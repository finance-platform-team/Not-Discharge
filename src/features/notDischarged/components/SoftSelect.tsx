import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faChevronDown, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';

export interface SoftOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: SoftOption[];
  onChange: (value: string) => void;
  /** Shown when no option matches `value` (e.g. while options load). */
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  /**
   * Draw the list fixed on the page instead of under the button, for places that clip overflow or
   * stack (a scrolling table with sticky cells). The list is rendered at the top of the app shell
   * so no cell can cover it. It opens upward when there is no room below, and closes on scroll.
   */
  floating?: boolean;
  disabled?: boolean;
  /** Shown before the value inside the button (e.g. a status icon). */
  icon?: ReactNode;
  /** Tooltip for the button, e.g. the full label when it is truncated. */
  title?: string;
  /** Adds a search box at the top of the list that narrows the options as you type. */
  searchable?: boolean;
}

/**
 * Filter dropdown with our own soft popover. The browser's native <select> list can't be styled
 * (sharp corners, blue highlight), so this draws the list itself. Keyboard: arrows, Enter, Escape.
 */
export function SoftSelect({ value, options, onChange, placeholder, ariaLabel, className, floating, disabled, icon, title, searchable }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  /** Where a floating list is rendered: the app shell (it carries the colour tokens). */
  const [host, setHost] = useState<HTMLElement | null>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);
  const [place, setPlace] = useState<CSSProperties>();
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const shown = searchable && term ? options.filter((o) => o.label.toLowerCase().includes(term)) : options;

  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) => root.current?.contains(t as Node) || list.current?.contains(t as Node);
    const onDown = (e: MouseEvent) => {
      if (!inside(e.target)) setOpen(false);
    };
    // A fixed list would drift away from its button, so any scroll outside the list closes it.
    const onScroll = (e: Event) => {
      if (!inside(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    if (floating) window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, floating]);

  // Keep the highlighted option in view while moving with the keyboard. Only the list scrolls:
  // scrollIntoView could scroll the page too, which closes a floating list.
  useEffect(() => {
    const ul = list.current;
    const li = ul?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    if (!open || !ul || !li) return;
    if (li.offsetTop < ul.scrollTop) ul.scrollTop = li.offsetTop;
    else if (li.offsetTop + li.offsetHeight > ul.scrollTop + ul.clientHeight) ul.scrollTop = li.offsetTop + li.offsetHeight - ul.clientHeight;
  }, [open, active]);

  const openList = () => {
    if (disabled) return;
    if (floating) {
      setHost(root.current?.closest<HTMLElement>('.nd-shell') ?? document.body);
      const r = root.current?.getBoundingClientRect();
      if (r) {
        const up = window.innerHeight - r.bottom < 240 && r.top > 240;
        setPlace({
          position: 'fixed',
          zIndex: 90, // above sticky table cells, the filter bar, the drawer and dialogs
          left: Math.min(r.left, window.innerWidth - 240),
          minWidth: r.width,
          ...(up ? { bottom: window.innerHeight - r.top + 6, top: 'auto' } : { top: r.bottom + 6 }),
        });
      }
    }
    setQuery('');
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent, searching = false) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // close the list only, not the dialog / drawer behind it
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(shown.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' || (e.key === ' ' && !searching)) {
      e.preventDefault();
      const o = shown[active];
      if (o) pick(o.value);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const listEl = open ? (
    <ul
      ref={list}
      id={listId}
      className="nd-soft__list"
      role="listbox"
      aria-label={ariaLabel}
      style={floating ? place : undefined}
    >
      {searchable && term && !shown.length && (
        <li className="nd-soft__empty" role="presentation">
          No matches
        </li>
      )}
      {shown.map((o, i) => (
        <li
          key={o.value}
          data-i={i}
          role="option"
          aria-selected={o.value === value}
          className={`${i === active ? 'is-active' : ''}${o.value === value ? ' is-on' : ''}`}
          onMouseEnter={() => setActive(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            pick(o.value);
          }}
        >
          <span>{o.label}</span>
          {o.value === value && <FontAwesomeIcon icon={faCheck} />}
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <div ref={root} className={`nd-soft${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}>
      {searchable && open ? (
        // While open, the box itself becomes the search field (type to narrow the list).
        <div className="nd-soft__btn is-search">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="nd-soft__find" />
          <input
            autoFocus
            className="nd-soft__input"
            value={query}
            placeholder={selected?.label ?? placeholder ?? 'Search…'}
            role="combobox"
            aria-label={`Search ${ariaLabel}`}
            aria-expanded
            aria-controls={listId}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => onKey(e, true)}
          />
          <button type="button" className="nd-soft__chevbtn" aria-label="Close list" onClick={() => setOpen(false)}>
            <FontAwesomeIcon icon={faChevronDown} className="nd-soft__chev" />
          </button>
        </div>
      ) : (
      <button
        type="button"
        className="nd-soft__btn"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        title={title}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKey}
      >
        {icon}
        <span className="nd-soft__val">{selected?.label ?? placeholder ?? ''}</span>
        <FontAwesomeIcon icon={faChevronDown} className="nd-soft__chev" />
      </button>
      )}
      {floating && host ? listEl && createPortal(listEl, host) : listEl}
    </div>
  );
}

