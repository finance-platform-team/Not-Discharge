import { useEffect, useState, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCheck,
  faCircleExclamation,
  faLock,
  faClipboardCheck,
  faClock,
  faPhone,
  faSpinner,
  faTriangleExclamation,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { CaseRow, TrackingRow } from '../types';
import { errorMessage, formatDate, formatDateInputDMY, formatDateTimeDMY, formatDateTimeISO, formatDateTimeUS, formatDays, formatHoursMinutes, formatMoney, formatPct } from '../format';
import { amountExceeding, BALANCE_THRESHOLD, DAYS_THRESHOLD, highValueThreshold } from '../risk';
import { addHistory, fetchEscalationLevel, fetchNotifiedLevel, recordDecision, updateCase } from '../api';
import { CASE_ALERT_ACKNOWLEDGEABLE, CASE_ALERT_ACKNOWLEDGED, CASE_ALERT_ESCALATED } from '../schema';
import type { LocalAction, useCaseHistory } from '../useCaseHistory';
import type { ToastTone } from '../useToast';
import { ACK_SLA_HOURS, ACTIONS, CLOSURE_ACTIONS, FLOW_ACTIONS, HISTORY_WARNING, SYSTEM_ROLE } from '../history';
import { todayInput, type DecisionInput } from '../workflow';
import { useAssignableUsers } from '../useAssignableUsers';
import { useCurrentUser } from '../useCurrentUser';
import { AlertTag, RiskTag } from './Bits';
import { SoftSelect } from './SoftSelect';
import { DecisionDialog } from './CaseDialogs';
import { createHandoff } from '../../tmsHandoff/api';

type Saving = 'ack' | 'decision';
type Dialog = 'decision';

interface Props {
  row?: CaseRow;
  latest?: TrackingRow;
  onClose: () => void;
  /** After an action: re-read SLA tracking and counts, then show the message. */
  onSaved: (message: string) => void;
  /** A toast without re-reading anything (errors, warnings). */
  onNotify: (message: string, tone: ToastTone) => void;
  /** A column of the case changed: patch the row on screen and re-read the list. */
  onCaseChanged: (caseId: string, patch: Partial<CaseRow>) => void;
  /** ND Case History of the open case, owned by the screen so other actions can refresh it too. */
  history: ReturnType<typeof useCaseHistory>;
}

function Sect({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="nd-sect">
      <div className="nd-sect-h">{title}</div>
      <div className="nd-sect-b">{children}</div>
    </div>
  );
}

const Dim = ({ children }: { children: ReactNode }) => <span className="nd-dim">{children}</span>;

/** Escalated red, Acknowledged / Decision Logged green, everything else grey. */
const isClosureAction = (action: string) => CLOSURE_ACTIONS.includes(action.trim());

function historyTone(action: string) {
  const a = action.trim().toLowerCase();
  if (isClosureAction(action)) return 'closed'; // Closed - Paid / Closed – Referred to Legal: red
  if (a.startsWith(FLOW_ACTIONS.escalated.toLowerCase()) || a === ACTIONS.manuallyEscalated.toLowerCase()) return 'esc';
  if (a.startsWith(ACTIONS.acknowledged.toLowerCase()) || a === ACTIONS.decisionLogged.toLowerCase()) return 'ack';
  return 'other';
}

/** One line of the timeline, whatever it came from. */
interface TimelineItem {
  key: string;
  action: string;
  who: string;
  when?: string;
  details?: string;
  /** Taken by a person in the app, or written by the flows. */
  origin: 'manual' | 'system';
  /** Set for an action taken in this session (it can be retried / dismissed). */
  local?: LocalAction;
  status?: 'saving' | 'failed';
  error?: string;
}

/** SLA tracking row → timeline line (automatic escalations, as the history showed them before). */
function fromTracking(t: TrackingRow): TimelineItem {
  const details = [
    t.slaStatus && `SLA ${t.slaStatus}`,
    t.startLabel && `Started ${t.startLabel}`,
    t.deadlineLabel && `Deadline ${t.deadlineLabel}`,
    t.escalatedLabel && `Escalated ${t.escalatedLabel}`,
    t.breachedLabel && `Breached ${t.breachedLabel}`,
    t.completedLabel && `Completed ${t.completedLabel}${t.closedBy ? ` by ${t.closedBy}` : ''}`,
  ].filter(Boolean);
  return {
    key: `sla-${t.id}`,
    origin: 'system',
    action: t.alert?.trim() || t.name || 'SLA tracking',
    who: t.owner ? `SLA tracking – ${t.owner}` : 'SLA tracking',
    when: t.createdOn,
    details: details.join(' · ') || undefined,
  };
}

function History({ history, onRetry }: { history: ReturnType<typeof useCaseHistory>; onRetry: (a: LocalAction) => void }) {
  const { rows, tracking, local, rowsError, trackingError, isLoading } = history;
  const items: TimelineItem[] = [
    ...local.map((a) => ({
      key: a.id,
      origin: 'manual' as const,
      local: a,
      action: a.action,
      who: a.by,
      when: a.createdOn,
      details: a.details,
      status: a.status === 'saved' ? undefined : a.status,
      error: a.error,
    })),
    ...(rows ?? []).map((h) => ({
      key: `h-${h.id}`,
      origin: h.role?.trim() === SYSTEM_ROLE ? ('system' as const) : ('manual' as const),
      action: h.action,
      who: h.role?.trim() === SYSTEM_ROLE ? 'Automatic' : `${h.role?.trim() || 'Unknown'} – ${h.createdBy ?? 'Unknown user'}`,
      when: h.createdOn,
      details: h.details,
    })),
    ...(tracking ?? []).map(fromTracking),
  ].sort((a, b) => (Date.parse(b.when ?? '') || 0) - (Date.parse(a.when ?? '') || 0));

  if (isLoading && !items.length)
    return (
      <div className="nd-tl">
        {[0, 1, 2].map((i) => (
          <div key={i} className="nd-tl-item">
            <span className="nd-skel" style={{ width: '45%' }} />
            <span className="nd-skel nd-skel--sub" style={{ width: '70%' }} />
          </div>
        ))}
      </div>
    );
  return (
    <>
      {rowsError && (
        <p className="nd-inline-error nd-tl-warn" title={rowsError}>
          <FontAwesomeIcon icon={faCircleExclamation} /> ND Case History could not be read: {rowsError}
        </p>
      )}
      {trackingError && !tracking && (
        <p className="nd-inline-error nd-tl-warn" title={trackingError}>
          <FontAwesomeIcon icon={faCircleExclamation} /> SLA tracking could not be read: {trackingError}
        </p>
      )}
      {!items.length ? (
        <p className="nd-empty">No actions yet</p>
      ) : (
        <div className="nd-tl">
          {items.map((h) => (
            <div key={h.key} className={`nd-tl-item ${historyTone(h.action)} is-${h.origin}${h.status ? ` is-${h.status}` : ''}`}>
              <div className="nd-tl-act">
                {h.action}
                {h.status === 'saving' && <span className="nd-tl-badge">Saving…</span>}
                {h.status === 'failed' && <span className="nd-tl-badge is-failed">Not saved</span>}
                <time className="nd-tl-when" dateTime={h.when}>
                  <FontAwesomeIcon icon={faClock} />
                  {formatDateTimeISO(h.when)}
                </time>
              </div>
              <div className="nd-tl-who">
                {!isClosureAction(h.action) && (
                  <span className={`nd-origin nd-origin--${h.origin}`}>{h.origin === 'manual' ? 'Manual' : SYSTEM_ROLE}</span>
                )}
                {h.who}
              </div>
              {h.details?.trim() && <div className="nd-tl-note">{h.details}</div>}
              {h.status === 'failed' && h.local && (
                <div className="nd-tl-failed">
                  {h.error && (
                    <span className="nd-tl-error" title={h.error}>
                      {h.error}
                    </span>
                  )}
                  <span className="nd-tl-failed__acts">
                    <button type="button" className="nd-tl-link" onClick={() => h.local && onRetry(h.local)}>
                      Retry
                    </button>
                    <button type="button" className="nd-tl-link is-muted" onClick={() => h.local && history.dismiss(h.local.id)}>
                      Dismiss
                    </button>
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** yyyy-mm-dd for <input type="date"> from an ISO date-time. */
const toDateInput = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function CaseDrawer({ row, latest, onClose, onSaved, onNotify, onCaseChanged, history }: Props) {
  const open = Boolean(row);
  const [saving, setSaving] = useState<Saving>();
  const [dialog, setDialog] = useState<{ caseId: string; kind: Dialog }>();
  const openDialog = dialog && dialog.caseId === row?.id ? dialog.kind : undefined;
  const closeDialog = () => setDialog(undefined);
  // The form belongs to one case + tracking row; showing another one starts from its saved due date.
  const formKey = `${row?.id}|${latest?.id}|${latest?.deadline}`;
  const [form, setForm] = useState<{ key: string; due: string; owner: string; error?: string }>({ key: '', due: '', owner: '' });
  const current =
    form.key === formKey ? form : { key: formKey, due: toDateInput(latest?.deadline), owner: latest?.ownerUserId ?? '', error: undefined };
  const { due: dueDate, owner: assignTo, error: saveError } = current;
  const setDueDate = (due: string) => setForm({ ...current, due });
  const setAssignTo = (owner: string) => setForm({ ...current, owner });
  const setSaveError = (error?: string) => setForm({ ...current, error });
  const { users, error: usersError } = useAssignableUsers(open);

  const userName = (id: string) => users?.find((u) => u.id === id)?.name ?? (id === latest?.ownerUserId ? latest?.owner : undefined) ?? 'the selected user';
  const patientId = row ? (row.patientId ?? row.name) : '';
  const me = useCurrentUser()?.name ?? 'You';
  const isDecisionRow = (action: string) => action.trim() === ACTIONS.decisionLogged || action.trim() === ACTIONS.manuallyEscalated;
  const decisionCount =
    (history.rows?.filter((h) => isDecisionRow(h.action)).length ?? 0) +
    history.local.filter((a) => isDecisionRow(a.action) && a.status === 'saving').length;
  const canAcknowledge = row?.caseAlertValue !== undefined && CASE_ALERT_ACKNOWLEDGEABLE.includes(row.caseAlertValue);
  // "Closed" line: shown for Closed - Paid / Closed – Referred to Legal, from the latest closure row.
  const closedNow = row?.caseStatusValue === 2 || row?.caseStatusValue === 3;
  const closure = (() => {
    if (!closedNow) return undefined;
    const isClosure = (action: string) => CLOSURE_ACTIONS.includes(action.trim());
    const fromServer = history.rows
      ?.filter((h) => isClosure(h.action))
      .map((h) => ({ when: h.createdOn, who: h.role?.trim() === SYSTEM_ROLE ? SYSTEM_ROLE : `${h.role?.trim() || 'Unknown'} – ${h.createdBy ?? 'Unknown user'}` }));
    const justNow = history.local
      .filter((a) => isClosure(a.action) && a.status !== 'failed')
      .map((a) => ({ when: a.createdOn, who: a.by }));
    return [...justNow, ...(fromServer ?? [])].sort((a, b) => (Date.parse(b.when ?? '') || 0) - (Date.parse(a.when ?? '') || 0))[0];
  })();

  /** One history row per action; a failure only warns (the action itself already succeeded). */
  async function record(caseId: string, action: string, details: string, buId?: string) {
    // Shown in the timeline at once; marked "Not saved" (with the reason) if the write fails.
    const localId = history.addLocal({ caseId, action, details, by: me, buId });
    const result = await addHistory(caseId, action, details, buId);
    history.settle(localId, result.ok, result.ok ? undefined : result.error);
    history.refresh(caseId);
    if (!result.ok) onNotify(`${HISTORY_WARNING}: ${result.error}`, 'warning');
    return result.ok;
  }

  /** Saves a failed action to ND Case History again. */
  async function retryHistory(a: LocalAction) {
    history.restart(a.id);
    const result = await addHistory(a.caseId, a.action, a.details, a.buId);
    history.settle(a.id, result.ok, result.ok ? undefined : result.error);
    history.refresh(a.caseId);
    onNotify(result.ok ? `${a.action} saved to history` : `${HISTORY_WARNING}: ${result.error}`, result.ok ? 'success' : 'warning');
  }

  /** Alert → Acknowledged (plus the SLA tracking update it always did). Never sets notdis_decisionon. */
  async function acknowledge() {
    if (!row) return;
    setSaving('ack');
    setSaveError(undefined);
    const newOwner = latest && assignTo && assignTo !== latest.ownerUserId ? assignTo : undefined;
    try {
      await updateCase(row.id, { notdis_alert: CASE_ALERT_ACKNOWLEDGED }, 'Acknowledging the case');
    } catch (err) {
      setSaveError(errorMessage(err, 'Could not acknowledge the case.'));
      setSaving(undefined);
      return;
    }
    // Time since the flow last notified (or since the case was created).
    const since = Date.parse(row.lastNotifiedOn ?? row.createdOn ?? '');
    const elapsed = Number.isNaN(since) ? undefined : Date.now() - since;
    onCaseChanged(row.id, { caseAlert: 'Acknowledged', caseAlertValue: CASE_ALERT_ACKNOWLEDGED });
    const historyWritten = record(
      row.id,
      ACTIONS.acknowledged,
      elapsed === undefined
        ? 'Time to acknowledge: unknown'
        : `Time to acknowledge: ${formatHoursMinutes(elapsed)} · ${elapsed <= ACK_SLA_HOURS * 3_600_000 ? 'Within SLA' : 'SLA Breached'}`,
      row.buId,
    );
    const slaUpdated: Promise<string | undefined> = latest
      ? recordDecision(latest.id, 'acknowledged', dueDate || undefined, newOwner).then(
          () => undefined,
          (err: unknown) => errorMessage(err, 'Could not update SLA tracking.'),
        )
      : Promise.resolve(undefined);
    const [, slaError] = await Promise.all([historyWritten, slaUpdated]);
    onSaved('Acknowledged');
    if (slaError) onNotify(`Acknowledged, but SLA tracking was not updated: ${slaError}`, 'warning');
    setSaving(undefined);
  }

  /**
   * Log Decision = one step of the escalation chain (only closing the case ends the chain):
   * notify the chosen person (TMS task), then move the chain to them — notdis_notifiedlevel =
   * max(current, their Config level), notdis_lastnotifiedon = now (restarts the 24-hour clock),
   * notdis_alert = Escalated, notdis_decisionon = now (shown as "Last decision") — then history.
   */
  async function logDecision(d: DecisionInput) {
    if (!row) return;
    setSaving('decision');
    const target = d.escalatedToName || userName(d.escalatedTo);
    let step: { level: number; role: string } | undefined;
    let current: number | undefined;
    try {
      [step, current] = await Promise.all([fetchEscalationLevel(d.escalatedTo, row.buId), fetchNotifiedLevel(row.id)]);
    } catch (err) {
      onNotify(`Decision not saved: ${errorMessage(err, 'could not read the escalation level.')}`, 'error');
      setSaving(undefined);
      return;
    }
    // Notify the chosen person (Teams is not available in this app yet; the TMS task is the notification).
    const handoff = await createHandoff(
      row.id,
      d.escalatedTo,
      d.dueDate,
      `ND Decision – Escalated – ${patientId}`,
      `${d.issue} | Reason: ${d.reason} | Criticality: ${d.criticality}`,
    );
    if (!handoff.ok) {
      onNotify(`Decision not saved: ${target} could not be notified. ${handoff.error}`, 'error');
      setSaving(undefined);
      return;
    }
    const now = new Date().toISOString();
    const fields: Record<string, unknown> = {
      notdis_lastnotifiedon: now,
      notdis_alert: CASE_ALERT_ESCALATED,
      notdis_decisionon: now,
    };
    // Not in the Config: the notified level stays as it is.
    if (step) fields.notdis_notifiedlevel = Math.max(current ?? 0, step.level);
    try {
      await updateCase(row.id, fields, 'Logging the decision', { escalationStep: true });
    } catch (err) {
      onNotify(`${target} was notified, but the case was not updated: ${errorMessage(err, 'Could not log the decision.')}`, 'error');
      setSaving(undefined);
      return;
    }
    const recorded = await record(
      row.id,
      ACTIONS.manuallyEscalated,
      `Escalated to: ${target} (${step?.role ?? 'Not in Config'}) · Issue: ${d.issue} · Reason: ${d.reason} · Criticality: ${d.criticality} · Due: ${formatDateInputDMY(d.dueDate)}`,
      row.buId,
    );
    closeDialog();
    onCaseChanged(row.id, { decisionOn: now, decisionOnLabel: undefined, caseAlert: 'Escalated', caseAlertValue: CASE_ALERT_ESCALATED });
    if (recorded) onSaved(`Escalated to ${target}${step ? ` (level ${fields.notdis_notifiedlevel as number})` : ''}`);
    setSaving(undefined);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const hot = row?.balance !== undefined && row.balance > BALANCE_THRESHOLD;
  const late = row?.daysNoPayment !== undefined && row.daysNoPayment >= DAYS_THRESHOLD;
  const busy = Boolean(saving);

  return (
    <>
      <div className={`nd-scrim${open ? ' on' : ''}`} onClick={onClose} />
      <aside className={`nd-drawer${open ? ' on' : ''}`} role="dialog" aria-modal="true" aria-hidden={!open}>
        {row && (
          <>
            <div className="nd-d-head">
              <div className="nd-d-top">
                <div>
                  <div className="nd-d-name">{row.name}</div>
                  <div className="nd-d-meta">
                    <span className="nd-mono">{row.patientId ?? '—'}</span>
                    {row.room && <> · Room {row.room}</>}
                    {row.entity && (
                      <>
                        {' · '}
                        <span className="nd-ent">{row.entity}</span>
                      </>
                    )}
                  </div>
                </div>
                <button type="button" className="nd-x" onClick={onClose} aria-label="Close">
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>
              <div className="nd-d-tags">
                <RiskTag label={row.riskLabel} />
                <AlertTag label={row.caseAlert ?? 'Pending'} />
                {row.flag && <span className="nd-d-flag">{row.flag}</span>}
              </div>
            </div>

            <div className="nd-d-body">
              {latest?.slaStatus === 'Breached' ? (
                <div className="nd-d-warn">
                  <FontAwesomeIcon icon={faTriangleExclamation} />
                  <span>
                    SLA breached{latest.deadlineLabel && <> · deadline was <b>{latest.deadlineLabel}</b></>}
                  </span>
                </div>
              ) : !row.lastPaymentDate ? (
                <div className="nd-d-warn amber">
                  <FontAwesomeIcon icon={faClock} />
                  <span>
                    No payment since admission
                    {row.daysNoPayment !== undefined && (
                      <>
                        {' · '}
                        <b>
                          {row.daysNoPayment} day{row.daysNoPayment === 1 ? '' : 's'}
                        </b>
                      </>
                    )}
                  </span>
                </div>
              ) : null}

              <Sect title="Financial position">
                <dl className="nd-kv">
                  <dt>Total charges</dt>
                  <dd className="nd-mono">{formatMoney(row.totalBill, row.currency)}</dd>
                  <dt>Paid to date</dt>
                  <dd className="nd-mono">
                    {formatMoney(row.amountPaid, row.currency)}
                    {row.paidPct !== undefined && <span className="nd-kv-note"> ({formatPct(row.paidPct)} paid)</span>}
                  </dd>
                  <dt className="nd-kv-sub">Debit</dt>
                  <dd className="nd-mono nd-kv-sub">{formatMoney(row.debit, row.currency)}</dd>
                  <dt className="nd-kv-sub">Credit</dt>
                  <dd className="nd-mono nd-kv-sub">{formatMoney(row.credit, row.currency)}</dd>
                  <dt>Balance due</dt>
                  <dd className={`big nd-mono${hot ? ' red' : ''}`}>
                    {formatMoney(row.balance, row.currency)}
                    {row.unpaidPct !== undefined && <span className="nd-kv-note"> ({formatPct(row.unpaidPct)} unpaid)</span>}
                  </dd>
                  <dt>Amount exceeding</dt>
                  <dd className={`nd-mono${(amountExceeding(row.balance, row.currency) ?? 0) > 0 ? ' red' : ''}`} title={`High-value threshold ${formatMoney(highValueThreshold(row.currency), row.currency)}`}>
                    {formatMoney(amountExceeding(row.balance, row.currency), row.currency)}
                  </dd>
                  <dt>Last payment</dt>
                  <dd className="nd-mono">
                    {row.lastPaymentAmount !== undefined
                      ? `${formatMoney(row.lastPaymentAmount, row.currency)} on ${row.lastPaymentLabel ?? formatDate(row.lastPaymentDate)}`
                      : 'None'}
                  </dd>
                  <dt>Days no payment</dt>
                  <dd className={`nd-mono${late ? ' red' : ''}`}>{row.daysNoPayment !== undefined ? `${row.daysNoPayment} days` : '—'}</dd>
                  <dt>Loss day</dt>
                  <dd className="nd-mono">{formatDays(row.lossDay)}</dd>
                </dl>
              </Sect>

              <Sect title="Stay & coverage">
                <dl className="nd-kv">
                  <dt>Visit ID</dt>
                  <dd className="nd-mono">{row.visitId ?? '—'}</dd>
                  <dt>National ID</dt>
                  <dd className="nd-mono">{row.nationalId ?? '—'}</dd>
                  <dt>Payer / company</dt>
                  <dd>{row.payer ?? '—'}</dd>
                  <dt>Admission</dt>
                  <dd>{row.admissionLabel ?? formatDate(row.admissionDate)}</dd>
                  <dt>Discharged</dt>
                  <dd>{row.discharged === undefined ? <Dim>Not set</Dim> : row.discharged ? 'Yes' : 'No'}</dd>
                  <dt>Length of stay</dt>
                  <dd className="nd-mono">{row.lengthOfStay !== undefined ? `${row.lengthOfStay} days` : '—'}</dd>
                  <dt>Contact</dt>
                  <dd>
                    {row.phone ? (
                      <a className="nd-tel" href={`tel:${row.phone.replace(/\s/g, '')}`}>
                        <FontAwesomeIcon icon={faPhone} /> {row.phone}
                      </a>
                    ) : (
                      '—'
                    )}
                  </dd>
                </dl>
              </Sect>

              <Sect title="Ownership">
                <dl className="nd-kv">
                  <dt>Assigned to</dt>
                  <dd>{latest?.owner ?? <Dim>Unassigned</Dim>}</dd>
                  <dt>Due date</dt>
                  <dd>{latest?.deadlineLabel ?? (latest?.deadline ? formatDate(latest.deadline) : <Dim>Not set</Dim>)}</dd>
                  <dt>Last decision</dt>
                  <dd>{row.decisionOn ? (row.decisionOnLabel ?? formatDateTimeUS(row.decisionOn)) : <Dim>None yet</Dim>}</dd>
                  {closedNow && (
                    <>
                      <dt>Closed</dt>
                      <dd>{closure ? `${formatDateTimeDMY(closure.when)} · ${closure.who}` : <Dim>Not recorded</Dim>}</dd>
                    </>
                  )}
                </dl>
              </Sect>

              <Sect title="Action history">
                <History history={history} onRetry={retryHistory} />
              </Sect>
            </div>

            {closedNow ? (
              <div className="nd-d-foot nd-d-foot--ro">
                <FontAwesomeIcon icon={faLock} />
                <span>
                  This case is <b>{row.caseStatus ?? 'closed'}</b> — no further actions. Its history stays above.
                </span>
              </div>
            ) : (
            <div className="nd-d-foot">
              {latest && (
                <div className="nd-f-row">
                  <div>
                    <span className="nd-f-lbl">Assign to</span>
                    <SoftSelect
                      floating
                      className="nd-soft--field"
                      ariaLabel="Assign to"
                      value={assignTo}
                      onChange={setAssignTo}
                      disabled={!users}
                      placeholder={usersError ? 'Users unavailable' : (latest.owner ?? 'Loading users…')}
                      options={[
                        ...(!latest.ownerUserId ? [{ value: '', label: latest.owner ?? 'Unassigned' }] : []),
                        ...(latest.ownerUserId && users && !users.some((u) => u.id === latest.ownerUserId)
                          ? [{ value: latest.ownerUserId, label: latest.owner ?? 'Current owner' }]
                          : []),
                        ...(users ?? []).map((u) => ({ value: u.id, label: u.name })),
                      ]}
                    />
                  </div>
                  <div>
                    <label className="nd-f-lbl" htmlFor="nd-due">
                      Due date
                    </label>
                    <input id="nd-due" type="date" value={dueDate} min={todayInput()} onChange={(e) => setDueDate(e.target.value)} />
                  </div>
                </div>
              )}
              {saveError && (
                <p className="nd-inline-error" role="alert">
                  <FontAwesomeIcon icon={faCircleExclamation} /> {saveError}
                </p>
              )}
              <div className="nd-acts">
                {canAcknowledge && (
                  <button type="button" className="nd-btn nd-btn-ack" disabled={busy} onClick={acknowledge}>
                    <FontAwesomeIcon icon={saving === 'ack' ? faSpinner : faCheck} spin={saving === 'ack'} /> Acknowledge
                  </button>
                )}
                <button
                  type="button"
                  className="nd-btn nd-btn-dec2"
                  disabled={busy}
                  onClick={() => setDialog({ caseId: row.id, kind: 'decision' })}
                  aria-label={`Decision (${decisionCount} logged)`}
                >
                  <FontAwesomeIcon icon={faClipboardCheck} /> Decision
                  {decisionCount > 0 && <span className="nd-count">{decisionCount}</span>}
                </button>
              </div>
            </div>
            )}

            {!closedNow && openDialog === 'decision' && (
              <DecisionDialog patientId={patientId} saving={saving === 'decision'} onCancel={closeDialog} onSubmit={logDecision} />
            )}
          </>
        )}
      </aside>
    </>
  );
}
