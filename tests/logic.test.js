import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueDates, pendingDates, committedForMonth, nextDueDate, planInstallment, amountOn, installmentStatus } from '../src/lib/recurring.js';

test('installments: equal slices, last absorbs the cents, ends on time', () => {
  const p = planInstallment(100, 3, '2026-10-31');
  assert.equal(p.amount, 33.33);
  assert.equal(p.end, '2026-12-31');
  const r = { kind: 'installment', frequency: 'monthly', day_of_month: p.day, start_date: '2026-10-31', end_date: p.end, amount_myr: p.amount, total_myr: 100, installment_count: 3 };
  const dates = dueDates(r, '2026-01-01', '2027-12-31');
  assert.deepEqual(dates, ['2026-10-31', '2026-11-30', '2026-12-31']);
  const sum = dates.reduce((s, d) => s + amountOn(r, d), 0);
  assert.equal(Math.round(sum * 100) / 100, 100);
  assert.equal(amountOn(r, '2026-12-31'), 33.34);
  assert.equal(committedForMonth([r], '2026-11-05'), 33.33);
  assert.deepEqual(installmentStatus(r, '2026-11-30'), { paid: 2, count: 3, left: 1, remaining: 33.34 });
  assert.deepEqual(installmentStatus(r, '2026-10-01'), { paid: 0, count: 3, left: 3, remaining: 100 });
});
import { budgetForDay, monthSummary, spendLines, sumBetween } from '../src/lib/spend.js';
import { rangePreset } from '../src/lib/dates.js';

const rule = (o) => ({ frequency: 'monthly', day_of_month: 1, start_date: '2026-01-01', amount_myr: 100, paused: false, ...o });
const exp = (date, amount, o = {}) => ({ type: 'expense', date, items: [{ amount_myr: amount, category_id: 'c' }], ...o });

test('day 31 clamps to the last day of short months', () => {
  const d = dueDates(rule({ day_of_month: 31 }), '2026-02-01', '2026-04-30');
  assert.deepEqual(d, ['2026-02-28', '2026-03-31', '2026-04-30']);
});

test('yearly rules only fire in their month', () => {
  const d = dueDates(rule({ frequency: 'yearly', month_of_year: 3, day_of_month: 15 }), '2026-01-01', '2027-12-31');
  assert.deepEqual(d, ['2026-03-15', '2027-03-15']);
});

test('catch-up generates every missed due date, nothing twice', () => {
  const r = rule({ day_of_month: 5, last_generated_date: '2026-08-05' });
  assert.deepEqual(pendingDates(r, '2026-10-15'), ['2026-09-05', '2026-10-05']);
  assert.deepEqual(pendingDates({ ...r, last_generated_date: '2026-10-05' }, '2026-10-15'), []);
});

test('paused and ended rules do not fire', () => {
  assert.deepEqual(pendingDates(rule({ paused: true }), '2026-10-15'), []);
  assert.deepEqual(dueDates(rule({ end_date: '2026-03-31' }), '2026-01-01', '2026-06-30').length, 3);
  assert.equal(nextDueDate(rule({ end_date: '2026-03-31' }), '2026-10-15'), null);
});

test('committed recurring for the month', () => {
  const rules = [rule({ amount_myr: 1500 }), rule({ amount_myr: 90, day_of_month: 18 }), rule({ frequency: 'yearly', month_of_year: 1, amount_myr: 500 })];
  assert.equal(committedForMonth(rules, '2026-10-15'), 1590);
});

test('rolling allowance: overspend shrinks tomorrow, refunds count back', () => {
  // October, 31 days. Budget 3100, no recurring → 100/day to start.
  const lines = spendLines([exp('2026-10-01', 220), exp('2026-10-02', 50)]);
  const d1 = budgetForDay({ lines, rules: [], budget: 3100, date: '2026-10-01' });
  assert.equal(d1.allowance, 100);
  assert.equal(d1.daySpend, 220);
  const d2 = budgetForDay({ lines, rules: [], budget: 3100, date: '2026-10-02' });
  assert.equal(d2.allowance, (3100 - 220) / 30); // 96
  const withRefund = spendLines([exp('2026-10-01', 220), { ...exp('2026-10-01', 20), type: 'refund' }]);
  assert.equal(budgetForDay({ lines: withRefund, rules: [], budget: 3100, date: '2026-10-02' }).allowance, (3100 - 200) / 30);
});

test('recurring, excluded and drafts stay out of the daily allowance', () => {
  const lines = spendLines([
    exp('2026-10-01', 1500, { recurring_rule_id: 'r' }),
    exp('2026-10-01', 4000, { exclude_from_budget: true }),
    exp('2026-10-01', 999, { is_draft: true }),
    exp('2026-10-01', 31)
  ]);
  const b = budgetForDay({ lines, rules: [rule({ amount_myr: 1500 })], budget: 4600, date: '2026-10-02' });
  // discretionary 3100, one-off spent 31 → (3100-31)/30
  assert.equal(b.allowance, (3100 - 31) / 30);
  assert.equal(sumBetween(lines, '2026-10-01', '2026-10-31'), 5531); // drafts excluded, everything else counts in totals
});

test('month pace counts bills on their due days, the rest evenly', () => {
  // Oct: budget 3100, rent 1500 on the 1st, gym 90 on the 25th → discretionary 1510 ≈ 48.71/day
  const rules = [rule({ amount_myr: 1500 }), rule({ amount_myr: 90, day_of_month: 25 })];
  const ms = monthSummary({ lines: [], budget: 3100, date: '2026-10-17', rules });
  assert.equal(Math.round(ms.pace * 100) / 100, Math.round((1500 + (1510 * 17) / 31) * 100) / 100);
});

test('allowance never goes negative', () => {
  const lines = spendLines([exp('2026-10-01', 5000)]);
  const b = budgetForDay({ lines, rules: [], budget: 3100, date: '2026-10-10' });
  assert.equal(b.allowance, 0);
  assert.ok(b.monthOver > 0);
});

test('month-to-date compares with the same point last month', () => {
  const r = rangePreset('mtd', '2026-10-15');
  assert.deepEqual([r.from, r.to], ['2026-10-01', '2026-10-15']);
  assert.deepEqual(r.prev, { from: '2026-09-01', to: '2026-09-15' });
  assert.deepEqual(r.lastYear, { from: '2025-10-01', to: '2025-10-15' });
  const m = rangePreset('mtd', '2026-03-31');
  assert.equal(m.prev.to, '2026-02-28');
});
