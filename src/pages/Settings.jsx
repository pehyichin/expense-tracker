import { useMemo, useState } from 'react';
import { Link, Route, Routes, useNavigate } from 'react-router-dom';
import { useData } from '../store.jsx';
import Icon, { ICON_NAMES } from '../components/Icon.jsx';
import { Sheet, Switch } from '../components/ui.jsx';
import { supabase } from '../lib/supabase.js';
import { money } from '../lib/format.js';
import { addDays, prettyDate, todayStr } from '../lib/dates.js';
import { installmentStatus, nextDueDate } from '../lib/recurring.js';
import { download, toCSV } from '../lib/csv.js';

export default function Settings() {
  return (
    <Routes>
      <Route index element={<Menu />} />
      <Route path="budget" element={<Budget />} />
      <Route path="recurring" element={<Recurring />} />
      <Route path="categories" element={<ListManager table="categories" title="Categories" withIcon archiveOnly />} />
      <Route path="merchants" element={<ListManager table="merchants" title="Merchants" />} />
      <Route path="platforms" element={<ListManager table="platforms" title="Platforms" archiveOnly />} />
      <Route path="accounts" element={<ListManager table="accounts" title="Payment methods" withKind archiveOnly />} />
      <Route path="income" element={<ListManager table="income_sources" title="Income sources" />} />
      <Route path="tags" element={<ListManager table="tags" title="Tags" />} />
      <Route path="export" element={<Export />} />
    </Routes>
  );
}

function Header({ title, back = '/settings' }) {
  const nav = useNavigate();
  return (
    <div className="row">
      <button className="icon-btn" aria-label="Back" onClick={() => nav(back)}><Icon name="arrow-left" /></button>
      <h1 className="title" style={{ fontSize: 26 }}>{title}</h1>
    </div>
  );
}

function Menu() {
  const { api } = useData();
  const items = [
    ['budget', 'Monthly budget', 'wallet', api.budget ? money(api.budget, { cents: false }) : 'Not set'],
    ['recurring', 'Recurring', 'repeat', `${api.recurring_rules.length} rules`],
    ['categories', 'Categories', 'shapes', `${api.categories.filter((c) => !c.archived).length}`],
    ['merchants', 'Merchants', 'store', `${api.merchants.length}`],
    ['platforms', 'Platforms', 'shopping-cart', `${api.platforms.filter((c) => !c.archived).length}`],
    ['accounts', 'Payment methods', 'credit-card', `${api.accounts.filter((c) => !c.archived).length}`],
    ['income', 'Income sources', 'banknote', `${api.income_sources.length}`],
    ['tags', 'Tags', 'tag', `${api.tags.length}`],
    ['export', 'Export to CSV', 'download', '']
  ];
  return (
    <div className="page">
      <Header title="Settings" back="/" />
      <div className="card tight">
        {items.map(([path, label, icon, meta]) => (
          <Link key={path} to={`/settings/${path}`} className="row" style={{ padding: '12px 10px', textDecoration: 'none', borderRadius: 16 }}>
            <span className="icon-chip" style={{ width: 36, height: 36 }}><Icon name={icon} size={18} /></span>
            <span className="grow">{label}</span>
            <span className="small muted">{meta}</span>
            <Icon name="chevron-right" size={18} />
          </Link>
        ))}
      </div>
      <button className="btn secondary" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </div>
  );
}

function Budget() {
  const { api } = useData();
  const [val, setVal] = useState(api.settings?.monthly_budget ? String(api.settings.monthly_budget) : '');
  const [saved, setSaved] = useState(false);
  const save = async () => {
    await api.saveSettings({ monthly_budget: val ? Number(val) : null });
    setSaved(true);
  };
  return (
    <div className="page">
      <Header title="Monthly budget" />
      <div className="field">
        <label htmlFor="b">Budget per month (RM)</label>
        <input id="b" inputMode="decimal" className="big" style={{ fontSize: 40 }} value={val} onChange={(e) => { setVal(e.target.value); setSaved(false); }} />
      </div>
      <div className="card small">
        <span>How the daily allowance works</span>
        <span className="muted">
          Recurring bills due this month come off the top. What’s left is spread over the remaining days, recalculated every
          morning. Overspend today and tomorrow’s allowance shrinks; have a quiet day and it loosens.
        </span>
      </div>
      <div className="card" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="col" style={{ gap: 2 }}>
          <span style={{ fontWeight: 500 }}>Show recurring in the daily view</span>
          <span className="small muted">Off keeps rent day from looking like a crisis.</span>
        </div>
        <Switch checked={!!api.settings?.include_recurring_in_daily} onChange={(v) => api.saveSettings({ include_recurring_in_daily: v })} label="Show recurring in daily view" />
      </div>
      <button className="btn" onClick={save}>{saved ? 'Saved' : 'Save budget'}</button>
    </div>
  );
}

function ListManager({ table, title, withIcon, withKind, archiveOnly }) {
  const { api } = useData();
  const [edit, setEdit] = useState(null);
  const rows = api[table];
  return (
    <div className="page">
      <Header title={title} />
      <button className="chip dashed" style={{ justifyContent: 'center' }} onClick={() => setEdit({ name: '', icon: 'circle', kind: 'card' })}>
        <Icon name="plus" size={16} /> Add
      </button>
      <div className="card tight">
        {rows.length === 0 && <div className="empty" style={{ background: 'transparent' }}>Nothing here yet. They appear as you use them.</div>}
        {rows.map((r) => (
          <button key={r.id} className="row" onClick={() => setEdit(r)} style={{ padding: '12px 10px', border: 'none', background: 'transparent', textAlign: 'left', opacity: r.archived ? 0.5 : 1 }}>
            {withIcon && <span className="icon-chip" style={{ width: 36, height: 36 }}><Icon name={r.icon} size={18} /></span>}
            <span className="grow">{r.name}</span>
            {withKind && <span className="small muted">{r.kind}</span>}
            {r.archived && <span className="small muted">hidden</span>}
            <Icon name="pencil" size={16} />
          </button>
        ))}
      </div>
      {edit && <EditRow table={table} row={edit} withIcon={withIcon} withKind={withKind} archiveOnly={archiveOnly} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EditRow({ table, row, withIcon, withKind, archiveOnly, onClose }) {
  const { api } = useData();
  const [name, setName] = useState(row.name);
  const [icon, setIcon] = useState(row.icon);
  const [kind, setKind] = useState(row.kind);
  const [picking, setPicking] = useState(false);
  const [err, setErr] = useState(null);

  async function save() {
    try {
      if (!name.trim()) throw new Error('Give it a name.');
      const r = { name: name.trim() };
      if (row.id) r.id = row.id;
      if (withIcon) r.icon = icon;
      if (withKind) r.kind = kind;
      if (table === 'categories' && !row.id) r.sort = api.categories.length;
      await api.upsert(table, r);
      onClose();
    } catch (e) {
      setErr(e.message.includes('duplicate') ? 'That name already exists.' : e.message);
    }
  }

  if (picking) return <IconPicker value={icon} onPick={(n) => { setIcon(n); setPicking(false); }} onClose={() => setPicking(false)} />;

  return (
    <Sheet title={row.id ? 'Edit' : 'Add'} onClose={onClose}>
      <div className="field"><label htmlFor="n">Name</label><input id="n" value={name} onChange={(e) => setName(e.target.value)} /></div>
      {withIcon && (
        <button className="card" style={{ flexDirection: 'row', alignItems: 'center', border: 'none', textAlign: 'left' }} onClick={() => setPicking(true)}>
          <span className="icon-chip"><Icon name={icon} /></span>
          <span className="grow">Icon</span>
          <span className="small muted">Change</span>
        </button>
      )}
      {withKind && (
        <div className="seg">
          {['card', 'bank', 'cash', 'ewallet'].map((k) => (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{k === 'ewallet' ? 'e-wallet' : k}</button>
          ))}
        </div>
      )}
      {err && <div className="error">{err}</div>}
      <button className="btn" onClick={save}>Save</button>
      {row.id && archiveOnly && (
        <button className="btn secondary" onClick={async () => { await api.upsert(table, { id: row.id, archived: !row.archived }); onClose(); }}>
          {row.archived ? 'Show again' : 'Hide (keeps history)'}
        </button>
      )}
      {row.id && !archiveOnly && (
        <button className="btn danger" onClick={async () => { await api.remove(table, row.id); onClose(); }}>Delete</button>
      )}
    </Sheet>
  );
}

function IconPicker({ value, onPick, onClose }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? ICON_NAMES.filter((n) => n.includes(s)) : ICON_NAMES).slice(0, 120);
  }, [q]);
  return (
    <Sheet title="Pick an icon" onClose={onClose}>
      <input className="input" autoFocus placeholder="Search, e.g. cat, yoga, coffee" aria-label="Search icons" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 6 }}>
        {list.map((n) => (
          <button key={n} title={n} aria-label={n} onClick={() => onPick(n)}
            style={{ height: 48, borderRadius: 14, border: n === value ? '1.5px solid var(--ink)' : 'none', background: n === value ? 'var(--lime)' : 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={n} size={20} />
          </button>
        ))}
      </div>
      {list.length === 0 && <span className="muted small">No icon by that name. Try a simpler word.</span>}
    </Sheet>
  );
}

function Recurring() {
  const { api } = useData();
  const [edit, setEdit] = useState(null);
  const today = todayStr();
  const [plan, setPlan] = useState(null);
  const plans = api.recurring_rules.filter((r) => r.kind === 'installment').map((r) => ({ r, s: installmentStatus(r, today), next: nextDueDate(r, addDays(today, 1)) }));
  const rows = api.recurring_rules
    .filter((r) => r.kind !== 'installment')
    .map((r) => ({ r, next: nextDueDate(r, today) }))
    .sort((a, b) => (a.next || '9999') < (b.next || '9999') ? -1 : 1);
  return (
    <div className="page">
      <Header title="Recurring" />
      <button className="chip dashed" style={{ justifyContent: 'center' }} onClick={() => setEdit({ frequency: 'monthly', day_of_month: Number(today.slice(8, 10)), start_date: today })}>
        <Icon name="plus" size={16} /> Add recurring
      </button>
      {rows.length === 0 && <div className="empty">Rent, gym, subscriptions: add them once, and they log themselves.</div>}
      {rows.map(({ r, next }) => (
        <button key={r.id} className="tx" onClick={() => setEdit(r)} style={{ opacity: r.paused ? 0.55 : 1 }}>
          <span className="icon-chip"><Icon name={api.byId.categories[r.category_id]?.icon || 'repeat'} /></span>
          <span className="grow col" style={{ gap: 2 }}>
            <span style={{ fontWeight: 500 }}>{r.name}</span>
            <span className="small muted">
              {r.paused ? 'Paused' : next ? `Next: ${prettyDate(next, today)}` : 'Ended'} · {r.frequency === 'yearly' ? 'yearly' : `day ${r.day_of_month}`}
            </span>
          </span>
          <span className="num" style={{ fontWeight: 500 }}>{r.variable_amount ? 'Varies' : money(r.amount_myr)}</span>
        </button>
      ))}
      {plans.length > 0 && (
        <>
          <span className="label" style={{ paddingLeft: 4, marginTop: 8 }}>Installments</span>
          {plans.map(({ r, s, next }) => (
            <button key={r.id} className="tx" onClick={() => setPlan(r)}>
              <span className="icon-chip"><Icon name={api.byId.categories[r.category_id]?.icon || 'calendar-range'} /></span>
              <span className="grow col" style={{ gap: 2 }}>
                <span style={{ fontWeight: 500 }} className="ellipsis">{r.name}</span>
                <span className="small muted">
                  {s.paid} of {s.count} paid{s.left > 0 && next ? ` · next ${prettyDate(next, today)}` : s.left === 0 ? ' · done' : ''}
                </span>
              </span>
              <span className="col" style={{ alignItems: 'flex-end', gap: 1 }}>
                <span className="num" style={{ fontWeight: 500 }}>{money(r.amount_myr)}/mo</span>
                <span className="tiny muted">{money(s.remaining)} left</span>
              </span>
            </button>
          ))}
        </>
      )}
      {edit && <EditRule rule={edit} onClose={() => setEdit(null)} />}
      {plan && <PlanSheet rule={plan} onClose={() => setPlan(null)} />}
    </div>
  );
}

function PlanSheet({ rule, onClose }) {
  const { api } = useData();
  const today = todayStr();
  const s = installmentStatus(rule, today);
  return (
    <Sheet title={rule.name} onClose={onClose}>
      <div className="card">
        <div className="between"><span className="muted">Total</span><span className="num">{money(rule.total_myr)}</span></div>
        <div className="between"><span className="muted">Monthly</span><span className="num">{money(rule.amount_myr)} × {rule.installment_count}</span></div>
        <div className="between"><span className="muted">Paid</span><span className="num">{s.paid} of {s.count}</span></div>
        <div className="between"><span className="muted">Left</span><span className="num">{money(s.remaining)}</span></div>
        <div className="between"><span className="muted">Runs</span><span>{prettyDate(rule.start_date, today)} – {prettyDate(rule.end_date, today)}</span></div>
      </div>
      <span className="small muted">Payments already logged stay in Activity. These only affect the ones still to come.</span>
      {s.left > 0 && (
        <button
          className="btn secondary"
          onClick={async () => {
            await api.upsert('recurring_rules', { id: rule.id, end_date: today });
            await api.saveTransaction({
              tx: { type: 'expense', date: today, merchant_id: rule.merchant_id, platform_id: rule.platform_id, account_id: rule.account_id, currency: 'MYR', amount_original: s.remaining, fx_rate: 1, note: `${rule.name} · paid off early` },
              items: [{ category_id: rule.category_id, item_name: rule.name, amount_myr: s.remaining }]
            });
            onClose();
          }}
        >
          Paid it off early ({money(s.remaining)} today)
        </button>
      )}
      <button className="btn danger" onClick={async () => { await api.remove('recurring_rules', rule.id); onClose(); }}>Delete plan</button>
    </Sheet>
  );
}

function EditRule({ rule, onClose }) {
  const { api } = useData();
  const [f, setF] = useState({
    name: '', amount_myr: '', variable_amount: false, category_id: '', account_id: '', platform_id: '',
    frequency: 'monthly', day_of_month: 1, month_of_year: Number(todayStr().slice(5, 7)), start_date: todayStr(), end_date: '', paused: false,
    ...rule,
    merchant: api.byId.merchants[rule.merchant_id]?.name || ''
  });
  const [err, setErr] = useState(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    try {
      if (!f.name.trim()) throw new Error('Name it, e.g. “Gym”.');
      if (!f.variable_amount && !(Number(f.amount_myr) > 0)) throw new Error('Enter the amount, or mark it as variable.');
      const merchant_id = f.merchant.trim() ? await api.ensureByName('merchants', f.merchant) : null;
      const row = {
        name: f.name.trim(),
        amount_myr: Number(f.amount_myr) || 0,
        variable_amount: f.variable_amount,
        category_id: f.category_id || null,
        account_id: f.account_id || null,
        platform_id: f.platform_id || null,
        merchant_id,
        frequency: f.frequency,
        day_of_month: Math.min(31, Math.max(1, Number(f.day_of_month) || 1)),
        month_of_year: f.frequency === 'yearly' ? Number(f.month_of_year) : null,
        start_date: f.start_date,
        end_date: f.end_date || null,
        paused: f.paused
      };
      if (rule.id) row.id = rule.id;
      else {
        // don't back-fill anything before today on a new rule
        row.last_generated_date = row.start_date < todayStr() ? addDays(todayStr(), -1) : null;
      }
      await api.upsert('recurring_rules', row);
      onClose();
    } catch (e) {
      setErr(e.message);
    }
  }

  const sel = (k, opts, label) => (
    <div className="field">
      <label htmlFor={'r-' + k}>{label}</label>
      <select id={'r-' + k} value={f[k] || ''} onChange={(e) => set(k, e.target.value)}>
        <option value="">—</option>
        {opts.filter((o) => !o.archived).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );

  return (
    <Sheet title={rule.id ? 'Edit recurring' : 'New recurring'} onClose={onClose}>
      <div className="field"><label htmlFor="r-name">Name</label><input id="r-name" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Gym" /></div>
      <div className="card" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="col" style={{ gap: 2 }}>
          <span style={{ fontWeight: 500 }}>Variable amount</span>
          <span className="small muted">Electricity, phone… you confirm each month.</span>
        </div>
        <Switch checked={f.variable_amount} onChange={(v) => set('variable_amount', v)} label="Variable amount" />
      </div>
      <div className="field">
        <label htmlFor="r-amt">{f.variable_amount ? 'Typical amount (for budgeting)' : 'Amount (RM)'}</label>
        <input id="r-amt" inputMode="decimal" value={f.amount_myr} onChange={(e) => set('amount_myr', e.target.value)} />
      </div>
      {sel('category_id', api.categories, 'Category')}
      <div className="field"><label htmlFor="r-m">Merchant</label><input id="r-m" list="r-merchants" value={f.merchant} onChange={(e) => set('merchant', e.target.value)} /></div>
      <datalist id="r-merchants">{api.merchants.map((m) => <option key={m.id} value={m.name} />)}</datalist>
      {sel('account_id', api.accounts, 'Payment method')}
      {sel('platform_id', api.platforms, 'Platform')}
      <div className="seg">
        <button className={f.frequency === 'monthly' ? 'on' : ''} onClick={() => set('frequency', 'monthly')}>Monthly</button>
        <button className={f.frequency === 'yearly' ? 'on' : ''} onClick={() => set('frequency', 'yearly')}>Yearly</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <div className="field">
          <label htmlFor="r-day">Day of month</label>
          <input id="r-day" type="number" min={1} max={31} value={f.day_of_month} onChange={(e) => set('day_of_month', e.target.value)} />
        </div>
        {f.frequency === 'yearly' && (
          <div className="field">
            <label htmlFor="r-mon">Month</label>
            <select id="r-mon" value={f.month_of_year} onChange={(e) => set('month_of_year', e.target.value)}>
              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
        )}
      </div>
      {Number(f.day_of_month) > 28 && <span className="small muted">In shorter months this lands on the last day.</span>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <div className="field"><label htmlFor="r-s">Starts</label><input id="r-s" type="date" value={f.start_date} onChange={(e) => set('start_date', e.target.value)} /></div>
        <div className="field"><label htmlFor="r-e">Ends (optional)</label><input id="r-e" type="date" value={f.end_date || ''} onChange={(e) => set('end_date', e.target.value)} /></div>
      </div>
      {rule.id && (
        <div className="card" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 500 }}>Paused</span>
          <Switch checked={f.paused} onChange={(v) => set('paused', v)} label="Paused" />
        </div>
      )}
      {err && <div className="error">{err}</div>}
      <button className="btn" onClick={save}>Save</button>
      {rule.id && <button className="btn danger" onClick={async () => { await api.remove('recurring_rules', rule.id); onClose(); }}>Delete rule</button>}
    </Sheet>
  );
}

function Export() {
  const { api } = useData();
  const b = api.byId;
  const today = todayStr();
  const lines = () => {
    const rows = [];
    for (const t of api.transactions) {
      const items = t.items?.length ? t.items : [{ amount_myr: t.amount_myr }];
      for (const i of items) rows.push({ t, i });
    }
    return toCSV(rows, [
      { label: 'date', get: (r) => r.t.date },
      { label: 'type', get: (r) => r.t.type },
      { label: 'merchant', get: (r) => b.merchants[r.t.merchant_id]?.name },
      { label: 'category', get: (r) => b.categories[r.i.category_id]?.name },
      { label: 'item', get: (r) => r.i.item_name },
      { label: 'amount_myr', get: (r) => r.i.amount_myr },
      { label: 'platform', get: (r) => b.platforms[r.t.platform_id]?.name },
      { label: 'payment_method', get: (r) => b.accounts[r.t.account_id]?.name },
      { label: 'to_account', get: (r) => b.accounts[r.t.to_account_id]?.name },
      { label: 'income_source', get: (r) => b.income_sources[r.t.income_source_id]?.name },
      { label: 'currency', get: (r) => r.t.currency },
      { label: 'amount_original_total', get: (r) => r.t.amount_original },
      { label: 'fx_rate', get: (r) => r.t.fx_rate },
      { label: 'tags', get: (r) => (r.t.tag_ids || []).map((id) => b.tags[id]?.name).join('|') },
      { label: 'recurring', get: (r) => (r.t.recurring_rule_id ? 'yes' : 'no') },
      { label: 'excluded_from_budget', get: (r) => (r.t.exclude_from_budget ? 'yes' : 'no') },
      { label: 'note', get: (r) => r.t.note },
      { label: 'transaction_id', get: (r) => r.t.id }
    ]);
  };
  const inv = () =>
    toCSV(api.investments, ['date', 'side', 'ticker', 'broker', 'currency', 'amount_original', 'fx_rate', 'amount_myr', 'fees_myr', 'units', 'note'].map((k) => ({ label: k, get: (r) => r[k] })));
  return (
    <div className="page">
      <Header title="Export" />
      <span className="muted">One row per item, so split orders stay split. Opens straight into Excel or pandas.</span>
      <button className="btn" onClick={() => download(`transactions-${today}.csv`, lines())}><Icon name="download" size={18} /> Transactions</button>
      <button className="btn secondary" onClick={() => download(`investments-${today}.csv`, inv())}><Icon name="download" size={18} /> Investments</button>
    </div>
  );
}
