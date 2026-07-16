# Keel — Build Plan

Standalone personal finance app in this project. Neon Postgres only (no Supabase/Lovable Cloud). Password-gated single-user app.

## Stack & infra
- **DB**: Neon serverless (`@neondatabase/serverless`) via `src/lib/db.server.ts` with `ensureSchema()` that runs `CREATE TABLE IF NOT EXISTS ...` on first server call and memoizes.
- **Auth**: shared-password gate. `useSession` (TanStack Start server runtime) encrypted cookie. Server fns: `checkUnlocked`, `unlockSite`, `lockSite`. `_gated` layout route calls `checkUnlocked` in `beforeLoad`, redirects to `/unlock` if locked. Every data server fn also calls `requireUnlocked()` internally so data can never leak via direct RPC.
- **Env**: `DATABASE_URL`, `SITE_PASSWORD`, `SESSION_SECRET` (32+ chars).
- **Data layer**: all reads/writes in `src/lib/keel.functions.ts` via `createServerFn` + Zod. Handlers throw real `Error`s on failure.
- **Client**: TanStack Query `queryOptions` + `ensureQueryData` in loaders + `useSuspenseQuery` in components. Mutations via `useServerFn` + `useMutation` with `onSuccess: invalidateQueries` and `onError: (e) => toast.error(e.message)`.

## Schema (single migration in `ensureSchema()`)
Exactly as specified:
- `app_settings` (singleton row, seeded if missing: USD / monday)
- `accounts`, `categories`
- `transactions` (with `transfer_account_id` for transfers)
- `subscriptions`, `constant_items` (same shape, separate tables)
- `debts`, `goals`, `net_worth_snapshots`
- `budget_months` (month DATE UNIQUE = YYYY-MM-01), `budget_lines` (UNIQUE(month_id,category_id))
- `fx_rates` (UNIQUE(base,quote,as_of)), `reminders`

All ids `uuid DEFAULT gen_random_uuid()`. Money as `NUMERIC(14,2)` returned as strings from pg, parsed to numbers in DTOs.

**Budget actuals**: server computes `SUM(amount) WHERE kind='expense' AND category_id=$1 AND date_trunc('month', on_date) = $2` per line and returns pre-joined `{ line, actual }`. Client never sums.

## Routes
```
/unlock                    public login form
/_gated                    layout: checkUnlocked → redirect + <Outlet/> + bottom nav
  /dashboard               net worth, totals, upcoming reminders/subs
  /accounts
  /categories
  /transactions            table + CSV export button (client-side blob from loader data)
  /subscriptions
  /constants
  /debts
  /goals
  /networth
  /budget                  ?month=YYYY-MM URL search param, no local state
  /fx
  /reminders
  /settings                base currency, week start, lock button
/                          redirect → /dashboard (which redirects to /unlock if locked)
```

## Bug guards (explicit)
1. **Subscriptions**: mutation wrapped in try/catch, `toast.error(e.message)` on failure, `toast.success` on success, `invalidateQueries(['subscriptions'])`. Server validates with Zod and throws descriptive `Error` on bad input or DB failure.
2. **Budget infinite loop**: `validateSearch` provides `month: string`. `loaderDeps: ({ search }) => ({ month: search.month })`. Loader calls `ensureQueryData({ queryKey: ['budget', month], queryFn: () => getBudget({ data: { month } }) })`. Component reads with `useSuspenseQuery`, month picker calls `navigate({ search: { month: newMonth } })`. Zero `useEffect`.

## Design
Near-white bg (`oklch(0.99 0 0)`), dark text, single teal accent, tabular-nums for money, mobile-first, bottom nav on `_gated` layout (icons: Dashboard, Transactions, Budget, More).

## Post-build verification
Run Playwright: unlock with test password, add a subscription, refresh, confirm it persists. Open `/budget?month=2026-07`, switch months, confirm no loop (console clean, single fetch).

## Env vars to set in Vercel
- `DATABASE_URL` — Neon connection string (pooled, `?sslmode=require`)
- `SITE_PASSWORD` — the shared password
- `SESSION_SECRET` — 32+ char random string
