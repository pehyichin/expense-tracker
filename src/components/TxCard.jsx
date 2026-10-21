import { useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useData } from '../store.jsx';
import { money } from '../lib/format.js';
import { txSpend } from '../lib/spend.js';

export function txView(t, byId) {
  const cats = [...new Set((t.items || []).map((i) => i.category_id))].map((id) => byId.categories[id]).filter(Boolean);
  const merchant = byId.merchants[t.merchant_id]?.name;
  const account = byId.accounts[t.account_id]?.name;
  const platform = byId.platforms[t.platform_id]?.name;
  let icon = cats[0]?.icon || 'receipt';
  const itemNames = (t.items || []).map((i) => i.item_name).filter(Boolean);
  let title = merchant || itemNames.join(', ') || t.note || cats[0]?.name || 'Expense';
  if (merchant && itemNames.length) title = `${merchant} · ${itemNames.join(', ')}`;
  let meta = [cats.map((c) => c.name).join(' + ') || 'Uncategorised', account, platform].filter(Boolean).join(' · ');
  let amount = money(txSpend(t));
  const refunded = (byId.refundsOf?.[t.id] || 0);
  if (t.type === 'expense' && refunded > 0) meta = `Refunded ${money(refunded)} · ` + meta;
  if (t.type === 'refund') {
    icon = 'undo-2';
    title = `Refund · ${merchant || 'unknown'}`;
    amount = '+' + money(Math.abs(txSpend(t)));
  } else if (t.type === 'income') {
    icon = 'banknote';
    title = byId.income_sources[t.income_source_id]?.name || 'Income';
    meta = ['Income', account].filter(Boolean).join(' · ');
    amount = '+' + money(t.amount_myr);
  } else if (t.type === 'transfer') {
    icon = 'arrow-left-right';
    title = 'Transfer';
    meta = `${account || '?'} → ${byId.accounts[t.to_account_id]?.name || '?'}`;
    amount = money(t.amount_myr);
  }
  if (t.currency && t.currency !== 'MYR' && t.amount_original)
    meta += ` · ${t.currency} ${Number(t.amount_original).toLocaleString()}`;
  const rule = byId.recurring_rules[t.recurring_rule_id];
  if (t.installment_no && rule) meta = `${t.installment_no}/${rule.installment_count} · ` + meta;
  else if (t.recurring_rule_id) meta = '↻ ' + meta;
  if (t.is_draft) amount = 'Confirm';
  return { icon, title, meta, amount };
}

export default function TxCard({ t }) {
  const { api } = useData();
  const nav = useNavigate();
  const v = txView(t, api.byId);
  return (
    <button className={'tx' + (t.is_draft ? ' draft' : '')} onClick={() => nav(`/edit/${t.id}`)} aria-label={`${v.title}, ${v.amount}`}>
      <span className="icon-chip"><Icon name={v.icon} /></span>
      <span className="grow col" style={{ gap: 2 }}>
        <span style={{ fontSize: 16, fontWeight: 500 }} className="ellipsis">{v.title}</span>
        <span className="small muted ellipsis">{t.is_draft ? 'Recurring · awaiting this month’s amount' : v.meta}</span>
      </span>
      <span className="num" style={{ fontSize: 16, fontWeight: 500 }}>{v.amount}</span>
    </button>
  );
}
