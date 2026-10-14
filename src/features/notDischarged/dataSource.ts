/**
 * Where the data lives.
 *
 * The app itself is deployed to environment cd78a59b-e16f-e4aa-b0a1-8e450a70ed56, but the tables
 * (notdis_notdischarged, cfm_slatracking, cfm_sla) live in environment 9ce6fb09-5b63-e9f4-9185-b707b4b3425e.
 * A code app's per-table services always hit the app's own environment, so every call goes through
 * MicrosoftDataverseService.*WithOrganization with this URL instead.
 */
export const DATA_ORG_URL = 'https://org319b4ea9.crm4.dynamics.com';

/** Entity set (plural) names, as the connector expects them. */
export const ENTITY = {
  cases: 'notdis_notdischargeds',
  tracking: 'cfm_slatrackings',
  tms: 'cfm_tmshandoffs',
  /** ND Case History: the only place case actions are recorded (create + read only). */
  history: 'notdis_ndcasehistories',
  /** ND Escalation Config: who holds which escalation role, per business unit. */
  escalationConfig: 'notdis_escalationconfigs',
} as const;

/** Logical (singular) names, used in FetchXML. */
export const LOGICAL = {
  cases: 'notdis_notdischarged',
  tracking: 'cfm_slatracking',
  tms: 'cfm_tmshandoff',
} as const;
