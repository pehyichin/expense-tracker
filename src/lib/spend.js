// Pure spending maths: lines, totals, rolling budget. No React, no network — unit-tested.
import { addDays, dayOfMonth, daysInMonth, monthEnd, monthStart } from './dates.js';
import { amountOn, dueDates } from './recurring.js';

/**
 * Bills for the month containing `date`: each due date uses the amount actually logged
 * (e.g. a confirmed electricity bill), otherwise the planned amount. Logged recurring
 * spending whose rule no longer exists still counts.
 */
export function monthCommitted(lines, rules, date) {
  const from = monthStart(date);
  const to = monthEnd(date);
  const logged = new Map();
  for (const l of lines) {
    if (!l.recurring || l.date < from || l.date > to) continue;
    const k = `${l.tx.recurring_rule_id}|${l.date}`;
    logged.set(k, (logged.get(k) || 0) + l.amount);
  }
  let total = 0;
  const used = new Set();
  for (const r of rules) {
    for (const d of dueDates(r, from, to)) {
      const k = `${r.id}|${d}`;
      if (logged.has(k)) {
        total += logged.get(k);
        used.add(k);
      } else total += amountOn(r, d);
    }
  }
  for (const [k, v] of logged) if (!used.has(k)) total += v;
  return total;
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
  const committed = monthCommitted(lines, rules, date);
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
 * Month view, same rules as the daily allowance:
 * - Bills (recurring + installments) are taken out of the budget on day 1, paid or not.
 * - One-off spending (not recurring, not excluded) is what moves day to day.
 * - Pace = all bills + the discretionary budget spread evenly to today.
 *   So "ahead/under pace" is purely about one-off spending, matching the arc.
 */
export function monthSummary({ lines, budget, date, rules = [] }) {
  const mStart = monthStart(date);
  const spent = sumBetween(lines, mStart, date);
  const oneOff = sumBetween(lines, mStart, date, (l) => !l.recurring && !l.excluded);
  const dim = daysInMonth(Number(date.slice(0, 4)), Number(date.slice(5, 7)));
  const committed = monthCommitted(lines, rules, date);
  const used = committed + oneOff;
  const pace = budget ? committed + ((budget - committed) * dayOfMonth(date)) / dim : null;
  return { spent, oneOff, committed, used, budget, pace, left: budget ? budget - used : null, daysLeft: dim - dayOfMonth(date) };
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
