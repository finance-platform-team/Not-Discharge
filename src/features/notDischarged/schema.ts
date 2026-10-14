/**
 * Choice (option set) values of the tables in the DATA environment (org319b4ea9).
 *
 * Copied verbatim from the models the Power Apps CLI generated from those tables
 * (Notdis_notdischargedsModel.ts / Cfm_slatrackingsModel.ts). The tables can't stay registered
 * as app data sources, because the app lives in another environment where they don't exist
 * and `pa app push` then fails on the missing dependency. If a choice changes in Dataverse,
 * update it here. Display labels on screen still come from Dataverse (FormattedValue annotations);
 * these maps are only used to build filters/updates and as a fallback label.
 */

/** notdis_notdischarged.notdis_currency */
export const CURRENCY = {
  1: 'EGP',
  2: 'SAR',
} as const;

/** cfm_slatracking.notdis_alert */
export const ALERT = {
  752210000: 'Escalated',
  752210001: 'Acknowledged ',
  752210002: 'Pending',
} as const;

/** cfm_slatracking.cfm_statussla */
export const SLA_STATUS = {
  0: 'Running',
  1: 'Completed',
  2: 'Breached',
} as const;

/** notdis_notdischarged.notdis_casestatus */
export const CASE_STATUS = {
  1: 'Open',
  2: 'Closed - Paid',
  3: 'Closed – Referred to Legal',
  4: 'Discharged – Pending Payment',
} as const;

/** notdis_notdischarged.notdis_alert (the case's own alert; not the SLA tracking alert above). */
export const CASE_ALERT = {
  1: 'Escalated',
  2: 'Acknowledged ',
  3: 'Pending',
} as const;
export const CASE_ALERT_ACKNOWLEDGED = 2;
export const CASE_ALERT_ESCALATED = 1;
/** Acknowledge is offered only while the case alert is one of these. */
export const CASE_ALERT_ACKNOWLEDGEABLE: readonly number[] = [3, 1]; // Pending, Escalated
