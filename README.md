# Expense Tracker

A mobile-first personal finance app built for one user's exact needs: fast expense logging, a rolling daily budget, and analysis by category, merchant, platform and payment method. Installable on a phone as a PWA, backed by Postgres.

**Live app:** https://pehyichin.github.io/expense-tracker/

## What it does

- **Fast entry.** Type a merchant's first letters and it autocompletes; picking it pre-fills the category, payment method and platform used last time. Most entries are amount → merchant → save.
- **Split orders.** One Shopee order can hold items from several categories.
- **Rolling daily budget.** Monthly budget minus recurring bills, spread over the days left and recalculated daily. Overspending shrinks tomorrow's allowance; it never shows a negative one.
- **Recurring bills** (monthly or yearly) log themselves, catch up after days away, clamp the 31st to short months, and arrive as drafts when the amount varies.
- **Foreign currency.** Enter the amount as charged; the day's rate (ECB, via Frankfurter) converts to MYR, editable to match the card statement.
- **Insights.** Month to date vs the *same point* last month and last year, 6/12-month trend with the current month marked in progress, ranked breakdowns with share and change, recurring vs one-off split.
- **Investments.** Net contributed per ticker over time (buys minus sells), not market value.
- **Export** to CSV, one row per item.

## Data model

Postgres on Supabase, every table protected by row level security.

| Table | Holds |
|---|---|
| `transactions` | One row per expense, refund, income or transfer (date, merchant, platform, account, currency, FX rate, MYR amount) |
| `transaction_items` | Line items: category and amount. Split orders have several |
| `categories`, `merchants`, `platforms`, `accounts`, `tags`, `income_sources` | Lookups. Merchants carry their last-used defaults |
| `recurring_rules` | Schedules and `last_generated_date`, which makes generation idempotent |
| `investments` | Buys and sells per ticker |

Card bill payments are **transfers**, not expenses, so spending is never double counted.

Two views are ready for SQL analysis: `v_spend_lines` (one row per spending line, refunds negative) and `v_monthly_category`.

```sql
-- Average monthly spend per category over the last 6 full months
select category, round(avg(spent_myr), 2) as avg_monthly
from v_monthly_category
where month >= date_trunc('month', now()) - interval '6 months'
  and month <  date_trunc('month', now())
group by category
order by avg_monthly desc;
```

## Stack

React + Vite, PWA via `vite-plugin-pwa`, Supabase (Postgres + auth), Lucide icons, charts drawn in plain SVG/CSS. Budget, recurring and date-range logic is pure JavaScript with unit tests (`npm test`).

## Running it yourself

1. Create a Supabase project and run `supabase/schema.sql` in its SQL Editor.
2. `cp .env.example .env.local` and fill in your project URL and **publishable** key.
3. `npm install && npm run dev`

Pushing to `main` builds, tests and deploys to GitHub Pages (enable Pages → Source: GitHub Actions).
