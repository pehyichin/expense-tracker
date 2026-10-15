import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, fetchAll } from './lib/supabase.js';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, DEFAULT_PLATFORMS } from './lib/defaults.js';
import { amountOn, paymentNumber, pendingDates } from './lib/recurring.js';
import { spendLines } from './lib/spend.js';
import { todayStr } from './lib/dates.js';

export const DataContext = createContext(null);
export const useData = () => useContext(DataContext);

const LISTS = {
  categories: 'sort',
  platforms: 'name',
  accounts: 'name',
  merchants: 'name',
  tags: 'name',
  income_sources: 'name',
  recurring_rules: 'created_at',
  investments: 'date'
};

async function loadAll() {
  const lists = await Promise.all(
    Object.entries(LISTS).map(([table, order]) =>
      fetchAll(() => supabase.from(table).select('*').order(order, { ascending: true }))
    )
  );
  const out = {};
  Object.keys(LISTS).forEach((t, i) => (out[t] = lists[i]));
  const txs = await fetchAll(() =>
    supabase
      .from('transactions')
      .select('*, items:transaction_items(*), tags:transaction_tags(tag_id)')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
  );
  out.transactions = txs.map((t) => ({ ...t, tag_ids: (t.tags || []).map((x) => x.tag_id) }));
  const { data: settings } = await supabase.from('settings').select('*').maybeSingle();
  out.settings = settings;
  return out;
}

async function seedIfEmpty(data) {
  if (data.settings) return false;
  await supabase.from('settings').insert({});
  if (!data.categories.length)
    await supabase.from('categories').insert(DEFAULT_CATEGORIES.map(([name, icon], i) => ({ name, icon, sort: i })));
  if (!data.platforms.length) await supabase.from('platforms').insert(DEFAULT_PLATFORMS.map((name) => ({ name })));
  if (!data.accounts.length) await supabase.from('accounts').insert(DEFAULT_ACCOUNTS.map(([name, kind]) => ({ name, kind })));
  return true;
}

/** Create entries for recurring rules whose due dates have passed since last time. */
async function generateRecurring(rules, today) {
  let made = 0;
  for (const r of rules) {
    const dates = pendingDates(r, today);
    if (!dates.length) continue;
    for (const date of dates) {
      const amount = amountOn(r, date);
      const isInst = r.kind === 'installment';
      const k = isInst ? paymentNumber(r, date) : null;
      const { data: tx, error } = await supabase
        .from('transactions')
        .insert({
          type: 'expense',
          date,
          merchant_id: r.merchant_id,
          platform_id: r.platform_id,
          account_id: r.account_id,
          amount_myr: amount,
          amount_original: amount,
          recurring_rule_id: r.id,
          installment_no: k,
          is_draft: !isInst && r.variable_amount,
          note: isInst ? `${r.name} · installment ${k}/${r.installment_count}` : r.name
        })
        .select()
        .single();
      if (error) throw error;
      await supabase.from('transaction_items').insert({
        transaction_id: tx.id,
        category_id: r.category_id,
        item_name: r.name,
        amount_myr: amount
      });
      made++;
    }
    await supabase.from('recurring_rules').update({ last_generated_date: dates[dates.length - 1] }).eq('id', r.id);
  }
  return made;
}

export function DataProvider({ session, children }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const chain = useRef(Promise.resolve());

  // Reloads run one at a time, so seeding and recurring generation can never overlap and double-create.
  const reload = useCallback(() => {
    chain.current = chain.current.then(async () => {
      try {
        let d = await loadAll();
        if (await seedIfEmpty(d)) d = await loadAll();
        if ((await generateRecurring(d.recurring_rules, todayStr())) > 0) d = await loadAll();
        setData(d);
        setError(null);
      } catch (e) {
        setError(e.message || String(e));
      }
    });
    return chain.current;
  }, []);

  useEffect(() => {
    reload();
  }, [reload, session?.user?.id]);

  const api = useMemo(() => {
    if (!data) return null;
    const index = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));

    async function ensureByName(table, name, extra = {}) {
      const clean = (name || '').trim();
      if (!clean) return null;
      const existing = data[table].find((r) => r.name.toLowerCase() === clean.toLowerCase());
      if (existing) return existing.id;
      const { data: row, error } = await supabase.from(table).insert({ name: clean, ...extra }).select().single();
      if (error) throw error;
      return row.id;
    }

    async function saveTransaction({ id, tx, items = [], tagNames = [], merchantName }) {
      const merchant_id = merchantName !== undefined ? await ensureByName('merchants', merchantName) : tx.merchant_id;
      const row = { ...tx, merchant_id };
      if (row.type === 'expense' || row.type === 'refund') {
        row.amount_myr = items.reduce((s, i) => s + Number(i.amount_myr || 0), 0);
      }
      let txId = id;
      if (id) {
        const { error } = await supabase.from('transactions').update(row).eq('id', id);
        if (error) throw error;
        await supabase.from('transaction_items').delete().eq('transaction_id', id);
        await supabase.from('transaction_tags').delete().eq('transaction_id', id);
      } else {
        const { data: ins, error } = await supabase.from('transactions').insert(row).select().single();
        if (error) throw error;
        txId = ins.id;
      }
      if (items.length) {
        const { error } = await supabase.from('transaction_items').insert(
          items.map((i) => ({
            transaction_id: txId,
            category_id: i.category_id || null,
            item_name: i.item_name || null,
            amount_myr: Number(i.amount_myr || 0)
          }))
        );
        if (error) throw error;
      }
      const tagIds = [];
      for (const n of tagNames) tagIds.push(await ensureByName('tags', n));
      if (tagIds.length)
        await supabase.from('transaction_tags').insert(tagIds.map((tag_id) => ({ transaction_id: txId, tag_id })));
      // merchant memory
      if (merchant_id && row.type === 'expense') {
        await supabase
          .from('merchants')
          .update({
            last_category_id: items[0]?.category_id || null,
            last_platform_id: row.platform_id || null,
            last_account_id: row.account_id || null
          })
          .eq('id', merchant_id);
      }
      await reload();
      return txId;
    }

    async function deleteTransaction(id) {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
      await reload();
    }

    async function upsert(table, row) {
      const q = row.id ? supabase.from(table).update(row).eq('id', row.id) : supabase.from(table).insert(row);
      const { error } = await q;
      if (error) throw error;
      await reload();
    }

    async function remove(table, id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      await reload();
    }

    async function saveSettings(patch) {
      const { error } = await supabase
        .from('settings')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('user_id', session.user.id);
      if (error) throw error;
      await reload();
    }

    return {
      ...data,
      byId: {
        categories: index(data.categories),
        platforms: index(data.platforms),
        accounts: index(data.accounts),
        merchants: index(data.merchants),
        tags: index(data.tags),
        income_sources: index(data.income_sources),
        recurring_rules: index(data.recurring_rules)
      },
      lines: spendLines(data.transactions),
      budget: Number(data.settings?.monthly_budget) || 0,
      reload,
      ensureByName,
      saveTransaction,
      deleteTransaction,
      upsert,
      remove,
      saveSettings
    };
  }, [data, reload, session]);

  return <DataContext.Provider value={{ api, error, reload }}>{children}</DataContext.Provider>;
}
