import type { RiskLevel } from './risk';

export type Region = 'EG' | 'SA';

export type SortKey = 'risk' | 'balance' | 'noPayment' | 'stay' | 'name';

export type AlertFilter = '' | 'Pending' | 'Acknowledged' | 'Escalated';

export interface CaseQuery {
  search: string;
  region: Region;
  risks: RiskLevel[];
  /** Business unit id (_notdis_bu_value), '' = all. */
  entity: string;
  /** notdis_companypayer, '' = all. */
  payer: string;
  /** notdis_flag, '' = all (High Balance / No Payment / 48H No Payment / Both Conditions). */
  flag: string;
  /** notdis_discharged: 'no' = still in hospital (empty counts as No), 'yes', '' = all. */
  discharged: '' | 'no' | 'yes';
  /** Cases that have an open SLA tracking row with this alert, '' = all. */
  alert: AlertFilter;
  /** notdis_casestatus option value, '' = all. */
  caseStatus: string;
  sort: SortKey;
  pageSize: number;
}

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

/** One not-discharged case, shaped for display. Every value comes from notdis_notdischarged. */
export interface CaseRow {
  id: string;
  name: string;
  patientId?: string;
  nationalId?: string;
  room?: string;
  phone?: string;
  payer?: string;
  entity?: string;
  admissionDate?: string;
  admissionLabel?: string;
  totalBill?: number;
  amountPaid?: number;
  /** notdis_debit / notdis_credit: the two parts of the amount paid. */
  debit?: number;
  credit?: number;
  /** notdis_discharged: the patient has left the hospital. */
  discharged?: boolean;
  /** notdis_referredtolegal: the case was referred to Legal (moves it to Closed – Referred to Legal). */
  referredToLegal?: boolean;
  /** notdis_visitid */
  visitId?: string;
  balance?: number;
  paidPct?: number;
  /** notdis_unpaid: outstanding balance as % of the total bill. */
  unpaidPct?: number;
  lastPaymentAmount?: number;
  lastPaymentDate?: string;
  lastPaymentLabel?: string;
  currency?: string;
  flag?: string;
  /** notdis_lossday (Loss Day, calculated decimal), shown as whole days. */
  lossDay?: number;
  lengthOfStay?: number;
  daysNoPayment?: number;
  risk: RiskLevel;
  riskWhy: string;
  /** notdis_risk, the Risk column as stored in Dataverse (shown on screen). */
  riskLabel?: string;
  /** notdis_casestatus: Open / Closed - Paid / Closed – Referred to Legal / Discharged – Pending Payment. */
  caseStatus?: string;
  caseStatusValue?: number;
  /** notdis_alert on the case: Pending / Acknowledged / Escalated / Decided / Closed. */
  caseAlert?: string;
  caseAlertValue?: number;
  /** notdis_decisionon: latest logged decision (the escalation flow stops once it is set). */
  decisionOn?: string;
  decisionOnLabel?: string;
  /** _notdis_bu_value: the case's business unit (for the escalation role lookup). */
  buId?: string;
  /** notdis_lastnotifiedon: when the escalation flow last notified (read only; the flow owns it). */
  lastNotifiedOn?: string;
  createdOn?: string;
}

/** One cfm_slatracking row linked to a case through notdis_case. */
export interface TrackingRow {
  id: string;
  caseId: string;
  name?: string;
  alert?: string;
  slaStatus?: string;
  owner?: string;
  /** systemuserid of the owning user (empty when a team owns the row). */
  ownerUserId?: string;
  closedBy?: string;
  deadline?: string;
  deadlineLabel?: string;
  startLabel?: string;
  completedLabel?: string;
  escalatedLabel?: string;
  breachedLabel?: string;
  escalated?: boolean;
  createdLabel?: string;
  createdOn?: string;
}

export interface CasePage {
  rows: CaseRow[];
  /** Latest tracking row per case on this page, keyed by case id. Undefined while it loads. */
  tracking?: Record<string, TrackingRow>;
  trackingError?: string;
  /** Token that fetches the page after this one; undefined on the last page. */
  nextToken?: string;
  /** Server-side total for the whole query (Dataverse caps it at 5000). */
  total?: number;
}

export type StatKey = RiskLevel | 'pending';
