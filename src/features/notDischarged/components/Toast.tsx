import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faCircleExclamation, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import type { ToastTone } from '../useToast';

const ICON = { success: faCircleCheck, warning: faTriangleExclamation, error: faCircleExclamation } as const;

export function Toast({ message, on, tone = 'success' }: { message?: string; on: boolean; tone?: ToastTone }) {
  return (
    <div className={`nd-toast nd-toast--${tone}${on ? ' on' : ''}`} role={tone === 'error' ? 'alert' : 'status'} aria-live="polite">
      <FontAwesomeIcon icon={ICON[tone]} className="nd-toast__icon" />
      {message}
    </div>
  );
}
