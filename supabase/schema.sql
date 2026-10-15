-- Expense Tracker — Supabase schema
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Every table is private to the signed-in user via row level security.

create extension if not exists "pgcrypto";

-- ---------- Settings ----------
create table if not exists settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  monthly_budget numeric(12,2),
  base_currency text not null default 'MYR',
  include_recurring_in_daily boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------- Lookup lists ----------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  icon text not null default 'circle',
  sort int not null default 0,
  archived boolean not null default false,
  unique (user_id, name)
);

create table if not exists platforms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  archived boolean not null default false,
  unique (user_id, name)
);

-- Payment methods double as accounts for transfers (cards, bank, cash, e-wallets)
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  kind text not null default 'card' check (kind in ('card','bank','cash','ewallet')),
  archived boolean not null default false,
  unique (user_id, name)
);

create table if not exists merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  -- "merchant memory": last-used defaults
  last_category_id uuid references categories on delete set null,
  last_platform_id uuid references platforms on delete set null,
  last_account_id uuid references accounts on delete set null,
  unique (user_id, name)
);

create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  unique (user_id, name)
);

create table if not exists income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  unique (user_id, name)
);

-- ---------- Recurring rules ----------
create table if not exists recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  amount_myr numeric(12,2) not null default 0,
  category_id uuid references categories on delete set null,
  merchant_id uuid references merchants on delete set null,
  platform_id uuid references platforms on delete set null,
  account_id uuid references accounts on delete set null,
  frequency text not null default 'monthly' check (frequency in ('monthly','yearly')),
  day_of_month int not null check (day_of_month between 1 and 31),
  month_of_year int check (month_of_year between 1 and 12),
  start_date date not null default current_date,
  end_date date,
  variable_amount boolean not null default false,
  paused boolean not null default false,
  last_generated_date date,
  -- installments are rules too: fixed count, equal slices, last slice absorbs rounding
  kind text not null default 'recurring' check (kind in ('recurring','installment')),
  total_myr numeric(12,2),
  installment_count int,
  created_at timestamptz not null default now()
);

-- ---------- Transactions ----------
-- type: expense | refund | income | transfer
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  type text not null check (type in ('expense','refund','income','transfer')),
  date date not null default current_date,
  merchant_id uuid references merchants on delete set null,
  platform_id uuid references platforms on delete set null,
  account_id uuid references accounts on delete set null,      -- paid with / transfer from
  to_account_id uuid references accounts on delete set null,   -- transfer to
  income_source_id uuid references income_sources on delete set null,
  currency text not null default 'MYR',
  amount_original numeric(14,2),        -- amount in original currency
  fx_rate numeric(14,6) not null default 1,
  amount_myr numeric(12,2) not null,    -- what it cost in MYR (sum of items for expenses)
  gross_myr numeric(12,2),              -- income only, optional
  note text,
  exclude_from_budget boolean not null default false,
  recurring_rule_id uuid references recurring_rules on delete set null,
  installment_no int,                   -- 1..n when generated from an installment plan
  is_draft boolean not null default false,  -- variable recurring awaiting amount
  refund_of uuid references transactions on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists transactions_user_date on transactions (user_id, date);

-- Line items: one or more per expense/refund (split orders)
create table if not exists transaction_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  transaction_id uuid not null references transactions on delete cascade,
  category_id uuid references categories on delete set null,
  item_name text,
  amount_myr numeric(12,2) not null
);
create index if not exists items_tx on transaction_items (transaction_id);

create table if not exists transaction_tags (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  transaction_id uuid not null references transactions on delete cascade,
  tag_id uuid not null references tags on delete cascade,
  primary key (transaction_id, tag_id)
);

-- ---------- Investments (net contributed only) ----------
create table if not exists investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null default current_date,
  side text not null check (side in ('buy','sell')),
  ticker text not null,
  broker text,
  currency text not null default 'MYR',
  amount_original numeric(14,2) not null,
  fx_rate numeric(14,6) not null default 1,
  amount_myr numeric(12,2) not null,
  fees_myr numeric(12,2) not null default 0,
  units numeric(18,6),
  note text,
  created_at timestamptz not null default now()
);

-- ---------- Row level security ----------
do $$
declare t text;
begin
  foreach t in array array['settings','categories','platforms','accounts','merchants','tags',
    'income_sources','recurring_rules','transactions','transaction_items','transaction_tags','investments']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists own_rows on %I', t);
    execute format('create policy own_rows on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ---------- Analysis views (for your own SQL / pandas work) ----------
-- One row per spending line; refunds are negative.
create or replace view v_spend_lines with (security_invoker = true) as
select
  t.user_id, t.id as transaction_id, i.id as item_id, t.date,
  date_trunc('month', t.date)::date as month,
  case when t.type = 'refund' then -i.amount_myr else i.amount_myr end as amount_myr,
  c.name as category, i.item_name, m.name as merchant, p.name as platform, a.name as payment_method,
  t.currency, t.exclude_from_budget, (t.recurring_rule_id is not null) as is_recurring
from transactions t
join transaction_items i on i.transaction_id = t.id
left join categories c on c.id = i.category_id
left join merchants m on m.id = t.merchant_id
left join platforms p on p.id = t.platform_id
left join accounts a on a.id = t.account_id
where t.type in ('expense','refund') and not t.is_draft;

create or replace view v_monthly_category with (security_invoker = true) as
select user_id, month, category, sum(amount_myr) as spent_myr, count(distinct transaction_id) as transactions
from v_spend_lines group by user_id, month, category;
