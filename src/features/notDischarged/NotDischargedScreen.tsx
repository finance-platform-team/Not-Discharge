import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AlertFilter, CaseRow, Region, SortKey, TrackingRow } from './types';
import { useFilterOptions } from './useFilterOptions';
import { RISK_LEVELS, type RiskLevel } from './risk';
import { errorMessage, formatMoney } from './format';
import { addHistory, autoCloseIfDischargedAndPaid, currentSystemUser, fetchAutoStatusCandidates, isDischargedAndFullyPaid, isDischargedPendingPayment, isReferredToLegal, updateCaseStatus, updateReferredToLegal } from './api';
import { STATUS_ACTIONS, STATUS_HISTORY_WARNING } from './history';
import { useCaseHistory } from './useCaseHistory';
import { useChangeWatcher } from './useChangeWatcher';
import { useCurrentUser } from './useCurrentUser';
import { useUserRoles } from './useUserRoles';
import { CASE_STATUS } from './schema';
import { useNotDischarged } from './useNotDischarged';
import { useCaseStats } from './useCaseStats';
import { useDebouncedValue } from './useDebouncedValue';
import { EXPORT_MAX, exportCasesToExcel } from './exportCases';
import { Sidebar, type AppPage } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { KpiTiles } from './components/KpiTiles';
import { Toolbar, type ViewMode } from './components/Toolbar';
import { CaseTable, CaseTableSkeleton } from './components/CaseTable';
import { CaseCards, CaseCardsSkeleton } from './components/CaseCards';
import { Pager, PAGE_SIZES } from './components/Pager';
import { CaseDrawer } from './components/CaseDrawer';
import { Toast } from './components/Toast';
import { useToast } from './useToast';
import { EmptyState, ErrorState } from './components/Bits';
import './notDischarged.css';

const REGION_LABEL: Record<Region, string> = { EG: 'Egypt', SA: 'Saudi Arabia' };
/** A region is defined by its notdis_currency value (EGP / SAR), so its currency follows from it. */
const REGION_CURRENCY: Record<Region, string> = { EG: 'EGP', SA: 'SAR' };
const EMPTY_TRACKING: Record<string, TrackingRow> = {};
/** The Alert filter starts on Pending. */
const DEFAULT_ALERT: AlertFilter = 'Pending';
/** notdis_casestatus value of Open: the Case status filter starts here. */
// The list opens on patients still in hospital (notdis_discharged = No) with Case status Open.
const DEFAULT_CASE_STATUS = String(Object.entries(CASE_STATUS).find(([, l]) => l === 'Open')?.[0] ?? '');
const DEFAULT_DISCHARGED = 'no' as const;

export function NotDischargedScreen({ onNavigate }: { onNavigate: (p: AppPage) => void }) {
  const [region, setRegion] = useState<Region>('EG');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput, 300);
  const [risks, setRisks] = useState<RiskLevel[]>([]);
  const [entity, setEntity] = useState('');
  const [payer, setPayer] = useState('');
  const [flag, setFlag] = useState('');
  const [discharged, setDischarged] = useState<'' | 'no' | 'yes'>(DEFAULT_DISCHARGED);
  // The list opens on cases waiting for action (Alert = Pending); "All alerts" is one click away.
  const [alert, setAlert] = useState<AlertFilter>(DEFAULT_ALERT);
  // The list opens on Open cases; "All" and the closed statuses are one click away.
  const [caseStatus, setCaseStatus] = useState(DEFAULT_CASE_STATUS);
  // No sort picker on screen: BRD A.1.1 default order is by risk band (Critical first), then highest balance.
  const sort: SortKey = 'risk';
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  // Always opens on the table; Cards is one click away on the filter bar.
  const [view, setView] = useState<ViewMode>('table');
  const [selected, setSelected] = useState<CaseRow>();
  const toast = useToast();
  const showToast = toast.show;
  // Look the signed-in user up once in the background, so the first history row is written faster.
  useEffect(() => {
    currentSystemUser().catch(() => undefined);
  }, []);
  const history = useCaseHistory(selected?.id);
  const { canEditStatus } = useUserRoles();

  // Entity and payer lists belong to a region, so switching region clears them.
  const changeRegion = useCallback((r: Region) => {
    setRegion(r);
    setEntity('');
    setPayer('');
  }, []);

  const list = useNotDischarged({ search, region, risks, entity, payer, flag, discharged, alert, caseStatus, sort, pageSize });
  const { stats, refresh: refreshStats } = useCaseStats(region);
  const { options } = useFilterOptions(region);
  // Case statuses just saved from the table, shown until the list is read again (then the server has them).
  const [casePatches, setCasePatches] = useState<{ base?: CaseRow[]; byId: Record<string, Partial<CaseRow>> }>({ byId: {} });
  const [savingCase, setSavingCase] = useState<string>();
  const [savingLegal, setSavingLegal] = useState<string>();
  const rows = useMemo(() => {
    const patches = casePatches.base === list.rows ? casePatches.byId : undefined;
    if (!patches) return list.rows;
    // A row just changed here that no longer matches the Case status filter leaves the list at once.
    const statusFilter = /^\d+$/.test(caseStatus) ? Number(caseStatus) : undefined;
    return list.rows
      ?.map((r) => (patches[r.id] ? { ...r, ...patches[r.id] } : r))
      .filter((r) => !patches[r.id] || statusFilter === undefined || r.caseStatusValue === statusFilter);
  }, [list.rows, casePatches, caseStatus]);
  const tracking = list.tracking ?? EMPTY_TRACKING;

  // The alert and risk-order modes return their own server total. Otherwise the risk aggregates (which partition all
  // active cases) give it for free; with a search / entity / payer filter there is no cheap total.
  const total = useMemo(() => {
    if (alert || list.total !== undefined) return list.total;
    if (search.trim() || entity || payer || flag || discharged || caseStatus || !stats) return undefined;
    const levels = risks.length ? risks : RISK_LEVELS.map((l) => l.value);
    const parts = levels.map((l) => stats[l].value);
    return parts.every((v) => v !== undefined) ? parts.reduce<number>((a, v) => a + (v ?? 0), 0) : undefined;
  }, [alert, list.total, search, entity, payer, flag, discharged, caseStatus, stats, risks]);

  const rowsById = useMemo(() => new Map(rows?.map((r) => [r.id, r])), [rows]);
  const rowsByIdRef = useRef(rowsById);
  useEffect(() => {
    rowsByIdRef.current = rowsById;
  }, [rowsById]);
  const openCase = useCallback((id: string) => setSelected(rowsById.get(id)), [rowsById]);
  const closeCase = useCallback(() => setSelected(undefined), []);

  const toggleRisk = useCallback(
    (r: RiskLevel) => setRisks((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r])),
    [],
  );
  const onlyRisk = useCallback(
    (r: RiskLevel) => setRisks((prev) => (prev.length === 1 && prev[0] === r ? [] : [r])),
    [],
  );
  const clearAll = useCallback(() => {
    setSearchInput('');
    setRisks([]);
    setEntity('');
    setPayer('');
    setFlag('');
    setDischarged(DEFAULT_DISCHARGED);
    setAlert(DEFAULT_ALERT);
    setCaseStatus(DEFAULT_CASE_STATUS);
  }, []);
  const togglePending = useCallback(() => {
    setRisks([]);
    setAlert((a) => (a === 'Pending' ? '' : 'Pending'));
  }, []);
  // Open is the default, so it does not count as a filter ("All" or a closed status does).
  const activeCount = [searchInput.trim(), risks.length, entity, payer, flag, discharged !== DEFAULT_DISCHARGED, alert !== DEFAULT_ALERT, caseStatus !== DEFAULT_CASE_STATUS].filter(Boolean).length;
  const filtered = activeCount > 0;

  // Excel export of every case matching the filters on screen (same query and order as the list).
  const [exporting, setExporting] = useState(false);
  const exportExcel = useCallback(async () => {
    setExporting(true);
    try {
      const { count, capped } = await exportCasesToExcel(
        { search, region, risks, entity, payer, flag, discharged, alert, caseStatus, sort, pageSize },
        region === 'SA' ? 'KSA' : 'Egypt',
      );
      if (capped) showToast(`Exported the first ${EXPORT_MAX.toLocaleString()} cases. Narrow the filters to export the rest.`, 'warning');
      else showToast(count ? `Exported ${count.toLocaleString()} cases to Excel` : 'No cases match the filters.', count ? 'success' : 'warning');
    } catch (err) {
      showToast(errorMessage(err, 'Could not export the cases.'), 'error');
    } finally {
      setExporting(false);
    }
  }, [search, region, risks, entity, payer, flag, discharged, alert, caseStatus, sort, pageSize, showToast]);

  const { refreshTracking, reload: reloadCases } = list;
  // Read through a ref so saveCaseStatus keeps one identity and memoised rows do not all re-render.
  const baseRowsRef = useRef(list.rows);
  useEffect(() => {
    baseRowsRef.current = list.rows;
  }, [list.rows]);
  const refreshHistory = history.refresh;
  const addLocalHistory = history.addLocal;
  const settleHistory = history.settle;
  const currentUserName = useCurrentUser()?.name;
  /** Shows a change on screen right away (the list is re-read separately). */
  const applyPatch = useCallback((id: string, patch: Partial<CaseRow>) => {
    const base = baseRowsRef.current;
    setCasePatches((prev) => {
      const byId = prev.base === base ? prev.byId : {};
      return { base, byId: { ...byId, [id]: { ...byId[id], ...patch } } };
    });
    setSelected((cur) => (cur?.id === id ? { ...cur, ...patch } : cur));
  }, []);
  const patchCase = useCallback(
    (id: string, patch: Partial<CaseRow>) => {
      applyPatch(id, patch);
      reloadCases();
    },
    [applyPatch, reloadCases],
  );
  /**
   * Saves a status picked in the Case status dropdown (no dialog), then writes one ND Case History
   * row: "Closed - Paid" / "Closed – Referred to Legal" / "Reopened", "Status changed from X to Y".
   * Optimistic: the new status shows (and the row leaves a non-matching filter) at once.
   */
  const saveCaseStatus = useCallback(
    async (id: string, raw: string, previous: string | undefined, buId?: string) => {
      const value = Number(raw);
      const label = CASE_STATUS[value as keyof typeof CASE_STATUS];
      if (!label) return;
      const before = rowsByIdRef.current.get(id);
      applyPatch(id, { caseStatus: label, caseStatusValue: value });
      setSavingCase(id);
      try {
        await updateCaseStatus(id, { caseStatus: value });
      } catch (err) {
        applyPatch(id, { caseStatus: before?.caseStatus, caseStatusValue: before?.caseStatusValue });
        showToast(errorMessage(err, 'Could not save the case status.'), 'error');
        setSavingCase(undefined);
        return;
      }
      showToast(`Case status: ${label}`);
      setSavingCase(undefined);
      reloadCases(); // confirm from the server (the patched row stays hidden meanwhile)
      refreshStats();
      const action = STATUS_ACTIONS[value];
      if (!action) return;
      const details = `Status changed from ${previous ?? 'Not set'} to ${label}`;
      const localId = addLocalHistory({ caseId: id, action, details, by: currentUserName ?? 'You', buId });
      const written = await addHistory(id, action, details, buId);
      settleHistory(localId, written.ok, written.ok ? undefined : written.error);
      refreshHistory(id);
      if (!written.ok) {
        console.error('[history] status change not recorded', written.error);
        showToast(STATUS_HISTORY_WARNING, 'warning');
      }
    },
    [applyPatch, reloadCases, refreshStats, showToast, refreshHistory, addLocalHistory, settleHistory, currentUserName],
  );
  /** From the table: any status pick saves at once (Billing Supervisor / Duty Manager can't change it). */
  const changeCaseStatus = useCallback(
    (id: string, raw: string, previous?: string) => {
      const r = rowsByIdRef.current.get(id);
      if (!canEditStatus(r?.buId)) return;
      void saveCaseStatus(id, raw, previous, r?.buId);
    },
    [saveCaseStatus, canEditStatus],
  );
  /* ---------- Automatic status (checked once per case): discharged + fully paid → Closed - Paid;
     discharged with a balance still due → Discharged – Pending Payment ---------- */
  const autoChecked = useRef(new Set<string>());
  // Discharged cases of the region (not on screen by default), read once per region per session.
  const [sweep, setSweep] = useState<{ region: Region; rows: CaseRow[] }>();
  const swept = useRef(new Set<Region>());
  useEffect(() => {
    if (swept.current.has(region)) return;
    swept.current.add(region);
    fetchAutoStatusCandidates(region)
      .then((rows) => setSweep({ region, rows }))
      .catch((err: unknown) => {
        swept.current.delete(region);
        console.error('[auto-status] could not read discharged cases', err);
      });
  }, [region]);
  useEffect(() => {
    const due = [...(list.rows ?? []), ...(sweep?.region === region ? sweep.rows : [])].filter(
      (r) =>
        (isReferredToLegal(r) || isDischargedAndFullyPaid(r) || isDischargedPendingPayment(r)) && !autoChecked.current.has(r.id),
    );
    if (!due.length) return;
    due.forEach((r) => autoChecked.current.add(r.id));
    let alive = true;
    (async () => {
      let closed = 0;
      let pending = 0;
      let legal = 0;
      for (const r of due) {
        try {
          const value = await autoCloseIfDischargedAndPaid(r.id, r.buId);
          if (value) {
            if (value === 2) closed++;
            else if (value === 3) legal++;
            else pending++;
            if (alive) {
              applyPatch(r.id, { caseStatus: CASE_STATUS[value], caseStatusValue: value });
              refreshHistory(r.id);
            }
          }
        } catch (err) {
          console.error('[auto-close] could not close', r.id, err);
          if (alive) showToast(`Could not close ${r.name} automatically: ${errorMessage(err, 'unknown error')}`, 'error');
        }
      }
      if (alive && (closed || pending || legal)) {
        const plural = (n: number) => `${n} case${n === 1 ? '' : 's'}`;
        showToast(
          [
            closed ? `${plural(closed)} closed automatically: discharged and fully paid` : '',
            pending ? `${plural(pending)} moved to Discharged – Pending Payment` : '',
            legal ? `${plural(legal)} moved to Closed – Referred to Legal` : '',
          ]
            .filter(Boolean)
            .join(' · '),
        );
        reloadCases();
        refreshStats();
      }
    })();
    return () => {
      alive = false;
    };
  }, [list.rows, sweep, region, applyPatch, refreshHistory, showToast, reloadCases, refreshStats]);

  /** Referred to Legal picked in the table (any role): saves at once; Yes lets the auto rule move the case to status 3. */
  const changeReferredToLegal = useCallback(
    async (id: string, value: boolean) => {
      const r = rowsByIdRef.current.get(id);
      if (r?.referredToLegal && !value) return; // Yes is final
      applyPatch(id, { referredToLegal: value });
      setSavingLegal(id);
      try {
        await updateReferredToLegal(id, value);
      } catch (err) {
        applyPatch(id, { referredToLegal: r?.referredToLegal });
        showToast(errorMessage(err, 'Could not save Referred to Legal.'), 'error');
        setSavingLegal(undefined);
        return;
      }
      showToast(`Referred to Legal: ${value ? 'Yes' : 'No'}`);
      setSavingLegal(undefined);
      autoChecked.current.delete(id); // checked again once the list is re-read with the new value
      reloadCases();
      refreshStats();
    },
    [applyPatch, showToast, reloadCases, refreshStats],
  );

  /* ---------- Refresh: the button on top, and automatically when Dataverse changes ---------- */
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  /** Rows on screen when a refresh started; the refresh is done once the list has new rows. */
  const [refreshFrom, setRefreshFrom] = useState<CaseRow[] | undefined | null>(null);
  const refreshing = refreshFrom !== null && list.rows === refreshFrom && !list.error;
  /** Changes arrived while on a later page: offer them instead of jumping back to page 1. */
  const [updatesWaiting, setUpdatesWaiting] = useState(false);
  const selectedId = selected?.id;
  const refreshAll = useCallback(() => {
    setRefreshFrom(baseRowsRef.current);
    reloadCases(); // the page (and its SLA tracking) again, from page 1
    refreshStats(); // KPI tiles + risk chips
    if (selectedId) refreshHistory(selectedId); // the open case's Action History
    setUpdatesWaiting(false);
    setUpdatedAt(Date.now());
  }, [reloadCases, refreshStats, refreshHistory, selectedId]);
  const page = list.page;
  const onDataChanged = useCallback(() => {
    if (page > 0) setUpdatesWaiting(true);
    else refreshAll();
  }, [page, refreshAll]);
  const { sync: syncChanges } = useChangeWatcher(region, onDataChanged);
  const manualRefresh = useCallback(() => {
    refreshAll();
    void syncChanges(); // what is on screen now counts as seen
  }, [refreshAll, syncChanges]);

  const onSaved = useCallback(
    (message: string) => {
      refreshTracking(); // 1 request: tracking for the page on screen
      refreshStats(); // 5 count requests: KPI tiles + risk chips
      showToast(message);
    },
    [refreshTracking, refreshStats, showToast],
  );

  // Sum of the balances on screen (only this page is loaded; the full total would need another request).
  const pageBalance = useMemo(() => rows?.reduce((s, r) => s + (r.balance ?? 0), 0), [rows]);
  const pageCurrency = rows?.find((r) => r.currency)?.currency;

  let body: ReactNode;
  if (list.error && !rows) body = <ErrorState message={list.error} onRetry={list.retry} />;
  else if (list.isInitialLoad) body = view === 'table' ? <CaseTableSkeleton rows={8} /> : <CaseCardsSkeleton count={6} />;
  else if (rows && rows.length === 0 && !list.isLoading) body = <EmptyState filtered={filtered} onClear={clearAll} />;
  else if (rows)
    body = (
      <div className={`nd-results${list.isLoading ? ' is-stale' : ''}`}>
        {view === 'table' ? (
          <CaseTable rows={rows} onOpen={openCase} savingCase={savingCase} onCaseStatus={changeCaseStatus} savingLegal={savingLegal} onReferredToLegal={changeReferredToLegal} canEditStatus={canEditStatus} />
        ) : (
          <CaseCards rows={rows} tracking={tracking} trackingPending={list.trackingPending} onOpen={openCase} savingCase={savingCase} onCaseStatus={changeCaseStatus} canEditStatus={canEditStatus} />
        )}
      </div>
    );

  return (
    <div className="nd-shell">
      <Sidebar page="cases" onNavigate={onNavigate} region={region} onRegionChange={changeRegion} />
      <Topbar onRefresh={manualRefresh} refreshing={refreshing} updatedAt={updatedAt} />

      <main className="nd-content">
        <div className="nd-wrap">
          <KpiTiles
            stats={stats}
            currency={REGION_CURRENCY[region]}
            activeRisks={risks}
            pendingOn={alert === 'Pending'}
            onRisk={(r) => {
              setAlert('');
              onlyRisk(r);
            }}
            onPending={togglePending}
            onClear={clearAll}
          />

          <Toolbar
            search={searchInput}
            onSearch={setSearchInput}
            risks={risks}
            onToggleRisk={toggleRisk}
            stats={stats}
            view={view}
            onView={setView}
            canClear={filtered}
            activeCount={activeCount}
            onClear={clearAll}
            entity={entity}
            onEntity={setEntity}
            payer={payer}
            onPayer={setPayer}
            flag={flag}
            onFlag={setFlag}
            discharged={discharged}
            onDischarged={setDischarged}
            alert={alert}
            onAlert={setAlert}
            caseStatus={caseStatus}
            onCaseStatus={setCaseStatus}
            entities={options?.entities}
            payers={options?.payers}
            onExport={exportExcel}
            exporting={exporting}
          />

          <div className="nd-resultline">
            {(list.isLoading || refreshing) && <span className="nd-progress" aria-hidden="true" />}
            {updatesWaiting && (
              <button type="button" className="nd-newdata" onClick={manualRefresh}>
                <span className="nd-newdata__dot" /> New updates · Refresh
              </button>
            )}
            <span>
              {rows ? (
                <>
                  {total !== undefined ? (
                    <>
                      <b>{total.toLocaleString()}</b> patients
                    </>
                  ) : (
                    <>
                      <b>{rows.length}</b> matching on this page
                    </>
                  )}
                  {' · '}
                  {REGION_LABEL[region]}
                  {rows.length > 0 && (
                    <>
                      {' · '}
                      <b className="nd-mono">{formatMoney(pageBalance, pageCurrency)}</b> outstanding on this page
                    </>
                  )}
                </>
              ) : (
                'Loading cases…'
              )}
            </span>
          </div>

          {list.error && rows && <ErrorState message={list.error} onRetry={list.retry} />}
          {list.trackingError && (
            <p className="nd-notice" role="alert">
              SLA tracking: {list.trackingError}
            </p>
          )}
          {body}

          {rows && rows.length > 0 && (
            <Pager
              page={list.page}
              pageSize={pageSize}
              rowsOnPage={rows.length}
              total={total}
              reachablePages={list.reachablePages}
              hasPrevious={list.hasPrevious}
              hasNext={list.hasNext}
              busy={list.isLoading}
              onPage={list.goToPage}
              onPageSize={setPageSize}
            />
          )}
        </div>
      </main>

      <CaseDrawer
        row={selected}
        latest={selected ? tracking[selected.id] : undefined}
        onClose={closeCase}
        onSaved={onSaved}
        onNotify={showToast}
        onCaseChanged={patchCase}
        history={history}
      />
      <Toast message={toast.message} on={toast.on} tone={toast.tone} />
    </div>
  );
}
