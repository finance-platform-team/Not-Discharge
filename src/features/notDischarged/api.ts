import { getContext } from '@microsoft/power-apps/app';
import { MicrosoftDataverseService } from '../../generated/services/MicrosoftDataverseService';
import { Notdis_escalationconfigsnotdis_role as ESCALATION_ROLE } from '../../generated/models/Notdis_escalationconfigsModel';
import {
  CURRENCY as Notdis_notdischargedsnotdis_currency,
  ALERT as Cfm_slatrackingsnotdis_alert,
  SLA_STATUS as Cfm_slatrackingscfm_statussla,
  CASE_STATUS,
  CASE_ALERT,
} from './schema';
import type { CasePage, CaseQuery, CaseRow, FilterOption, Region, SortKey, StatKey, TrackingRow } from './types';
import { daysSince, errorMessage, formatted, num, str } from './format';
import { computeRisk, riskFilter, RISK_FETCH_FILTER, RISK_LEVELS, SESSION_NOW, type RiskLevel } from './risk';
import { DATA_ORG_URL, ENTITY, LOGICAL } from './dataSource';

type Raw = Record<string, unknown>;

/** Option value of "SAR" in notdis_currency, read from the generated choice map. */
const SAR_VALUE = Number(
  Object.entries(Notdis_notdischargedsnotdis_currency).find(([, label]) => label === 'SAR')?.[0],
);

const alertValue = (label: string) =>
  Number(Object.entries(Cfm_slatrackingsnotdis_alert).find(([, l]) => l.trim() === label)?.[0]);

const CASE_SELECT = [
  'notdis_notdischargedid',
  'notdis_name',
  'notdis_patientid',
  'notdis_roomid',
  'notdis_phonenumber',
  'notdis_companypayer',
  '_notdis_bu_value',
  'notdis_admissiondate',
  'notdis_totalbillamount',
  'notdis_amountpaid',
  'notdis_debit',
  'notdis_credit',
  'notdis_discharged',
  'notdis_referredtolegal',
  'notdis_visitid',
  'notdis_unpaid',
  'notdis_paid',
  'notdis_balance',
  'notdis_lastpmtamount',
  'notdis_lastpmtdate',
  'notdis_currency',
  'notdis_flag',
  'notdis_patientnatinalid',
  'notdis_lossday',
  'notdis_risk',
  'notdis_casestatus',
  'notdis_alert',
  'notdis_decisionon',
  'notdis_lastnotifiedon',
  'createdon',
].join(',');

const TRACKING_FIELDS = [
  'cfm_slatrackingid',
  '_notdis_case_value',
  'notdis_alert',
  'cfm_statussla',
  'cfm_deadline',
  'cfm_escalated',
  '_owninguser_value',
  '_owningteam_value',
  'createdon',
];
const TRACKING_SELECT = TRACKING_FIELDS.join(',');

/** Server-side sort. The record id is the tie-breaker so paging stays stable. */
const ORDER_BY: Record<SortKey, string> = {
  balance: 'notdis_balance desc,notdis_notdischargedid asc',
  risk: 'notdis_balance desc,notdis_notdischargedid asc', // paged by band in fetchCasePageByRisk
  noPayment: 'notdis_lastpmtdate asc,notdis_notdischargedid asc',
  stay: 'notdis_admissiondate asc,notdis_notdischargedid asc',
  name: 'notdis_name asc,notdis_notdischargedid asc',
};

export const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Page size goes in `prefer` (never $top, or Dataverse stops returning a next link). */
const prefer = (pageSize: number, allAnnotations = false) =>
  `odata.include-annotations="${allAnnotations ? '*' : 'OData.Community.Display.V1.FormattedValue'}",odata.maxpagesize=${pageSize}`;

function odataString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Saudi Arabia = currency SAR; every other case (EGP or empty) belongs to Egypt. */
function regionFilter(region: Region): string {
  return region === 'SA'
    ? `notdis_currency eq ${SAR_VALUE}`
    : `(notdis_currency ne ${SAR_VALUE} or notdis_currency eq null)`;
}

export function buildCaseFilter(
  query: Pick<CaseQuery, 'search' | 'region'> & Partial<Pick<CaseQuery, 'risks' | 'entity' | 'payer' | 'caseStatus' | 'flag' | 'discharged'>>,
): string {
  const parts = ['statecode eq 0', regionFilter(query.region)];
  const risk = riskFilter(query.risks ?? []);
  if (risk) parts.push(risk);
  if (query.entity && GUID.test(query.entity)) parts.push(`_notdis_bu_value eq ${query.entity}`);
  if (query.payer) parts.push(`notdis_companypayer eq ${odataString(query.payer)}`);
  if (query.flag) parts.push(`notdis_flag eq ${odataString(query.flag)}`);
  if (query.discharged === 'no') parts.push('(notdis_discharged eq false or notdis_discharged eq null)');
  if (query.discharged === 'yes') parts.push('notdis_discharged eq true');
  if (/^\d+$/.test(query.caseStatus ?? '')) parts.push(`notdis_casestatus eq ${query.caseStatus}`);
  const term = query.search.trim();
  if (term) {
    const t = odataString(term);
    parts.push(
      `(contains(notdis_name,${t}) or contains(notdis_patientid,${t}) or contains(notdis_patientnatinalid,${t}) or contains(notdis_roomid,${t}) or contains(notdis_companypayer,${t}))`,
    );
  }
  return parts.join(' and ');
}

function toCaseRow(r: Raw, now: number): CaseRow {
  const totalBill = num(r, 'notdis_totalbillamount');
  const balance = num(r, 'notdis_balance');
  // notdis_amountpaid is a formula column; if it doesn't come back, paid = charges − balance.
  const amountPaid =
    num(r, 'notdis_amountpaid') ?? (totalBill !== undefined && balance !== undefined ? totalBill - balance : undefined);
  const currencyValue = num(r, 'notdis_currency');
  const admissionDate = str(r, 'notdis_admissiondate');
  const lastPaymentDate = str(r, 'notdis_lastpmtdate');
  // Never paid → counted from admission.
  const daysNoPayment = daysSince(lastPaymentDate ?? admissionDate, now);
  const risk = computeRisk(balance, daysNoPayment);
  return {
    risk: risk.level,
    riskWhy: risk.why,
    id: String(r.notdis_notdischargedid),
    name: str(r, 'notdis_name') ?? '—',
    patientId: str(r, 'notdis_patientid'),
    nationalId: str(r, 'notdis_patientnatinalid'),
    room: str(r, 'notdis_roomid'),
    phone: str(r, 'notdis_phonenumber'),
    payer: str(r, 'notdis_companypayer'),
    entity: formatted(r, '_notdis_bu_value'),
    admissionDate,
    admissionLabel: formatted(r, 'notdis_admissiondate'),
    totalBill,
    amountPaid,
    debit: num(r, 'notdis_debit'),
    credit: num(r, 'notdis_credit'),
    discharged: yesNo(r.notdis_discharged),
    referredToLegal: yesNo(r.notdis_referredtolegal),
    visitId: str(r, 'notdis_visitid'),
    balance,
    // notdis_paid (Paid % = Amount Paid ÷ Total Bill × 100); computed the same way if it is empty.
    paidPct:
      num(r, 'notdis_paid') ??
      (totalBill && totalBill > 0 && amountPaid !== undefined ? Math.round((amountPaid / totalBill) * 10000) / 100 : undefined),
    // notdis_unpaid (Unpaid % = Balance ÷ Total Bill × 100, BR-CR-06); computed the same way if it is empty.
    unpaidPct:
      num(r, 'notdis_unpaid') ??
      (totalBill && totalBill > 0 && balance !== undefined ? Math.round((balance / totalBill) * 10000) / 100 : undefined),
    lastPaymentAmount: num(r, 'notdis_lastpmtamount'),
    lastPaymentDate,
    lastPaymentLabel: formatted(r, 'notdis_lastpmtdate'),
    currency:
      formatted(r, 'notdis_currency') ??
      (currencyValue !== undefined
        ? Notdis_notdischargedsnotdis_currency[currencyValue as keyof typeof Notdis_notdischargedsnotdis_currency]
        : undefined),
    flag: str(r, 'notdis_flag'),
    lossDay: num(r, 'notdis_lossday'),
    lengthOfStay: daysSince(admissionDate, now),
    daysNoPayment,
    riskLabel: formatted(r, 'notdis_risk') ?? str(r, 'notdis_risk')?.trim(),
    caseStatus: choiceLabel(r, 'notdis_casestatus', CASE_STATUS),
    caseStatusValue: num(r, 'notdis_casestatus'),
    caseAlert: choiceLabel(r, 'notdis_alert', CASE_ALERT)?.trim(),
    caseAlertValue: num(r, 'notdis_alert'),
    decisionOn: str(r, 'notdis_decisionon'),
    decisionOnLabel: formatted(r, 'notdis_decisionon'),
    buId: str(r, '_notdis_bu_value'),
    lastNotifiedOn: str(r, 'notdis_lastnotifiedon'),
    createdOn: str(r, 'createdon'),
  };
}

function choiceLabel<T extends Record<number, string>>(r: Raw, field: string, map: T): string | undefined {
  const fromServer = formatted(r, field);
  if (fromServer) return fromServer;
  const value = num(r, field);
  return value !== undefined ? map[value]?.trim() : undefined;
}

function toTrackingRow(r: Raw): TrackingRow {
  const escalated = r.cfm_escalated;
  return {
    id: String(r.cfm_slatrackingid),
    caseId: String(r._notdis_case_value),
    name: str(r, 'cfm_slatrackingname'),
    alert: choiceLabel(r, 'notdis_alert', Cfm_slatrackingsnotdis_alert),
    slaStatus: choiceLabel(r, 'cfm_statussla', Cfm_slatrackingscfm_statussla),
    owner: formatted(r, '_owninguser_value') ?? formatted(r, '_owningteam_value'),
    ownerUserId: str(r, '_owninguser_value'),
    closedBy: formatted(r, '_cfm_closedby_value'),
    deadline: str(r, 'cfm_deadline'),
    deadlineLabel: formatted(r, 'cfm_deadline'),
    startLabel: formatted(r, 'cfm_startdate'),
    completedLabel: formatted(r, 'cfm_completeddate'),
    escalatedLabel: formatted(r, 'cfm_escalateddate'),
    breachedLabel: formatted(r, 'cfm_breacheddate'),
    escalated: typeof escalated === 'boolean' ? escalated : escalated === 'true' ? true : escalated === 'false' ? false : undefined,
    createdLabel: formatted(r, 'createdon'),
    createdOn: str(r, 'createdon'),
  };
}

const TIMEOUT_MS = 30_000;
/** Writes can run synchronous plugins / flows in Dataverse, so they get longer. */
const WRITE_TIMEOUT_MS = 90_000;

/**
 * The SDK has no way to abort a call, and outside the Power Apps host (e.g. opening
 * localhost:3000 directly instead of the Play link from `pa app run`) calls never settle.
 * Fail loudly instead of showing a skeleton forever.
 */
export function withTimeout<T>(promise: Promise<T>, what: string, ms = TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = window.setTimeout(
      () =>
        reject(
          new Error(
            `${what} did not respond within ${ms / 1000}s. Open the app through the Play link printed by "pa app run" (not localhost directly) and check your Dataverse connection.`,
          ),
        ),
      ms,
    );
    promise.then(
      (v) => { window.clearTimeout(id); resolve(v); },
      (e: unknown) => { window.clearTimeout(id); reject(e instanceof Error ? e : new Error(String(e))); },
    );
  });
}

/**
 * The connector's @odata.nextLink points at its own nextLink endpoint; the real Dataverse
 * query (with $skiptoken) is URL-encoded inside its `next` parameter. A flat URL is handled too.
 */
function extractSkipToken(nextLink: unknown): string | undefined {
  if (typeof nextLink !== 'string' || !nextLink) return undefined;
  try {
    const outer = new URL(nextLink);
    const inner = outer.searchParams.get('next');
    const source = inner ?? nextLink;
    const q = source.indexOf('?');
    if (q === -1) return undefined;
    return new URLSearchParams(source.substring(q + 1)).get('$skiptoken') ?? undefined;
  } catch {
    return undefined;
  }
}

type ListArgs = {
  select?: string;
  filter?: string;
  orderBy?: string;
  fetchXml?: string;
  pageSize?: number;
  skipToken?: string;
  /** Every annotation (e.g. a lookup's target table), not only formatted values. */
  allAnnotations?: boolean;
};

/** One ListRecordsWithOrganization call against the data environment. */
export async function listRecords(
  entity: string,
  args: ListArgs,
  what: string,
): Promise<{ rows: Raw[]; skipToken?: string; body: Raw }> {
  const res = await withTimeout(
    MicrosoftDataverseService.ListRecordsWithOrganization(
      DATA_ORG_URL, // organization
      entity, // entityName (plural)
      prefer(args.pageSize ?? 500, args.allAnnotations), // prefer
      'application/json', // accept
      undefined, // x_ms_odata_metadata_full
      undefined, // MSCRM_IncludeMipSensitivityLabel
      args.select, // $select
      args.filter, // $filter
      args.orderBy, // $orderby
      undefined, // $expand
      args.fetchXml, // fetchXml
      undefined, // $top — never, it disables the next link
      args.skipToken, // $skiptoken
    ),
    what,
  );
  if (!res.success) throw new Error(errorMessage(res.error, `${what} failed.`));
  const body = res.data as unknown;
  const rows = Array.isArray(body) ? (body as Raw[]) : (((body as Raw)?.value as Raw[] | undefined) ?? []);
  const nextLink = Array.isArray(body) ? undefined : (body as Raw)?.['@odata.nextLink'];
  return { rows, skipToken: extractSkipToken(nextLink), body: Array.isArray(body) ? {} : ((body as Raw) ?? {}) };
}

/** Latest tracking row for every case on the page, in a single request. */
export async function fetchLatestTracking(caseIds: string[]): Promise<Record<string, TrackingRow>> {
  const ids = caseIds.filter((id) => GUID.test(id));
  if (!ids.length) return {};
  const { rows } = await listRecords(
    ENTITY.tracking,
    {
      select: TRACKING_SELECT,
      filter: `(${ids.map((id) => `_notdis_case_value eq ${id}`).join(' or ')})`,
      orderBy: 'createdon desc',
      pageSize: 500,
    },
    'SLA tracking',
  );
  const latest: Record<string, TrackingRow> = {};
  for (const raw of rows) {
    const row = toTrackingRow(raw);
    if (!latest[row.caseId]) latest[row.caseId] = row; // ordered newest first
  }
  return latest;
}

/* ---------------- Alert filter: FetchXML list joined to cfm_slatracking ---------------- */

export const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const likeEscape = (s: string) => s.replace(/[[\]%_]/g, (c) => `[${c}]`);

const FETCH_ORDER: Record<SortKey, string> = {
  balance: '<order attribute="notdis_balance" descending="true"/>',
  risk: '<order attribute="notdis_balance" descending="true"/>',
  noPayment: '<order attribute="notdis_lastpmtdate"/>',
  stay: '<order attribute="notdis_admissiondate"/>',
  name: '<order attribute="notdis_name"/>',
};

/** notdis_alert on the case: the Alert filter value → FetchXML condition (empty = Pending, the default). */
const CASE_ALERT_VALUE: Record<Exclude<CaseQuery['alert'], ''>, number> = { Escalated: 1, Acknowledged: 2, Pending: 3 };
function caseAlertFetch(alert: CaseQuery['alert']): string {
  if (!alert) return '';
  const eq = `<condition attribute="notdis_alert" operator="eq" value="${CASE_ALERT_VALUE[alert]}"/>`;
  return alert === 'Pending' ? `<filter type="or">${eq}<condition attribute="notdis_alert" operator="null"/></filter>` : eq;
}

function caseFetchConditions(query: CaseQuery): string {
  const parts = ['<condition attribute="statecode" operator="eq" value="0"/>', regionFetch(query.region)];
  if (query.risks.length && query.risks.length < RISK_LEVELS.length) {
    parts.push(`<filter type="or">${query.risks.map((r) => RISK_FETCH_FILTER[r]).join('')}</filter>`);
  }
  if (query.entity && GUID.test(query.entity)) {
    parts.push(`<condition attribute="notdis_bu" operator="eq" value="${query.entity}"/>`);
  }
  if (query.payer) parts.push(`<condition attribute="notdis_companypayer" operator="eq" value="${xmlEscape(query.payer)}"/>`);
  if (query.flag) parts.push(`<condition attribute="notdis_flag" operator="eq" value="${xmlEscape(query.flag)}"/>`);
  if (query.discharged === 'no')
    parts.push('<filter type="or"><condition attribute="notdis_discharged" operator="eq" value="0"/><condition attribute="notdis_discharged" operator="null"/></filter>');
  if (query.discharged === 'yes') parts.push('<condition attribute="notdis_discharged" operator="eq" value="1"/>');
  if (query.alert) parts.push(caseAlertFetch(query.alert));
  if (/^\d+$/.test(query.caseStatus)) parts.push(`<condition attribute="notdis_casestatus" operator="eq" value="${query.caseStatus}"/>`);
  const term = query.search.trim();
  if (term) {
    const v = xmlEscape(`%${likeEscape(term)}%`);
    parts.push(
      `<filter type="or">${['notdis_name', 'notdis_patientid', 'notdis_roomid', 'notdis_companypayer']
        .map((a) => `<condition attribute="${a}" operator="like" value="${v}"/>`)
        .join('')}</filter>`,
    );
  }
  return parts.join('');
}

/** Page tokens for this mode are page numbers ("fx:2"), since FetchXML pages by number. */
async function fetchCasePageByAlert(query: CaseQuery, token: string | undefined) {
  const page = token?.startsWith('fx:') ? Number(token.slice(3)) || 1 : 1;
  const attributes = CASE_SELECT.split(',')
    .map((a) => (a === '_notdis_bu_value' ? 'notdis_bu' : a))
    .map((a) => `<attribute name="${a}"/>`)
    .join('');
  const fetchXml =
    `<fetch page="${page}" count="${query.pageSize}" returntotalrecordcount="true">` +
    `<entity name="${LOGICAL.cases}">${attributes}${FETCH_ORDER[query.sort]}<order attribute="notdis_notdischargedid"/>` +
    `<filter type="and">${caseFetchConditions(query)}</filter>` +
    `</entity></fetch>`;
  const res = await listRecords(ENTITY.cases, { fetchXml, pageSize: query.pageSize }, 'Dataverse (cases by alert)');
  const more = res.body['@Microsoft.Dynamics.CRM.morerecords'];
  const hasMore = typeof more === 'boolean' ? more : res.rows.length === query.pageSize;
  const total = num(res.body, '@Microsoft.Dynamics.CRM.totalrecordcount');
  return {
    rows: res.rows.map((r) => toCaseRow(r, SESSION_NOW)),
    nextToken: hasMore ? `fx:${page + 1}` : undefined,
    total: total !== undefined && total >= 0 ? total : undefined,
  };
}

/* ---------------- Filter options: distinct entities and payers of the region ---------------- */

async function groupCases(region: Region, attribute: string, alias: string): Promise<Raw[]> {
  const fetchXml =
    `<fetch aggregate="true"><entity name="${LOGICAL.cases}">` +
    `<attribute name="${attribute}" alias="${alias}" groupby="true"/>` +
    `<attribute name="notdis_notdischargedid" alias="n" aggregate="countcolumn"/>` +
    `<filter type="and"><condition attribute="statecode" operator="eq" value="0"/>${regionFetch(region)}</filter>` +
    `</entity></fetch>`;
  return (await listRecords(ENTITY.cases, { fetchXml }, 'Filter options')).rows;
}

/** 2 grouped requests per region: business units (entity) and payers, with case counts. */
export async function fetchFilterOptions(region: Region): Promise<{ entities: FilterOption[]; payers: FilterOption[] }> {
  const [bus, payers] = await Promise.all([
    groupCases(region, 'notdis_bu', 'bu'),
    groupCases(region, 'notdis_companypayer', 'payer'),
  ]);
  const byLabel = (a: FilterOption, b: FilterOption) => a.label.localeCompare(b.label);
  return {
    entities: bus
      .filter((r) => typeof r.bu === 'string' && GUID.test(r.bu))
      .map((r) => ({ value: String(r.bu), label: formatted(r, 'bu') ?? String(r.bu), count: aggNumber(r, 'n') }))
      .sort(byLabel),
    payers: payers
      .map((r) => ({ name: str(r, 'payer'), count: aggNumber(r, 'n') }))
      .filter((p): p is { name: string; count: number | undefined } => Boolean(p.name))
      .map((p) => ({ value: p.name, label: p.name, count: p.count }))
      .sort(byLabel),
  };
}

/* ---------------- Risk order (BRD A.1.1): Critical → High → Medium → Low ---------------- */

/** Band order on screen; inside a band the highest balance comes first. */
const RISK_ORDER: RiskLevel[] = ['critical', 'high', 'medium', 'low'];

async function countCases(query: CaseQuery): Promise<number> {
  const fetchXml =
    `<fetch aggregate="true"><entity name="${LOGICAL.cases}">` +
    `<attribute name="notdis_notdischargedid" alias="n" aggregate="countcolumn"/>` +
    `<filter type="and">${caseFetchConditions(query)}</filter>` +
    `</entity></fetch>`;
  const { rows } = await listRecords(ENTITY.cases, { fetchXml }, 'Case count');
  return aggNumber(rows[0], 'n') ?? 0;
}

/** Case count per band for one query (filters only, not the page), shared by all its pages. */
const bandCounts = new Map<string, Promise<number[]>>();

/** Rows [from, to) of one band, read as at most 2 FetchXML pages of the same size. */
async function bandSlice(query: CaseQuery, from: number, to: number): Promise<CaseRow[]> {
  const size = query.pageSize;
  const first = Math.floor(from / size);
  const last = Math.floor((to - 1) / size);
  const pages = await Promise.all(
    Array.from({ length: last - first + 1 }, (_, i) => fetchCasePageByAlert(query, `fx:${first + i + 1}`)),
  );
  return pages.flatMap((p) => p.rows).slice(from - first * size, to - first * size);
}

/**
 * Pages in risk order: each band is counted once, then a page (token "rk:<offset>") is cut out of
 * the bands it overlaps, so every page is full and the total is known.
 */
async function fetchCasePageByRisk(query: CaseQuery, token: string | undefined) {
  const bands = RISK_ORDER.filter((b) => !query.risks.length || query.risks.includes(b));
  const key = JSON.stringify({ ...query, pageSize: 0 });
  // Page 1 (also after a refresh) always counts again; later pages reuse its counts.
  let counts = token ? bandCounts.get(key) : undefined;
  if (!counts) {
    if (bandCounts.size > 20) bandCounts.clear();
    counts = Promise.all(bands.map((b) => countCases({ ...query, risks: [b] })));
    bandCounts.set(key, counts);
    counts.catch(() => bandCounts.delete(key));
  }
  const sizes = await counts;
  const total = sizes.reduce((a, n) => a + n, 0);
  const offset = token?.startsWith('rk:') ? Number(token.slice(3)) || 0 : 0;
  const end = Math.min(total, offset + query.pageSize);

  const reads: Promise<CaseRow[]>[] = [];
  let start = 0;
  bands.forEach((band, i) => {
    const from = Math.max(offset, start) - start;
    const to = Math.min(end, start + sizes[i]) - start;
    if (to > from) reads.push(bandSlice({ ...query, sort: 'balance', risks: [band] }, from, to));
    start += sizes[i];
  });
  const rows = (await Promise.all(reads)).flat();
  return { rows, nextToken: end < total ? `rk:${end}` : undefined, total };
}

/** One page of cases. */
export async function fetchCasePage(
  query: CaseQuery,
  skipToken: string | undefined,
): Promise<Pick<CasePage, 'rows' | 'nextToken' | 'total'>> {
  if (query.sort === 'risk') {
    // A token that is not "rk:" comes from the balance-order fallback below: keep paging that way.
    if (skipToken && !skipToken.startsWith('rk:')) return fetchCasePage({ ...query, sort: 'balance' }, skipToken);
    try {
      return await fetchCasePageByRisk(query, skipToken);
    } catch (err) {
      // e.g. the aggregate limit: fall back to the balance order rather than show nothing.
      if (skipToken) throw err;
      console.warn('[cases] risk order unavailable, using balance order', err);
      return fetchCasePage({ ...query, sort: 'balance' }, undefined);
    }
  }
  if (query.alert) return fetchCasePageByAlert(query, skipToken);
  const res = await listRecords(
    ENTITY.cases,
    {
      select: CASE_SELECT,
      filter: buildCaseFilter(query),
      orderBy: ORDER_BY[query.sort],
      pageSize: query.pageSize,
      skipToken,
    },
    'Dataverse (not-discharged cases)',
  );
  return { rows: res.rows.map((r) => toCaseRow(r, SESSION_NOW)), nextToken: res.skipToken };
}


/* ---------------- KPI / chip stats: FetchXML aggregates (count + sum in one request) ---------------- */

const regionFetch = (region: Region) =>
  region === 'SA'
    ? `<condition attribute="notdis_currency" operator="eq" value="${SAR_VALUE}"/>`
    : `<filter type="or"><condition attribute="notdis_currency" operator="ne" value="${SAR_VALUE}"/><condition attribute="notdis_currency" operator="null"/></filter>`;

const aggNumber = (row: Raw | undefined, alias: string): number | undefined => {
  const v = row?.[alias];
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
};

async function aggregateCases(region: Region, level: RiskLevel): Promise<StatResult> {
  const fetchXml =
    `<fetch aggregate="true"><entity name="${LOGICAL.cases}">` +
    `<attribute name="notdis_notdischargedid" alias="n" aggregate="countcolumn"/>` +
    `<attribute name="notdis_balance" alias="bal" aggregate="sum"/>` +
    `<filter type="and"><condition attribute="statecode" operator="eq" value="0"/>${regionFetch(region)}${RISK_FETCH_FILTER[level]}</filter>` +
    `</entity></fetch>`;
  const { rows } = await listRecords(ENTITY.cases, { fetchXml }, 'Case totals');
  return { value: aggNumber(rows[0], 'n') ?? 0, amount: aggNumber(rows[0], 'bal') ?? 0 };
}

async function aggregatePending(region: Region): Promise<StatResult> {
  const fetchXml =
    `<fetch aggregate="true"><entity name="${LOGICAL.cases}">` +
    `<attribute name="notdis_notdischargedid" alias="n" aggregate="countcolumn"/>` +
    `<filter type="and"><condition attribute="statecode" operator="eq" value="0"/>${regionFetch(region)}${caseAlertFetch('Pending')}</filter>` +
    `</entity></fetch>`;
  const { rows } = await listRecords(ENTITY.cases, { fetchXml }, 'Pending count');
  return { value: aggNumber(rows[0], 'n') ?? 0 };
}

export type StatResult = { value?: number; amount?: number; error?: string };

/** KPI tiles + risk chips: 4 risk aggregates (they partition all cases) + 1 pending count. */
export async function fetchStats(region: Region): Promise<Record<StatKey, StatResult>> {
  const keys: StatKey[] = [...RISK_LEVELS.map((l) => l.value), 'pending'];
  const settled = await Promise.allSettled(
    keys.map((k) => (k === 'pending' ? aggregatePending(region) : aggregateCases(region, k))),
  );
  const out = {} as Record<StatKey, StatResult>;
  settled.forEach((s, i) => {
    out[keys[i]] = s.status === 'fulfilled' ? s.value : { error: errorMessage(s.reason, 'Count failed.') };
  });
  return out;
}

/* ---------------- Decisions: update the case's latest SLA tracking row ---------------- */

export type DecisionKind = 'acknowledged' | 'escalated';

export interface AssignableUser {
  id: string;
  name: string;
  email?: string;
}

/**
 * Searches the systemuser table of the data environment (enabled, interactive users) by name or
 * email, 25 at a time. An empty term returns the first 25 by name.
 */
export async function searchUsers(term: string): Promise<AssignableUser[]> {
  const t = term.trim();
  const base = 'isdisabled eq false and accessmode eq 0';
  const filter = t
    ? `${base} and (contains(fullname,${odataString(t)}) or contains(internalemailaddress,${odataString(t)}))`
    : base;
  const { rows } = await listRecords(
    'systemusers',
    { select: 'systemuserid,fullname,internalemailaddress', filter, orderBy: 'fullname asc', pageSize: 25 },
    'User search',
  );
  return rows
    .map((r) => ({ id: String(r.systemuserid), name: str(r, 'fullname') ?? '', email: str(r, 'internalemailaddress') }))
    .filter((u) => GUID.test(u.id) && u.name);
}

/** Enabled, interactive users of the data environment, for "Assign to" (one request, cached by the hook). */
export async function fetchAssignableUsers(): Promise<AssignableUser[]> {
  const { rows } = await listRecords(
    'systemusers',
    {
      select: 'systemuserid,fullname',
      filter: 'isdisabled eq false and accessmode eq 0',
      orderBy: 'fullname asc',
      pageSize: 500,
    },
    'Users',
  );
  return rows
    .map((r) => ({ id: String(r.systemuserid), name: str(r, 'fullname') ?? '' }))
    .filter((u) => GUID.test(u.id) && u.name);
}

export async function recordDecision(
  trackingId: string,
  kind: DecisionKind,
  dueDate?: string,
  assignToUserId?: string,
): Promise<void> {
  if (!GUID.test(trackingId)) throw new Error('Invalid SLA tracking id.');
  const item: Record<string, unknown> = {
    notdis_alert: alertValue(kind === 'acknowledged' ? 'Acknowledged' : 'Escalated'),
  };
  if (assignToUserId && GUID.test(assignToUserId)) item['ownerid@odata.bind'] = `/systemusers(${assignToUserId})`;
  if (kind === 'escalated') {
    item.cfm_escalated = true;
    item.cfm_escalateddate = new Date().toISOString();
  }
  if (dueDate) item.cfm_deadline = new Date(`${dueDate}T00:00:00`).toISOString();
  const target = item.notdis_alert;
  // UpdateOnly (If-Match: *) so a missing row is never created by accident (the plain Update is an upsert).
  const update = MicrosoftDataverseService.UpdateOnlyRecordWithOrganization(
    'return=representation',
    'application/json',
    '*',
    DATA_ORG_URL,
    ENTITY.tracking,
    trackingId,
    item,
  );
  let res: Awaited<typeof update>;
  try {
    res = await withTimeout(update, 'Saving the decision', WRITE_TIMEOUT_MS);
  } catch (err) {
    // The SDK can't abort, so a slow save may still land. If the row already shows the new alert, it did.
    if (await trackingAlertIs(trackingId, target)) return;
    throw err;
  }
  if (!res.success) throw new Error(errorMessage(res.error, 'Could not save the decision.'));
}

async function trackingAlertIs(trackingId: string, alert: unknown): Promise<boolean> {
  try {
    const { rows } = await listRecords(
      ENTITY.tracking,
      { select: 'cfm_slatrackingid,notdis_alert', filter: `cfm_slatrackingid eq ${trackingId}`, pageSize: 1 },
      'Checking the decision',
    );
    return rows.length > 0 && num(rows[0], 'notdis_alert') === alert;
  } catch {
    return false;
  }
}

/* ---------------- Writes on the case itself ---------------- */

/** Owned by the automatic escalation flow. The app never writes notdis_escalationlevel; the other two
 * only from a logged decision (it moves the escalation chain to the chosen person). */
const NEVER_WRITTEN = ['notdis_escalationlevel'];
const CHAIN_FIELDS = ['notdis_notifiedlevel', 'notdis_lastnotifiedon'];

/**
 * Updates columns of one case (UpdateOnly, so a missing case is never created).
 * opts.escalationStep allows notdis_notifiedlevel / notdis_lastnotifiedon (Log Decision only).
 */
export async function updateCase(
  caseId: string,
  fields: Record<string, unknown>,
  what = 'Saving the case',
  opts: { escalationStep?: boolean } = {},
): Promise<void> {
  if (!GUID.test(caseId)) throw new Error('Invalid case id.');
  const blocked = Object.keys(fields).filter((k) => NEVER_WRITTEN.includes(k) || (!opts.escalationStep && CHAIN_FIELDS.includes(k)));
  if (blocked.length) throw new Error(`${blocked.join(', ')} belong to the escalation flow and can't be changed here.`);
  const res = await withTimeout(
    MicrosoftDataverseService.UpdateOnlyRecordWithOrganization(
      'return=representation',
      'application/json',
      '*',
      DATA_ORG_URL,
      ENTITY.cases,
      caseId,
      fields,
    ),
    what,
    WRITE_TIMEOUT_MS,
  );
  if (!res.success) throw new Error(errorMessage(res.error, `${what} failed.`));
}

export type CaseStatusPatch = { caseStatus?: number | null };

/** Writes notdis_casestatus on the case (null clears the choice). */
export async function updateCaseStatus(caseId: string, patch: CaseStatusPatch): Promise<void> {
  const item: Record<string, unknown> = {};
  if (patch.caseStatus !== undefined) item.notdis_casestatus = patch.caseStatus;
  await updateCase(caseId, item, 'Saving the case status');
}

/** notdis_referredtolegal from the table; Yes then moves an Open / Pending Payment case to status 3 (auto rule). */
export async function updateReferredToLegal(caseId: string, value: boolean): Promise<void> {
  await updateCase(caseId, { notdis_referredtolegal: value }, 'Saving Referred to Legal');
}

/* ---------------- Action history: ND Case History (create + read only, never updated or deleted) ---------------- */

export type WriteResult = { ok: true } | { ok: false; error: string };

export interface HistoryRow {
  id: string;
  action: string;
  role?: string;
  details?: string;
  createdOn?: string;
  /** Full name of the user who created the row (_createdby_value formatted value). */
  createdBy?: string;
}

/**
 * Every ND Case History row of the case, newest first: actions from this app and rows written by
 * the flows (data environment, where the cases are).
 */
export async function fetchCaseHistory(caseId: string): Promise<HistoryRow[]> {
  if (!GUID.test(caseId)) return [];
  try {
    const { rows } = await listRecords(
      ENTITY.history,
      {
        select: 'notdis_ndcasehistoryid,notdis_action,notdis_role,notdis_details,createdon,_createdby_value',
        filter: `_notdis_case_value eq ${caseId}`,
        orderBy: 'createdon desc',
        pageSize: 200,
      },
      'Action history',
    );
    return rows.map((r) => ({
      id: String(r.notdis_ndcasehistoryid),
      action: str(r, 'notdis_action') ?? '(no action)',
      role: str(r, 'notdis_role'),
      details: str(r, 'notdis_details'),
      createdOn: str(r, 'createdon'),
      createdBy: formatted(r, '_createdby_value'),
    }));
  } catch (err) {
    throw new Error(errorMessage(err, 'Could not read ND Case History.'));
  }
}

/** The case's SLA tracking rows (automatic escalations), newest first, for the Action History. */
export async function fetchTrackingHistory(caseId: string): Promise<TrackingRow[]> {
  if (!GUID.test(caseId)) return [];
  const { rows } = await listRecords(
    ENTITY.tracking,
    {
      select: [
        ...TRACKING_FIELDS,
        'cfm_slatrackingname',
        'cfm_startdate',
        'cfm_completeddate',
        'cfm_escalateddate',
        'cfm_breacheddate',
        '_cfm_closedby_value',
      ].join(','),
      filter: `_notdis_case_value eq ${caseId}`,
      orderBy: 'createdon desc',
      pageSize: 200,
    },
    'SLA history',
  );
  return rows.map(toTrackingRow);
}

interface SystemUser {
  id: string;
  fullName?: string;
  title?: string;
}

let currentUserRequest: Promise<SystemUser | undefined> | undefined;

/** The signed-in user as a systemuser of the data environment (matched on the Entra object id). Cached. */
export function currentSystemUser(): Promise<SystemUser | undefined> {
  currentUserRequest ??= (async () => {
    const ctx = await getContext();
    const oid = ctx.user.objectId;
    const upn = ctx.user.userPrincipalName;
    const filter =
      oid && GUID.test(oid)
        ? `azureactivedirectoryobjectid eq ${oid}`
        : upn
          ? `domainname eq ${odataString(upn)}`
          : undefined;
    if (!filter) return undefined;
    const { rows } = await listRecords('systemusers', { select: 'systemuserid,fullname,title', filter, pageSize: 1 }, 'Current user');
    const r = rows[0];
    return r ? { id: String(r.systemuserid), fullName: str(r, 'fullname'), title: str(r, 'title') } : undefined;
  })().catch((err: unknown) => {
    currentUserRequest = undefined; // try again next time
    throw err;
  });
  return currentUserRequest;
}

/** The signed-in user's ND Escalation Config roles (per business unit; none = all units) and Job Title. */
export interface RoleAssignments {
  roles: { buId?: string; role: string }[];
  title?: string;
}

export async function fetchRoleAssignments(): Promise<RoleAssignments> {
  const user = await currentSystemUser();
  if (!user) return { roles: [] };
  const { rows } = await listRecords(
    ENTITY.escalationConfig,
    {
      select: 'notdis_role,_notdis_businessunit_value',
      filter: `statecode eq 0 and _notdis_user_value eq ${user.id}`,
      pageSize: 200,
    },
    'Escalation roles',
  );
  return {
    title: user.title?.trim() || undefined,
    roles: rows
      .map((r) => ({
        buId: str(r, '_notdis_businessunit_value'),
        role: formatted(r, 'notdis_role') ?? ESCALATION_ROLE[num(r, 'notdis_role') as keyof typeof ESCALATION_ROLE],
      }))
      .filter((x): x is { buId: string | undefined; role: string } => Boolean(x.role)),
  };
}

/** The user's roles for one case: its business unit's configs (or all-unit ones), else the Job Title. */
export function rolesForBusinessUnit(a: RoleAssignments, buId: string | undefined): string[] {
  const roles = [...new Set(a.roles.filter((r) => !r.buId || (buId !== undefined && r.buId === buId)).map((r) => r.role))];
  return roles.length ? roles : a.title ? [a.title] : [];
}

/**
 * A user's place in the escalation chain for a case: their highest notdis_level in ND Escalation
 * Config for the case's business unit (or for all units), and the role(s) at that level.
 * Undefined when the user is not in the Config.
 */
export async function fetchEscalationLevel(userId: string, buId: string | undefined): Promise<{ level: number; role: string } | undefined> {
  if (!GUID.test(userId)) return undefined;
  const bu = buId && GUID.test(buId) ? `_notdis_businessunit_value eq ${buId} or ` : '';
  const { rows } = await listRecords(
    ENTITY.escalationConfig,
    {
      select: 'notdis_level,notdis_role',
      filter: `statecode eq 0 and _notdis_user_value eq ${userId} and (${bu}_notdis_businessunit_value eq null)`,
      orderBy: 'notdis_level desc',
      pageSize: 50,
    },
    'Escalation level',
  );
  const levels = rows.map((r) => ({
    level: num(r, 'notdis_level'),
    role: formatted(r, 'notdis_role') ?? ESCALATION_ROLE[num(r, 'notdis_role') as keyof typeof ESCALATION_ROLE],
  }));
  const top = levels.find((l) => l.level !== undefined);
  if (!top || top.level === undefined) return undefined;
  const roles = [...new Set(levels.filter((l) => l.level === top.level && l.role).map((l) => l.role as string))];
  return { level: top.level, role: roles.join(' / ') || 'Unknown role' };
}

/** The case's current notdis_notifiedlevel, read fresh (the flow may have moved it). */
export async function fetchNotifiedLevel(caseId: string): Promise<number | undefined> {
  if (!GUID.test(caseId)) return undefined;
  const { rows } = await listRecords(ENTITY.cases, { select: 'notdis_notifiedlevel', filter: `notdis_notdischargedid eq ${caseId}`, pageSize: 1 }, 'Notified level');
  return num(rows[0] ?? {}, 'notdis_notifiedlevel');
}

/** notdis_role holds at most 100 characters. */
const ROLE_MAX = 100;

/** Roles joined with " / ", cut to fit notdis_role: as many as fit, then "+N" for the rest. */
function fitRoles(roles: string[]): string {
  const all = roles.join(' / ');
  if (all.length <= ROLE_MAX) return all;
  for (let n = roles.length - 1; n >= 1; n--) {
    const text = `${roles.slice(0, n).join(' / ')} +${roles.length - n}`;
    if (text.length <= ROLE_MAX) return text;
  }
  return `${roles[0].slice(0, ROLE_MAX - 4)}… +${roles.length - 1}`.slice(0, ROLE_MAX);
}

/**
 * The role written on a history row: the user's ND Escalation Config roles for the case's business
 * unit (or configs with no business unit), joined with " / "; else their Job Title; else "Unknown".
 */
export async function getCurrentUserRole(caseId: string, knownBuId?: string): Promise<string> {
  try {
    const user = await currentSystemUser();
    if (!user) return 'Unknown';
    let buId = knownBuId;
    if (buId === undefined && GUID.test(caseId)) {
      const { rows } = await listRecords(ENTITY.cases, { select: '_notdis_bu_value', filter: `notdis_notdischargedid eq ${caseId}`, pageSize: 1 }, 'Case business unit');
      buId = str(rows[0] ?? {}, '_notdis_bu_value');
    }
    const bu = buId && GUID.test(buId) ? `_notdis_businessunit_value eq ${buId} or ` : '';
    const { rows } = await listRecords(
      ENTITY.escalationConfig,
      {
        select: 'notdis_role,notdis_level',
        filter: `statecode eq 0 and _notdis_user_value eq ${user.id} and (${bu}_notdis_businessunit_value eq null)`,
        orderBy: 'notdis_level asc',
        pageSize: 50,
      },
      'Escalation role',
    );
    const roles = [
      ...new Set(
        rows
          .map((r) => formatted(r, 'notdis_role') ?? ESCALATION_ROLE[num(r, 'notdis_role') as keyof typeof ESCALATION_ROLE])
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    if (roles.length) return fitRoles(roles);
    return user.title?.trim().slice(0, ROLE_MAX) || 'Unknown';
  } catch (err) {
    console.error('[history] getCurrentUserRole failed', err);
    return 'Unknown';
  }
}

/**
 * Creates one ND Case History row (createdby / createdon are set by Dataverse). Never throws:
 * history must not undo the action it records, so the caller gets a result instead.
 */
export async function addHistory(
  caseId: string,
  action: string,
  details: string,
  knownBuId?: string,
  opts: { role?: string } = {},
): Promise<WriteResult> {
  if (!GUID.test(caseId)) return { ok: false, error: 'Invalid case id.' };
  const role = opts.role ?? (await getCurrentUserRole(caseId, knownBuId));
  const row = {
    'notdis_Case@odata.bind': `/${ENTITY.cases}(${caseId})`,
    notdis_action: action,
    notdis_role: role,
    notdis_details: details,
  };
  try {
    const res = await withTimeout(
      MicrosoftDataverseService.CreateRecordWithOrganization('return=representation', 'application/json', DATA_ORG_URL, ENTITY.history, row),
      'Saving the history',
      WRITE_TIMEOUT_MS,
    );
    if (res.success) return { ok: true };
    throw new Error(errorMessage(res.error, 'Could not save the history.'));
  } catch (err) {
    console.error('[history] addHistory failed', err);
    return { ok: false, error: readableError(errorMessage(err, 'Could not save the history.')) };
  }
}

/** Dataverse errors come back as JSON text; keep just the message. */
function readableError(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    return parsed.error?.message ?? text;
  } catch {
    return text;
  }
}

/* ---------------- Automatic close: discharged and fully paid ---------------- */

/** Dataverse Yes/No can come back as true/false, 1/0 or "true"/"false". */
function yesNo(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === '1' || v === 'true') return true;
  if (v === 0 || v === '0' || v === 'false') return false;
  return undefined;
}

const CENT = 0.005;

/**
 * The rule: discharged = Yes, amount paid = total bill, balance = 0, and the case not closed yet
 * (Open, Discharged – Pending Payment, or no status). Such a case becomes Closed - Paid.
 */
export function isDischargedAndFullyPaid(c: {
  discharged?: boolean;
  amountPaid?: number;
  totalBill?: number;
  balance?: number;
  caseStatusValue?: number;
}): boolean {
  return (
    c.discharged === true &&
    c.totalBill !== undefined &&
    c.amountPaid !== undefined &&
    Math.abs(c.amountPaid - c.totalBill) < CENT &&
    c.balance !== undefined &&
    Math.abs(c.balance) < CENT &&
    (c.caseStatusValue === undefined || c.caseStatusValue === CASE_STATUS_OPEN || c.caseStatusValue === CASE_STATUS_DISCHARGED_PENDING)
  );
}

/** Discharged (notdis_discharged = Yes) but not fully paid, and still Open: moves to status 4. */
export function isDischargedPendingPayment(c: Parameters<typeof isDischargedAndFullyPaid>[0]): boolean {
  return (
    c.discharged === true &&
    !isDischargedAndFullyPaid(c) &&
    (c.caseStatusValue === undefined || c.caseStatusValue === CASE_STATUS_OPEN)
  );
}

/** notdis_referredtolegal = Yes and still Open / Discharged – Pending Payment: moves to status 3. */
export function isReferredToLegal(c: { referredToLegal?: boolean; caseStatusValue?: number }): boolean {
  return (
    c.referredToLegal === true &&
    (c.caseStatusValue === undefined || c.caseStatusValue === CASE_STATUS_OPEN || c.caseStatusValue === CASE_STATUS_DISCHARGED_PENDING)
  );
}

export const AUTO_CLOSE_ACTION = 'Closed - Paid';
export const AUTO_LEGAL_ACTION = 'Closed – Referred to Legal';
export const AUTO_PENDING_ACTION = 'Discharged – Pending Payment';
const CASE_STATUS_OPEN = 1;
const CASE_STATUS_CLOSED_PAID = 2;
const CASE_STATUS_REFERRED_TO_LEGAL = 3;
/** Discharged – Pending Payment: closes as Closed - Paid once fully paid. */
const CASE_STATUS_DISCHARGED_PENDING = 4;

/**
 * Re-reads the case and, if it still meets the rule, sets Closed - Paid and writes one history row
 * ("Closed - Paid", role System). Returns true when the case was closed here.
 */
/**
 * Discharged or referred-to-Legal cases of the region that may need an automatic status (Open / Discharged – Pending
 * Payment / empty), read once per session: the list itself opens on Discharged = No, so these are
 * usually not on screen.
 */
export async function fetchAutoStatusCandidates(region: Region): Promise<CaseRow[]> {
  const res = await listRecords(
    ENTITY.cases,
    {
      select: CASE_SELECT,
      filter: `statecode eq 0 and ${regionFilter(region)} and (notdis_discharged eq true or notdis_referredtolegal eq true) and (notdis_casestatus eq ${CASE_STATUS_OPEN} or notdis_casestatus eq ${CASE_STATUS_DISCHARGED_PENDING} or notdis_casestatus eq null)`,
      pageSize: 500,
    },
    'Automatic status check',
  );
  return res.rows.map((r) => toCaseRow(r, SESSION_NOW));
}

/**
 * Automatic Case status from the fresh record: referred to Legal → Closed – Referred to Legal (3);
 * discharged + fully paid → Closed - Paid (2);
 * discharged, not fully paid, still Open → Discharged – Pending Payment (4). Returns the new value.
 */
export async function autoCloseIfDischargedAndPaid(caseId: string, buId?: string): Promise<2 | 3 | 4 | undefined> {
  if (!GUID.test(caseId)) return undefined;
  const { rows } = await listRecords(
    ENTITY.cases,
    {
      select: 'notdis_discharged,notdis_referredtolegal,notdis_amountpaid,notdis_totalbillamount,notdis_balance,notdis_casestatus',
      filter: `notdis_notdischargedid eq ${caseId}`,
      pageSize: 1,
    },
    'Closure check',
  );
  const r = rows[0];
  if (!r) return undefined;
  const fresh = {
    discharged: yesNo(r.notdis_discharged),
    amountPaid: num(r, 'notdis_amountpaid'),
    totalBill: num(r, 'notdis_totalbillamount'),
    balance: num(r, 'notdis_balance'),
    caseStatusValue: num(r, 'notdis_casestatus'),
    referredToLegal: yesNo(r.notdis_referredtolegal),
  };
  if (isReferredToLegal(fresh)) {
    await updateCaseStatus(caseId, { caseStatus: CASE_STATUS_REFERRED_TO_LEGAL });
    const w = await addHistory(
      caseId,
      AUTO_LEGAL_ACTION,
      'Status set automatically: case referred to Legal (Referred to Legal = Yes)',
      buId,
      { role: 'System' },
    );
    if (!w.ok) console.error('[auto-status] status saved, history not recorded', w.error);
    return CASE_STATUS_REFERRED_TO_LEGAL;
  }
  if (isDischargedPendingPayment(fresh)) {
    await updateCaseStatus(caseId, { caseStatus: CASE_STATUS_DISCHARGED_PENDING });
    const w = await addHistory(
      caseId,
      AUTO_PENDING_ACTION,
      'Status set automatically: patient discharged with a balance still due',
      buId,
      { role: 'System' },
    );
    if (!w.ok) console.error('[auto-status] status saved, history not recorded', w.error);
    return CASE_STATUS_DISCHARGED_PENDING;
  }
  if (!isDischargedAndFullyPaid(fresh)) return undefined;
  await updateCaseStatus(caseId, { caseStatus: CASE_STATUS_CLOSED_PAID });
  const fmt = (n?: number) => (n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const written = await addHistory(
    caseId,
    AUTO_CLOSE_ACTION,
    `Closed automatically: patient discharged and fully paid · Amount paid ${fmt(fresh.amountPaid)} = Total bill ${fmt(fresh.totalBill)} · Balance 0`,
    buId,
    { role: 'System' },
  );
  if (!written.ok) console.error('[auto-close] status saved, history not recorded', written.error);
  return CASE_STATUS_CLOSED_PAID;
}

/* ---------------- Change detection (auto refresh) ---------------- */

/**
 * A short fingerprint of the data on screen: count + latest change of the region's active cases,
 * latest change in SLA tracking, and latest ND Case History row. Dataverse can't push changes to a
 * code app, so the screen polls this (3 tiny aggregate requests) and refreshes when it moves.
 */
export async function fetchChangeStamp(region: Region): Promise<string> {
  const max = (entity: string, logical: string, idAttr: string, dateAttr: string, extra = '') =>
    listRecords(
      entity,
      {
        fetchXml:
          `<fetch aggregate="true"><entity name="${logical}">` +
          `<attribute name="${idAttr}" alias="n" aggregate="countcolumn"/>` +
          `<attribute name="${dateAttr}" alias="m" aggregate="max"/>` +
          `<filter type="and"><condition attribute="statecode" operator="eq" value="0"/>${extra}</filter>` +
          `</entity></fetch>`,
      },
      'Change check',
    ).then(({ rows }) => `${aggNumber(rows[0], 'n') ?? 0}@${String(rows[0]?.m ?? '')}`);
  const parts = await Promise.all([
    max(ENTITY.cases, LOGICAL.cases, 'notdis_notdischargedid', 'modifiedon', regionFetch(region)),
    max(ENTITY.tracking, LOGICAL.tracking, 'cfm_slatrackingid', 'modifiedon'),
    max(ENTITY.history, 'notdis_ndcasehistory', 'notdis_ndcasehistoryid', 'createdon'),
  ]);
  return parts.join('|');
}
