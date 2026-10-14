import { memo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronRight } from '@fortawesome/free-solid-svg-icons';
import type { CaseRow } from '../types';
import { formatDate, formatDays, formatMoney, formatNumber, formatPct } from '../format';
import { amountExceeding, BALANCE_THRESHOLD, highValueThreshold, riskTone } from '../risk';
import { AlertTag, PaidTrack, RiskTag } from './Bits';
import { CaseStatusPicker, ReferredToLegalPicker } from './CaseStatusPicker';

interface Props {
  rows: CaseRow[];
  onOpen: (id: string) => void;
  /** Case being saved from its status picker. */
  savingCase?: string;
  onCaseStatus: (caseId: string, value: string, previous?: string) => void;
  /** Case being saved from its Referred to Legal picker. */
  savingLegal?: string;
  onReferredToLegal: (caseId: string, value: boolean) => void;
  /** Whether the signed-in user may change the Case status of a case in this business unit. */
  canEditStatus: (buId: string | undefined) => boolean;
}

const WIDTHS = ['14%', '10%', '8%', '8%', '9%', '8%', '8%', '6%', '10%', '11%', '9%', '120px'];

function Colgroup() {
  return (
    <colgroup>
      {WIDTHS.map((w, i) => (
        <col key={i} style={{ width: w }} />
      ))}
    </colgroup>
  );
}

function Head() {
  return (
    <thead>
      <tr className="col">
        <th className="stick">
          Patient
          <span className="nd-th-sub">No · Room · National ID</span>
        </th>
        <th className="gline">Company / Payer</th>
        <th>Stay</th>
        <th className="gline">Charges / Paid</th>
        <th className="num">Balance / Paid %</th>
        <th className="gline">Risk</th>
        <th>Length of stay</th>
        <th>Loss day</th>
        <th className="gline">Alert</th>
        <th className="gline">Case status</th>
        <th>Referred to Legal</th>
        <th className="gline stick-r" aria-label="Decision" />
      </tr>
    </thead>
  );
}

const Row = memo(function Row({
  row,
  onOpen,
  caseSaving,
  onCaseStatus,
  legalSaving,
  onReferredToLegal,
  canEdit,
}: {
  row: CaseRow;
  onOpen: (id: string) => void;
  caseSaving: boolean;
  onCaseStatus: (caseId: string, value: string, previous?: string) => void;
  legalSaving: boolean;
  onReferredToLegal: (caseId: string, value: boolean) => void;
  canEdit: boolean;
}) {
  const hot = row.balance !== undefined && row.balance > BALANCE_THRESHOLD;
  const exceeding = amountExceeding(row.balance, row.currency);
  return (
    <tr onClick={() => onOpen(row.id)}>
      <td className="stick">
        <span className={`nd-t-edge ${riskTone(row.riskLabel) ?? ''}`} />
        <span className="nd-t-namecell">
          <div className="nd-t-name">{row.name}</div>
          <div className="nd-t-sub">
            <span className="nd-mono">{row.patientId ?? '—'}</span>
            {row.room && <> · Room {row.room}</>}
            {row.visitId && <> · Visit <span className="nd-mono">{row.visitId}</span></>}
          </div>
          {row.nationalId && (
            <div className="nd-t-sub">
              National ID <span className="nd-mono">{row.nationalId}</span>
            </div>
          )}
        </span>
      </td>
      <td className="gline">
        <div className="nd-t-top">{row.payer ?? '—'}</div>
        <div className="nd-t-sub nd-ent">{row.entity ?? '—'}</div>
      </td>
      <td>
        <div className="nd-t-top nd-mono">{row.admissionLabel ?? formatDate(row.admissionDate)}</div>
      </td>
      <td className="gline">
        <div className="nd-t-top nd-mono">{formatNumber(row.totalBill)}</div>
        <div className="nd-t-sub nd-mono">{formatNumber(row.amountPaid)} paid</div>
      </td>
      <td className="num">
        <div className={`nd-t-bal nd-mono${hot ? ' hot' : ''}`}>{formatMoney(row.balance, row.currency)}</div>
        <div className="nd-t-sub">
          <PaidTrack pct={row.paidPct} compact />
          <span className="nd-mono">{row.paidPct !== undefined ? `${formatPct(row.paidPct)} paid` : ''}</span>
        </div>
        {exceeding !== undefined && exceeding > 0 && (
          <div className="nd-t-exceed nd-mono" title={`Above the ${formatMoney(highValueThreshold(row.currency), row.currency)} high-value threshold`}>
            +{formatMoney(exceeding, row.currency)} over
          </div>
        )}
      </td>
      <td className="gline">
        <RiskTag label={row.riskLabel} />
        {row.flag && <div className="nd-t-flag">{row.flag}</div>}
      </td>
      <td>
        <div className="nd-t-big nd-mono">{formatDays(row.lengthOfStay)}</div>
        <div className="nd-t-sub">in hospital</div>
      </td>
      <td>
        <div className="nd-t-big nd-mono">{formatDays(row.lossDay)}</div>
        <div className="nd-t-sub">{row.lastPaymentDate ? `last paid ${row.lastPaymentLabel ?? formatDate(row.lastPaymentDate)}` : 'never paid'}</div>
      </td>
      <td className="gline">
        <AlertTag label={row.caseAlert ?? 'Pending'} />
      </td>
      <td className="gline">
        <CaseStatusPicker row={row} saving={caseSaving} canEdit={canEdit} onChange={onCaseStatus} />
      </td>
      <td>
        <ReferredToLegalPicker row={row} saving={legalSaving} onChange={onReferredToLegal} />
      </td>
      <td className="gline stick-r">
        <div className="nd-t-action">
          <button
            type="button"
            className="nd-btn-dec sm"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(row.id);
            }}
          >
            Decision <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </div>
      </td>
    </tr>
  );
});

export const CaseTable = memo(function CaseTable({ rows, onOpen, savingCase, onCaseStatus, savingLegal, onReferredToLegal, canEditStatus }: Props) {
  return (
    <div className="nd-tablewrap">
      <table className="nd-table">
        <Head />
        <tbody>
          {rows.map((row) => (
            <Row
              key={row.id}
              row={row}
              onOpen={onOpen}
              caseSaving={savingCase === row.id}
              onCaseStatus={onCaseStatus}
              legalSaving={savingLegal === row.id}
              onReferredToLegal={onReferredToLegal}
              canEdit={canEditStatus(row.buId)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
});

/** Placeholder rows with the same columns, shown only on the very first load. */
export function CaseTableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="nd-tablewrap" aria-busy="true" aria-label="Loading cases">
      <table className="nd-table">
        <Colgroup />
        <Head />
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r} className="nd-skel-row">
              {WIDTHS.map((_, c) => (
                <td key={c} className={c === 0 ? 'stick' : c === WIDTHS.length - 1 ? 'stick-r' : undefined}>
                  <span className="nd-skel" style={{ width: c === 0 ? '80%' : '60%' }} />
                  <span className="nd-skel nd-skel--sub" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
