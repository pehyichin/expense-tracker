import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../store.jsx';
import Icon from '../components/Icon.jsx';
import TxCard, { txView } from '../components/TxCard.jsx';
import { Sheet } from '../components/ui.jsx';
import { prettyDate, todayStr } from '../lib/dates.js';
import { isSpend, txSpend } from '../lib/spend.js';
import { money } from '../lib/format.js';

const TYPES = [['all', 'All'], ['expense', 'Spend'], ['income', 'Income'], ['transfer', 'Transfer']];
const FILTER_KEYS = [
  ['category', 'Category', 'categories'],
  ['merchant', 'Merchant', 'merchants'],
  ['platform', 'Platform', 'platforms'],
  ['account', 'Payment', 'accounts'],
  ['tag', 'Tag', 'tags']
];

export default function Activity() {
  const { api } = useData();
  const [params, setParams] = useSearchParams();
  const [type, setType] = useState(params.get('category') || params.get('merchant') || params.get('platform') || params.get('account') || params.get('tag') ? 'expense' : 'all');
  const [q, setQ] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(150);
  const today = todayStr();

  const f = Object.fromEntries(FILTER_KEYS.map(([k]) => [k, params.get(k)]));
  const from = params.get('from');
  const to = params.get('to');
  const setFilter = (k, v) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return api.transactions.filter((t) => {
      if (type === 'expense' && !(t.type === 'expense' || t.type === 'refund')) return false;
      if (type !== 'all' && type !== 'expense' && t.type !== type) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (f.category && !(t.items || []).some((i) => i.category_id === f.category)) return false;
      if (f.merchant && t.merchant_id !== f.merchant) return false;
      if (f.platform && t.platform_id !== f.platform) return false;
      if (f.account && t.account_id !== f.account && t.to_account_id !== f.account) return false;
      if (f.tag && !(t.tag_ids || []).includes(f.tag)) return false;
      if (needle) {
        const v = txView(t, api.byId);
        const hay = [v.title, v.meta, t.note, ...(t.items || []).map((i) => i.item_name)].join(' ').toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [api, type, q, from, to, f.category, f.merchant, f.platform, f.account, f.tag]);

  const groups = useMemo(() => {
    const out = [];
    for (const t of filtered.slice(0, limit)) {
      let g = out[out.length - 1];
      if (!g || g.date !== t.date) out.push((g = { date: t.date, items: [], total: 0 }));
      g.items.push(t);
      if (isSpend(t)) g.total += txSpend(t);
    }
    return out;
  }, [filtered, limit]);

  const total = filtered.filter(isSpend).reduce((s, t) => s + txSpend(t), 0);
  const active = FILTER_KEYS.filter(([k]) => f[k]).map(([k, label, table]) => ({ k, label, name: api.byId[table][f[k]]?.name || '?' }));

  return (
    <div className="page">
      <div className="between">
        <h1 className="title">Activity</h1>
        <button className="icon-btn" aria-label="Filters" onClick={() => setShowFilters(true)}><Icon name="sliders-horizontal" /></button>
      </div>

      <div className="seg" role="group" aria-label="Type">
        {TYPES.map(([k, l]) => (
          <button key={k} className={type === k ? 'on' : ''} aria-pressed={type === k} onClick={() => setType(k)}>{l}</button>
        ))}
      </div>

      <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: '6px 16px' }}>
        <Icon name="search" size={18} />
        <input aria-label="Search" placeholder="Search merchant, item, note" value={q} onChange={(e) => setQ(e.target.value)} style={{ fontSize: 16 }} />
      </div>

      {(active.length > 0 || from || to) && (
        <div className="chips">
          {active.map((a) => (
            <button key={a.k} className="chip sm on" onClick={() => setFilter(a.k, null)} aria-label={`Remove ${a.label} filter`}>
              {a.label}: {a.name} <Icon name="x" size={12} strokeWidth={2.4} />
            </button>
          ))}
          {(from || to) && (
            <button className="chip sm on" onClick={() => { const p = new URLSearchParams(params); p.delete('from'); p.delete('to'); setParams(p, { replace: true }); }}>
              {from ? prettyDate(from, today) : '…'} – {to ? prettyDate(to, today) : '…'} <Icon name="x" size={12} strokeWidth={2.4} />
            </button>
          )}
        </div>
      )}

      {(type === 'expense' || active.length > 0) && filtered.length > 0 && (
        <div className="small muted" style={{ paddingLeft: 4 }}>{filtered.length} entries · {money(total)} spent</div>
      )}

      {groups.length === 0 && <div className="empty">Nothing matches. Either you’re frugal or the filters are.</div>}

      {groups.map((g) => (
        <section key={g.date} className="col" style={{ gap: 8 }}>
          <div className="between small" style={{ padding: '6px 4px 0' }}>
            <strong style={{ fontWeight: 500 }}>{prettyDate(g.date, today)}</strong>
            {g.total !== 0 && <span className="muted num">{money(g.total)}</span>}
          </div>
          {g.items.map((t) => <TxCard key={t.id} t={t} />)}
        </section>
      ))}

      {filtered.length > limit && (
        <button className="btn secondary" onClick={() => setLimit(limit + 150)}>Show more</button>
      )}

      {showFilters && (
        <Sheet title="Filters" onClose={() => setShowFilters(false)}>
          {FILTER_KEYS.map(([k, label, table]) => (
            <div className="field" key={k}>
              <label htmlFor={'f-' + k}>{label}</label>
              <select id={'f-' + k} value={f[k] || ''} onChange={(e) => setFilter(k, e.target.value || null)}>
                <option value="">Any</option>
                {api[table].map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <div className="field">
              <label htmlFor="f-from">From</label>
              <input id="f-from" type="date" value={from || ''} onChange={(e) => setFilter('from', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-to">To</label>
              <input id="f-to" type="date" value={to || ''} onChange={(e) => setFilter('to', e.target.value)} />
            </div>
          </div>
          <button className="btn" onClick={() => setShowFilters(false)}>Show {filtered.length} entries</button>
          <button className="btn secondary" onClick={() => { setParams({}, { replace: true }); setShowFilters(false); }}>Clear all</button>
        </Sheet>
      )}
    </div>
  );
}
