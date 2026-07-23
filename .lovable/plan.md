# Monthly Expenses redesign

Replaces the current `budget_line_items` (per-category, per-month, manual) with a Subscriptions-style **definitions** table plus a **per-month instance** table that snapshots what was planned/paid for each expense in each month. This is the core change: definitions describe the recurring intent; instances are the historical record.

## Schema (additive migrations only)

```sql
-- Definitions: one row per recurring monthly expense.
CREATE TABLE IF NOT EXISTS monthly_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  default_amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  active boolean NOT NULL DEFAULT true,     -- false = deactivated, hidden from future months
  start_month date,                         -- first month it applies (YYYY-MM-01); null = always
  end_month date,                           -- last month it applies; null = ongoing
  notes text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Per-month instances: one row per (expense, month) once materialized.
-- Also stores ad-hoc one-off items (monthly_expense_id = null, month + name + category set directly).
CREATE TABLE IF NOT EXISTS monthly_expense_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_expense_id uuid REFERENCES monthly_expenses(id) ON DELETE SET NULL,
  month date NOT NULL,                      -- always YYYY-MM-01
  name_snapshot text NOT NULL,              -- frozen at materialization; edits to def don't change past
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  planned_amount numeric(14,2) NOT NULL,    -- frozen snapshot; also holds one-month overrides
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','paused','skipped')),
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  is_ad_hoc boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (monthly_expense_id, month)        -- one instance per definition per month
);
CREATE INDEX IF NOT EXISTS mei_month_idx ON monthly_expense_instances(month);
CREATE INDEX IF NOT EXISTS mei_category_month_idx ON monthly_expense_instances(category_id, month);
CREATE INDEX IF NOT EXISTS mei_txn_idx ON monthly_expense_instances(transaction_id);
```

`budget_line_items` is left in place (unused by the new UI) rather than dropped — additive-only rule.

## How the pieces interact

- **Definitions** (`monthly_expenses`) = the "Rent, Internet, Car Insurance" list. Edited on a new `/monthly-expenses` route, styled like `/subscriptions`.
- **Instances** (`monthly_expense_instances`) = the frozen per-month snapshot. Created lazily the first time a month is viewed (or when the user acts on it). Once created, edits to the definition never mutate it.
- **Historical safety**: past months read only their instance rows. Editing a definition today changes `default_amount`, but September's instance still holds `planned_amount=600` even after October's edit sets it to 650.
- **Ad-hoc items**: `is_ad_hoc = true`, `monthly_expense_id = null`. Live in the same table so the Budget page renders one unified list per category.

### Materialization rule (server-side, in `getBudget(month)`)

For the requested `month`:
1. Load existing instances for that month.
2. Load active definitions where `start_month <= month` (or null) and (`end_month >= month` or null) and no instance yet for that (def, month).
3. For each missing one, insert an instance with `planned_amount = default_amount`, `name_snapshot = name`, `category_id`, `status = 'pending'`.
4. Return instances grouped by category. Category `planned` total = `SUM(planned_amount)` over its instances (excluding `status='paused'|'skipped'`). Category `actual` stays as it is today (sum of transactions).

Only materializes the currently viewed month, so viewing "August 2027" doesn't fill in every month between now and then.

### Editing semantics (matches user's requirements point-by-point)

- **Rename / recategorize / change amount** on a definition → updates definition only. Future months materialize with the new values; already-materialized instances stay frozen.
- **One-month override** → edit the instance's `planned_amount` directly (on the Budget page). Definition untouched.
- **Pause for one month** → set instance `status='paused'`. Still visible on that month's Budget with a "Paused" badge; excluded from planned total. Definition still materializes normal instances in other months.
- **Deactivate** definition → `active=false`. Stops materializing new months. Existing instances remain.
- **Delete** definition → `ON DELETE SET NULL` on instances keeps history intact; instance rows survive with `monthly_expense_id=null` and their frozen snapshot.
- **Link / unlink transaction** → set/clear `transaction_id` and flip `status` between `paid`/`pending`. Manual only — no auto-matching.

## Server functions (in `keel.functions.ts`)

Definitions CRUD:
- `listMonthlyExpenses()`, `createMonthlyExpense`, `updateMonthlyExpense`, `deleteMonthlyExpense`

Per-month instance ops:
- `getBudget({month})` — extended: materializes + returns instances grouped by category alongside existing budget lines.
- `updateExpenseInstance({id, planned_amount?, status?, notes?})` — for overrides and pause.
- `createAdHocExpense({month, name, category_id, planned_amount})` — one-off item for a specific month.
- `deleteExpenseInstance({id})` — removes a materialized instance (ad-hoc, or "not this month" for a definition; next view re-materializes unless status was paused).
- `linkTransactionToExpense({instance_id, transaction_id})` / `unlinkTransactionFromExpense({instance_id})`.

Transactions form gets a new optional field: "Pays which Monthly Expense?" — a dropdown of the current-month unpaid instances. On save, links + flips to `paid`.

## UI

- **New `/monthly-expenses` route** — Subscriptions-shaped list: name, category, default amount, active toggle, edit/delete. Primary way to add recurring expenses. Linked from side + bottom nav.
- **`/budget`** — reshaped around the question "what am I expected to pay this month, and what's paid?" For each category card:
  - Header: name + planned (sum of active instances) + actual (from transactions).
  - Rows: each instance with name, planned amount, status pill (Pending / Paid / Paused), linked transaction amount + date if any, and inline actions (override amount, pause, link txn, unlink, delete if ad-hoc).
  - Footer: small secondary "+ Add one-off item" button (ad-hoc). Deliberately subdued vs. the Monthly Expenses list.
- **Transactions create/edit form** — new optional "Pays Monthly Expense" select (current-month pending instances).

## Build order

1. Migration additions.
2. Server fns: definitions CRUD, materialization inside `getBudget`, instance mutations, link/unlink.
3. `/monthly-expenses` route.
4. Rework `/budget` around instances; remove the current per-month `BudgetLineCard` line-item UI (`budget_line_items` table stays orphaned, table not dropped).
5. Transactions form: add expense-link dropdown.
6. Nav links.
7. Playwright end-to-end: (a) add "Rent $600" definition → appears in Jul, Aug, Sep automatically; (b) override Aug to $650, confirm Jul/Sep unchanged; (c) edit definition to $700, confirm Jul/Aug/Sep instances unchanged, Oct materializes at $700; (d) pause Sep, confirm excluded from Sep total but still listed; (e) link a transaction from `/transactions` form, confirm status flips to Paid with actual amount shown; (f) unlink, confirm reverts to Pending.

## Assumptions to confirm

- **Materialization is lazy** (on first `getBudget` for a month), not eager for all future months. Backfilling old months you haven't visited yet: on first view, they materialize using today's definition values — acceptable because there's no prior snapshot to preserve. OK?
- **Deleting a definition** keeps historical instances intact (via `ON DELETE SET NULL`). They still render with their `name_snapshot`. OK, or would you rather deletions cascade and wipe history?
- **`budget_line_items` table** stays in the DB unused (additive rule) but the UI for it is removed. OK?
- **Definition scope window** (`start_month` / `end_month`): both optional, both nullable. Empty = "applies to every month." OK?

Reply "go" to build, or edit any of the four assumptions.
