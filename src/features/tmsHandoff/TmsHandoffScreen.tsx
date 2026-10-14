import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCalendarDay,
  faCalendarWeek,
  faHourglassHalf,
  faInbox,
  faLayerGroup,
  faMagnifyingGlass,
  faPaperPlane,
  faRotateRight,
  faTriangleExclamation,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { Sidebar, type AppPage } from '../notDischarged/components/Sidebar';
import { Topbar } from '../notDischarged/components/Topbar';
import { Pager, PAGE_SIZES } from '../notDischarged/components/Pager';
import { ErrorState } from '../notDischarged/components/Bits';
import { Toast } from '../notDischarged/components/Toast';
import { useToast } from '../notDischarged/useToast';
import { useDebouncedValue } from '../notDischarged/useDebouncedValue';
import { CARDS, type CardKey, type TmsRow } from './api';
import { useTmsCounts, useTmsPage } from './useTms';
import { TmsTable, TmsTableSkeleton } from './components/TmsTable';
import { TmsViewDrawer } from './components/TmsViewDrawer';
import '../notDischarged/notDischarged.css';
import './tmsHandoff.css';

const ICONS: Record<CardKey, typeof faInbox> = {
  all: faLayerGroup,
  overdue: faTriangleExclamation,
  dueToday: faCalendarDay,
  due72h: faHourglassHalf,
  sentToday: faPaperPlane,
  sentWeek: faCalendarWeek,
};

export function TmsHandoffScreen({ onNavigate }: { onNavigate: (p: AppPage) => void }) {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [card, setCard] = useState<CardKey>('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [viewing, setViewing] = useState<TmsRow>();
  const toast = useToast();

  // Any filter change goes back to the first page. Done in the handlers, not an effect.
  const resetting = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(0);
  };
  const [lastSearch, setLastSearch] = useState(search);
  if (lastSearch !== search) {
    setLastSearch(search);
    setPage(0);
  }

  const list = useTmsPage({ search, startDate, dueDate, card, page, pageSize });
  const counts = useTmsCounts({ search, startDate, dueDate });
  const { refresh: refreshList } = list;
  const { refresh: refreshCounts } = counts;
  const refresh = useCallback(() => {
    refreshList();
    refreshCounts();
  }, [refreshList, refreshCounts]);

  const closeView = useCallback(() => setViewing(undefined), []);

  const filtered = Boolean(searchInput.trim() || startDate || dueDate || card !== 'all');
  const clearAll = () => {
    setSearchInput('');
    setStartDate('');
    setDueDate('');
    setCard('all');
    setPage(0);
  };

  // The server total, or the matching card count while the page is loading.
  const total = list.total ?? counts.counts?.[card];
  const pages = total !== undefined ? Math.max(1, Math.ceil(total / pageSize)) : undefined;
  const reachablePages = useMemo(() => pages ?? page + 1 + (list.hasMore ? 1 : 0), [pages, page, list.hasMore]);

  const rows = list.rows;
  let body: ReactNode;
  if (list.error && !rows) body = <ErrorState message={list.error} onRetry={refresh} />;
  else if (!rows) body = <TmsTableSkeleton rows={8} />;
  else if (rows.length === 0 && !list.isLoading)
    body = (
      <div className="nd-noresult">
        <FontAwesomeIcon icon={faInbox} className="nd-noresult__icon" />
        <h3>No tasks match</h3>
        <p>{filtered ? 'Try another card, date range or search.' : 'No TMS hand-offs have been sent yet.'}</p>
        {filtered && (
          <button type="button" className="nd-clearbtn" onClick={clearAll}>
            Clear all
          </button>
        )}
      </div>
    );
  else
    body = (
      <div className={`nd-results${list.isLoading ? ' is-stale' : ''}`}>
        <TmsTable rows={rows} onView={setViewing} />
      </div>
    );

  return (
    <div className="nd-shell">
      <Sidebar page="tms" onNavigate={onNavigate} />
      <Topbar section="TMS Hand Off" title="TMS Hand Off" />

      <main className="nd-content">
        <div className="nd-wrap">
          <div className="nd-filterbar tms-filterbar">
            <label className="tms-date">
              <span className="nd-fb-lbl">Start date</span>
              <input type="date" value={startDate} max={dueDate || undefined} onChange={(e) => resetting(setStartDate)(e.target.value)} />
            </label>
            <label className="tms-date">
              <span className="nd-fb-lbl">Due date</span>
              <input type="date" value={dueDate} min={startDate || undefined} onChange={(e) => resetting(setDueDate)(e.target.value)} />
            </label>
            {filtered && (
              <button type="button" className="nd-clearbtn" onClick={clearAll}>
                Clear all
              </button>
            )}
            <span className="nd-spacer" />
            <div className="nd-search tms-search">
              <FontAwesomeIcon icon={faMagnifyingGlass} className="nd-search__icon" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search tasks…"
                aria-label="Search tasks"
              />
              {searchInput && (
                <button type="button" className="nd-search__clear" onClick={() => setSearchInput('')} aria-label="Clear search">
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              )}
            </div>
            <button type="button" className="tms-btn-ghost" onClick={refresh} disabled={list.isLoading}>
              <FontAwesomeIcon icon={faRotateRight} spin={list.isLoading} /> Refresh Data
            </button>
          </div>

          <div className="tms-stats" role="group" aria-label="Filter by due date and sent date">
            {CARDS.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`tms-stat tms-stat--${s.key}${card === s.key ? ' on' : ''}`}
                aria-pressed={card === s.key}
                title={s.hint}
                onClick={() => resetting(setCard)(s.key)}
              >
                <FontAwesomeIcon icon={ICONS[s.key]} className="tms-stat__icon" />
                <span className="tms-stat__val">
                  {counts.counts ? counts.counts[s.key].toLocaleString() : counts.error ? '—' : <span className="nd-skel nd-skel--kpi" />}
                </span>
                <span className="tms-stat__lbl">{s.label}</span>
              </button>
            ))}
          </div>
          {counts.error && (
            <p className="nd-notice" role="alert">
              Counts: {counts.error}
            </p>
          )}

          {list.error && rows && <ErrorState message={list.error} onRetry={refresh} />}
          {body}

          {rows && rows.length > 0 && (
            <Pager
              page={page}
              pageSize={pageSize}
              rowsOnPage={rows.length}
              total={total}
              reachablePages={reachablePages}
              hasPrevious={page > 0}
              hasNext={list.hasMore}
              busy={list.isLoading}
              onPage={setPage}
              onPageSize={resetting(setPageSize)}
            />
          )}
        </div>
      </main>

      <TmsViewDrawer row={viewing} onClose={closeView} />
      <Toast message={toast.message} on={toast.on} />
    </div>
  );
}
