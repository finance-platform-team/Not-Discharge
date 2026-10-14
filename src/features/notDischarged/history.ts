/** Action texts the app writes to ND Case History. Always use these, never free text. */
export const ACTIONS = {
  acknowledged: 'Acknowledged',
  decisionLogged: 'Decision Logged',
  manuallyEscalated: 'Manually Escalated',
  closed: 'Closed',
} as const;

/** ND Case History action written when the Case status dropdown changes (by the new status value). */
export const STATUS_ACTIONS: Record<number, string> = {
  1: 'Reopened',
  2: 'Closed - Paid',
  3: 'Closed – Referred to Legal',
  4: 'Discharged – Pending Payment',
};
/** Rows that record a closure (the "Closed" line in the panel); "Closed" is the earlier wording. */
// "Closed - TRANSPORT TO LEGAL" is the old wording of status 3, kept for rows written before the rename.
export const CLOSURE_ACTIONS: readonly string[] = ['Closed - Paid', 'Closed – Referred to Legal', 'Closed - TRANSPORT TO LEGAL', 'Closed'];
/** Shown when the status saved but its history row could not be written. */
export const STATUS_HISTORY_WARNING = 'Status saved, but history could not be recorded';

/** Written only by the flows; the app reads them, never writes them. */
export const FLOW_ACTIONS = { escalated: 'Escalated', taskClosed: 'Task Closed' } as const;

/** Role stored on rows written by the automatic escalation flow. */
export const SYSTEM_ROLE = 'System';

/** Shown when an action succeeded but its history row could not be written. */
export const HISTORY_WARNING = 'Action saved, but history could not be recorded';

/** These roles may not change the Case status. */
export const CASE_STATUS_READONLY_ROLES: readonly string[] = ['Billing Supervisor', 'Duty Manager'];

/**
 * Anyone may change the Case status except Billing Supervisors and Duty Managers: blocked only when
 * every role the user holds for the case is one of those (no role at all = allowed).
 */
export function canEditCaseStatus(roles: string[]): boolean {
  if (!roles.length) return true;
  const blocked = CASE_STATUS_READONLY_ROLES.map((r) => r.toLowerCase());
  return roles.some((r) => !blocked.includes(r.trim().toLowerCase()));
}

/** Acknowledging within this many hours of the last notification is within SLA. */
export const ACK_SLA_HOURS = 24;
