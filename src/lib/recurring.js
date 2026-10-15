import { addDays, daysInMonth, monthEnd, monthStart } from './dates.js';

const pad = (n) => String(n).padStart(2, '0');

function isActiveOn(rule, date) {
  if (rule.paused) return false;
  if (rule.start_date && date < rule.start_date) return false;
  if (rule.end_date && date > rule.end_date) return false;
  return true;
}

/** The due date of a rule within a given month ('YYYY-MM-..'), or null. Days 29–31 clamp to month end. */
export function dueDateInMonth(rule, anyDayInMonth) {
  const y = Number(anyDayInMonth.slice(0, 4));
  const m = Number(anyDayInMonth.slice(5, 7));
  if (rule.frequency === 'yearly' && Number(rule.month_of_year) !== m) return null;
  const day = Math.min(Number(rule.day_of_month), daysInMonth(y, m));
  return `${y}-${pad(m)}-${pad(day)}`;
}

/** All due dates of a rule in [from, to], respecting start/end dates and pause. */
export function dueDates(rule, from, to) {
  const out = [];
  let cursor = monthStart(from);
  let guard = 0;
  while (cursor <= to && guard++ < 600) {
    const d = dueDateInMonth(rule, cursor);
    if (d && d >= from && d <= to && isActiveOn(rule, d)) out.push(d);
    cursor = addDays(monthEnd(cursor), 1);
  }
  return out;
}

/** Due dates that still need generating, up to and including today. */
export function pendingDates(rule, today) {
  if (rule.paused) return [];
  const after = rule.last_generated_date ? addDays(rule.last_generated_date, 1) : rule.start_date;
  if (!after || after > today) return [];
  return dueDates(rule, after, today);
}

export function nextDueDate(rule, today) {
  if (rule.paused) return null;
  const limit = addDays(today, 800);
  const from = rule.start_date && rule.start_date > today ? rule.start_date : today;
  const list = dueDates(rule, from, limit);
  return list[0] || null;
}

/** Which payment number a due date is (1-based), counted from the rule's start. */
export function paymentNumber(rule, date) {
  return dueDates({ ...rule, paused: false, end_date: null }, rule.start_date, date).length;
}

/** Amount due on a date. Installments: equal slices, the last one absorbs rounding cents. */
export function amountOn(rule, date) {
  const base = Number(rule.amount_myr || 0);
  if (rule.kind !== 'installment') return base;
  const n = Number(rule.installment_count);
  const k = paymentNumber(rule, date);
  if (k >= n) return Math.round((Number(rule.total_myr) - base * (n - 1)) * 100) / 100;
  return base;
}

/** Plan an installment: slice amount and the date of the final payment. */
export function planInstallment(total, count, firstDate) {
  const amount = Math.floor((total / count) * 100) / 100;
  const day = Number(firstDate.slice(8, 10));
  let end = firstDate;
  for (let i = 1; i < count; i++) end = dueDateInMonth({ frequency: 'monthly', day_of_month: day }, addDays(monthEnd(end), 1));
  return { amount, end, day };
}

/** Installment progress as of `today`. */
export function installmentStatus(rule, today) {
  const n = Number(rule.installment_count);
  const paid = Math.min(n, today < rule.start_date ? 0 : paymentNumber(rule, today));
  const paidAmount = paid >= n ? Number(rule.total_myr) : paid * Number(rule.amount_myr);
  return { paid, count: n, left: n - paid, remaining: Math.max(0, Math.round((Number(rule.total_myr) - paidAmount) * 100) / 100) };
}

/** Sum of recurring commitments (incl. installments) due in the month containing `date`. */
export function committedForMonth(rules, date) {
  const from = monthStart(date);
  const to = monthEnd(date);
  return rules.reduce((sum, r) => sum + dueDates(r, from, to).reduce((s, d) => s + amountOn(r, d), 0), 0);
}
