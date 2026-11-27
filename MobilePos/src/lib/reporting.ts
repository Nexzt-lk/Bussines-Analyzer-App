// Business rules shared by the sales, expenses, reports and inventory APIs.
// Keeping them in one place guarantees every screen computes the same numbers.

export const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Branch scoping
// ---------------------------------------------------------------------------

export class MissingBranchError extends Error {
  constructor() {
    super('No branch selected.');
    this.name = 'MissingBranchError';
  }
}

/** Every query must be scoped to a branch; never fall back to "all shops". */
export const requireBranchId = (branchId: string | null | undefined): string => {
  const id = (branchId ?? '').trim();
  if (!id) throw new MissingBranchError();
  return id;
};

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Escapes LIKE/ILIKE wildcards so user input is matched literally. */
export const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (c) => `\\${c}`);

// ---------------------------------------------------------------------------
// Order status
// ---------------------------------------------------------------------------

const PAID_STATUSES = new Set(['completed', 'paid']);
const CLOSED_UNPAID_STATUSES = new Set(['refunded', 'cancelled', 'canceled', 'void', 'voided']);

const normaliseStatus = (status: string | null | undefined) => (status ?? '').trim().toLowerCase();

/** A sale that counts towards income. */
export const isPaidOrder = (status: string | null | undefined): boolean =>
  PAID_STATUSES.has(normaliseStatus(status));

/** An order still waiting for payment (not paid, refunded or cancelled). */
export const isUnpaidOrder = (status: string | null | undefined): boolean => {
  const s = normaliseStatus(status);
  return !PAID_STATUSES.has(s) && !CLOSED_UNPAID_STATUSES.has(s);
};

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/** Parses a numeric DB value (number or numeric string); anything else is 0. */
export const toNumber = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Like toNumber but keeps "missing" distinct from 0. */
export const toNumberOrNull = (value: unknown): number | null =>
  value === null || value === undefined || value === '' ? null : toNumber(value);

export interface Trend {
  text: string; // e.g. '+12%', '-5%', '0%'
  positive: boolean; // good news for the owner
}

/**
 * Period-over-period change. With no previous data the change is undefined,
 * so it is reported as '+100%' when there is new activity and '0%' otherwise.
 */
export const computeTrend = (
  current: number,
  previous: number,
  { lowerIsBetter = false } = {}
): Trend => {
  if (previous > 0) {
    const pct = Math.round(((current - previous) / previous) * 100);
    const text = `${pct >= 0 ? '+' : ''}${pct}%`;
    return { text, positive: lowerIsBetter ? pct <= 0 : pct >= 0 };
  }
  if (current > 0) return { text: '+100%', positive: !lowerIsBetter };
  return { text: '0%', positive: true };
};

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses a DB date/timestamp to epoch ms in LOCAL time.
 * Date-only values ('2026-10-03') are a calendar day, not UTC midnight, so
 * they are placed at local noon — the same day in every timezone.
 */
export const parseRecordDate = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const m = DATE_ONLY.exec(value);
  const t = m ? new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0, 0).getTime() : new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
};

/** Local calendar date as 'YYYY-MM-DD' (unlike toISOString, which is UTC). */
export const toLocalYmd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
export const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
export const addDays = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());

export class InvalidDateRangeError extends Error {
  constructor() {
    super('Start date must be on or before the end date.');
    this.name = 'InvalidDateRangeError';
  }
}

export interface DateRange {
  start: Date;
  end: Date;
}

const parseYmd = (ymd: string | undefined): Date | null => {
  const m = ymd ? DATE_ONLY.exec(ymd) : null;
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  // Reject impossible dates like 2026-02-31 (which JS rolls into March).
  return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null;
};

/**
 * Resolves a custom 'YYYY-MM-DD' range to whole local days.
 * Missing/malformed dates use the fallback; a reversed range is rejected.
 */
export const resolveCustomRange = (
  startYmd: string | undefined,
  endYmd: string | undefined,
  fallback: DateRange
): DateRange => {
  const s = parseYmd(startYmd);
  const e = parseYmd(endYmd);
  const start = s ? startOfDay(s) : fallback.start;
  const end = e ? endOfDay(e) : fallback.end;
  if (start.getTime() > end.getTime()) throw new InvalidDateRangeError();
  return { start, end };
};

/** The equally long period immediately before `range`. */
export const previousPeriod = ({ start, end }: DateRange): DateRange => {
  const length = end.getTime() - start.getTime() + 1;
  return { start: new Date(start.getTime() - length), end: new Date(start.getTime() - 1) };
};

/**
 * Splits whole days [start, end] into at most `maxSlices` contiguous,
 * non-overlapping slices of (nearly) equal day counts. Every slice lies
 * inside the range and together they cover it exactly.
 */
export const splitIntoDaySlices = ({ start, end }: DateRange, maxSlices: number): DateRange[] => {
  const first = startOfDay(start);
  const totalDays = Math.round((startOfDay(end).getTime() - first.getTime()) / DAY_MS) + 1;
  const count = Math.max(1, Math.min(maxSlices, totalDays));
  const slices: DateRange[] = [];
  for (let i = 0; i < count; i++) {
    const fromDay = Math.floor((i * totalDays) / count);
    const toDay = Math.floor(((i + 1) * totalDays) / count) - 1;
    slices.push({
      start: i === 0 ? start : startOfDay(addDays(first, fromDay)),
      end: i === count - 1 ? end : endOfDay(addDays(first, toDay)),
    });
  }
  return slices;
};

/** Sums `amount(row)` over rows whose timestamp falls inside [start, end]. */
export const sumInRange = <T>(
  rows: T[],
  range: DateRange,
  time: (row: T) => number | null,
  amount: (row: T) => number
): number =>
  rows.reduce((acc, row) => {
    const t = time(row);
    return t !== null && t >= range.start.getTime() && t <= range.end.getTime() ? acc + amount(row) : acc;
  }, 0);
