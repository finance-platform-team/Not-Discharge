import { MicrosoftDataverseService } from '../../generated/services/MicrosoftDataverseService';
import {
  Cfm_tmshandoffscfm_priority as PRIORITY,
  Cfm_tmshandoffscfm_progress as PROGRESS,
  type Cfm_tmshandoffscfm_decisionfromwhere,
  type Cfm_tmshandoffscfm_progress,
  type Cfm_tmshandoffscfm_tagename,
} from '../../generated/models/Cfm_tmshandoffsModel';
import { DATA_ORG_URL, ENTITY, LOGICAL } from '../notDischarged/dataSource';
import { GUID, likeEscape, listRecords, withTimeout, xmlEscape, type WriteResult } from '../notDischarged/api';
import { errorMessage, formatted, num, str } from '../notDischarged/format';

type Raw = Record<string, unknown>;

export type StatusKey = 'all' | 'new' | 'submitted' | 'inProgress' | 'onHold' | 'closed' | 'cancelled' | 'rejected';

/** Stat cards in the order of the design. `value` is the cfm_progress option value. */
export const STATUSES: { key: StatusKey; label: string; value?: Cfm_tmshandoffscfm_progress }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New', value: 123200004 },
  { key: 'submitted', label: 'Submitted', value: 123200005 },
  { key: 'inProgress', label: 'In Progress', value: 100000001 },
  { key: 'onHold', label: 'On Hold', value: 100000005 },
  { key: 'closed', label: 'Closed', value: 123200002 },
  { key: 'cancelled', label: 'Cancelled', value: 123200003 },
  { key: 'rejected', label: 'Rejected', value: 931940001 },
];

const statusByValue = new Map(STATUSES.filter((s) => s.value !== undefined).map((s) => [s.value as number, s.key]));


/** Decisions created from this app are tagged as coming from Not Discharge. */
const SOURCE: { from: Cfm_tmshandoffscfm_decisionfromwhere; tag: Cfm_tmshandoffscfm_tagename } = { from: 6, tag: 752210001 };

export interface TmsRow {
  id: string;
  taskId?: string;
  decisionId?: string;
  title: string;
  description?: string;
  decision?: string;
  typeAction?: string;
  assignee?: string;
  sla?: string;
  dueDate?: string;
  dueLabel?: string;
  status?: StatusKey;
  statusLabel?: string;
  priority?: string;
  source?: string;
  tag?: string;
  createdOn?: string;
  createdLabel?: string;
  createdBy?: string;
}

const DONE = new Set<StatusKey | undefined>(['closed', 'cancelled', 'rejected']);

/** Past due and still open. */
export const isOverdue = (r: TmsRow) =>
  Boolean(r.dueDate && !DONE.has(r.status) && Date.parse(r.dueDate) < new Date().setHours(0, 0, 0, 0));

export interface TmsFilters {
  search: string;
  /** yyyy-mm-dd: sent (created) on or after. */
  startDate: string;
  /** yyyy-mm-dd: due on or before. */
  dueDate: string;
}

/**
 * Summary cards, each tied to a column on screen (SLA / Due, Sent). A card is also a
 * filter: clicking it shows the matching rows, so a card count always equals the table total.
 */
export type CardKey = 'all' | 'overdue' | 'dueToday' | 'due72h' | 'sentToday' | 'sentWeek';

export const CARDS: { key: CardKey; label: string; hint: string }[] = [
  { key: 'all', label: 'All', hint: 'Every hand-off assigned to you' },
  { key: 'overdue', label: 'Overdue', hint: 'Due date has passed and the task is still open' },
  { key: 'dueToday', label: 'Due today', hint: 'Due date is today' },
  { key: 'due72h', label: 'Due in 72h', hint: 'Due in the next 3 days (after today)' },
  { key: 'sentToday', label: 'Sent today', hint: 'Created today' },
  { key: 'sentWeek', label: 'Sent this week', hint: 'Created in the last 7 days' },
];

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
};
/** cfm_progress values that end a task (an ended task is never overdue). */
const DONE_VALUES = STATUSES.filter((s) => DONE.has(s.key)).map((s) => s.value);

function cardCondition(card: CardKey | undefined): string {
  const due = (op: string, value?: string) =>
    `<condition attribute="cfm_duedate" operator="${op}"${value ? ` value="${value}"` : ''}/>`;
  switch (card) {
    case 'overdue':
      return (
        due('on-or-before', plusDays(-1)) +
        `<filter type="or"><condition attribute="cfm_progress" operator="null"/><condition attribute="cfm_progress" operator="not-in">${DONE_VALUES.map((v) => `<value>${v}</value>`).join('')}</condition></filter>`
      );
    case 'dueToday':
      return due('on', plusDays(0));
    case 'due72h':
      return due('on-or-after', plusDays(1)) + due('on-or-before', plusDays(3));
    case 'sentToday':
      return `<condition attribute="createdon" operator="on" value="${plusDays(0)}"/>`;
    case 'sentWeek':
      return `<condition attribute="createdon" operator="on-or-after" value="${plusDays(-6)}"/>`;
    default:
      return '';
  }
}

export interface TmsQuery extends TmsFilters {
  card: CardKey;
  page: number; // 0-based
  pageSize: number;
}

const ATTRIBUTES = [
  'cfm_tmshandoffid',
  'cfm_tmscode',
  'cfm_tasktitle',
  'cfm_taskdescription',
  'cfm_decision',
  'cfm_typeaction',
  'cfm_assignee',
  'cfm_taskstms',
  'cfm_sla',
  'cfm_duedate',
  'cfm_progress',
  'cfm_priority',
  'cfm_decisionfromwhere',
  'cfm_tagename',
  'createdon',
  'createdby',
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Filter + the assignee join a search needs (the join is only added when searching). */
function fetchFilter(f: TmsFilters, card?: CardKey): { filter: string; link: string } {
  // This app only shows its own hand-offs (Tage Name = Not Discharge) that are assigned to the
  // signed-in user; the cards and the table share this filter, so their counts always match.
  const parts: string[] = [
    `<condition attribute="cfm_tagename" operator="eq" value="${SOURCE.tag}"/>`,
    '<condition attribute="cfm_assignee" operator="eq-userid"/>',
  ];
  const cardFilter = cardCondition(card);
  if (cardFilter) parts.push(cardFilter);
  if (DATE.test(f.startDate)) parts.push(`<condition attribute="createdon" operator="on-or-after" value="${f.startDate}"/>`);
  if (DATE.test(f.dueDate)) parts.push(`<condition attribute="cfm_duedate" operator="on-or-before" value="${f.dueDate}"/>`);
  const term = f.search.trim();
  let link = '';
  if (term) {
    const v = xmlEscape(`%${likeEscape(term)}%`);
    const own = ['cfm_tasktitle', 'cfm_tmscode', 'cfm_typeaction', 'cfm_decision']
      .map((a) => `<condition attribute="${a}" operator="like" value="${v}"/>`)
      .join('');
    parts.push(`<filter type="or">${own}<condition entityname="asg" attribute="fullname" operator="like" value="${v}"/></filter>`);
    link = '<link-entity name="systemuser" from="systemuserid" to="cfm_assignee" link-type="outer" alias="asg"/>';
  }
  return { filter: `<filter type="and">${parts.join('')}</filter>`, link };
}

function toRow(r: Raw): TmsRow {
  const progress = num(r, 'cfm_progress');
  return {
    id: String(r.cfm_tmshandoffid),
    taskId: formatted(r, '_cfm_taskstms_value'),
    decisionId: str(r, 'cfm_tmscode'),
    title: str(r, 'cfm_tasktitle') ?? '—',
    description: str(r, 'cfm_taskdescription'),
    decision: str(r, 'cfm_decision'),
    typeAction: str(r, 'cfm_typeaction'),
    assignee: formatted(r, '_cfm_assignee_value'),
    sla: slaOf(r),
    dueDate: str(r, 'cfm_duedate'),
    dueLabel: formatted(r, 'cfm_duedate'),
    status: progress !== undefined ? statusByValue.get(progress) : undefined,
    statusLabel:
      formatted(r, 'cfm_progress') ??
      (progress !== undefined ? PROGRESS[progress as Cfm_tmshandoffscfm_progress]?.trim() : undefined),
    priority: formatted(r, 'cfm_priority'),
    source: formatted(r, 'cfm_decisionfromwhere'),
    tag: formatted(r, 'cfm_tagename'),
    createdOn: str(r, 'createdon'),
    createdLabel: formatted(r, 'createdon'),
    createdBy: formatted(r, '_createdby_value'),
  };
}

/** One page of hand-offs, newest first. FetchXML pages by number, so any page can be opened directly. */
export async function fetchTmsPage(q: TmsQuery): Promise<{ rows: TmsRow[]; total?: number; hasMore: boolean }> {
  const { filter, link } = fetchFilter(q, q.card);
  const fetchXml =
    `<fetch page="${q.page + 1}" count="${q.pageSize}" returntotalrecordcount="true">` +
    `<entity name="${LOGICAL.tms}">${ATTRIBUTES.map((a) => `<attribute name="${a}"/>`).join('')}` +
    `<order attribute="createdon" descending="true"/><order attribute="cfm_tmshandoffid"/>` +
    `${filter}${link}</entity></fetch>`;
  const res = await listRecords(ENTITY.tms, { fetchXml, pageSize: q.pageSize }, 'Dataverse (TMS hand-offs)');
  const more = res.body['@Microsoft.Dynamics.CRM.morerecords'];
  const total = num(res.body, '@Microsoft.Dynamics.CRM.totalrecordcount');
  return {
    rows: res.rows.map(toRow),
    total: total !== undefined && total >= 0 ? total : undefined,
    hasMore: typeof more === 'boolean' ? more : res.rows.length === q.pageSize,
  };
}

/** One count per card (small aggregate requests in parallel), with the same filters as the table. */
export async function fetchTmsCounts(f: TmsFilters): Promise<Record<CardKey, number>> {
  const counts = await Promise.all(
    CARDS.map(async (c) => {
      const { filter, link } = fetchFilter(f, c.key);
      const fetchXml =
        `<fetch aggregate="true"><entity name="${LOGICAL.tms}">` +
        `<attribute name="cfm_tmshandoffid" alias="n" aggregate="countcolumn"/>` +
        `${filter}${link}</entity></fetch>`;
      const { rows } = await listRecords(ENTITY.tms, { fetchXml }, 'TMS counts');
      return [c.key, num(rows[0] ?? {}, 'n') ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts) as Record<CardKey, number>;
}

/** High (cfm_priority): every handoff from the case panel goes to TMS as high priority. */
const PRIORITY_HIGH: keyof typeof PRIORITY = 123200002;

/**
 * cfm_sla from the days between today (the row's createdon) and the due date:
 * up to 3 days → "72h", more than 3 → "<n> days".
 */
export function slaLabel(dueDate: string, from = new Date()): string {
  return slaBetween(new Date(`${dueDate}T00:00:00`), from);
}

/** Calendar days from `from` to `due` (local dates): up to 3 → "72h", more → "<n> days". */
function slaBetween(due: Date, from: Date): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(due) - day(from)) / 86_400_000);
  return days > 3 ? `${days} days` : '72h';
}

/** cfm_sla, or (older rows saved without it) the same rule from the row's createdon and due date. */
function slaOf(r: Raw): string | undefined {
  const saved = str(r, 'cfm_sla');
  if (saved) return saved;
  const due = new Date(str(r, 'cfm_duedate') ?? '');
  const created = new Date(str(r, 'createdon') ?? '');
  return Number.isNaN(due.getTime()) || Number.isNaN(created.getTime()) ? undefined : slaBetween(due, created);
}

/**
 * One cfm_tmshandoffs row linked to a Not Discharged case. The TMS flow watches this table and
 * creates the real TMS task, so hx_taskses is never written here. Never throws.
 */
export async function createHandoff(
  caseId: string,
  assigneeId: string,
  dueDate: string,
  title: string,
  description: string,
): Promise<WriteResult> {
  try {
    if (!GUID.test(caseId)) throw new Error('Invalid case id.');
    if (!GUID.test(assigneeId)) throw new Error('Choose who to assign the task to.');
    if (!DATE.test(dueDate)) throw new Error('Pick a due date.');
    const item: Record<string, unknown> = {
      'cfm_Assignee@odata.bind': `/systemusers(${assigneeId})`,
      'notdis_Case@odata.bind': `/${ENTITY.cases}(${caseId})`,
      cfm_tasktitle: title,
      cfm_taskdescription: description,
      cfm_duedate: new Date(`${dueDate}T00:00:00`).toISOString(),
      cfm_sla: slaLabel(dueDate),
      cfm_priority: PRIORITY_HIGH,
      cfm_decisionfromwhere: SOURCE.from,
      cfm_tagename: SOURCE.tag,
    };
    const res = await withTimeout(
      MicrosoftDataverseService.CreateRecordWithOrganization('return=representation', 'application/json', DATA_ORG_URL, ENTITY.tms, item),
      'Creating the TMS handoff',
      90_000,
    );
    if (!res.success) throw new Error(errorMessage(res.error, 'Could not create the TMS handoff.'));
    return { ok: true };
  } catch (err) {
    console.error('[handoff] createHandoff failed', err);
    return { ok: false, error: errorMessage(err, 'Could not create the TMS handoff.') };
  }
}
