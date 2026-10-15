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

/** Sum of recurring commitments due in the month containing `date`. */
export function committedForMonth(rules, date) {
  const from = monthStart(date);
  const to = monthEnd(date);
  return rules.reduce((sum, r) => sum + dueDates(r, from, to).length * Number(r.amount_myr || 0), 0);
}
