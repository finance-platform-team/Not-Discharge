import { useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileExcel, faGrip, faMagnifyingGlass, faSpinner, faTableList, faXmark } from '@fortawesome/free-solid-svg-icons';
import { RISK_LEVELS, type RiskLevel } from '../risk';
import type { StatResult } from '../api';
import type { AlertFilter, FilterOption, StatKey } from '../types';
import { CASE_STATUS } from '../schema';
import { SoftSelect } from './SoftSelect';

const CASE_STATUSES: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  ...Object.entries(CASE_STATUS).map(([value, label]) => ({ value, label })),
];

const ALERTS: { value: AlertFilter; label: string }[] = [
  { value: '', label: 'All alerts' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Acknowledged', label: 'Acknowledged' },
  { value: 'Escalated', label: 'Escalated' },
];

/** notdis_flag values, fixed (BRD V2.1). */
const FLAGS = [
  { value: '', label: 'All flags' },
  { value: 'High Balance', label: 'High Balance' },
  { value: 'No Payment', label: 'No Payment' },
  { value: '48H No Payment', label: '48H No Payment' },
  { value: 'Both Conditions', label: 'Both Conditions' },
];

/** Short pill text so the filter row fits one line; the full label is the tooltip. */
const shortStatus = (label: string) =>
  label.replace(/^Closed\s*[–-]\s*Referred to Legal$/, 'Closed - Legal').replace(/^Discharged\s*[–-]\s*Pending Payment$/, 'Pending Payment');

export type ViewMode = 'table' | 'cards';

interface Props {
  search: string;
  onSearch: (v: string) => void;
  risks: RiskLevel[];
  onToggleRisk: (r: RiskLevel) => void;
  stats?: Record<StatKey, StatResult>;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  canClear: boolean;
  /** How many filters are on, shown on "Clear all". */
  activeCount?: number;
  onClear: () => void;
  entity: string;
  onEntity: (v: string) => void;
  payer: string;
  onPayer: (v: string) => void;
  flag: string;
  onFlag: (v: string) => void;
  discharged: '' | 'no' | 'yes';
  onDischarged: (v: '' | 'no' | 'yes') => void;
  alert: AlertFilter;
  onAlert: (v: AlertFilter) => void;
  caseStatus: string;
  onCaseStatus: (v: string) => void;
  entities?: FilterOption[];
  payers?: FilterOption[];
  /** Saves the cases of the current filters as an Excel file. */
  onExport?: () => void;
  exporting?: boolean;
}

const withCount = (o: FilterOption) => (o.count !== undefined ? `${o.label} (${o.count})` : o.label);

export function Toolbar({
  search, onSearch, risks, onToggleRisk, stats, view, onView, canClear, activeCount, onClear,
  entity, onEntity, payer, onPayer, flag, onFlag, discharged, onDischarged, alert, onAlert, caseStatus, onCaseStatus, entities, payers, onExport, exporting,
}: Props) {
  // "/" anywhere on the page jumps to the search box (unless you are already typing somewhere).
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="nd-filterbar">
      {/* Row 1: how to look at it, and a short search at the right */}
      <div className="nd-fb-row nd-fb-row--top">
        <span className="nd-fb-title">Filters</span>
        <button
          type="button"
          role="switch"
          aria-checked={discharged === 'yes'}
          className={`nd-switch${discharged === 'yes' ? ' on' : ''}`}
          onClick={() => onDischarged(discharged === 'yes' ? 'no' : 'yes')}
          title="notdis_discharged: click to switch between No and Yes"
        >
          <span className="nd-switch__track" aria-hidden="true">
            <span className="nd-switch__thumb" />
          </span>
          Discharged: <b>{discharged === 'yes' ? 'Yes' : 'No'}</b>
        </button>
        {canClear && (
          <button type="button" className="nd-clearbtn" onClick={onClear}>
            Clear all
            {activeCount ? <span className="nd-clearbtn__n">{activeCount}</span> : null}
          </button>
        )}
        <div className="nd-spacer" />
        <label className="nd-search nd-search--short">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="nd-search__icon" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search patient, ID, room…"
            title="Search name, patient no, national ID, room, payer"
            aria-label="Search cases"
          />
          {!search && (
            <kbd className="nd-kbd" title="Press / to search">
              /
            </kbd>
          )}
          {search && (
            <button type="button" className="nd-search__clear" onClick={() => onSearch('')} aria-label="Clear search">
              <FontAwesomeIcon icon={faXmark} />
            </button>
          )}
        </label>
        {onExport && (
          <button
            type="button"
            className="nd-export"
            onClick={onExport}
            disabled={exporting}
            title="Export the cases of the current filters to Excel"
          >
            <FontAwesomeIcon icon={exporting ? faSpinner : faFileExcel} spin={exporting} /> {exporting ? 'Exporting…' : 'Export'}
          </button>
        )}
        <div className="nd-toggle" role="group" aria-label="View">
          <button type="button" className={view === 'cards' ? 'on' : ''} onClick={() => onView('cards')}>
            <FontAwesomeIcon icon={faGrip} /> Cards
          </button>
          <button type="button" className={view === 'table' ? 'on' : ''} onClick={() => onView('table')}>
            <FontAwesomeIcon icon={faTableList} /> Table
          </button>
        </div>
      </div>

      {/* Row 2: every filter on one line (it scrolls sideways if the screen is too narrow) */}
      <div className="nd-fb-row nd-fb-row--one">
        <span className="nd-fb-lbl">Risk</span>
        <div className="nd-chips">
          {RISK_LEVELS.map((r) => {
            const count = stats?.[r.value].value;
            return (
              <button
                key={r.value}
                type="button"
                className={`nd-chip ${r.value}${risks.includes(r.value) ? ' on' : ''}`}
                aria-pressed={risks.includes(r.value)}
                onClick={() => onToggleRisk(r.value)}
              >
                <span className="nd-chip__dot" style={{ background: `var(--risk-${r.value})` }} />
                {r.label}
                {count !== undefined && <span className="nd-chip__count">{count >= 5000 ? '5k+' : count}</span>}
              </button>
            );
          })}
        </div>
        <span className="nd-fb-div" />
        <span className="nd-fb-lbl">Scope</span>
        <div className="nd-fb-group">
          <SoftSelect floating
            className="nd-sel--ent"
            ariaLabel="BU"
            value={entity}
            onChange={onEntity}
            options={[
              { value: '', label: entities ? 'All BUs' : 'Loading BUs…' },
              ...(entities ?? []).map((o) => ({ value: o.value, label: withCount(o) })),
            ]}
          />
          <SoftSelect floating
            ariaLabel="Payer"
            value={payer}
            onChange={onPayer}
            options={[
              { value: '', label: payers ? 'All payers' : 'Loading payers…' },
              ...(payers ?? []).map((o) => ({ value: o.value, label: withCount(o) })),
            ]}
          />
          <SoftSelect floating ariaLabel="Flag" value={flag} onChange={onFlag} options={FLAGS} />
          <SoftSelect floating ariaLabel="Alert" value={alert} onChange={(v) => onAlert(v as AlertFilter)} options={ALERTS} />
        </div>
        <span className="nd-fb-div" />
        <span className="nd-fb-lbl">Case status</span>
        <div className="nd-seg nd-seg--sm" role="group" aria-label="Case status">
          {CASE_STATUSES.map((st) => (
            <button
              key={st.value}
              type="button"
              className={caseStatus === st.value ? 'on' : ''}
              aria-pressed={caseStatus === st.value}
              title={st.label}
              onClick={() => onCaseStatus(st.value)}
            >
              {shortStatus(st.label)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
