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
  const b = budgetForDay({ lines, rules: [rule({ id: 'r', amount_myr: 1500 })], budget: 4600, date: '2026-10-02' });
  // discretionary 3100, one-off spent 31 → (3100-31)/30
  assert.equal(b.allowance, (3100 - 31) / 30);
  assert.equal(sumBetween(lines, '2026-10-01', '2026-10-31'), 5531); // drafts excluded, everything else counts in totals
});

test('month view: all bills count from day 1, pace is about one-off spending only', () => {
  // Oct: budget 3100. Rent 1500 on the 1st (logged), gym 90 on the 25th (not yet), installment 100 on the 28th.
  const rules = [
    rule({ id: 'rent', amount_myr: 1500 }),
    rule({ amount_myr: 90, day_of_month: 25 }),
    { kind: 'installment', frequency: 'monthly', day_of_month: 28, start_date: '2026-10-28', end_date: '2027-01-28', amount_myr: 100, total_myr: 400, installment_count: 4 }
  ];
  const lines = spendLines([
    exp('2026-10-01', 1500, { recurring_rule_id: 'rent' }), // the logged rent must not be counted twice
    exp('2026-10-05', 300),
    exp('2026-10-06', 2000, { exclude_from_budget: true })
  ]);
  const ms = monthSummary({ lines, budget: 3100, date: '2026-10-17', rules });
  assert.equal(ms.committed, 1690);
  assert.equal(ms.oneOff, 300);
  assert.equal(ms.used, 1990);
  assert.equal(ms.left, 1110);
  // discretionary 1410 spread evenly: pace = 1690 + 1410*17/31
  assert.equal(Math.round(ms.pace * 100) / 100, Math.round((1690 + (1410 * 17) / 31) * 100) / 100);
  // agrees with the daily allowance: same discretionary pool
  const b = budgetForDay({ lines, rules, budget: 3100, date: '2026-10-17' });
  assert.equal(b.discretionary, 1410);
  assert.equal(b.remaining, 1410 - 300);
  // a fresh month: bills already taken on the 1st, before anything is paid
  const nov = monthSummary({ lines, budget: 3100, date: '2026-11-01', rules });
  assert.equal(nov.used, 1690);
  assert.equal(nov.oneOff, 0);
});

test('variable bills use the confirmed amount once logged, the estimate until then', () => {
  const elec = rule({ id: 'e', amount_myr: 100, day_of_month: 10, variable_amount: true });
  const before = monthSummary({ lines: [], budget: 1000, date: '2026-10-05', rules: [elec] });
  assert.equal(before.committed, 100);
  const lines = spendLines([exp('2026-10-10', 135, { recurring_rule_id: 'e' })]);
  const after = monthSummary({ lines, budget: 1000, date: '2026-10-17', rules: [elec] });
  assert.equal(after.committed, 135);
  assert.equal(after.used, 135);
  // an unconfirmed draft doesn't count twice or at zero
  const draft = spendLines([exp('2026-10-10', 0, { recurring_rule_id: 'e', is_draft: true })]);
  assert.equal(monthSummary({ lines: draft, budget: 1000, date: '2026-10-17', rules: [elec] }).committed, 100);
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

test('rule created on the 19th with start date the 18th: the 18th is due', () => {
  const r = rule({ id: 'db', start_date: '2026-10-18', day_of_month: 18 });
  assert.deepEqual(pendingDates(r, '2026-10-19'), ['2026-10-18']);
  // the old behaviour stamped last_generated_date = yesterday, which skipped it
  assert.deepEqual(pendingDates({ ...r, last_generated_date: '2026-10-18' }, '2026-10-19'), []);
  assert.deepEqual(dueDates({ ...r, last_generated_date: '2026-10-18' }, r.start_date, '2026-10-18'), ['2026-10-18']);
});
