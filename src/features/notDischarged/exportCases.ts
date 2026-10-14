import { fetchCasePage } from './api';
import { amountExceeding, RISK_LEVELS } from './risk';
import type { CaseQuery, CaseRow } from './types';
import { buildXlsx, downloadBlob, type Cell } from './xlsx';

/** Rows per request while exporting, and the most an export reads. */
const EXPORT_PAGE = 500;
export const EXPORT_MAX = 10_000;

/** DD/MM/YYYY (BRD localisation rule). */
function dmy(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const round2 = (n: number | undefined) => (n === undefined ? undefined : Math.round(n * 100) / 100);
const riskName = (r: CaseRow) => r.riskLabel ?? RISK_LEVELS.find((l) => l.value === r.risk)?.label;

const COLUMNS: { header: string; width: number; value: (r: CaseRow) => Cell }[] = [
  { header: 'Patient', width: 28, value: (r) => r.name },
  { header: 'Patient No.', width: 14, value: (r) => r.patientId },
  { header: 'National ID', width: 18, value: (r) => r.nationalId },
  { header: 'Visit ID', width: 14, value: (r) => r.visitId },
  { header: 'Phone', width: 16, value: (r) => r.phone },
  { header: 'Room', width: 10, value: (r) => r.room },
  { header: 'BU', width: 22, value: (r) => r.entity },
  { header: 'Company / Payer', width: 26, value: (r) => r.payer },
  { header: 'Currency', width: 10, value: (r) => r.currency },
  { header: 'Total Bill', width: 14, value: (r) => round2(r.totalBill) },
  { header: 'Amount Paid', width: 14, value: (r) => round2(r.amountPaid) },
  { header: 'Paid %', width: 10, value: (r) => round2(r.paidPct) },
  { header: 'Debit', width: 14, value: (r) => round2(r.debit) },
  { header: 'Credit', width: 14, value: (r) => round2(r.credit) },
  { header: 'Balance', width: 14, value: (r) => round2(r.balance) },
  { header: 'Unpaid %', width: 10, value: (r) => round2(r.unpaidPct) },
  { header: 'Amount Exceeding', width: 16, value: (r) => round2(amountExceeding(r.balance, r.currency)) },
  { header: 'Last Pmt. Amount', width: 16, value: (r) => round2(r.lastPaymentAmount) },
  { header: 'Last Pmt. Date', width: 14, value: (r) => dmy(r.lastPaymentDate) },
  { header: 'Admission Date', width: 14, value: (r) => dmy(r.admissionDate) },
  { header: 'Discharged', width: 11, value: (r) => (r.discharged === undefined ? undefined : r.discharged ? 'Yes' : 'No') },
  { header: 'LOS (days)', width: 11, value: (r) => r.lengthOfStay },
  { header: 'Loss Days', width: 11, value: (r) => (r.lossDay === undefined ? undefined : Math.round(r.lossDay)) },
  { header: 'Risk', width: 11, value: riskName },
  { header: 'Flag', width: 18, value: (r) => r.flag },
  { header: 'Alert', width: 13, value: (r) => r.caseAlert ?? 'Pending' },
  { header: 'Case Status', width: 26, value: (r) => r.caseStatus },
  { header: 'Last Decision', width: 18, value: (r) => r.decisionOnLabel ?? dmy(r.decisionOn) },
];

/**
 * Reads every case of the current filters (same query and order as the list) and saves them as
 * an Excel file. Returns how many rows were written and whether the export hit EXPORT_MAX.
 */
export async function exportCasesToExcel(query: CaseQuery, fileLabel: string): Promise<{ count: number; capped: boolean }> {
  const q: CaseQuery = { ...query, pageSize: EXPORT_PAGE };
  const rows: CaseRow[] = [];
  let token: string | undefined;
  do {
    const page = await fetchCasePage(q, token);
    rows.push(...page.rows);
    token = page.nextToken;
  } while (token && rows.length < EXPORT_MAX);
  const list = rows.slice(0, EXPORT_MAX);

  const blob = buildXlsx(
    'Not-Discharged',
    COLUMNS.map((c) => c.header),
    list.map((r) => COLUMNS.map((c) => c.value(r))),
    COLUMNS.map((c) => c.width),
  );
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  downloadBlob(blob, `Not-Discharged ${fileLabel} ${stamp}.xlsx`);
  return { count: list.length, capped: Boolean(token) || rows.length > EXPORT_MAX };
}
