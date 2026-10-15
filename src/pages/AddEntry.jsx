import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useData } from '../store.jsx';
import Icon from '../components/Icon.jsx';
import { Autocomplete, ChipPicker, Sheet, Switch } from '../components/ui.jsx';
import { prettyDate, todayStr } from '../lib/dates.js';
import { planInstallment } from '../lib/recurring.js';
import { money, round2 } from '../lib/format.js';
import { CURRENCIES, rateToMYR } from '../lib/fx.js';
import { supabase } from '../lib/supabase.js';

const TYPES = [
  ['expense', 'Expense'],
  ['income', 'Income'],
  ['transfer', 'Transfer'],
  ['invest', 'Invest']
];

const num = (v) => {
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const blankItem = () => ({ key: Math.random().toString(36).slice(2), category_id: null, item_name: '', amount: '' });

export default function AddEntry() {
  const { api } = useData();
  const nav = useNavigate();
  const { id } = useParams();
  const [params] = useSearchParams();
  const editing = id ? api.transactions.find((t) => t.id === id) : null;
  const refundOf = params.get('refund') ? api.transactions.find((t) => t.id === params.get('refund')) : null;

  const [type, setType] = useState(TYPES.some(([k]) => k === params.get('type')) ? params.get('type') : 'expense');
  const [date, setDate] = useState(todayStr());
  const [currency, setCurrency] = useState('MYR');
  const [rate, setRate] = useState(1);
  const [rateState, setRateState] = useState('ok'); // ok | loading | error
  const [myrOverride, setMyrOverride] = useState(null);
  const [merchant, setMerchant] = useState('');
  const [items, setItems] = useState([blankItem()]);
  const [accountId, setAccountId] = useState(null);
  const [toAccountId, setToAccountId] = useState(null);
  const [platformId, setPlatformId] = useState(null);
  const [tagNames, setTagNames] = useState([]);
  const [tagDraft, setTagDraft] = useState('');
  const [note, setNote] = useState('');
  const [exclude, setExclude] = useState(false);
  const [amount, setAmount] = useState(''); // income / transfer / invest
  const [gross, setGross] = useState('');
  const [source, setSource] = useState('');
  const [side, setSide] = useState('buy');
  const [ticker, setTicker] = useState('');
  const [broker, setBroker] = useState('');
  const [fees, setFees] = useState('');
  const [units, setUnits] = useState('');
  const [memoryNote, setMemoryNote] = useState(null);
  const [newPlatform, setNewPlatform] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [inst, setInst] = useState(false);
  const [instCount, setInstCount] = useState('6');
  const [instFirst, setInstFirst] = useState(todayStr());

  // Populate when editing an existing entry or logging a refund
  useEffect(() => {
    const src = editing || refundOf;
    if (!src) return;
    const isRefund = !!refundOf && !editing;
    setType(isRefund || src.type === 'refund' || src.type === 'expense' ? 'expense' : src.type);
    setDate(isRefund ? todayStr() : src.date);
    setCurrency(src.currency || 'MYR');
    setRate(Number(src.fx_rate) || 1);
    setMyrOverride(!isRefund && src.currency && src.currency !== 'MYR' ? String(src.amount_myr) : null);
    setMerchant(api.byId.merchants[src.merchant_id]?.name || '');
    const r = Number(src.fx_rate) || 1;
    setItems(
      (src.items?.length ? src.items : [{ category_id: null, item_name: '', amount_myr: src.amount_myr }]).map((i) => ({
        key: i.id || Math.random().toString(36).slice(2),
        category_id: i.category_id,
        item_name: i.item_name || '',
        amount: src.is_draft ? '' : String(round2(Number(i.amount_myr) / r))
      }))
    );
    setAccountId(src.account_id);
    setToAccountId(src.to_account_id);
    setPlatformId(src.platform_id);
    setTagNames(isRefund ? [] : (src.tag_ids || []).map((t) => api.byId.tags[t]?.name).filter(Boolean));
    setNote(isRefund ? '' : src.note || '');
    setExclude(!!src.exclude_from_budget);
    setAmount(String(src.amount_original ?? src.amount_myr ?? ''));
    setGross(src.gross_myr ? String(src.gross_myr) : '');
    setSource(api.byId.income_sources[src.income_source_id]?.name || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, refundOf?.id]);

  const isRefund = (editing && editing.type === 'refund') || (!!refundOf && !editing);

  // Keep each item's selected category chip in view (it may sit far right in the scroll row)
  const catKey = items.map((i) => i.category_id).join(',');
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      document.querySelectorAll('.chips.scroll .chip.on').forEach((el) => {
        const c = el.parentElement;
        c.scrollTo({ left: el.offsetLeft - c.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [catKey]);

  // Exchange rate for foreign currencies
  useEffect(() => {
    if (currency === 'MYR') {
      setRate(1);
      setRateState('ok');
      return;
    }
    if (editing && editing.currency === currency && editing.date === date) return;
    let live = true;
    setRateState('loading');
    rateToMYR(currency, date)
      .then((r) => live && (setRate(r), setRateState('ok')))
      .catch(() => live && setRateState('error'));
    return () => {
      live = false;
    };
  }, [currency, date]);

  const origTotal = type === 'expense' ? items.reduce((s, i) => s + num(i.amount), 0) : num(amount);
  const myrAuto = round2(origTotal * rate);
  const myrTotal = currency === 'MYR' ? origTotal : myrOverride != null ? num(myrOverride) : myrAuto;
  const effRate = origTotal ? myrTotal / origTotal : rate;

  const categoryOpts = api.categories.filter((c) => !c.archived);
  const accountOpts = api.accounts.filter((a) => !a.archived);
  const platformOpts = api.platforms.filter((p) => !p.archived);

  const merchantOptions = useMemo(
    () => api.merchants.map((m) => ({ ...m })),
    [api.merchants]
  );
  const tickers = useMemo(() => {
    const s = [...new Set(api.investments.map((i) => i.ticker))];
    return s.map((name) => ({ id: name, name }));
  }, [api.investments]);
  const brokers = useMemo(() => {
    const s = [...new Set(api.investments.map((i) => i.broker).filter(Boolean))];
    return s.map((name) => ({ id: name, name }));
  }, [api.investments]);

  function applyMemory(m) {
    const filled = [];
    if (m.last_category_id && api.byId.categories[m.last_category_id]) {
      setItems((its) => (its[0].category_id ? its : [{ ...its[0], category_id: m.last_category_id }, ...its.slice(1)]));
      filled.push(api.byId.categories[m.last_category_id].name);
    }
    if (m.last_account_id && api.byId.accounts[m.last_account_id]) {
      setAccountId(m.last_account_id);
      filled.push(api.byId.accounts[m.last_account_id].name);
    }
    if (m.last_platform_id && api.byId.platforms[m.last_platform_id]) {
      setPlatformId(m.last_platform_id);
      filled.push(api.byId.platforms[m.last_platform_id].name);
    }
    setMemoryNote(filled.length ? `Filled from last time: ${filled.join(' · ')}` : null);
  }

  const setItem = (key, patch) => setItems((its) => its.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  function addTag(name) {
    const n = name.trim();
    if (n && !tagNames.some((t) => t.toLowerCase() === n.toLowerCase())) setTagNames([...tagNames, n]);
    setTagDraft('');
  }

  async function save() {
    setErr(null);
    try {
      if (origTotal <= 0) throw new Error('Enter an amount.');
      if (currency !== 'MYR' && rateState !== 'ok' && myrOverride == null)
        throw new Error('No exchange rate yet. Type the MYR amount yourself.');
      setBusy(true);
      if (type === 'expense' && canInstall && inst) {
        const n = Math.round(num(instCount));
        if (!(n >= 2 && n <= 60)) throw new Error('Installments: between 2 and 60 months.');
        if (!items[0].category_id) throw new Error('Pick a category.');
        const total = round2(myrTotal);
        const plan = planInstallment(total, n, instFirst);
        const merchant_id = await api.ensureByName('merchants', merchant);
        const { error } = await supabase.from('recurring_rules').insert({
          kind: 'installment',
          name: items[0].item_name.trim() || merchant.trim() || 'Installment purchase',
          amount_myr: plan.amount,
          total_myr: total,
          installment_count: n,
          category_id: items[0].category_id,
          merchant_id,
          platform_id: platformId,
          account_id: accountId,
          frequency: 'monthly',
          day_of_month: plan.day,
          start_date: instFirst,
          end_date: plan.end
        });
        if (error) throw error;
        if (merchant_id)
          await supabase.from('merchants').update({ last_category_id: items[0].category_id, last_platform_id: platformId, last_account_id: accountId }).eq('id', merchant_id);
        await api.reload();
        nav(-1);
        return;
      }
      if (type === 'expense') {
        if (items.some((i) => num(i.amount) > 0 && !i.category_id)) throw new Error('Pick a category for each item.');
        const kept = items.filter((i) => num(i.amount) > 0);
        await api.saveTransaction({
          id: editing?.id,
          merchantName: merchant,
          tagNames,
          items: kept.map((i) => ({ category_id: i.category_id, item_name: i.item_name.trim(), amount_myr: round2(num(i.amount) * effRate) })),
          tx: {
            type: isRefund ? 'refund' : 'expense',
            date,
            platform_id: platformId,
            account_id: accountId,
            to_account_id: null,
            income_source_id: null,
            currency,
            amount_original: round2(origTotal),
            fx_rate: effRate,
            note: note.trim() || null,
            exclude_from_budget: exclude,
            is_draft: false,
            refund_of: editing?.refund_of || refundOf?.id || null,
            amount_myr: round2(myrTotal)
          }
        });
      } else if (type === 'income') {
        const source_id = await api.ensureByName('income_sources', source || 'Income');
        await api.saveTransaction({
          id: editing?.id,
          tagNames,
          items: [],
          tx: {
            type: 'income', date, income_source_id: source_id, account_id: accountId, currency,
            amount_original: round2(origTotal), fx_rate: effRate, amount_myr: round2(myrTotal),
            gross_myr: gross ? round2(num(gross) * effRate) : null, note: note.trim() || null
          }
        });
      } else if (type === 'transfer') {
        if (!accountId || !toAccountId || accountId === toAccountId) throw new Error('Pick two different accounts.');
        await api.saveTransaction({
          id: editing?.id,
          tagNames,
          items: [],
          tx: {
            type: 'transfer', date, account_id: accountId, to_account_id: toAccountId, currency,
            amount_original: round2(origTotal), fx_rate: effRate, amount_myr: round2(myrTotal), note: note.trim() || null
          }
        });
      } else {
        if (!ticker.trim()) throw new Error('Enter a ticker, e.g. NVDA.');
        const { error } = await supabase.from('investments').insert({
          date, side, ticker: ticker.trim().toUpperCase(), broker: broker.trim() || null, currency,
          amount_original: round2(origTotal), fx_rate: effRate, amount_myr: round2(myrTotal),
          fees_myr: round2(num(fees) * effRate), units: units ? num(units) : null, note: note.trim() || null
        });
        if (error) throw error;
        await api.reload();
        nav('/investments');
        return;
      }
      nav(-1);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    setBusy(true);
    try {
      await api.deleteTransaction(editing.id);
      nav(-1);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  const canInstall = type === 'expense' && !editing && !isRefund && items.length === 1;
  const instN = Math.round(num(instCount));
  const instPlan = canInstall && inst && instN >= 2 && myrTotal > 0 ? planInstallment(round2(myrTotal), instN, instFirst) : null;

  const heading = editing ? (editing.is_draft ? 'Confirm amount' : isRefund ? 'Edit refund' : 'Edit entry') : isRefund ? 'Log a refund' : 'New entry';

  return (
    <div className="page">
      <div className="between">
        <button className="icon-btn" aria-label="Close" onClick={() => nav(-1)}><Icon name="x" /></button>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>{heading}</h1>
        <div style={{ width: 48 }} />
      </div>

      {!editing && !isRefund && (
        <div className="seg" role="group" aria-label="Entry type">
          {TYPES.map(([k, l]) => (
            <button key={k} className={type === k ? 'on' : ''} aria-pressed={type === k} onClick={() => setType(k)}>{l}</button>
          ))}
        </div>
      )}
      {isRefund && refundOf && <div className="lime-note">Refund for {api.byId.merchants[refundOf.merchant_id]?.name || 'an expense'} · {money(refundOf.amount_myr)} on {refundOf.date}</div>}

      {type === 'invest' && (
        <div className="seg" role="group" aria-label="Buy or sell">
          <button className={side === 'buy' ? 'on' : ''} onClick={() => setSide('buy')}>Buy</button>
          <button className={side === 'sell' ? 'on' : ''} onClick={() => setSide('sell')}>Sell</button>
        </div>
      )}

      {/* Amount */}
      <div className="card" style={{ borderRadius: 28, padding: '18px 20px' }}>
        <div className="between">
          <span className="label">{type === 'expense' ? (items.length > 1 ? 'Total' : 'Amount') : type === 'income' ? 'Amount received (net)' : 'Amount'}</span>
          <label className="chip sm outline" style={{ position: 'relative' }}>
            {currency} <Icon name="chevron-down" size={14} strokeWidth={2} />
            <select
              aria-label="Currency"
              value={currency}
              onChange={(e) => { setCurrency(e.target.value); setMyrOverride(null); }}
              style={{ position: 'absolute', inset: 0, opacity: 0 }}
            >
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
        {type === 'expense' && items.length > 1 ? (
          <div className="huge">{currency === 'MYR' ? 'RM' : currency + ' '}{origTotal.toFixed(2)}</div>
        ) : (
          <div className="row" style={{ alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 300 }} className="muted">{currency === 'MYR' ? 'RM' : currency}</span>
            <input
              aria-label="Amount"
              inputMode="decimal"
              placeholder="0.00"
              autoFocus={!editing}
              value={type === 'expense' ? items[0].amount : amount}
              onChange={(e) => (type === 'expense' ? setItem(items[0].key, { amount: e.target.value }) : setAmount(e.target.value))}
              className="huge"
              style={{ border: 'none', background: 'transparent', width: '100%', outline: 'none', padding: 0 }}
            />
          </div>
        )}
        {currency !== 'MYR' && (
          <div className="col" style={{ gap: 6 }}>
            <div className="row small">
              <span className="muted grow">
                {rateState === 'loading' ? 'Fetching rate…' : rateState === 'error' ? 'Rate unavailable — type the MYR amount' : `1 ${currency} = RM${rate.toFixed(4)} on ${date}`}
              </span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className="small muted">In MYR</span>
              <input
                className="input"
                inputMode="decimal"
                aria-label="Amount in MYR"
                value={myrOverride ?? (myrAuto ? myrAuto.toFixed(2) : '')}
                onChange={(e) => setMyrOverride(e.target.value)}
                style={{ height: 40 }}
              />
            </div>
            <span className="tiny muted">Edit to match your card statement.</span>
          </div>
        )}
      </div>

      {type === 'expense' && (
        <>
          <div style={{ position: 'relative' }}>
            <Autocomplete
              id="merchant"
              label="Merchant"
              placeholder="Where did you spend?"
              value={merchant}
              onChange={(v) => { setMerchant(v); setMemoryNote(null); }}
              options={merchantOptions}
              onPick={applyMemory}
              renderMeta={(m) => [api.byId.categories[m.last_category_id]?.name, api.byId.accounts[m.last_account_id]?.name, api.byId.platforms[m.last_platform_id]?.name].filter(Boolean).join(' · ')}
            />
          </div>
          {memoryNote && <div className="lime-note">{memoryNote}</div>}

          <div className="col" style={{ gap: 8 }}>
            {items.map((it, idx) => (
              <div className="card" key={it.key}>
                <div className="between">
                  <span className="label">{items.length > 1 ? `Item ${idx + 1}` : 'Category'}</span>
                  {items.length > 1 && (
                    <button className="chip sm" aria-label={`Remove item ${idx + 1}`} onClick={() => setItems(items.filter((i) => i.key !== it.key))}>
                      <Icon name="trash-2" size={14} /> Remove
                    </button>
                  )}
                </div>
                <div className="chips scroll" role="group" aria-label="Category">
                  {categoryOpts.map((c) => (
                    <button key={c.id} className={'chip' + (it.category_id === c.id ? ' on' : '')} aria-pressed={it.category_id === c.id} onClick={() => setItem(it.key, { category_id: c.id })}>
                      <Icon name={c.icon} size={16} /> {c.name}
                    </button>
                  ))}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <input className="input grow" placeholder="What was it? (optional)" aria-label="Item name" value={it.item_name} onChange={(e) => setItem(it.key, { item_name: e.target.value })} />
                  {items.length > 1 && (
                    <input className="input" style={{ width: 110 }} inputMode="decimal" placeholder="0.00" aria-label="Item amount" value={it.amount} onChange={(e) => setItem(it.key, { amount: e.target.value })} />
                  )}
                </div>
              </div>
            ))}
            <button className="chip dashed" style={{ justifyContent: 'center', width: '100%' }} onClick={() => setItems([...items, blankItem()])}>
              <Icon name="plus" size={16} /> Add item (split this order)
            </button>
          </div>

          <div className="col" style={{ gap: 8 }}>
            <span className="label" style={{ paddingLeft: 4 }}>Payment method</span>
            <ChipPicker label="Payment method" options={accountOpts} value={accountId} onChange={setAccountId} allowNone />
          </div>
          <div className="col" style={{ gap: 8 }}>
            <span className="label" style={{ paddingLeft: 4 }}>Platform</span>
            <ChipPicker label="Platform" options={platformOpts} value={platformId} onChange={setPlatformId} allowNone onAdd={() => setNewPlatform(true)} />
          </div>
        </>
      )}

      {type === 'income' && (
        <>
          <Autocomplete id="source" label="Source" placeholder="e.g. Salary" value={source} onChange={setSource} options={api.income_sources} />
          <div className="field">
            <label htmlFor="gross">Gross, before EPF / tax (optional)</label>
            <input id="gross" inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 8 }}>
            <span className="label" style={{ paddingLeft: 4 }}>Received into</span>
            <ChipPicker label="Received into" options={accountOpts} value={accountId} onChange={setAccountId} allowNone />
          </div>
        </>
      )}

      {type === 'transfer' && (
        <>
          <div className="col" style={{ gap: 8 }}>
            <span className="label" style={{ paddingLeft: 4 }}>From</span>
            <ChipPicker label="From account" options={accountOpts} value={accountId} onChange={setAccountId} />
          </div>
          <div className="col" style={{ gap: 8 }}>
            <span className="label" style={{ paddingLeft: 4 }}>To (e.g. the card you’re paying off)</span>
            <ChipPicker label="To account" options={accountOpts} value={toAccountId} onChange={setToAccountId} />
          </div>
        </>
      )}

      {type === 'invest' && (
        <>
          <Autocomplete id="ticker" label="Ticker" placeholder="e.g. NVDA" value={ticker} onChange={setTicker} options={tickers} />
          <Autocomplete id="broker" label="Broker (optional)" placeholder="e.g. Moomoo" value={broker} onChange={setBroker} options={brokers} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <div className="field">
              <label htmlFor="fees">Fees</label>
              <input id="fees" inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="units">Units (optional)</label>
              <input id="units" inputMode="decimal" value={units} onChange={(e) => setUnits(e.target.value)} />
            </div>
          </div>
        </>
      )}

      <div className="field">
        <label htmlFor="date">Date</label>
        <input id="date" type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
      </div>

      {type !== 'invest' && (
        <div className="card">
          <span className="label">Tags</span>
          <div className="chips">
            {tagNames.map((t) => (
              <button key={t} className="chip sm on" aria-label={`Remove tag ${t}`} onClick={() => setTagNames(tagNames.filter((x) => x !== t))}>
                {t} <Icon name="x" size={12} strokeWidth={2.4} />
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <input
              className="input grow"
              list="tag-list"
              placeholder="Add a tag, e.g. Japan trip"
              aria-label="New tag"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag(tagDraft))}
            />
            <datalist id="tag-list">{api.tags.map((t) => <option key={t.id} value={t.name} />)}</datalist>
            <button className="chip" onClick={() => addTag(tagDraft)} disabled={!tagDraft.trim()}>Add</button>
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="note">Note</label>
        <textarea id="note" rows={2} placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {canInstall && (
        <div className="card">
          <div className="between">
            <div className="col" style={{ gap: 2 }}>
              <span style={{ fontWeight: 500 }}>Pay in installments</span>
              <span className="small muted">Logged as one slice a month, automatically.</span>
            </div>
            <Switch checked={inst} onChange={setInst} label="Pay in installments" />
          </div>
          {inst && (
            <>
              <div className="chips" role="group" aria-label="Number of months">
                {['3', '6', '12', '24'].map((n) => (
                  <button key={n} className={'chip sm' + (instCount === n ? ' on' : '')} aria-pressed={instCount === n} onClick={() => setInstCount(n)}>{n} months</button>
                ))}
                <input className="input" style={{ width: 90, height: 36 }} inputMode="numeric" aria-label="Custom number of months" value={['3', '6', '12', '24'].includes(instCount) ? '' : instCount} placeholder="Other" onChange={(e) => setInstCount(e.target.value)} />
              </div>
              <div className="field" style={{ background: 'var(--card-2)' }}>
                <label htmlFor="inst-first">First payment</label>
                <input id="inst-first" type="date" value={instFirst} onChange={(e) => setInstFirst(e.target.value)} />
              </div>
              {instPlan && (
                <div className="lime-note">
                  {money(instPlan.amount)} × {instN}, monthly until {prettyDate(instPlan.end)}. Each slice counts against that month’s budget.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {type === 'expense' && !isRefund && !(canInstall && inst) && (
        <div className="card" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="col" style={{ gap: 2 }}>
            <span style={{ fontWeight: 500 }}>Exclude from budget</span>
            <span className="small muted">For big planned one-offs. Still counts in Insights.</span>
          </div>
          <Switch checked={exclude} onChange={setExclude} label="Exclude from budget" />
        </div>
      )}

      {err && <div className="error" role="alert">{err}</div>}

      <button className="btn" onClick={save} disabled={busy}>
        {busy ? 'Saving…' : instPlan ? `Save · ${money(instPlan.amount)}/month` : `Save${myrTotal > 0 ? ' · ' + money(myrTotal) : ''}`}
      </button>

      {editing && editing.type === 'expense' && !editing.is_draft && (
        <button className="btn secondary" onClick={() => nav(`/add?refund=${editing.id}`)}>
          <Icon name="undo-2" size={18} /> Log a refund for this
        </button>
      )}
      {editing && (
        <button className="btn danger" onClick={() => setConfirmDelete(true)} disabled={busy}>Delete entry</button>
      )}

      {confirmDelete && (
        <Sheet title="Delete this entry?" onClose={() => setConfirmDelete(false)}>
          <span className="muted">This can’t be undone.</span>
          <button className="btn danger" onClick={doDelete} disabled={busy}>Delete</button>
          <button className="btn secondary" onClick={() => setConfirmDelete(false)}>Keep it</button>
        </Sheet>
      )}

      {newPlatform && (
        <NewNameSheet
          title="New platform"
          onClose={() => setNewPlatform(false)}
          onSave={async (name) => {
            const pid = await api.ensureByName('platforms', name);
            await api.reload();
            setPlatformId(pid);
            setNewPlatform(false);
          }}
        />
      )}
    </div>
  );
}

function NewNameSheet({ title, onClose, onSave }) {
  const [name, setName] = useState('');
  return (
    <Sheet title={title} onClose={onClose}>
      <input className="input" autoFocus aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn" disabled={!name.trim()} onClick={() => onSave(name.trim())}>Add</button>
    </Sheet>
  );
}
