import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;
let _schemaReady: Promise<void> | null = null;

export function getSql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it in Vercel (or your project secrets) as a Neon Postgres connection string.",
    );
  }
  _sql = neon(url);
  return _sql;
}

const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency text NOT NULL DEFAULT 'USD',
  week_start text NOT NULL DEFAULT 'monday',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('bank','cash','credit','investment','other')),
  currency text NOT NULL DEFAULT 'USD',
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('income','expense')),
  color text NOT NULL DEFAULT '#0d9488',
  archived boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  on_date date NOT NULL,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('income','expense','transfer')),
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  notes text,
  transfer_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions(on_date);
CREATE INDEX IF NOT EXISTS transactions_cat_date_idx ON transactions(category_id, on_date);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  frequency text NOT NULL CHECK (frequency IN ('weekly','monthly','quarterly','yearly')),
  next_charge_date date NOT NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS constant_items (
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

CREATE TABLE IF NOT EXISTS debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  balance numeric(14,2) NOT NULL DEFAULT 0,
  min_payment numeric(14,2) NOT NULL DEFAULT 0,
  apr numeric(6,3) NOT NULL DEFAULT 0,
  due_day int,
  currency text NOT NULL DEFAULT 'USD',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  target_amount numeric(14,2) NOT NULL DEFAULT 0,
  saved_amount numeric(14,2) NOT NULL DEFAULT 0,
  target_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS net_worth_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  on_date date NOT NULL,
  assets_total numeric(14,2) NOT NULL DEFAULT 0,
  debts_total numeric(14,2) NOT NULL DEFAULT 0,
  net_worth numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budget_months (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL UNIQUE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budget_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_id uuid NOT NULL REFERENCES budget_months(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  planned numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  UNIQUE (month_id, category_id)
);

CREATE TABLE IF NOT EXISTS fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base text NOT NULL,
  quote text NOT NULL,
  rate numeric(18,8) NOT NULL,
  as_of date NOT NULL,
  UNIQUE (base, quote, as_of)
);

CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  due_date date NOT NULL,
  amount numeric(14,2),
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  done boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Additive: debt enhancements
ALTER TABLE debts ADD COLUMN IF NOT EXISTS original_balance numeric(14,2);
ALTER TABLE debts ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS paid_off_at date;

-- Additive: debt_payments
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

-- Additive: budget line items (named sub-items under a budget_line)
CREATE TABLE IF NOT EXISTS budget_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_line_id uuid NOT NULL REFERENCES budget_lines(id) ON DELETE CASCADE,
  name text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS budget_line_items_line_idx ON budget_line_items(budget_line_id);

-- Additive: recurring income
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

-- Additive: transaction receipt
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS receipt_url text;

-- Additive: Monthly Expenses (recurring definitions, like Subscriptions)
CREATE TABLE IF NOT EXISTS monthly_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  default_amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  active boolean NOT NULL DEFAULT true,
  start_month date,
  end_month date,
  notes text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Per-month materialized instances (historical snapshots) + ad-hoc one-offs.
CREATE TABLE IF NOT EXISTS monthly_expense_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_expense_id uuid REFERENCES monthly_expenses(id) ON DELETE SET NULL,
  month date NOT NULL,
  name_snapshot text NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  planned_amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','paused','skipped')),
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  is_ad_hoc boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mei_def_month_uidx ON monthly_expense_instances(monthly_expense_id, month) WHERE monthly_expense_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mei_month_idx ON monthly_expense_instances(month);
CREATE INDEX IF NOT EXISTS mei_category_month_idx ON monthly_expense_instances(category_id, month);
CREATE INDEX IF NOT EXISTS mei_txn_idx ON monthly_expense_instances(transaction_id);
-- Additive: track manual per-month overrides, and let subscriptions feed the budget.
ALTER TABLE monthly_expense_instances ADD COLUMN IF NOT EXISTS amount_overridden boolean NOT NULL DEFAULT false;
ALTER TABLE monthly_expense_instances ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mei_sub_month_uidx ON monthly_expense_instances(subscription_id, month) WHERE subscription_id IS NOT NULL;

-- Additive: extend recurring_income for bi-weekly / semi-monthly / variable amounts.
ALTER TABLE recurring_income DROP CONSTRAINT IF EXISTS recurring_income_frequency_check;
ALTER TABLE recurring_income ADD CONSTRAINT recurring_income_frequency_check
  CHECK (frequency IN ('weekly','biweekly','semimonthly','monthly','quarterly','yearly'));
ALTER TABLE recurring_income ADD COLUMN IF NOT EXISTS anchor_date date;
ALTER TABLE recurring_income ADD COLUMN IF NOT EXISTS semimonthly_day_1 int;
ALTER TABLE recurring_income ADD COLUMN IF NOT EXISTS semimonthly_day_2 int;
ALTER TABLE recurring_income ADD COLUMN IF NOT EXISTS is_variable boolean NOT NULL DEFAULT false;
ALTER TABLE recurring_income ALTER COLUMN amount DROP NOT NULL;
ALTER TABLE recurring_income ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE recurring_income ADD COLUMN IF NOT EXISTS end_date date;

-- Additive: per-occurrence income instances (Expected → Received).
CREATE TABLE IF NOT EXISTS income_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_income_id uuid REFERENCES recurring_income(id) ON DELETE SET NULL,
  expected_date date NOT NULL,
  name_snapshot text NOT NULL,
  expected_amount numeric(14,2),
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'expected' CHECK (status IN ('expected','received','skipped')),
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  received_amount numeric(14,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ii_def_date_uidx ON income_instances(recurring_income_id, expected_date) WHERE recurring_income_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ii_date_idx ON income_instances(expected_date);
CREATE INDEX IF NOT EXISTS ii_txn_idx ON income_instances(transaction_id);

-- Additive: Goals tied to real money (linked account + tagged transactions).
ALTER TABLE goals ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS goal_id uuid REFERENCES goals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tx_goal_idx ON transactions(goal_id);
CREATE INDEX IF NOT EXISTS tx_account_idx ON transactions(account_id);
CREATE INDEX IF NOT EXISTS tx_transfer_account_idx ON transactions(transfer_account_id);

-- Additive: debt interest model. The balance is recomputed from a known "anchor" balance
-- (what the statement said on anchor_date) plus payments logged after it, with daily interest.
ALTER TABLE debts ADD COLUMN IF NOT EXISTS promo_apr numeric(6,3);
ALTER TABLE debts ADD COLUMN IF NOT EXISTS promo_end_date date;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS extra_payment numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS anchor_balance numeric(14,2);
ALTER TABLE debts ADD COLUMN IF NOT EXISTS anchor_date date;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS anchor_set_at timestamptz;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS balance_as_of date;
UPDATE debts d SET
  anchor_balance = d.balance,
  anchor_date = GREATEST(CURRENT_DATE, COALESCE((SELECT MAX(p.payment_date) FROM debt_payments p WHERE p.debt_id = d.id), CURRENT_DATE)),
  anchor_set_at = now(),
  balance_as_of = GREATEST(CURRENT_DATE, COALESCE((SELECT MAX(p.payment_date) FROM debt_payments p WHERE p.debt_id = d.id), CURRENT_DATE))
WHERE d.anchor_balance IS NULL;

-- Additive: which bank account pays each bill. The definition holds the default; an instance
-- can override it for one month (ad-hoc bills, or "paid from a different account this time").
ALTER TABLE monthly_expenses ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE monthly_expense_instances ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;

-- Additive: everyday spending limits and icons on categories. monthly_limit is the default each
-- month starts from (spending starts fresh every month); budget_lines.planned overrides it for
-- a single month.
ALTER TABLE categories ADD COLUMN IF NOT EXISTS monthly_limit numeric(14,2);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon text;

-- Additive: Constants are being folded into Bills / Subscriptions / Income. moved_to records
-- where a constant went ("monthly_expenses:<id>", "subscriptions:<id>", "recurring_income:<id>").
ALTER TABLE constant_items ADD COLUMN IF NOT EXISTS moved_to text;
ALTER TABLE constant_items ADD COLUMN IF NOT EXISTS moved_at timestamptz;
`;

export function ensureSchema(): Promise<void> {
  if (_schemaReady) return _schemaReady;
  const sql = getSql();
  _schemaReady = (async () => {
    // neon's serverless client supports .query for raw multi-statement text.
    // But the tagged template only takes a single statement, so split manually.
    const statements = SCHEMA_SQL.split(/;\s*(?=CREATE|ALTER|INSERT|UPDATE|DROP|--)/i)
      .map((s) => s.replace(/^\s*(--[^\n]*\n)+/g, "").trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await sql.query(stmt);
    }
    // Seed singleton app_settings row.
    const rows = (await sql`SELECT id FROM app_settings LIMIT 1`) as { id: string }[];
    if (rows.length === 0) {
      await sql`INSERT INTO app_settings (base_currency, week_start) VALUES ('USD','monday')`;
    }
  })().catch((err) => {
    _schemaReady = null;
    throw err;
  });
  return _schemaReady;
}

export async function db() {
  await ensureSchema();
  return getSql();
}
