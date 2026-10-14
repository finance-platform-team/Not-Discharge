import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faMagnifyingGlass, faSpinner, faXmark } from '@fortawesome/free-solid-svg-icons';
import { searchUsers, type AssignableUser } from '../api';
import { errorMessage } from '../format';

type Picked = { id: string; name: string };

interface Props {
  value?: Picked;
  onChange: (user: Picked | undefined) => void;
  placeholder?: string;
  ariaLabel: string;
}

/**
 * Type-ahead over the systemuser table (searched in Dataverse as you type, by name or email).
 * The list is drawn at the top of the app shell so a dialog's scrolling body can't clip it.
 */
export function UserSearch({ value, onChange, placeholder, ariaLabel }: Props) {
  const [text, setText] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<AssignableUser[]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<CSSProperties>();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const seq = useRef(0);
  const listId = useId();

  // Search while the list is open (debounced); only the latest answer is shown.
  useEffect(() => {
    if (!open) return;
    const id = ++seq.current;
    const timer = window.setTimeout(() => {
      setLoading(true);
      searchUsers(value && text === value.name ? '' : text)
        .then((users) => {
          if (id !== seq.current) return;
          setResults(users);
          setError(undefined);
          setActive(0);
        })
        .catch((err: unknown) => id === seq.current && setError(errorMessage(err, 'Could not search users.')))
        .finally(() => id === seq.current && setLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, text, value]);

  // Close on a click outside, or on any scroll outside the list (a fixed list would drift).
  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) => root.current?.contains(t as Node) || list.current?.contains(t as Node);
    const onDown = (e: MouseEvent) => !inside(e.target) && setOpen(false);
    const onScroll = (e: Event) => !inside(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const openList = () => {
    const r = root.current?.getBoundingClientRect();
    if (r) {
      const up = window.innerHeight - r.bottom < 260 && r.top > 260;
      setPlace({
        position: 'fixed',
        zIndex: 90,
        left: r.left,
        width: r.width,
        minWidth: r.width, // the list's own min-width (100%) would otherwise be the whole screen
        ...(up ? { bottom: window.innerHeight - r.top + 6, top: 'auto' } : { top: r.bottom + 6 }),
      });
    }
    setHost(root.current?.closest<HTMLElement>('.nd-shell') ?? document.body);
    setOpen(true);
  };

  const pick = (u: AssignableUser) => {
    onChange({ id: u.id, name: u.name });
    setText(u.name);
    setOpen(false);
  };

  const clear = () => {
    onChange(undefined);
    setText('');
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const items = results ?? [];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) openList();
      else setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && open && items[active]) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation(); // close the list only, not the dialog behind it
      setOpen(false);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const listEl = open ? (
    <ul ref={list} id={listId} className="nd-soft__list nd-user-list" role="listbox" aria-label={ariaLabel} style={place}>
      {error ? (
        <li className="nd-user-list__state is-error">{error}</li>
      ) : !results ? (
        <li className="nd-user-list__state">
          <FontAwesomeIcon icon={faSpinner} spin /> Searching…
        </li>
      ) : results.length === 0 ? (
        <li className="nd-user-list__state">No users match “{text.trim()}”</li>
      ) : (
        results.map((u, i) => (
          <li
            key={u.id}
            role="option"
            aria-selected={u.id === value?.id}
            className={`${i === active ? 'is-active' : ''}${u.id === value?.id ? ' is-on' : ''}`}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              pick(u);
            }}
          >
            <span className="nd-user-list__who">
              <span>{u.name}</span>
              {u.email && <small>{u.email}</small>}
            </span>
            {u.id === value?.id && <FontAwesomeIcon icon={faCheck} />}
          </li>
        ))
      )}
    </ul>
  ) : null;

  return (
    <div ref={root} className={`nd-user-search${open ? ' is-open' : ''}`}>
      <FontAwesomeIcon icon={loading ? faSpinner : faMagnifyingGlass} spin={loading} className="nd-user-search__icon" />
      <input
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        onFocus={openList}
        onChange={(e) => {
          setText(e.target.value);
          if (value) onChange(undefined); // typing again means a new choice
          if (!open) openList();
        }}
        onKeyDown={onKey}
      />
      {text && (
        <button type="button" className="nd-user-search__clear" onClick={clear} aria-label="Clear">
          <FontAwesomeIcon icon={faXmark} />
        </button>
      )}
      {listEl && host ? createPortal(listEl, host) : null}
    </div>
  );
}
