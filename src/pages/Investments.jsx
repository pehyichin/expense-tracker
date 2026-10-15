import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../store.jsx';
import Icon from '../components/Icon.jsx';
import { Sheet } from '../components/ui.jsx';
import { prettyDate, todayStr, monShort } from '../lib/dates.js';
import { compact, money } from '../lib/format.js';

const signed = (i) => (i.side === 'sell' ? -1 : 1) * Number(i.amount_myr);

export default function Investments() {
  const { api } = useData();
  const today = todayStr();
  const [edit, setEdit] = useState(null);
  const inv = api.investments;

  const net = inv.reduce((s, i) => s + signed(i), 0);
  const fees = inv.reduce((s, i) => s + Number(i.fees_myr || 0), 0);

  const byTicker = useMemo(() => {
    const m = new Map();
    for (const i of inv) m.set(i.ticker, (m.get(i.ticker) || 0) + signed(i));
    return [...m.entries()].map(([ticker, amount]) => ({ ticker, amount })).sort((a, b) => b.amount - a.amount);
  }, [inv]);
  const maxT = Math.max(1, ...byTicker.map((t) => Math.abs(t.amount)));

  // cumulative series, one point per date
  const series = useMemo(() => {
    const sorted = [...inv].sort((a, b) => (a.date < b.date ? -1 : 1));
    const pts = [];
    let run = 0;
    for (const i of sorted) {
      run += signed(i);
      if (pts.length && pts[pts.length - 1].date === i.date) pts[pts.length - 1].v = run;
      else pts.push({ date: i.date, v: run });
    }
    if (pts.length && pts[pts.length - 1].date !== today) pts.push({ date: today, v: run });
    return pts;
  }, [inv, today]);

  return (
    <div className="page">
      <div className="between">
        <h1 className="title">Investments</h1>
        <Link to="/add?type=invest" className="chip"><Icon name="plus" size={16} /> Log</Link>
      </div>

      <div className="col" style={{ gap: 2, padding: '4px 4px 0' }}>
        <span className="small muted">Net contributed, all time</span>
        <span className="huge">{money(net)}</span>
        {fees > 0 && <span className="small muted">plus {money(fees)} in fees</span>}
      </div>

      {inv.length === 0 ? (
        <div className="empty">Nothing invested yet. Tap + and pick Invest when you do.</div>
      ) : (
        <>
          <div className="card">
            <span style={{ fontWeight: 500 }}>Cumulative contributions</span>
            <LineChart pts={series} />
          </div>

          <div className="card tight">
            <span style={{ fontWeight: 500, padding: '8px 10px 4px' }}>By ticker</span>
            {byTicker.map((t) => (
              <div key={t.ticker} className="list-row">
                <div className="between" style={{ width: '100%' }}>
                  <span style={{ fontWeight: 500 }}>{t.ticker}</span>
                  <span className="num">{money(t.amount)}</span>
                </div>
                <div className="track"><div style={{ width: `${(Math.abs(t.amount) / maxT) * 100}%`, background: t.amount < 0 ? 'var(--terra)' : undefined }} /></div>
              </div>
            ))}
          </div>

          <div className="col" style={{ gap: 8 }}>
            <span className="label" style={{ paddingLeft: 4 }}>Log</span>
            {[...inv].reverse().map((i) => (
              <button key={i.id} className="tx" onClick={() => setEdit(i)} aria-label={`${i.side} ${i.ticker} ${money(i.amount_myr)}`}>
                <span className="icon-chip"><Icon name={i.side === 'buy' ? 'arrow-down-to-line' : 'arrow-up-from-line'} /></span>
                <span className="grow col" style={{ gap: 2 }}>
                  <span style={{ fontWeight: 500 }}>{i.side === 'buy' ? 'Bought' : 'Sold'} {i.ticker}</span>
                  <span className="small muted ellipsis">
                    {[prettyDate(i.date, today), i.broker, i.units ? `${Number(i.units)} units` : null, i.currency !== 'MYR' ? `${i.currency} ${Number(i.amount_original).toLocaleString()}` : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="num" style={{ fontWeight: 500 }}>{i.side === 'sell' ? '−' : ''}{money(i.amount_myr)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {edit && <EditInvestment row={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function LineChart({ pts }) {
  if (pts.length < 2) return <span className="small muted">One entry so far. A line needs two points.</span>;
  const W = 320, H = 150, P = 6;
  const min = Math.min(0, ...pts.map((p) => p.v));
  const max = Math.max(1, ...pts.map((p) => p.v));
  const t0 = new Date(pts[0].date).getTime();
  const t1 = new Date(pts[pts.length - 1].date).getTime() || t0 + 1;
  const x = (d) => P + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
  const y = (v) => H - P - ((v - min) / (max - min)) * (H - 2 * P);
  // stepped line: contributions jump on the day they happen
  let d = `M${x(pts[0].date)},${y(pts[0].v)}`;
  for (let k = 1; k < pts.length; k++) d += ` H${x(pts[k].date)} V${y(pts[k].v)}`;
  const area = `${d} V${y(min)} H${x(pts[0].date)} Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Net contributed rose to ${money(pts[pts.length - 1].v)}`}>
        <path d={area} fill="#EDF59A" />
        <path d={d} fill="none" stroke="#111111" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <div className="between tiny muted">
        <span>{monShort(pts[0].date)} {pts[0].date.slice(0, 4)}</span>
        <span>peak {compact(max)}</span>
        <span>{monShort(pts[pts.length - 1].date)} {pts[pts.length - 1].date.slice(0, 4)}</span>
      </div>
    </div>
  );
}

function EditInvestment({ row, onClose }) {
  const { api } = useData();
  const [f, setF] = useState({ ...row, amount_myr: String(row.amount_myr), fees_myr: String(row.fees_myr || ''), units: row.units ? String(row.units) : '' });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    try {
      const amount = Number(f.amount_myr);
      if (!(amount > 0)) throw new Error('Enter an amount.');
      await api.upsert('investments', {
        id: row.id,
        date: f.date,
        side: f.side,
        ticker: f.ticker.trim().toUpperCase(),
        broker: f.broker?.trim() || null,
        amount_myr: amount,
        amount_original: row.currency === 'MYR' ? amount : row.amount_original,
        fees_myr: Number(f.fees_myr) || 0,
        units: f.units ? Number(f.units) : null,
        note: f.note || null
      });
      onClose();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <Sheet title={`${row.side === 'buy' ? 'Buy' : 'Sell'} · ${row.ticker}`} onClose={onClose}>
      <div className="seg">
        <button className={f.side === 'buy' ? 'on' : ''} onClick={() => setF({ ...f, side: 'buy' })}>Buy</button>
        <button className={f.side === 'sell' ? 'on' : ''} onClick={() => setF({ ...f, side: 'sell' })}>Sell</button>
      </div>
      <div className="field"><label htmlFor="i-t">Ticker</label><input id="i-t" value={f.ticker} onChange={set('ticker')} /></div>
      <div className="field"><label htmlFor="i-a">Amount (MYR)</label><input id="i-a" inputMode="decimal" value={f.amount_myr} onChange={set('amount_myr')} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <div className="field"><label htmlFor="i-f">Fees (MYR)</label><input id="i-f" inputMode="decimal" value={f.fees_myr} onChange={set('fees_myr')} /></div>
        <div className="field"><label htmlFor="i-u">Units</label><input id="i-u" inputMode="decimal" value={f.units} onChange={set('units')} /></div>
      </div>
      <div className="field"><label htmlFor="i-b">Broker</label><input id="i-b" value={f.broker || ''} onChange={set('broker')} /></div>
      <div className="field"><label htmlFor="i-d">Date</label><input id="i-d" type="date" value={f.date} onChange={set('date')} /></div>
      {err && <div className="error">{err}</div>}
      <button className="btn" onClick={save}>Save</button>
      <button className="btn danger" onClick={async () => { await api.remove('investments', row.id); onClose(); }}>Delete</button>
    </Sheet>
  );
}
