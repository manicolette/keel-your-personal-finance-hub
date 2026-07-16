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
CREATE INDEX IF NOT EXISTS transactions_cat_month_idx ON transactions(category_id, date_trunc('month', on_date));

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
`;

export function ensureSchema(): Promise<void> {
  if (_schemaReady) return _schemaReady;
  const sql = getSql();
  _schemaReady = (async () => {
    // neon's serverless client supports .query for raw multi-statement text.
    // But the tagged template only takes a single statement, so split manually.
    const statements = SCHEMA_SQL.split(/;\s*(?=CREATE|ALTER|INSERT|DROP)/i)
      .map((s) => s.trim())
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
