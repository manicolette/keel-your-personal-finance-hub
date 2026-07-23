# Keel — Feature Batch Plan

All schema changes are **additive** (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`). No drops, no recreates. Added to `SCHEMA_SQL` in `src/lib/db.server.ts` after existing block.

## 1. Debts — original balance, start date, paid-off state

```sql
ALTER TABLE debts ADD COLUMN IF NOT EXISTS original_balance numeric(14,2);
ALTER TABLE debts ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS paid_off_at date;
```

- All three nullable. Existing debts keep working with no changes.
- Progress bar renders only when `original_balance` AND `start_date` set: `(original_balance - balance) / original_balance`.
- `paid_off_at` auto-set (server-side) when balance reaches ≤0 via a payment; cleared if balance goes back above 0.
- Debts list splits into **Active** and **Paid off** sections with a collapse toggle for the latter.

## 2. Debt payments table

```sql
CREATE TABLE IF NOT EXISTS debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id uuid NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL,
  payment_date date NOT NULL,
  note text,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS debt_payments_debt_date_idx ON debt_payments(debt_id, payment_date DESC);
```

Server functions (`keel.functions.ts`):
- `listDebtPayments({debt_id})`
- `createDebtPayment({debt_id, amount, payment_date, note?, account_id?, category_id?})` — in a single logical operation:
  1. Insert payment row.
  2. `UPDATE debts SET balance = balance - amount, paid_off_at = CASE WHEN balance - amount <= 0 THEN payment_date ELSE NULL END`.
  3. If `account_id` provided: insert a matching `transactions` row (`kind='expense'`, amount, on_date, account_id, category_id, notes = `"Debt payment: <debt.name>"`), then update `debt_payments.transaction_id`.
- `updateDebtPayment` / `deleteDebtPayment` — reverse the balance delta, cascade-delete the linked transaction if present, recompute `paid_off_at`.

Multiple payments per month supported naturally (no unique constraint on month).

UI: expandable "Payments" panel per debt row with log form + history list (edit/delete). Optional "Log as transaction from account…" picker + category picker.

## 3. Budget named line items

```sql
CREATE TABLE IF NOT EXISTS budget_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_line_id uuid NOT NULL REFERENCES budget_lines(id) ON DELETE CASCADE,
  name text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS budget_line_items_line_idx ON budget_line_items(budget_line_id);
```

- Existing `budget_lines.planned` stays; when a line has ≥1 named items, server returns `planned = SUM(items.amount)` (computed, authoritative) and marks it read-only in the UI. Otherwise `planned` is user-editable as today.
- Full CRUD on items. Collapsible per-category items panel on Budget page.
- No drift possible: category total is always `SUM(items.amount)` when items exist.

## 4. Transactions free-text search

- Add `q` search param (URL) to `/transactions`; client-side `notes ILIKE '%q%'` via existing loaded list (already capped at 1000). Combines with date/account/category filters.

## 5. Recurring income

```sql
CREATE TABLE IF NOT EXISTS recurring_income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  frequency text NOT NULL CHECK (frequency IN ('weekly','monthly','quarterly','yearly')),
  next_date date NOT NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

- New `/income` route mirroring Subscriptions shape.
- "Log received" button on each row → creates income transaction, advances `next_date` by frequency.
- Dashboard "Income (MTD)" already sums real transactions; recurring income shows a separate "Upcoming income" card.

## 6. FX Rates → Net Worth (wire it in)

Currently FX Rates are stored but unused. Fix:

- Server helper `convertToBase(amount, from, base, ratesMap)` picking the **latest** `fx_rates.as_of` per pair; identity when `from === base`; if no rate found, fall back to raw amount and flag `unconverted: true` in response.
- `getDashboard` net-worth calc + `/networth` snapshot creator: sum `accounts.opening_balance + transactions delta` converted to `app_settings.base_currency`.
- UI on Net Worth: shows unified total in base currency + a small "N accounts unconverted (missing FX rate)" warning if any.

Test: create USD account $1000, EUR account €500, FX rate EUR→USD 1.10 → total should be $1550.

## 7. Receipt attachments on transactions

```sql
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS receipt_url text;
```

- Vercel Blob via `@vercel/blob`. Needs `BLOB_READ_WRITE_TOKEN` env var.
- New server route `POST /api/public/upload-receipt` (auth-gated via session cookie check inside handler — not truly public) returns `{url}`.
- Optional file input in transaction create/edit form; small thumbnail + "Remove" in the row. Skipped entirely if no token configured (form hides the field, logs a one-time console note).

## Build order

1. Migration additions (all in one block).
2. `keel.functions.ts` — new server fns for payments, line items, recurring income, upload.
3. FX conversion helper + wire into dashboard/networth server fns.
4. UI: Debts (progress, payments, paid-off split), Budget (line items), Transactions (search + receipt), new Income route, Net Worth (unified total).
5. Nav links.
6. Verify: build, then Playwright smoke — Debts: two payments same month → balance + payoff drop; Budget: sum matches items; FX: mixed-currency total math; receipt upload skipped gracefully if no token.

## Env vars

- New: `BLOB_READ_WRITE_TOKEN` (Vercel Blob). Only needed for receipts; everything else works without it.

## Assumptions to confirm

- **Base currency for Net Worth** = `app_settings.base_currency` (default USD, already in schema). OK to use.
- **Debt payments UI** lives inside the existing Debts page (expandable per row), not a new route. OK?
- **Receipt storage:** Vercel Blob only (no S3/local fallback). OK?
- **Budget line items:** when a category has items, `planned` becomes read-only (sum of items). User edits items directly, not the total. OK?

Reply "go" to build, or edit any of the four assumptions.
