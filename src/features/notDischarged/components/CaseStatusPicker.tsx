import { memo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faCircleDot, faCircleQuestion, faHourglassHalf, faScaleBalanced, faSpinner, type IconDefinition } from '@fortawesome/free-solid-svg-icons';
import type { CaseRow } from '../types';
import { CASE_STATUS } from '../schema';
import { SoftSelect } from './SoftSelect';

const OPTIONS = Object.entries(CASE_STATUS).map(([value, label]) => ({ value, label }));

type Tone = 'open' | 'paid' | 'legal' | 'pending' | 'none';

/** Each status gets its own colour and icon, so it reads at a glance. */
const TONE_ICON: Record<Tone, IconDefinition> = {
  open: faCircleDot,
  paid: faCircleCheck,
  legal: faScaleBalanced,
  pending: faHourglassHalf,
  none: faCircleQuestion,
};

function tone(label?: string): Tone {
  const t = label?.toLowerCase() ?? '';
  return t.includes('legal') ? 'legal' : t.includes('pending') ? 'pending' : t.includes('paid') ? 'paid' : t.includes('open') ? 'open' : 'none';
}

interface Props {
  row: CaseRow;
  saving: boolean;
  /** Billing Supervisors and Duty Managers see the status but cannot change it. */
  canEdit: boolean;
  /** previous = the status label before the change, for the history note. */
  onChange: (caseId: string, value: string, previous?: string) => void;
}

/** notdis_casestatus shown as a status badge; clicking it opens the list to change it. Clicks stay here. */
export const CaseStatusPicker = memo(function CaseStatusPicker({ row, saving, canEdit, onChange }: Props) {
  const t = tone(row.caseStatus);
  if (!canEdit)
    return (
      <span className={`nd-cs nd-cs--${t}`} title={`${row.caseStatus ?? 'Case status not set'} · your role can't change it`}>
        <span className="nd-soft__btn is-static">
          <FontAwesomeIcon icon={TONE_ICON[t]} className="nd-cs__icon" />
          <span className="nd-soft__val">{row.caseStatus ?? 'Not set'}</span>
        </span>
      </span>
    );
  return (
    <div className="nd-cs" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <SoftSelect
        floating
        className={`nd-cs--${t}`}
        ariaLabel={`Case status of ${row.name}: ${row.caseStatus ?? 'not set'}. Change status`}
        title={row.caseStatus ? `${row.caseStatus} · click to change` : 'Set case status'}
        icon={<FontAwesomeIcon icon={saving ? faSpinner : TONE_ICON[t]} spin={saving} className="nd-cs__icon" />}
        value={row.caseStatusValue !== undefined ? String(row.caseStatusValue) : ''}
        placeholder="Set status"
        options={OPTIONS}
        disabled={saving}
        onChange={(v) => v !== String(row.caseStatusValue) && onChange(row.id, v, row.caseStatus)}
      />
    </div>
  );
});

interface LegalProps {
  row: CaseRow;
  saving: boolean;
  onChange: (caseId: string, value: boolean) => void;
}

/** notdis_referredtolegal as a Yes / No switch; anyone can set Yes, and Yes is final (no way back to No). Clicks stay here. */
export const ReferredToLegalPicker = memo(function ReferredToLegalPicker({ row, saving, onChange }: LegalProps) {
  const on = row.referredToLegal === true;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`Referred to Legal for ${row.name}`}
      title={on ? "Referred to Legal · can't be changed back to No" : 'Not referred to Legal · click to set Yes'}
      className={`nd-switch${on ? ' is-on is-locked' : ''}`}
      disabled={saving || on}
      onClick={(e) => {
        e.stopPropagation();
        if (!on) onChange(row.id, true);
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <span className="nd-switch__track" aria-hidden="true">
        <span className="nd-switch__thumb">{saving && <FontAwesomeIcon icon={faSpinner} spin />}</span>
      </span>
      <span className="nd-switch__label">{on ? 'Yes' : 'No'}</span>
    </button>
  );
});
