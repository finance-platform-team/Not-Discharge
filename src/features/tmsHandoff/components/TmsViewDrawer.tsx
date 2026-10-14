import { useEffect, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { isOverdue, type TmsRow } from '../api';

const Dim = ({ children }: { children: ReactNode }) => <span className="nd-dim">{children}</span>;

/** Read-only details of one hand-off (the View button). */
export function TmsViewDrawer({ row, onClose }: { row?: TmsRow; onClose: () => void }) {
  const open = Boolean(row);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      <div className={`nd-scrim${open ? ' on' : ''}`} onClick={onClose} />
      <aside className={`nd-drawer${open ? ' on' : ''}`} role="dialog" aria-modal="true" aria-hidden={!open}>
        {row && (
          <>
            <div className="nd-d-head">
              <div className="nd-d-top">
                <div>
                  <div className="nd-d-name">{row.title}</div>
                  <div className="nd-d-meta nd-mono">
                    {[row.decisionId, row.taskId && `Task ${row.taskId}`].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                <button type="button" className="nd-x" onClick={onClose} aria-label="Close">
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>
              {row.priority && (
                <div className="nd-d-tags">
                  <span className="nd-d-flag">Priority: {row.priority}</span>
                </div>
              )}
            </div>

            <div className="nd-d-body">
              <div className="nd-sect">
                <div className="nd-sect-h">Decision</div>
                <div className="nd-sect-b">
                  <dl className="nd-kv">
                    <dt>Decision</dt>
                    <dd>{row.decision ?? <Dim>—</Dim>}</dd>
                    <dt>Description</dt>
                    <dd className="tms-pre">{row.description ?? <Dim>No description</Dim>}</dd>
                    <dt>Source</dt>
                    <dd>{[row.source, row.tag].filter(Boolean).join(' · ') || <Dim>—</Dim>}</dd>
                  </dl>
                </div>
              </div>

              <div className="nd-sect">
                <div className="nd-sect-h">Ownership & SLA</div>
                <div className="nd-sect-b">
                  <dl className="nd-kv">
                    <dt>Assignee</dt>
                    <dd>{row.assignee ?? <Dim>Unassigned</Dim>}</dd>
                    <dt>SLA</dt>
                    <dd className="nd-mono">{row.sla ?? '—'}</dd>
                    <dt>Due date</dt>
                    <dd className={isOverdue(row) ? 'red' : undefined}>{row.dueLabel ?? <Dim>Not set</Dim>}</dd>
                    <dt>Sent</dt>
                    <dd>{row.createdLabel ?? '—'}</dd>
                    <dt>Sent by</dt>
                    <dd>{row.createdBy ?? '—'}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
