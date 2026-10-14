import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronRight, faMoon, faRotateRight, faSun } from '@fortawesome/free-solid-svg-icons';
import { useCurrentUser } from '../useCurrentUser';
import { useTheme } from '../useTheme';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

interface Props {
  section?: string;
  title?: string;
  /** Shows a Refresh button that re-reads everything on screen. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** When the data on screen was last read (ms). */
  updatedAt?: number;
}

const timeLabel = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export function Topbar({ section = 'Case List', title = 'Not-Discharged Case List', onRefresh, refreshing, updatedAt }: Props) {
  const user = useCurrentUser();
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <header className="nd-topbar">
      <div className="nd-topbar__context">
        <nav className="nd-crumbs" aria-label="Breadcrumb">
          <span>Core</span>
          <FontAwesomeIcon icon={faChevronRight} />
          <span>Revenue Cycle</span>
          <FontAwesomeIcon icon={faChevronRight} />
          <span aria-current="page">{section}</span>
        </nav>
        <h1>{title}</h1>
      </div>
      <div className="nd-topbar__right">
      <button
        type="button"
        className="nd-theme"
        onClick={toggle}
        aria-pressed={dark}
        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={dark ? 'Light mode' : 'Dark mode'}
      >
        <FontAwesomeIcon icon={dark ? faSun : faMoon} />
      </button>
      {onRefresh && (
        <button type="button" className="nd-refresh" onClick={onRefresh} disabled={refreshing} title="Read the latest data from Dataverse (also refreshes on its own every minute)">
          <FontAwesomeIcon icon={faRotateRight} spin={refreshing} />
          <span className="nd-refresh__label">Refresh</span>
          {updatedAt !== undefined && <small>Updated {timeLabel(updatedAt)}</small>}
        </button>
      )}
      {user?.name && (
        <div className="nd-profile" title={user.email}>
          <span className="nd-profile__avatar" aria-hidden="true">{initials(user.name)}</span>
          <div>
            <strong>{user.name}</strong>
            {user.email && <span>{user.email}</span>}
          </div>
        </div>
      )}
      </div>
    </header>
  );
}
