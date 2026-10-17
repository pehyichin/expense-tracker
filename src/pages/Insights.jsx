import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useData } from '../store.jsx';
import Icon from '../components/Icon.jsx';
import { Sheet } from '../components/ui.jsx';
import { addMonths, monShort, monthEnd, monthStart, rangePreset, rangeText, todayStr } from '../lib/dates.js';
import { groupBy, sumBetween } from '../lib/spend.js';
import { changeLabel, compact, money, pct } from '../lib/format.js';

const PRESETS = [
  ['mtd', 'Month to date'],
  ['lastMonth', 'Last month'],
  ['last3', 'Last 3 months'],
  ['ytd', 'Year to date'],
  ['lastYear', 'Last year'],
  ['custom', 'Custom']
];

const TABS = [
  ['category', 'Category', 'categories', (l) => l.category_id, 'Uncategorised'],
  ['merchant', 'Merchant', 'merchants', (l) => l.merchant_id, 'No merchant'],
  ['platform', 'Platform', 'platforms', (l) => l.platform_id, 'No platform'],
  ['account', 'Payment', 'accounts', (l) => l.account_id, 'No payment method'],
  ['tag', 'Tag', 'tags', (l) => l.tag_ids, null]
];

export default function Insights() {
  const { api } = useData();
  const nav = useNavigate();
  const today = todayStr();
  // View state lives in the URL, so drilling into Activity and pressing back restores it.
  const [params, setParams] = useSearchParams();
  const preset = params.get('range') || 'mtd';
  const custom = useMemo(
    () => ({ from: params.get('from') || monthStart(today), to: params.get('to') || today }),
    [params, today]
  );
  const tab = params.get('tab') || 'category';
  const focus = params.get('focus') || null;
  const span = params.get('span') === '12' ? 12 : 6;
  const setView = (patch) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') p.delete(k);
      else p.set(k, String(v));
    }
    setParams(p, { replace: true });
  };
  const setPreset = (v) => setView({ range: v === 'mtd' ? null : v });
  const setCustom = (c) => setView({ from: c.from, to: c.to });
  const setTab = (v) => setView({ tab: v === 'category' ? null : v });
  const setFocus = (v) => setView({ focus: v });
  const setSpan = (v) => setView({ span: v === 6 ? null : v });
  const [pick, setPick] = useState(false);

  // Remember the view so the bottom-nav Insights button returns to it too
  useEffect(() => {
    try { sessionStorage.setItem('insights-search', params.toString()); } catch {}
  }, [params]);

  // Restore scroll position when coming back from a drill-down (saved in drill(), used once)
  useEffect(() => {
    let y = 0;
    try {
      y = Number(sessionStorage.getItem('insights-scroll')) || 0;
      sessionStorage.removeItem('insights-scroll');
    } catch {}
    if (y) requestAnimationFrame(() => window.scrollTo(0, y));
  }, []);

  const range = useMemo(() => rangePreset(preset, today, custom), [preset, today, custom]);
  const lines = api.lines;
  const total = sumBetween(lines, range.from, range.to);
  const prevTotal = range.prev ? sumBetween(lines, range.prev.from, range.prev.to) : null;
  const lyTotal = sumBetween(lines, range.lastYear.from, range.lastYear.to);
  const hasLastYear = lines.some((l) => l.date <= range.lastYear.to);

  // Monthly bars ending this month
  const months = useMemo(() => {
    const out = [];
    for (let i = span - 1; i >= 0; i--) {
      const s = addMonths(monthStart(today), -i);
      const e = i === 0 ? today : monthEnd(s);
      out.push({
        s,
        total: sumBetween(lines, s, e),
        focus: focus ? sumBetween(lines, s, e, (l) => l.category_id === focus) : 0,
        current: i === 0
      });
    }
    return out;
  }, [lines, span, focus, today]);
  const maxMonth = Math.max(1, ...months.map((m) => m.total));

  const [, tabLabel, table, keyFn, noneLabel] = TABS.find((t) => t[0] === tab);
  const inRange = lines.filter((l) => l.date >= range.from && l.date <= range.to);
  const prevRange = range.prev ? lines.filter((l) => l.date >= range.prev.from && l.date <= range.prev.to) : null;
  const rows = groupBy(inRange, keyFn).filter((r) => r.key || noneLabel);
  const prevMap = prevRange ? new Map(groupBy(prevRange, keyFn).map((r) => [r.key, r.amount])) : null;
  const maxRow = Math.max(1, ...rows.map((r) => r.amount));

  const recurring = sumBetween(lines, range.from, range.to, (l) => l.recurring);
  const oneOff = total - recurring;

  const income = api.transactions
    .filter((t) => t.type === 'income' && t.date >= range.from && t.date <= range.to)
    .reduce((s, t) => s + Number(t.amount_myr), 0);

  const drill = (key) => {
    const p = new URLSearchParams({ from: range.from, to: range.to });
    if (key) p.set(tab, key);
    try { sessionStorage.setItem('insights-scroll', String(window.scrollY)); } catch {}
    nav(`/activity?${p}`, { state: { from: 'insights' } });
  };

  const iconFor = (key) => {
    if (tab === 'category') return api.byId.categories[key]?.icon || 'circle-dashed';
    return { merchant: 'store', platform: 'shopping-cart', account: 'credit-card', tag: 'tag' }[tab];
  };

  return (
    <div className="page">
      <div className="between">
        <h1 className="title">Insights</h1>
        <button className="chip" onClick={() => setPick(true)} aria-label={`Date range: ${range.label}. Change range`}>
          <Icon name="calendar" size={16} /> {range.label} <Icon name="chevron-down" size={14} strokeWidth={2} />
        </button>
      </div>

      <div className="col" style={{ gap: 2, padding: '4px 4px 0' }}>
        <span className="small muted">Spent, {rangeText(range, today)}</span>
        <span className="huge">{money(total)}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <CompareCard label={range.prev ? `vs ${rangeText(range.prev, today)}` : 'vs previous'} cur={total} prev={range.prev ? prevTotal : null} />
        <CompareCard label={`vs ${rangeText(range.lastYear, '0000')}`} cur={total} prev={hasLastYear ? lyTotal : null} />
      </div>

      <div className="card">
        <div className="between">
          <span style={{ fontWeight: 500 }}>Last {span} months</span>
          <div className="row" style={{ gap: 6 }}>
            {focus && (
              <button className="chip sm" style={{ background: 'var(--lime)', borderColor: 'var(--lime)' }} onClick={() => setFocus(null)} aria-label="Clear focus">
                {api.byId.categories[focus]?.name} <Icon name="x" size={12} strokeWidth={2.4} />
              </button>
            )}
            <button className="chip sm" onClick={() => setSpan(span === 6 ? 12 : 6)}>{span === 6 ? '12m' : '6m'}</button>
          </div>
        </div>
        <div
          role="img"
          aria-label={`Monthly spending: ${months.map((m) => `${monShort(m.s)} ${money(m.total, { cents: false })}`).join(', ')}`}
          style={{ display: 'grid', gridTemplateColumns: `repeat(${span}, minmax(0, 1fr))`, gap: span === 6 ? 10 : 4, alignItems: 'end', height: 190 }}
        >
          {months.map((m) => (
            <div key={m.s} className="col" style={{ alignItems: 'center', gap: 6 }}>
              <span className="tiny num">{m.total ? compact(m.total) : ''}</span>
              <div
                className={m.current ? 'hatch' : ''}
                style={{
                  width: '100%', height: Math.max(2, Math.round((m.total / maxMonth) * 150)), borderRadius: span === 6 ? 12 : 6,
                  overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                  background: m.current ? undefined : 'var(--sage)'
                }}
              >
                {focus && m.focus > 0 && (
                  <div style={{ height: Math.round((m.focus / maxMonth) * 150), background: 'var(--lime)', borderTop: '1.5px solid var(--ink)' }} />
                )}
              </div>
              <span className="tiny" style={m.current ? { fontWeight: 600 } : { color: 'var(--muted)' }}>{monShort(m.s).slice(0, span === 6 ? 3 : 1)}</span>
            </div>
          ))}
        </div>
        <span className="tiny muted">Striped = month in progress{tab === 'category' ? ' · tap a category to see its share' : ''}</span>
      </div>

      <div className="chips scroll" role="tablist" aria-label="Breakdown">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={'chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div className="card tight">
        {rows.length === 0 && <div className="empty" style={{ background: 'transparent' }}>No {tabLabel.toLowerCase()} spending in this range.</div>}
        {rows.map((r) => {
          const name = r.key ? api.byId[table][r.key]?.name || '—' : noneLabel;
          const on = tab === 'category' && focus === r.key;
          const prev = prevMap ? prevMap.get(r.key) || 0 : null;
          return (
            <div key={r.key ?? 'none'} className={'list-row' + (on ? ' on' : '')}>
              <div className="row" style={{ width: '100%' }}>
                <button
                  onClick={() => (tab === 'category' && r.key ? setFocus(on ? null : r.key) : drill(r.key))}
                  aria-label={`${name}, ${money(r.amount)}, ${pct(r.amount, total)} of spending${tab === 'category' ? '. Tap to highlight in chart' : '. Tap to see entries'}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, border: 'none', background: 'transparent', padding: 0, textAlign: 'left' }}
                >
                  <span className="icon-chip" style={{ width: 36, height: 36 }}><Icon name={iconFor(r.key)} size={18} /></span>
                  <span className="grow col" style={{ gap: 1 }}>
                    <span className="ellipsis" style={{ fontWeight: 500 }}>{name}</span>
                    <span className="tiny muted">{pct(r.amount, total)} of spending</span>
                  </span>
                  <span className="col" style={{ alignItems: 'flex-end', gap: 1 }}>
                    <span className="num" style={{ fontWeight: 500 }}>{money(r.amount)}</span>
                    {prev != null && <span className="tiny muted">{prev ? changeLabel(r.amount, prev) : 'New'}</span>}
                  </span>
                </button>
                {tab === 'category' && (
                  <button className="icon-btn" style={{ width: 36, height: 36, background: 'transparent' }} aria-label={`See ${name} entries`} onClick={() => drill(r.key)}>
                    <Icon name="chevron-right" size={18} />
                  </button>
                )}
              </div>
              <div className="track"><div style={{ width: `${(r.amount / maxRow) * 100}%` }} /></div>
            </div>
          );
        })}
      </div>

      {total > 0 && (
        <div className="card">
          <span style={{ fontWeight: 500 }}>Recurring vs one-off</span>
          <div style={{ display: 'flex', gap: 6, height: 96 }}>
            {recurring > 0 && (
              <div style={{ flex: `${recurring} 1 0`, minWidth: 64, background: 'var(--sage)', borderRadius: 18, padding: 12, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <span className="small">Recurring</span>
                <span style={{ fontSize: 26, fontWeight: 300 }}>{pct(recurring, total, 0)}</span>
              </div>
            )}
            {oneOff > 0 && (
              <div style={{ flex: `${oneOff} 1 0`, minWidth: 64, background: 'var(--lime)', borderRadius: 18, padding: 12, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <span className="small">One-off</span>
                <span style={{ fontSize: 26, fontWeight: 300 }}>{pct(oneOff, total, 0)}</span>
              </div>
            )}
          </div>
          <div className="between small muted">
            <span>{money(recurring)} · the floor</span>
            <span>{money(oneOff)} · the choices</span>
          </div>
        </div>
      )}

      {income > 0 && (
        <div className="card">
          <span style={{ fontWeight: 500 }}>Income vs spending</span>
          <div className="between"><span className="muted">Income</span><span className="num">{money(income)}</span></div>
          <div className="between"><span className="muted">Spent</span><span className="num">{money(total)}</span></div>
          <div className="between" style={{ paddingTop: 8, borderTop: '1px solid var(--bg)' }}>
            <span>Savings rate</span>
            <span style={{ fontSize: 24, fontWeight: 300 }}>{(((income - total) / income) * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}

      {pick && (
        <Sheet title="Date range" onClose={() => setPick(false)}>
          <div className="chips">
            {PRESETS.map(([k, l]) => (
              <button key={k} className={'chip' + (preset === k ? ' on' : '')} onClick={() => { setPreset(k); if (k !== 'custom') setPick(false); }}>{l}</button>
            ))}
          </div>
          {preset === 'custom' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                <div className="field">
                  <label htmlFor="c-from">From</label>
                  <input id="c-from" type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="c-to">To</label>
                  <input id="c-to" type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
                </div>
              </div>
              <button className="btn" onClick={() => setPick(false)}>Apply</button>
            </>
          )}
        </Sheet>
      )}
    </div>
  );
}

function CompareCard({ label, cur, prev }) {
  return (
    <div className="card" style={{ gap: 4, borderRadius: 22 }}>
      <span className="small muted">{label}</span>
      {prev == null ? (
        <span style={{ fontSize: 20, fontWeight: 300 }} className="muted">No data yet</span>
      ) : (
        <>
          <span style={{ fontSize: 26, fontWeight: 300 }}>{changeLabel(cur, prev, 'pct')}</span>
          <span className="small muted">
            {Math.abs(cur - prev) < 0.5 ? 'Same as before' : `${money(Math.abs(cur - prev), { cents: false })} ${cur > prev ? 'more' : 'less'}`}
          </span>
        </>
      )}
    </div>
  );
}
