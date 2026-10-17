// Pure spending maths: lines, totals, rolling budget. No React, no network — unit-tested.
import { addDays, dayOfMonth, daysInMonth, monthStart } from './dates.js';
import { amountOn, committedForMonth, dueDates } from './recurring.js';

function committedBetween(rules, from, to) {
  return rules.reduce((s, r) => s + dueDates(r, from, to).reduce((t, d) => t + amountOn(r, d), 0), 0);
}

export const isSpend = (t) => (t.type === 'expense' || t.type === 'refund') && !t.is_draft;

export function txSpend(t) {
  const sign = t.type === 'refund' ? -1 : 1;
  const items = t.items || [];
  const total = items.length ? items.reduce((s, i) => s + Number(i.amount_myr || 0), 0) : Number(t.amount_myr || 0);
  return sign * total;
}

/** One line per item. Refunds negative. */
export function spendLines(txs) {
  const out = [];
  for (const t of txs) {
    if (!isSpend(t)) continue;
    const sign = t.type === 'refund' ? -1 : 1;
    const items = t.items?.length ? t.items : [{ amount_myr: t.amount_myr, category_id: null }];
    for (const i of items) {
      out.push({
        tx: t,
        date: t.date,
        amount: sign * Number(i.amount_myr || 0),
        category_id: i.category_id,
        merchant_id: t.merchant_id,
        platform_id: t.platform_id,
        account_id: t.account_id,
        tag_ids: t.tag_ids || [],
        recurring: !!t.recurring_rule_id,
        excluded: !!t.exclude_from_budget
      });
    }
  }
  return out;
}

export function sumBetween(lines, from, to, pred = () => true) {
  let s = 0;
  for (const l of lines) if (l.date >= from && l.date <= to && pred(l)) s += l.amount;
  return s;
}

const counts = (l) => !l.recurring && !l.excluded;

/**
 * Rolling budget.
 * discretionary = monthly budget − recurring committed this month
 * allowance(day) = max(0, (discretionary − one-off spent before day) / days left incl. day)
 */
export function budgetForDay({ lines, rules, budget, date, includeRecurring = false }) {
  if (!budget) return null;
  const mStart = monthStart(date);
  const committed = committedForMonth(rules, date);
  const discretionary = budget - committed;
  const spentBefore = date > mStart ? sumBetween(lines, mStart, addDays(date, -1), counts) : 0;
  const dim = daysInMonth(Number(date.slice(0, 4)), Number(date.slice(5, 7)));
  const daysLeft = dim - dayOfMonth(date) + 1;
  const remaining = discretionary - spentBefore;
  const allowance = Math.max(0, remaining / daysLeft);
  const daySpend = sumBetween(lines, date, date, includeRecurring ? (l) => !l.excluded : counts);
  const monthOver = Math.max(0, -(remaining - sumBetween(lines, date, date, counts)));
  return { committed, discretionary, spentBefore, daysLeft, remaining, allowance, daySpend, monthOver };
}

/**
 * Pace = bills already due by `date` (they land on fixed days, not evenly)
 *      + the discretionary budget spread evenly across the month.
 * So rent on the 1st doesn't make you "ahead of pace", and a bill due on the 25th
 * doesn't make you look thrifty on the 17th.
 */
export function monthSummary({ lines, budget, date, rules = [] }) {
  const mStart = monthStart(date);
  const spent = sumBetween(lines, mStart, date);
  const budgetSpent = sumBetween(lines, mStart, date, (l) => !l.excluded);
  const dim = daysInMonth(Number(date.slice(0, 4)), Number(date.slice(5, 7)));
  const committed = committedForMonth(rules, date);
  const dueSoFar = committedBetween(rules, mStart, date);
  const pace = budget ? dueSoFar + ((budget - committed) * dayOfMonth(date)) / dim : null;
  return { spent, budgetSpent, budget, pace, daysLeft: dim - dayOfMonth(date) };
}

/** Group lines by a key → [{key, amount}], sorted desc. */
export function groupBy(lines, keyFn) {
  const m = new Map();
  for (const l of lines) {
    const keys = [].concat(keyFn(l));
    for (const k of keys) m.set(k ?? null, (m.get(k ?? null) || 0) + l.amount);
  }
  return [...m.entries()].map(([key, amount]) => ({ key, amount })).sort((a, b) => b.amount - a.amount);
}
