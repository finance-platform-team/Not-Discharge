import { memo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleExclamation, faInbox, faRotateRight } from '@fortawesome/free-solid-svg-icons';
import { riskTone } from '../risk';

const ALERT_CLASS: Record<string, string> = {
  pending: 'nd-status--pending',
  acknowledged: 'nd-status--acknowledged',
  escalated: 'nd-status--escalated',
};

/** Alert state from cfm_slatracking.notdis_alert (label, never the numeric value). */
export const AlertTag = memo(function AlertTag({ label, pending }: { label?: string; pending?: boolean }) {
  if (pending) return <span className="nd-skel nd-skel--tag" aria-label="Loading alert" />;
  if (!label) return <span className="nd-status nd-status--none">No tracking</span>;
  const text = label.trim();
  return (
    <span className={`nd-status ${ALERT_CLASS[text.toLowerCase()] ?? 'nd-status--none'}`}>
      <span className="nd-status__dot" />
      {text}
    </span>
  );
});

/** The Risk column as stored in Dataverse (notdis_risk). */
export function RiskTag({ label }: { label?: string }) {
  if (!label) return <span className="nd-risk nd-risk--none">—</span>;
  return <span className={`nd-risk nd-risk--${riskTone(label) ?? 'none'}`}>{label}</span>;
}

function paidTone(pct: number) {
  return pct >= 70 ? 'g' : pct >= 40 ? 'y' : 'r';
}

/** Bar of the paid share of the bill (BRD A.1.1 "Paid %"). */
export function PaidTrack({ pct, compact }: { pct?: number; compact?: boolean }) {
  if (pct === undefined) return null;
  return (
    <span className={compact ? 'nd-t-track' : 'nd-track'} aria-label={`${pct}% paid`}>
      <span className={`nd-fill nd-fill--${paidTone(pct)}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </span>
  );
}

export function EmptyState({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="nd-noresult">
      <FontAwesomeIcon icon={faInbox} className="nd-noresult__icon" />
      <h3>No patients match</h3>
      <p>{filtered ? 'Try widening the risk filter or clearing the search.' : 'There are no active not-discharged cases in this region.'}</p>
      {filtered && (
        <button type="button" className="nd-clearbtn" onClick={onClear}>
          Clear all
        </button>
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="nd-noresult nd-noresult--error" role="alert">
      <FontAwesomeIcon icon={faCircleExclamation} className="nd-noresult__icon" />
      <h3>Couldn’t load cases</h3>
      <p className="nd-noresult__detail">{message}</p>
      <button type="button" className="nd-btn-dec" onClick={onRetry}>
        <FontAwesomeIcon icon={faRotateRight} /> Try again
      </button>
    </div>
  );
}
