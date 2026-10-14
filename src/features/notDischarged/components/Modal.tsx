import { useEffect, useId, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';

interface Props {
  title: string;
  subtitle?: string;
  /** While saving, the dialog can't be dismissed. */
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}

/** Centered dialog in the app's style. Escape or a click outside closes it (unless busy). */
export function Modal({ title, subtitle, busy, onClose, children, footer }: Props) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // An open dropdown inside the dialog takes the Escape first (it closes itself).
      if (document.querySelector('.nd-soft.is-open, .nd-user-search.is-open')) return;
      e.stopPropagation(); // the drawer behind listens for Escape too
      if (!busy) onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [busy, onClose]);

  return (
    <div className="nd-modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="nd-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="nd-modal__head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="nd-x" onClick={onClose} disabled={busy} aria-label="Close">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <div className="nd-modal__body">{children}</div>
        <div className="nd-modal__foot">{footer}</div>
      </div>
    </div>
  );
}

/** Label + control + inline error, one per form row. */
export function Field({ label, required, error, htmlFor, children }: { label: string; required?: boolean; error?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className={`nd-field${error ? ' has-error' : ''}`}>
      {htmlFor ? (
        <label className="nd-f-lbl" htmlFor={htmlFor}>
          {label} {required && <i className="nd-req">*</i>}
        </label>
      ) : (
        <span className="nd-f-lbl">
          {label} {required && <i className="nd-req">*</i>}
        </span>
      )}
      {children}
      {error && <span className="nd-f-hint">{error}</span>}
    </div>
  );
}
