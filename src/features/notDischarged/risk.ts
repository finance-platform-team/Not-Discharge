/**
 * Risk matrix from the design: balance above 50k x days since last payment >= 5.
 * It is derived from real columns only (notdis_balance, notdis_lastpmtdate, notdis_admissiondate),
 * and the same rule is expressed as an OData filter so it can run on the server.
 */
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

export const RISK_LEVELS: { value: RiskLevel; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

/** Colour for a notdis_risk text: its level when the text names one, otherwise neutral. */
export function riskTone(label: string | undefined): RiskLevel | undefined {
  const t = label?.trim().toLowerCase();
  return t ? RISK_LEVELS.find((l) => t.includes(l.value))?.value : undefined;
}

export const BALANCE_THRESHOLD = 50_000;
export const DAYS_THRESHOLD = 5;

const DAY_MS = 86_400_000;
/** One reference "now" per session, so client-side risk and the server filter always agree. */
export const SESSION_NOW = Date.now();

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

export function computeRisk(balance: number | undefined, daysNoPayment: number | undefined): { level: RiskLevel; why: string } {
  const hiBal = balance !== undefined && balance > BALANCE_THRESHOLD;
  const longGap = daysNoPayment !== undefined && daysNoPayment >= DAYS_THRESHOLD;
  const d = daysNoPayment ?? 0;
  if (hiBal && longGap) return { level: 'critical', why: `Balance over ${k(BALANCE_THRESHOLD)} and ${d} days with no payment` };
  if (hiBal) return { level: 'high', why: `Balance over ${k(BALANCE_THRESHOLD)}, last payment ${d} days ago` };
  if (longGap) return { level: 'medium', why: `${d} days with no payment, balance under ${k(BALANCE_THRESHOLD)}` };
  return { level: 'low', why: 'Within both thresholds' };
}

const cutoff = new Date(SESSION_NOW - DAYS_THRESHOLD * DAY_MS).toISOString();

const HI_BAL = `notdis_balance gt ${BALANCE_THRESHOLD}`;
const LO_BAL = `(notdis_balance le ${BALANCE_THRESHOLD} or notdis_balance eq null)`;
// "Never paid" counts from admission, exactly like the client-side days calculation.
const LONG_GAP = `(notdis_lastpmtdate le ${cutoff} or (notdis_lastpmtdate eq null and notdis_admissiondate le ${cutoff}))`;
const SHORT_GAP = `(notdis_lastpmtdate gt ${cutoff} or (notdis_lastpmtdate eq null and (notdis_admissiondate gt ${cutoff} or notdis_admissiondate eq null)))`;

const RISK_FILTER: Record<RiskLevel, string> = {
  critical: `(${HI_BAL} and ${LONG_GAP})`,
  high: `(${HI_BAL} and ${SHORT_GAP})`,
  medium: `(${LO_BAL} and ${LONG_GAP})`,
  low: `(${LO_BAL} and ${SHORT_GAP})`,
};

/* The same four risk conditions as FetchXML, for the aggregate (count + sum) queries. */
const cond = (attr: string, op: string, value?: string | number) =>
  `<condition attribute="${attr}" operator="${op}"${value === undefined ? '' : ` value="${value}"`}/>`;
const or = (...xs: string[]) => `<filter type="or">${xs.join('')}</filter>`;
const and = (...xs: string[]) => `<filter type="and">${xs.join('')}</filter>`;

const X_HI_BAL = cond('notdis_balance', 'gt', BALANCE_THRESHOLD);
const X_LO_BAL = or(cond('notdis_balance', 'le', BALANCE_THRESHOLD), cond('notdis_balance', 'null'));
const X_LONG_GAP = or(
  cond('notdis_lastpmtdate', 'le', cutoff),
  and(cond('notdis_lastpmtdate', 'null'), cond('notdis_admissiondate', 'le', cutoff)),
);
const X_SHORT_GAP = or(
  cond('notdis_lastpmtdate', 'gt', cutoff),
  and(cond('notdis_lastpmtdate', 'null'), or(cond('notdis_admissiondate', 'gt', cutoff), cond('notdis_admissiondate', 'null'))),
);

export const RISK_FETCH_FILTER: Record<RiskLevel, string> = {
  critical: and(X_HI_BAL, X_LONG_GAP),
  high: and(X_HI_BAL, X_SHORT_GAP),
  medium: and(X_LO_BAL, X_LONG_GAP),
  low: and(X_LO_BAL, X_SHORT_GAP),
};

export function riskFilter(levels: RiskLevel[]): string | undefined {
  if (!levels.length || levels.length === RISK_LEVELS.length) return undefined;
  return `(${levels.map((l) => RISK_FILTER[l]).join(' or ')})`;
}

/** BRD high-value threshold: 50,000 EGP for Egypt, a fixed 10,000 SAR for KSA. */
export function highValueThreshold(currency: string | undefined): number {
  return currency === 'SAR' ? 10_000 : 50_000;
}

/** Outstanding balance above the applicable threshold (0 when at or below it). */
export function amountExceeding(balance: number | undefined, currency: string | undefined): number | undefined {
  if (balance === undefined) return undefined;
  return Math.max(0, balance - highValueThreshold(currency));
}
