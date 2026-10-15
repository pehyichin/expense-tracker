import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../store.jsx';
import Icon from '../components/Icon.jsx';
import TxCard from '../components/TxCard.jsx';
import BudgetArc from '../components/BudgetArc.jsx';
import { addDays, addMonths, dayOfMonth, dowLong, dowShort, monthLong, monthStart, prettyDate, startOfWeek, todayStr } from '../lib/dates.js';
import { budgetForDay, monthSummary, sumBetween } from '../lib/spend.js';
import { installmentStatus, nextDueDate } from '../lib/recurring.js';
import { changeLabel, money } from '../lib/format.js';

export default function Home() {
  const { api } = useData();
  const today = todayStr();
  const [sel, setSel] = useState(today);
  const touch = useRef(null);
  const includeRec = !!api.settings?.include_recurring_in_daily;

  const week = useMemo(() => {
    const s = startOfWeek(sel);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [sel]);

  const dayVal = (d) =>
    sumBetween(api.lines, d, d, includeRec ? (l) => !l.excluded : (l) => !l.recurring && !l.excluded);
  const weekMax = Math.max(1, ...week.map(dayVal));

  const b = api.budget
    ? budgetForDay({ lines: api.lines, rules: api.recurring_rules, budget: api.budget, date: sel, includeRecurring: includeRec })
    : null;
  const spentSel = b ? b.daySpend : dayVal(sel);
  const dayTx = api.transactions.filter((t) => t.date === sel);
  const drafts = api.transactions.filter((t) => t.is_draft);

  const ms = monthSummary({ lines: api.lines, budget: api.budget, date: today });
  const pm = addMonths(monthStart(today), -1);
  const prevSamePoint = sumBetween(api.lines, pm, addMonths(today, -1));

  const next = api.recurring_rules
    .map((r) => ({ r, d: nextDueDate(r, addDays(today, 1)) }))
    .filter((x) => x.d)
    .sort((a, b2) => (a.d < b2.d ? -1 : 1))[0];

  const instLeft = api.recurring_rules
    .filter((r) => r.kind === 'installment')
    .map((r) => installmentStatus(r, today))
    .filter((s) => s.left > 0);
  const instRemaining = instLeft.reduce((s, x) => s + x.remaining, 0);

  const shiftWeek = (n) => {
    const target = addDays(sel, 7 * n);
    setSel(target > today ? today : target);
  };

  let status, statusStyle;
  if (sel > today) {
    status = 'Not yet';
    statusStyle = { background: 'var(--card)' };
  } else if (!b) {
    status = 'Set a monthly budget';
    statusStyle = { background: 'var(--card)' };
  } else if (spentSel > b.allowance + 0.004) {
    status = `${money(spentSel - b.allowance)} over`;
    statusStyle = { background: 'var(--ink)', color: 'var(--lime)' };
  } else {
    status = `${money(b.allowance - spentSel)} left`;
    statusStyle = { background: 'var(--lime)' };
  }

  return (
    <div className="page">
      <div className="between">
        <div className="col" style={{ gap: 2 }}>
          <span className="small muted">{monthLong(sel)} {sel.slice(0, 4)}</span>
          <h1 className="title">{sel === today ? 'Today' : `${dowLong(sel)}, ${dayOfMonth(sel)}`}</h1>
        </div>
        <Link to="/settings" className="icon-btn" aria-label="Settings"><Icon name="settings-2" size={22} /></Link>
      </div>

      <div
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current == null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          if (Math.abs(dx) > 50) shiftWeek(dx > 0 ? -1 : 1);
          touch.current = null;
        }}
        style={{ display: 'flex', alignItems: 'center', gap: 2 }}
      >
        <button className="icon-btn" style={{ width: 28, background: 'transparent' }} aria-label="Previous week" onClick={() => shiftWeek(-1)}>
          <Icon name="chevron-left" size={18} />
        </button>
        <div role="group" aria-label="Choose a day" style={{ display: 'flex', justifyContent: 'space-between', gap: 4, flex: 1 }}>
          {week.map((d) => {
            const future = d > today;
            const on = d === sel;
            const v = dayVal(d);
            const h = v > 0 ? Math.max(4, Math.round((v / weekMax) * 22)) : 3;
            const over = !future && api.budget && (() => {
              const bd = budgetForDay({ lines: api.lines, rules: api.recurring_rules, budget: api.budget, date: d, includeRecurring: includeRec });
              return bd.daySpend > bd.allowance + 0.004;
            })();
            return (
              <button
                key={d}
                disabled={future}
                onClick={() => setSel(d)}
                aria-pressed={on}
                aria-label={`${dowLong(d)} ${dayOfMonth(d)}${future ? ', upcoming' : `, spent ${money(v)}`}`}
                style={{
                  width: 44, height: 82, borderRadius: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '6px 0',
                  background: on ? 'var(--ink)' : 'var(--card)', color: on ? '#fff' : 'var(--ink)',
                  border: `1.5px solid ${on || d === today ? 'var(--ink)' : 'var(--card)'}`, opacity: future ? 0.45 : 1
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500 }}>{dowShort(d)}</span>
                <span style={{ fontSize: 17 }}>{dayOfMonth(d)}</span>
                <span style={{ height: 26, display: 'flex', alignItems: 'flex-end' }}>
                  <span style={{ width: 14, height: h, borderRadius: 3, background: on ? (over ? 'var(--lime)' : 'var(--sage)') : over ? 'var(--terra)' : 'var(--sage-dark)' }} />
                </span>
              </button>
            );
          })}
        </div>
        <button className="icon-btn" style={{ width: 28, background: 'transparent' }} aria-label="Next week" disabled={startOfWeek(sel) === startOfWeek(today)} onClick={() => shiftWeek(1)}>
          <Icon name="chevron-right" size={18} />
        </button>
      </div>

      <BudgetArc spent={spentSel} allowance={b ? b.allowance : 0}>
        <div className="big">{sel > today ? '—' : money(spentSel)}</div>
        <div className="small muted">{b && sel <= today ? `of ${money(b.allowance)} allowance` : sel > today ? 'Allowance set that morning' : 'spent'}</div>
        {!b && sel <= today ? (
          <Link to="/settings/budget" style={{ marginTop: 6, fontSize: 14, fontWeight: 500, padding: '6px 14px', borderRadius: 16, textDecoration: 'none', ...statusStyle }}>{status}</Link>
        ) : (
          <div style={{ marginTop: 6, fontSize: 14, fontWeight: 500, padding: '6px 14px', borderRadius: 16, ...statusStyle }}>{status}</div>
        )}
      </BudgetArc>

      {drafts.length > 0 && (
        <Link to={`/edit/${drafts[0].id}`} className="lime-note" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="circle-alert" size={16} />
          {drafts.length === 1 ? `${drafts[0].note || 'A recurring bill'} needs this month’s amount` : `${drafts.length} recurring bills need their amounts`}
        </Link>
      )}

      <div className="col" style={{ gap: 8 }}>
        {dayTx.length ? dayTx.map((t) => <TxCard key={t.id} t={t} />) : (
          <div className="empty">{sel > today ? 'Nothing yet. The day is young.' : sel === today ? 'Nothing logged today. Yet.' : 'A no-spend day. Rare, admirable.'}</div>
        )}
      </div>

      <div className="card">
        <div className="between small muted">
          <span>{monthLong(today)} {api.budget ? 'budget' : 'spending'}</span>
          <span>{ms.daysLeft} days left</span>
        </div>
        <div className="row" style={{ alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 28, fontWeight: 300 }} className="num">{money(ms.spent)}</span>
          {api.budget > 0 && <span className="muted">of {money(api.budget, { cents: false })}</span>}
        </div>
        {api.budget > 0 && (
          <>
            <div style={{ position: 'relative', height: 10, borderRadius: 5, background: 'var(--bg)' }}>
              <div style={{ position: 'absolute', inset: 0, width: `${Math.min(100, (ms.budgetSpent / api.budget) * 100)}%`, borderRadius: 5, background: 'var(--ink)' }} />
              <div title="Pace" style={{ position: 'absolute', left: `${(ms.pace / api.budget) * 100}%`, top: -4, width: 2, height: 18, background: 'var(--terra)' }} />
            </div>
            <span className="small muted">
              {ms.budgetSpent > ms.pace ? `${money(ms.budgetSpent - ms.pace, { cents: false })} ahead of pace` : `${money(ms.pace - ms.budgetSpent, { cents: false })} under pace`}
              {prevSamePoint > 0 && ` · ${changeLabel(ms.spent, prevSamePoint, 'pct')} vs same point last month`}
            </span>
          </>
        )}
        {next && (
          <div className="row small" style={{ gap: 8, paddingTop: 10, borderTop: '1px solid var(--bg)' }}>
            <Icon name="repeat" size={16} />
            <span>Next: {next.r.name} · {next.r.variable_amount ? 'variable' : money(next.r.amount_myr, { cents: false })} · {prettyDate(next.d, today)}</span>
          </div>
        )}
        {instLeft.length > 0 && (
          <Link to="/settings/recurring" className="row small" style={{ gap: 8, textDecoration: 'none' }}>
            <Icon name="calendar-range" size={16} />
            <span>Installments left: {money(instRemaining, { cents: false })} across {instLeft.length} {instLeft.length === 1 ? 'plan' : 'plans'}</span>
          </Link>
        )}
      </div>
    </div>
  );
}
