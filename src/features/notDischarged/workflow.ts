/** yyyy-mm-dd of today, local time (date inputs compare as strings). */
export const todayInput = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const CRITICALITY = ['High', 'Medium', 'Low'] as const;
export type Criticality = (typeof CRITICALITY)[number];

/** A logged decision is one step of the escalation chain: it always escalates to someone. */
export interface DecisionInput {
  issue: string;
  reason: string;
  criticality: Criticality;
  /** systemuserid of the user the case is escalated to. */
  escalatedTo: string;
  /** That user's full name, as picked in the search. */
  escalatedToName: string;
  /** yyyy-mm-dd */
  dueDate: string;
}

