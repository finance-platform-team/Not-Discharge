import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faPlus, faRotateRight, faSort, faSortDown, faSortUp, faSpinner, faXmark } from '@fortawesome/free-solid-svg-icons';
import { Sidebar, type AppPage } from '../notDischarged/components/Sidebar';
import { Topbar } from '../notDischarged/components/Topbar';
import { SoftSelect } from '../notDischarged/components/SoftSelect';
import { UserSearch } from '../notDischarged/components/UserSearch';
import { Toast } from '../notDischarged/components/Toast';
import { ErrorState } from '../notDischarged/components/Bits';
import { useToast } from '../notDischarged/useToast';
import { errorMessage, formatDateTimeUS } from '../notDischarged/format';
import {
  createConfig,
  fetchBusinessUnits,
  fetchConfigs,
  roleLabel,
  ROLE_OPTIONS,
  updateConfig,
  type BusinessUnitOption,
  type ConfigChange,
  type ConfigRow,
} from './api';
import '../notDischarged/notDischarged.css';
import './escalationConfig.css';

type SortKey = 'name' | 'user' | 'role' | 'level' | 'bu' | 'created';
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'user', label: 'User' },
  { key: 'role', label: 'Role' },
  { key: 'level', label: 'Level' },
  { key: 'bu', label: 'Business Unit' },
  { key: 'created', label: 'Created On' },
];

const sortValue = (r: ConfigRow, k: SortKey): string | number => {
  switch (k) {
    case 'name':
      return r.name.toLowerCase();
    case 'user':
      return (r.userName ?? '').toLowerCase();
    case 'role':
      return (roleLabel(r.role) ?? '').toLowerCase();
    case 'level':
      return r.level ?? -1;
    case 'bu':
      return (r.buName ?? '').toLowerCase();
    case 'created':
      return r.createdOn ?? '';
  }
};

const ROLE_SELECT = ROLE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }));
const ALL_UNITS = 'All business units';

/** Text / number cell: saves on blur or Enter when the value changed; Escape puts it back. */
function InlineInput({ value, type = 'text', disabled, onSave, ariaLabel }: { value: string; type?: 'text' | 'number'; disabled?: boolean; onSave: (v: string) => void; ariaLabel: string }) {
  const [text, setText] = useState(value);
  const [base, setBase] = useState(value);
  if (base !== value) {
    setBase(value);
    setText(value);
  }
  const commit = () => text.trim() !== value && onSave(text.trim());
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      setText(value);
      e.currentTarget.blur();
    }
  };
  return (
    <input
      className={`nd-cell-input${type === 'number' ? ' is-num' : ''}`}
      type={type}
      min={type === 'number' ? 0 : undefined}
      step={type === 'number' ? 1 : undefined}
      value={text}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={onKey}
    />
  );
}

type Draft = { name: string; user?: { id: string; name: string }; role: string; level: string; buId: string };
const EMPTY_DRAFT: Draft = { name: '', role: '', level: '', buId: '' };

export function EscalationConfigScreen({ onNavigate }: { onNavigate: (p: AppPage) => void }) {
  const [rows, setRows] = useState<ConfigRow[]>();
  const [buTable, setBuTable] = useState<string>();
  const [units, setUnits] = useState<BusinessUnitOption[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'level', dir: 1 });
  const [savingIds, setSavingIds] = useState<ReadonlySet<string>>(new Set());
  const [draft, setDraft] = useState<Draft>();
  const [draftTried, setDraftTried] = useState(false);
  const [creating, setCreating] = useState(false);
  const toast = useToast();
  const showToast = toast.show;

  useEffect(() => {
    let alive = true;
    fetchConfigs()
      .then(async ({ rows: list, buTable: table }) => {
        if (!alive) return;
        setRows(list);
        setBuTable(table);
        setError(undefined);
        setUpdatedAt(Date.now());
        const bus = await fetchBusinessUnits(table, list).catch(() => []);
        if (alive) setUnits(bus);
      })
      .catch((err: unknown) => alive && setError(errorMessage(err, 'Could not load the escalation config.')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [version]);

  const reload = useCallback(() => {
    setLoading(true);
    setVersion((v) => v + 1);
  }, []);

  const unitOptions = useMemo(() => [{ value: '', label: ALL_UNITS }, ...units], [units]);
  const unitName = useCallback((id?: string) => (id ? (units.find((u) => u.value === id)?.label ?? id) : undefined), [units]);

  const sorted = useMemo(
    () =>
      rows &&
      [...rows].sort((a, b) => {
        const x = sortValue(a, sort.key);
        const y = sortValue(b, sort.key);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || a.name.localeCompare(b.name);
      }),
    [rows, sort],
  );

  /** Optimistic: the cell shows the new value at once; a failed save puts the old row back. */
  const save = useCallback(
    async (row: ConfigRow, change: ConfigChange, shown: Partial<ConfigRow>) => {
      setRows((prev) => prev?.map((r) => (r.id === row.id ? { ...r, ...shown } : r)));
      setSavingIds((prev) => new Set(prev).add(row.id));
      try {
        await updateConfig(row.id, change, buTable);
        showToast('Saved');
      } catch (err) {
        setRows((prev) => prev?.map((r) => (r.id === row.id ? row : r)));
        showToast(errorMessage(err, 'Could not save.'), 'error');
      } finally {
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
      }
    },
    [buTable, showToast],
  );

  const draftErrors = draft && {
    name: !draft.name.trim() ? 'Required' : undefined,
    user: !draft.user ? 'Required' : undefined,
    role: !draft.role ? 'Required' : undefined,
    level: !/^\d+$/.test(draft.level.trim()) ? 'Whole number' : undefined,
  };

  async function createDraft() {
    if (!draft || !draftErrors) return;
    setDraftTried(true);
    if (Object.values(draftErrors).some(Boolean) || !draft.user) return;
    setCreating(true);
    try {
      await createConfig(
        { name: draft.name, userId: draft.user.id, role: Number(draft.role), level: Number(draft.level), buId: draft.buId || null },
        buTable,
      );
      showToast('Row created');
      setDraft(undefined);
      setDraftTried(false);
      reload();
    } catch (err) {
      showToast(errorMessage(err, 'Could not create the row.'), 'error');
    } finally {
      setCreating(false);
    }
  }

  const sortIcon = (k: SortKey) => (sort.key !== k ? faSort : sort.dir === 1 ? faSortUp : faSortDown);
  const show = (e?: string) => (draftTried ? e : undefined);

  return (
    <div className="nd-shell">
      <Sidebar page="config" onNavigate={onNavigate} />
      <Topbar section="Escalation Config" title="Escalation Config" onRefresh={reload} refreshing={loading} updatedAt={updatedAt} />

      <main className="nd-content">
        <div className="nd-wrap">
          <div className="nd-resultline ec-bar">
            {loading && <span className="nd-progress" aria-hidden="true" />}
            <span>
              {rows ? (
                <>
                  <b>{rows.length}</b> config row{rows.length === 1 ? '' : 's'} · click any cell to edit, it saves on its own
                </>
              ) : (
                'Loading…'
              )}
            </span>
            <span className="nd-spacer" />
            <button
              type="button"
              className="nd-btn-dec"
              disabled={Boolean(draft)}
              onClick={() => {
                setDraft(EMPTY_DRAFT);
                setDraftTried(false);
              }}
            >
              <FontAwesomeIcon icon={faPlus} /> New record
            </button>
          </div>

          {error && !rows ? (
            <ErrorState message={error} onRetry={reload} />
          ) : (
            <div className="nd-tablewrap">
              <table className="nd-table ec-table">
                <thead>
                  <tr className="col">
                    {COLUMNS.map((c) => (
                      <th key={c.key} className={c.key === 'level' ? 'num' : undefined}>
                        <button type="button" className="ec-sort" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? ((s.dir * -1) as 1 | -1) : 1 }))}>
                          {c.label} <FontAwesomeIcon icon={sortIcon(c.key)} />
                        </button>
                      </th>
                    ))}
                    <th aria-label="Status" />
                  </tr>
                </thead>
                <tbody>
                  {draft && draftErrors && (
                    <tr className="ec-draft">
                      <td>
                        <input className={`nd-cell-input${show(draftErrors.name) ? ' is-bad' : ''}`} value={draft.name} placeholder="Name" autoFocus onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Name" />
                      </td>
                      <td className={show(draftErrors.user) ? 'is-bad' : undefined}>
                        <UserSearch value={draft.user} onChange={(u) => setDraft({ ...draft, user: u })} placeholder="Search user…" ariaLabel="User" />
                      </td>
                      <td className={show(draftErrors.role) ? 'is-bad' : undefined}>
                        <SoftSelect floating className="nd-soft--field" ariaLabel="Role" value={draft.role} placeholder="Select role…" options={ROLE_SELECT} onChange={(v) => setDraft({ ...draft, role: v })} />
                      </td>
                      <td className="num">
                        <input className={`nd-cell-input is-num${show(draftErrors.level) ? ' is-bad' : ''}`} type="number" min={0} step={1} value={draft.level} placeholder="1" onChange={(e) => setDraft({ ...draft, level: e.target.value })} aria-label="Level" />
                      </td>
                      <td>
                        <SoftSelect floating searchable className="nd-soft--field" ariaLabel="Business Unit" value={draft.buId} options={unitOptions} onChange={(v) => setDraft({ ...draft, buId: v })} />
                      </td>
                      <td className="nd-dim">New</td>
                      <td className="ec-actions">
                        <button type="button" className="ec-icon is-ok" onClick={createDraft} disabled={creating} title="Create" aria-label="Create">
                          <FontAwesomeIcon icon={creating ? faSpinner : faCheck} spin={creating} />
                        </button>
                        <button type="button" className="ec-icon" onClick={() => setDraft(undefined)} disabled={creating} title="Cancel" aria-label="Cancel">
                          <FontAwesomeIcon icon={faXmark} />
                        </button>
                      </td>
                    </tr>
                  )}
                  {!sorted
                    ? Array.from({ length: 6 }, (_, i) => (
                        <tr key={i} className="nd-skel-row">
                          {COLUMNS.map((c) => (
                            <td key={c.key}>
                              <span className="nd-skel" style={{ width: '60%' }} />
                            </td>
                          ))}
                          <td />
                        </tr>
                      ))
                    : sorted.map((r) => {
                        const busy = savingIds.has(r.id);
                        return (
                          <tr key={r.id} className={busy ? 'is-saving' : undefined}>
                            <td>
                              <InlineInput value={r.name} ariaLabel="Name" onSave={(v) => v && save(r, { name: v }, { name: v })} />
                            </td>
                            <td>
                              <UserSearch
                                value={r.userId ? { id: r.userId, name: r.userName ?? r.userId } : undefined}
                                onChange={(u) => u && u.id !== r.userId && save(r, { userId: u.id }, { userId: u.id, userName: u.name })}
                                placeholder="Search user…"
                                ariaLabel="User"
                              />
                            </td>
                            <td>
                              <SoftSelect
                                floating
                                className="nd-soft--field"
                                ariaLabel="Role"
                                value={r.role !== undefined ? String(r.role) : ''}
                                placeholder="Select role…"
                                options={ROLE_SELECT}
                                onChange={(v) => Number(v) !== r.role && save(r, { role: Number(v) }, { role: Number(v) })}
                              />
                            </td>
                            <td className="num">
                              <InlineInput
                                type="number"
                                value={r.level !== undefined ? String(r.level) : ''}
                                ariaLabel="Level"
                                onSave={(v) => {
                                  if (!/^\d+$/.test(v)) return showToast('Level must be a whole number', 'warning');
                                  void save(r, { level: Number(v) }, { level: Number(v) });
                                }}
                              />
                            </td>
                            <td>
                              <SoftSelect
                                floating
                                searchable
                                className="nd-soft--field"
                                ariaLabel="Business Unit"
                                value={r.buId ?? ''}
                                options={unitOptions}
                                placeholder={r.buName ?? ALL_UNITS}
                                onChange={(v) => (v || undefined) !== r.buId && save(r, { buId: v || null }, { buId: v || undefined, buName: unitName(v || undefined) })}
                              />
                            </td>
                            <td className="nd-mono ec-created">{formatDateTimeUS(r.createdOn)}</td>
                            <td className="ec-actions">{busy && <FontAwesomeIcon icon={faSpinner} spin className="ec-spin" />}</td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
              {sorted && sorted.length === 0 && !draft && <p className="nd-empty ec-empty">No config rows yet — add the first one with “New record”.</p>}
            </div>
          )}
          {error && rows && (
            <p className="nd-notice" role="alert">
              <FontAwesomeIcon icon={faRotateRight} /> {error}
            </p>
          )}
        </div>
      </main>

      <Toast message={toast.message} on={toast.on} tone={toast.tone} />
    </div>
  );
}
