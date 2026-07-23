# Income redesign

Mirrors the Monthly Expenses shape: **definitions** (`recurring_income`, extended) + **per-occurrence instances** (`income_instances`). Multiple named sources, each with its own schedule and variability. Additive-only migrations.

## Schema changes

Extend the existing `recurring_income` table (kept — additive):

```sql
ALTER TABLE recurring_income
  DROP CONSTRAINT IF EXISTS recurring_income_frequency_check;
ALTER TABLE recurring_income
  ADD CONSTRAINT recurring_income_frequency_check
  CHECK (frequency IN ('weekly','biweekly','semimonthly','monthly','quarterly','yearly'));

ALTER TABLE recurring_income
  ADD COLUMN IF NOT EXISTS anchor_date date,          -- biweekly: pay-cycle anchor (14-day math from here)
  ADD COLUMN IF NOT EXISTS semimonthly_day_1 int,     -- e.g. 1  or 15
  ADD COLUMN IF NOT EXISTS semimonthly_day_2 int,     -- e.g. 15 or 31 (31 = "last day of month")
  ADD COLUMN IF NOT EXISTS is_variable boolean NOT NULL DEFAULT false;

ALTER TABLE recurring_income ALTER COLUMN amount DROP NOT NULL;  -- variable sources can leave amount null
```

New table for per-occurrence status (Expected → Received):

```sql
CREATE TABLE IF NOT EXISTS income_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_income_id uuid REFERENCES recurring_income(id) ON DELETE SET NULL,
  expected_date date NOT NULL,                        -- when we projected it
  name_snapshot text NOT NULL,
  expected_amount numeric(14,2),                      -- null for variable sources
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'expected'
    CHECK (status IN ('expected','received','skipped')),
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  received_amount numeric(14,2),                      -- populated on link (esp. for variable sources)
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recurring_income_id, expected_date)
);
CREATE INDEX IF NOT EXISTS income_instances_date_idx ON income_instances(expected_date);
CREATE INDEX IF NOT EXISTS income_instances_txn_idx  ON income_instances(transaction_id);
```

## Date math (server-side, dedicated helpers)

- **weekly** → +7 days from `next_date`.
- **biweekly** → +14 days from `anchor_date` (fall back to `next_date` if anchor missing). Never day-of-month based. Test: anchor 2026-07-24 → 2026-08-07, 2026-08-21, 2026-09-04, 2026-09-18 (Aug gets 2 checks, Oct gets 3).
- **semimonthly** → for month M, emit `(M, day_1)` and `(M, day_2)`; if either day > `daysInMonth(M)` (e.g. day_2 = 31), clamp to last day of that month. Always exactly 2 per calendar month, no drift.
- **monthly / quarterly / yearly** → unchanged (add 1 / 3 / 12 months to `next_date`).

## Materialization (in a new `getIncome({month})`, mirrors `getBudget`)

For the requested month:
1. Load existing `income_instances` in that month.
2. For each active `recurring_income`, project all occurrences that fall inside the month using the helpers above; upsert an `expected` instance for each missing `(source, date)`.
3. Return instances (with source name/frequency) sorted by date, plus month totals: `expectedTotal = sum(expected_amount)` over non-skipped, `receivedTotal = sum(received_amount)` over `received`.

Variable sources contribute `0` to `expectedTotal` and only show up in `receivedTotal` once linked.

Dashboard "upcoming income" switches to reading from `income_instances WHERE status='expected' AND expected_date >= today` — so multiple biweekly sources land on their own real dates.

## Server functions (`keel.functions.ts`)

Definitions (extend existing):
- `listRecurringIncome`, `createRecurringIncome`, `updateRecurringIncome`, `deleteRecurringIncome` — accept the new fields; validate: biweekly requires `anchor_date`; semimonthly requires both `semimonthly_day_1` and `semimonthly_day_2` in 1..31; variable sources allow null `amount`.

Instances (new):
- `getIncome({month})` — materialize + return grouped.
- `updateIncomeInstance({id, expected_amount?, status?, notes?})` — overrides + skip.
- `linkTransactionToIncome({instance_id, transaction_id, received_amount?})` — sets status `received`, stores actual amount (defaults to transaction.amount).
- `unlinkIncomeInstance({instance_id})` — reverts to `expected`, clears amount.
- Deprecate `logRecurringIncomeReceived` (leave function so old code doesn't break, but UI stops calling it).

Transaction form gets a second optional field: "Receives which Income?" — dropdown of current-month `expected` instances. Mutually exclusive with the existing Monthly Expense link.

## UI

- **`/income`** — two-panel:
  - **Sources** (top): list of definitions, styled like `/monthly-expenses`. Add/edit form with frequency-conditional fields (biweekly → anchor date picker; semimonthly → two day inputs with "31 = last day of month" hint; variable checkbox → hides amount input).
  - **This month** (below): month selector (URL search param, same pattern as Budget), showing projected income_instances with source name, expected date, expected amount (or "variable"), status pill (Expected / Received / Skipped), inline actions (link txn, unlink, override, skip). Footer totals: Expected / Received.
- **`/dashboard`** — "Upcoming income" pulls from `income_instances` so bi-weekly sources show their real dates and multiple sources are listed separately.
- **`/transactions`** form — add income-link dropdown alongside the existing expense-link.

## Build order

1. Migrations (frequency check + new columns + `income_instances`).
2. Date-math helpers with unit-level sanity print in a scratch script (biweekly cycle, semimonthly with day_2=31 in Feb/Apr).
3. Server fns: extended CRUD + `getIncome` + instance ops + txn link.
4. Rework `/income` route around the definition + instance panels.
5. Wire income link into `/transactions` form.
6. Update `/dashboard` upcoming-income widget.
7. Playwright: create a biweekly source with anchor 2026-07-24; open `/income` for Jul/Aug/Sep; confirm dates 07-24, 08-07, 08-21, 09-04, 09-18. Create a semimonthly source with days 15/31; confirm Feb clamps to 28/29. Create a variable source; confirm no expected amount, link a transaction, confirm received_amount shows.

## Assumptions to confirm

- **Biweekly anchor**: on create, if user leaves anchor blank, default it to `next_date`. On edit, changing anchor recomputes future instances but leaves already-materialized past instances frozen (same freeze rule as Monthly Expenses). OK?
- **Semimonthly day_2 = 31**: interpreted as "last day of month" (clamped per month). OK, or would you rather require an explicit "last day" toggle?
- **Variable sources**: contribute 0 to Expected total; only Received total reflects them. Their expected instances still materialize on schedule so you have a row to link a transaction to. OK?
- **Old `logRecurringIncomeReceived`**: kept as a no-op-safe leftover; UI stops using it. OK?

Reply "go" to build, or edit any assumption.
