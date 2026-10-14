import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';

export const PAGE_SIZES = [25, 50, 100] as const;
const COUNT_CAP = 5000; // Dataverse stops counting at 5000

interface Props {
  page: number;
  pageSize: number;
  rowsOnPage: number;
  total?: number;
  /** Pages the user can jump to (token paging: loaded pages + the next one). */
  reachablePages: number;
  hasPrevious: boolean;
  hasNext: boolean;
  busy: boolean;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}

export function Pager({ page, pageSize, rowsOnPage, total, reachablePages, hasPrevious, hasNext, busy, onPage, onPageSize }: Props) {
  const from = rowsOnPage ? page * pageSize + 1 : 0;
  const to = page * pageSize + rowsOnPage;
  const capped = total !== undefined && total >= COUNT_CAP;
  const pages = total !== undefined && !capped ? Math.max(1, Math.ceil(total / pageSize)) : undefined;
  const reachable = Math.max(page + 1, Math.min(reachablePages, pages ?? reachablePages));

  // Window of at most 5 numbers around the current page, like the design.
  const cur = page + 1;
  let a = Math.max(1, cur - 2);
  const b = Math.min(reachable, a + 4);
  a = Math.max(1, b - 4);
  const nums: number[] = [];
  for (let i = a; i <= b; i++) nums.push(i);

  return (
    <div className="nd-pager">
      <div className="nd-pg-left">
        Rows per page
        <select className="nd-sel nd-pg-size" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <span className="nd-pg-range nd-mono">
          {from}–{to}
          {total !== undefined && <> of {capped ? `${COUNT_CAP.toLocaleString()}+` : total.toLocaleString()}</>}
        </span>
      </div>
      <div className="nd-pg-right">
        <button type="button" className="nd-pg-step" disabled={!hasPrevious} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>
        {a > 1 && (
          <>
            <button type="button" className="nd-pg-num" onClick={() => onPage(0)}>1</button>
            {a > 2 && <span className="nd-pg-gap">…</span>}
          </>
        )}
        {nums.map((n) => (
          <button
            key={n}
            type="button"
            className={`nd-pg-num${n === cur ? ' on' : ''}`}
            aria-current={n === cur ? 'page' : undefined}
            disabled={busy && n !== cur}
            onClick={() => onPage(n - 1)}
          >
            {n}
          </button>
        ))}
        {pages !== undefined && pages > b && (
          <span className="nd-pg-gap" title="Pages load in order">
            … {pages}
          </span>
        )}
        <button type="button" className="nd-pg-step" disabled={!hasNext || busy} onClick={() => onPage(page + 1)} aria-label="Next page">
          <FontAwesomeIcon icon={faChevronRight} />
        </button>
      </div>
    </div>
  );
}
