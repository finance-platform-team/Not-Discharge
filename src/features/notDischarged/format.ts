const FORMATTED = '@OData.Community.Display.V1.FormattedValue';

type Raw = Record<string, unknown>;

/** Dataverse returns display text for choices, lookups and dates as an annotation next to the value. */
export function formatted(record: Raw, field: string): string | undefined {
  const value = record[`${field}${FORMATTED}`];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function str(record: Raw, field: string): string | undefined {
  const value = record[field];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function num(record: Raw, field: string): number | undefined {
  const value = record[field];
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  // The connector can return decimals / choice values as strings.
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

const DAY_MS = 86_400_000;

export function daysSince(iso: string | undefined, now = Date.now()): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? undefined : Math.max(0, Math.floor((now - t) / DAY_MS));
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const moneyFormatters = new Map<string, Intl.NumberFormat>();

/** Formats an amount in the record's own currency (EGP / SAR from notdis_currency). */
export function formatMoney(amount: number | undefined, currency: string | undefined): string {
  if (amount === undefined) return '—';
  const code = currency && /^[A-Z]{3}$/.test(currency) ? currency : undefined;
  const key = code ?? '';
  let f = moneyFormatters.get(key);
  if (!f) {
    f = code
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: code, currencyDisplay: 'code', maximumFractionDigits: 0 })
      : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
    moneyFormatters.set(key, f);
  }
  return f.format(amount);
}

export function formatNumber(amount: number | undefined): string {
  return amount === undefined ? '—' : Math.round(amount).toLocaleString('en-US');
}

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return fallback;
}

/** Whole days with a "d" suffix (Loss Day is a decimal column, e.g. 10.00 → "10d"). */
export function formatDays(days: number | undefined): string {
  return days === undefined ? '—' : `${Math.round(days).toLocaleString('en-US')}d`;
}

/** M/d/yyyy h:mm AM/PM in the user's local time (action history). */
export function formatDateTimeUS(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${h % 12 || 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

/** M/d/yyyy from a yyyy-mm-dd date input value (no time zone shift). */
export function formatDateInputUS(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : value;
}

/** yyyy-MM-dd HH:mm in the user's local time (action history). */
export function formatDateTimeISO(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "Xh Ym" for a duration in milliseconds (negative counts as 0). */
export function formatHoursMinutes(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

/** dd/MM/yyyy HH:mm in the user's local time (the "Closed" line). */
export function formatDateTimeDMY(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** dd/MM/yyyy from a yyyy-mm-dd date input value (no time zone shift). */
export function formatDateInputDMY(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

/** A percentage with at most 2 decimals (BR-CR-08): 75 → "75%", 33.333 → "33.33%". */
export function formatPct(pct: number | undefined): string {
  return pct === undefined ? '—' : `${pct.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
}
