import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBedPulse, faBriefcaseMedical, faListCheck, faSitemap } from '@fortawesome/free-solid-svg-icons';
import type { Region } from '../types';

export type AppPage = 'cases' | 'tms' | 'config';

const PAGES: { value: AppPage; label: string; sub: string; icon: typeof faBedPulse }[] = [
  { value: 'cases', label: 'Not-Discharged Cases', sub: 'Case list & decisions', icon: faBedPulse },
  { value: 'config', label: 'Escalation Config', sub: 'Levels, roles & users', icon: faSitemap },
  { value: 'tms', label: 'TMS Hand Off', sub: 'Task decisions', icon: faListCheck },
];

const REGIONS: { value: Region; code: string; label: string }[] = [
  { value: 'EG', code: 'EGY', label: 'Egypt' },
  { value: 'SA', code: 'KSA', label: 'Saudi Arabia' },
];

interface Props {
  page: AppPage;
  onNavigate: (p: AppPage) => void;
  /** The region switch only shows on pages that use it. */
  region?: Region;
  onRegionChange?: (r: Region) => void;
}

/**
 * Narrow icon rail like the design. Clicking anywhere on it opens / closes it.
 * It is part of the layout: when open it takes its width from the page instead of covering it.
 * The page and region buttons only do their own job, they don't toggle the rail.
 */
export function Sidebar({ page, onNavigate, region, onRegionChange }: Props) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((o) => !o);

  return (
    <aside
      className={`nd-sidebar${open ? ' is-open' : ''}`}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <div className="nd-rail__brand">
        <span className="nd-rail__logo" aria-hidden="true">
          <FontAwesomeIcon icon={faBriefcaseMedical} />
        </span>
        <span className="nd-rail__text">
          <strong>Not-Discharge</strong>
          <small>Revenue Cycle</small>
        </span>
      </div>

      <nav className="nd-rail__nav" aria-label="Main">
        {PAGES.map((p) => (
          <button
            key={p.value}
            type="button"
            className={`nd-rail__item${page === p.value ? ' is-on' : ''}`}
            aria-current={page === p.value ? 'page' : undefined}
            title={p.label}
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(p.value);
            }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <span className="nd-rail__icon">
              <FontAwesomeIcon icon={p.icon} />
            </span>
            <span className="nd-rail__text">
              <strong>{p.label}</strong>
              <small>{p.sub}</small>
            </span>
          </button>
        ))}
      </nav>

      <div className="nd-rail__spacer" />

      {onRegionChange && (
        <>
          <span className="nd-rail__label">Region</span>
          <div className="nd-rail__regions" role="group" aria-label="Region">
            {REGIONS.map((r) => (
              <button
                key={r.value}
                type="button"
                className={`nd-rail__region${region === r.value ? ' is-on' : ''}`}
                aria-pressed={region === r.value}
                title={r.label}
                onClick={(e) => {
                  e.stopPropagation();
                  onRegionChange(r.value);
                }}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <span className="nd-rail__code">{r.code}</span>
                <span className="nd-rail__text">{r.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </aside>
  );
}
