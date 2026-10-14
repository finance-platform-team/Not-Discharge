import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClockRotateLeft, faEye } from '@fortawesome/free-solid-svg-icons';
import { isOverdue, type TmsRow } from '../api';

function initials(name?: string) {
  return (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

const COLUMNS = ['Task ID', 'Decision ID', 'Task title', 'Assignee', 'SLA / Due', 'Sent', 'View'];
const HIDE: Record<string, string> = { 'Decision ID': 'tms-c-md', Sent: 'tms-c-md' };

export function TmsTable({ rows, onView }: { rows: TmsRow[]; onView: (row: TmsRow) => void }) {
  return (
    <div className="nd-tablewrap">
      <table className="nd-table tms-table">
        <thead>
          <tr className="col">
            {COLUMNS.map((c) => (
              <th key={c} className={HIDE[c]}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const late = isOverdue(r);
            return (
              <tr key={r.id} onClick={() => onView(r)}>
                <td className="nd-mono">{r.taskId ?? '—'}</td>
                <td className={`nd-mono tms-dec ${HIDE['Decision ID']}`}>{r.decisionId ?? '—'}</td>
                <td className="tms-title">
                  <div className="nd-t-top">{r.title}</div>
                </td>
                <td>
                  {r.assignee ? (
                    <span className="tms-person" title={r.assignee}>
                      <span className="tms-avatar" aria-hidden="true">{initials(r.assignee)}</span>
                      <span className="tms-clip">{r.assignee}</span>
                    </span>
                  ) : (
                    <span className="nd-dim">Unassigned</span>
                  )}
                </td>
                <td>
                  <div className={`tms-sla${late ? ' late' : ''}`}>
                    <FontAwesomeIcon icon={faClockRotateLeft} /> {r.sla ?? '—'}
                  </div>
                  <div className="nd-t-sub nd-mono">{r.dueLabel ?? '—'}</div>
                </td>
                <td className={`nd-mono tms-muted ${HIDE.Sent}`}>{r.createdLabel ?? '—'}</td>
                <td>
                  <button
                    type="button"
                    className="tms-btn-view"
                    onClick={(e) => {
                      e.stopPropagation();
                      onView(r);
                    }}
                  >
                    <FontAwesomeIcon icon={faEye} /> View
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TmsTableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="nd-tablewrap">
      <table className="nd-table tms-table">
        <thead>
          <tr className="col">
            {COLUMNS.map((c) => (
              <th key={c} className={HIDE[c]}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i} className="nd-skel-row">
              {COLUMNS.map((c) => (
                <td key={c} className={HIDE[c]}>
                  <span className="nd-skel" style={{ width: c === 'Task title' ? '70%' : '60%' }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
