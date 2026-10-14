import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { Field, Modal } from './Modal';
import { CRITICALITY, todayInput, type Criticality, type DecisionInput } from '../workflow';
import { UserSearch } from './UserSearch';


function Footer({ saving, confirmLabel, onCancel, onConfirm }: { saving: boolean; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <>
      <button type="button" className="nd-btn nd-btn-ghost" disabled={saving} onClick={onCancel}>
        Cancel
      </button>
      <button type="button" className="nd-btn nd-btn-ack" disabled={saving} onClick={onConfirm}>
        <FontAwesomeIcon icon={saving ? faSpinner : faCheck} spin={saving} /> {confirmLabel}
      </button>
    </>
  );
}

/* ---------------- Case Decision ---------------- */

export function DecisionDialog({ patientId, saving, onCancel, onSubmit }: { patientId: string; saving: boolean; onCancel: () => void; onSubmit: (d: DecisionInput) => void }) {
  const [issue, setIssue] = useState('');
  const [reason, setReason] = useState('');
  const [escalatedTo, setEscalatedTo] = useState<{ id: string; name: string }>();
  const [dueDate, setDueDate] = useState('');
  const [criticality, setCriticality] = useState<Criticality | ''>('');
  const [tried, setTried] = useState(false);

  const errors = {
    issue: !issue.trim() ? 'Issue description is required.' : undefined,
    reason: !reason.trim() ? 'Escalation reason is required.' : undefined,
    criticality: !criticality ? 'Choose a criticality.' : undefined,
    escalatedTo: !escalatedTo ? 'Choose who to escalate to.' : undefined,
    dueDate: !dueDate ? 'Due date is required.' : dueDate < todayInput() ? 'The due date can’t be in the past.' : undefined,
  };
  const show = (e?: string) => (tried ? e : undefined);

  const submit = () => {
    setTried(true);
    if (Object.values(errors).some(Boolean) || !escalatedTo || !criticality) return;
    onSubmit({ issue: issue.trim(), reason: reason.trim(), criticality, escalatedTo: escalatedTo.id, escalatedToName: escalatedTo.name, dueDate });
  };

  return (
    <Modal
      title={`Case Decision — ${patientId}`}
      subtitle="Escalates the case to the chosen person; the automatic escalation continues from them until the case is closed."
      busy={saving}
      onClose={onCancel}
      footer={<Footer saving={saving} confirmLabel="Log Decision" onCancel={onCancel} onConfirm={submit} />}
    >
      <Field label="Issue description" required htmlFor="nd-dec-issue" error={show(errors.issue)}>
        <textarea id="nd-dec-issue" rows={3} value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="What is the issue with this case?" autoFocus />
      </Field>
      <Field label="Escalation reason" required htmlFor="nd-dec-reason" error={show(errors.reason)}>
        <textarea id="nd-dec-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this decision needed?" />
      </Field>
      <Field label="Criticality" required error={show(errors.criticality)}>
        <div className="nd-seg nd-seg--crit" role="radiogroup" aria-label="Criticality">
          {CRITICALITY.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={criticality === c} className={`crit-${c.toLowerCase()}${criticality === c ? ' on' : ''}`} onClick={() => setCriticality(c)}>
              {c}
            </button>
          ))}
        </div>
      </Field>
      <div className="nd-f-row">
        <Field label="Escalated to" required error={show(errors.escalatedTo)}>
          <UserSearch value={escalatedTo} onChange={setEscalatedTo} placeholder="Search for a user…" ariaLabel="Escalated to" />
        </Field>
        <Field label="Due date" required htmlFor="nd-dec-due" error={show(errors.dueDate)}>
          <input id="nd-dec-due" type="date" min={todayInput()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>
      <p className="nd-esc__note">The selected user gets a TMS task; if the case is still open 24 hours later, it escalates to the next level.</p>
    </Modal>
  );
}

/* ---------------- One required text (Follow-up Note, closure reason) ---------------- */

export function TextDialog({
  title,
  summary,
  label,
  placeholder,
  confirmLabel,
  saving,
  onCancel,
  onSubmit,
}: {
  title: string;
  summary?: string;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  const error = !text.trim() ? `${label} is required.` : undefined;
  const submit = () => {
    setTried(true);
    if (!error) onSubmit(text.trim());
  };
  return (
    <Modal title={title} subtitle={summary} busy={saving} onClose={onCancel} footer={<Footer saving={saving} confirmLabel={confirmLabel} onCancel={onCancel} onConfirm={submit} />}>
      <Field label={label} required htmlFor="nd-text" error={tried ? error : undefined}>
        <textarea id="nd-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} autoFocus />
      </Field>
    </Modal>
  );
}
