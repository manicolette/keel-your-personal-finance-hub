import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "./db.server";
import { requireUnlocked } from "./session.server";
import { replayBalance, simulateStrategy, firstPaymentMonth } from "./payoff";
import { parseAsk, type Period } from "./ask-parse";

// -------------------------- Types --------------------------
export type Account = {
  id: string;
  name: string;
  kind: "bank" | "cash" | "credit" | "investment" | "other";
  currency: string;
  opening_balance: number;
  current_balance: number;
  archived: boolean;
  sort_order: number;
};
export type Category = {
  id: string;
  name: string;
  kind: "income" | "expense";
  color: string;
  archived: boolean;
  sort_order: number;
  /** Default everyday spending limit per month; null = no limit (bills-only category). */
  monthly_limit: number | null;
  /** lucide icon name, e.g. "shopping-cart"; null = color dot only. */
  icon: string | null;
};
export type Transaction = {
  id: string;
  on_date: string;
  account_id: string;
  category_id: string | null;
  kind: "income" | "expense" | "transfer";
  amount: number;
  currency: string;
  notes: string | null;
  transfer_account_id: string | null;
  receipt_url: string | null;
  goal_id: string | null;
};
export type Subscription = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  frequency: "weekly" | "monthly" | "quarterly" | "yearly";
  next_charge_date: string;
  account_id: string | null;
  category_id: string | null;
  active: boolean;
  notes: string | null;
};
export type ConstantItem = {
  id: string;
  /** Where this constant was moved ("monthly_expenses:<id>" etc.); null = not moved yet. */
  moved_to: string | null;
  name: string;
  amount: number;
  currency: string;
  frequency: "weekly" | "monthly" | "quarterly" | "yearly";
  next_date: string;
  account_id: string | null;
  category_id: string | null;
  active: boolean;
  notes: string | null;
};
export type RecurringIncome = {
  id: string;
  name: string;
  amount: number | null;
  currency: string;
  frequency: "weekly" | "biweekly" | "semimonthly" | "monthly" | "quarterly" | "yearly";
  next_date: string;
  account_id: string | null;
  category_id: string | null;
  active: boolean;
  notes: string | null;
  anchor_date: string | null;
  semimonthly_day_1: number | null;
  semimonthly_day_2: number | null;
  is_variable: boolean;
  start_date: string | null;
  end_date: string | null;
};
export type IncomeInstance = {
  id: string;
  recurring_income_id: string | null;
  expected_date: string;
  name: string;
  expected_amount: number | null;
  currency: string;
  status: "expected" | "received" | "skipped";
  transaction_id: string | null;
  received_amount: number | null;
  transaction_date: string | null;
  notes: string | null;
  frequency: RecurringIncome["frequency"] | null;
  is_variable: boolean;
};
export type Debt = {
  id: string;
  name: string;
  balance: number;
  min_payment: number;
  apr: number;
  due_day: number | null;
  currency: string;
  notes: string | null;
  original_balance: number | null;
  start_date: string | null;
  paid_off_at: string | null;
  promo_apr: number | null;
  promo_end_date: string | null;
  extra_payment: number;
  balance_as_of: string | null; // date the balance figure is accurate as of (last payment or statement)
};
export type DebtPayment = {
  id: string;
  debt_id: string;
  amount: number;
  payment_date: string;
  note: string | null;
  account_id: string | null;
  transaction_id: string | null;
};
export type Goal = {
  id: string;
  name: string;
  target_amount: number;
  saved_amount: number;
  contributed_amount: number;
  progress_amount: number;
  target_date: string | null;
  notes: string | null;
  account_id: string | null;
  account_name: string | null;
};
export type NetWorthSnapshot = {
  id: string;
  on_date: string;
  assets_total: number;
  debts_total: number;
  net_worth: number;
  notes: string | null;
};
export type FxRate = {
  id: string;
  base: string;
  quote: string;
  rate: number;
  as_of: string;
};
export type Reminder = {
  id: string;
  title: string;
  due_date: string;
  amount: number | null;
  account_id: string | null;
  done: boolean;
  notes: string | null;
};
export type Settings = {
  id: string;
  base_currency: string;
  week_start: string;
  /** First month Keel tracks, "YYYY-MM". Nothing before it is shown. */
  start_month: string;
  remind_log: boolean;
  /** "HH:MM" after which Home nudges you if nothing was logged today. */
  remind_time: string;
  remind_bills: boolean;
  remind_income: boolean;
};
export type BudgetLineItem = {
  id: string;
  budget_line_id: string;
  name: string;
  amount: number;
  sort_order: number;
};
export type BudgetLine = {
  id: string;
  month_id: string;
  category_id: string;
  category_name: string;
  category_color: string;
  planned: number;
  actual: number;
  notes: string | null;
  items: BudgetLineItem[];
  planned_from_items: boolean;
};

export type MonthlyExpense = {
  id: string;
  name: string;
  category_id: string | null;
  /** Bank account this bill is normally paid from. */
  account_id: string | null;
  /** Day of the month it is due (1-31), if known. */
  due_day: number | null;
  default_amount: number;
  currency: string;
  active: boolean;
  start_month: string | null;
  end_month: string | null;
  notes: string | null;
  sort_order: number;
};
export type MonthlyExpenseInstance = {
  id: string;
  monthly_expense_id: string | null;
  subscription_id: string | null;
  amount_overridden: boolean;
  month: string;
  name: string;
  /** Effective paying account: this month's override, else the bill's or subscription's default. */
  account_id: string | null;
  /** True when account_id was set for this month only. */
  account_overridden: boolean;
  /** Day of the month due: the bill's due day, or a subscription's charge day. */
  due_day: number | null;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  planned_amount: number;
  currency: string;
  status: "pending" | "paid" | "paused" | "skipped";
  transaction_id: string | null;
  transaction_amount: number | null;
  transaction_date: string | null;
  is_ad_hoc: boolean;
  notes: string | null;
};
export type BudgetGroup = {
  category_id: string | null;
  category_name: string;
  category_color: string;
  category_icon: string | null;
  /** Bills planned this month + the everyday spending limit, if any. */
  planned: number;
  actual: number;
  /** Everyday spending limit in effect this month (null = none). */
  limit: number | null;
  /** True when this month's limit differs from the category default (a budget_lines row exists). */
  limit_overridden: boolean;
  /** The category's default limit, so the UI can offer "reset to default". */
  default_limit: number | null;
  instances: MonthlyExpenseInstance[];
};

/** Keel starts tracking in October 2026 unless changed in Settings. */
export const DEFAULT_START_MONTH = "2026-10";

const n = (v: unknown): number => (v == null ? 0 : Number(v));
const s = (v: unknown): string | null => (v == null ? null : String(v));
const d = (v: unknown): string => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const str = String(v);
  return str.length >= 10 ? str.slice(0, 10) : str;
};
const dOrNull = (v: unknown): string | null => (v == null ? null : d(v));

// -------------------------- Settings --------------------------
export const getSettings = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const sql = await db();
  const rows = (await sql`SELECT id, base_currency, week_start, start_month, remind_log, remind_time, remind_bills, remind_income FROM app_settings LIMIT 1`) as any[];
  const r = rows[0];
  return {
    ...r,
    start_month: r.start_month ? d(r.start_month).slice(0, 7) : DEFAULT_START_MONTH,
    remind_log: r.remind_log !== false, remind_bills: r.remind_bills !== false, remind_income: r.remind_income !== false,
    remind_time: r.remind_time ?? "20:30",
  } as Settings;
});

export const updateSettings = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        base_currency: z.string().min(1).max(8),
        week_start: z.enum(["sunday", "monday"]),
        start_month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        remind_log: z.boolean().optional(),
        remind_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        remind_bills: z.boolean().optional(),
        remind_income: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`UPDATE app_settings SET base_currency = ${data.base_currency}, week_start = ${data.week_start} WHERE id = ${data.id}`;
    if (data.start_month) await sql`UPDATE app_settings SET start_month = ${data.start_month + "-01"} WHERE id = ${data.id}`;
    if (data.remind_log !== undefined) {
      await sql`
        UPDATE app_settings SET remind_log = ${data.remind_log}, remind_time = ${data.remind_time ?? "20:30"},
          remind_bills = ${data.remind_bills ?? true}, remind_income = ${data.remind_income ?? true}
        WHERE id = ${data.id}`;
    }
    return { ok: true };
  });

// -------------------------- Accounts --------------------------
// Live per-account balance: opening + income - expense - transfers out + transfers in.
// Always computed from the transactions table, never stored, so it cannot drift.
export const listAccounts = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const sql = await db();
  return loadAccounts(sql);
});

async function loadAccounts(sql: any): Promise<Account[]> {
  const rows = (await sql`
    SELECT a.id, a.name, a.kind, a.currency, a.opening_balance, a.archived, a.sort_order,
      a.opening_balance
      + COALESCE((
          SELECT SUM(CASE WHEN t.kind = 'income' THEN t.amount
                          WHEN t.kind IN ('expense','transfer') THEN -t.amount
                          ELSE 0 END)
          FROM transactions t WHERE t.account_id = a.id), 0)
      + COALESCE((
          SELECT SUM(t.amount) FROM transactions t
          WHERE t.kind = 'transfer' AND t.transfer_account_id = a.id), 0)
      AS current_balance
    FROM accounts a ORDER BY a.sort_order, a.name`) as any[];
  return rows.map((r) => ({
    ...r,
    opening_balance: n(r.opening_balance),
    current_balance: n(r.current_balance),
  })) as Account[];
}

const accountInput = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(["bank", "cash", "credit", "investment", "other"]),
  currency: z.string().min(1).max(8).default("USD"),
  opening_balance: z.coerce.number().default(0),
  archived: z.boolean().default(false),
  sort_order: z.coerce.number().int().default(0),
});

export const createAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => accountInput.parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const rows = (await sql`
      INSERT INTO accounts (name, kind, currency, opening_balance, archived, sort_order)
      VALUES (${data.name}, ${data.kind}, ${data.currency}, ${data.opening_balance}, ${data.archived}, ${data.sort_order})
      RETURNING id`) as any[];
    return { id: rows[0].id as string };
  });

export const updateAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => accountInput.extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`
      UPDATE accounts SET
        name = ${data.name}, kind = ${data.kind}, currency = ${data.currency},
        opening_balance = ${data.opening_balance}, archived = ${data.archived}, sort_order = ${data.sort_order}
      WHERE id = ${data.id}`;
    return { ok: true };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`DELETE FROM accounts WHERE id = ${data.id}`;
    return { ok: true };
  });

// -------------------------- Categories --------------------------
export const listCategories = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const sql = await db();
  const rows = (await sql`SELECT id, name, kind, color, archived, sort_order, monthly_limit, icon FROM categories ORDER BY kind, sort_order, name`) as any[];
  return rows.map((r) => ({ ...r, monthly_limit: r.monthly_limit == null ? null : n(r.monthly_limit), icon: s(r.icon) })) as Category[];
});

const categoryInput = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(["income", "expense"]),
  color: z.string().min(1).max(16).default("#0d9488"),
  archived: z.boolean().default(false),
  sort_order: z.coerce.number().int().default(0),
  monthly_limit: z.coerce.number().nonnegative().nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
});

export const createCategory = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => categoryInput.parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const rows = (await sql`
      INSERT INTO categories (name, kind, color, archived, sort_order, monthly_limit, icon)
      VALUES (${data.name}, ${data.kind}, ${data.color}, ${data.archived}, ${data.sort_order},
              ${data.kind === "expense" ? (data.monthly_limit ?? null) : null}, ${data.icon ?? null})
      RETURNING id`) as any[];
    return { id: rows[0].id as string };
  });

export const updateCategory = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => categoryInput.extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`
      UPDATE categories SET name = ${data.name}, kind = ${data.kind}, color = ${data.color},
        archived = ${data.archived}, sort_order = ${data.sort_order},
        monthly_limit = ${data.kind === "expense" ? (data.monthly_limit ?? null) : null}, icon = ${data.icon ?? null}
      WHERE id = ${data.id}`;
    return { ok: true };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`DELETE FROM categories WHERE id = ${data.id}`;
    return { ok: true };
  });

// -------------------------- Transactions --------------------------
export const listTransactions = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const sql = await db();
  const rows = (await sql`
    SELECT id, on_date, account_id, category_id, kind, amount, currency, notes, transfer_account_id, receipt_url, goal_id
    FROM transactions ORDER BY on_date DESC, created_at DESC LIMIT 1000`) as any[];
  return rows.map((r) => ({ ...r, amount: n(r.amount), on_date: d(r.on_date), notes: s(r.notes), receipt_url: s(r.receipt_url) })) as Transaction[];
});

const txInput = z.object({
  on_date: z.string().min(10),
  account_id: z.string().uuid(),
  category_id: z.string().uuid().nullable().optional(),
  kind: z.enum(["income", "expense", "transfer"]),
  amount: z.coerce.number(),
  currency: z.string().min(1).max(8).default("USD"),
  notes: z.string().max(500).nullable().optional(),
  transfer_account_id: z.string().uuid().nullable().optional(),
  receipt_url: z.string().url().nullable().optional(),
  goal_id: z.string().uuid().nullable().optional(),
});

export const createTransaction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => txInput.parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    if (data.kind === "transfer" && data.transfer_account_id === data.account_id) {
      throw new Error("A transfer must go between two different accounts");
    }
    const rows = (await sql`
      INSERT INTO transactions (on_date, account_id, category_id, kind, amount, currency, notes, transfer_account_id, receipt_url, goal_id)
      VALUES (${data.on_date}, ${data.account_id}, ${data.category_id ?? null}, ${data.kind}, ${data.amount}, ${data.currency}, ${data.notes ?? null}, ${data.transfer_account_id ?? null}, ${data.receipt_url ?? null}, ${data.goal_id ?? null})
      RETURNING id`) as any[];
    return { id: rows[0].id as string };
  });

export const updateTransaction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => txInput.extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    if (data.kind === "transfer" && data.transfer_account_id === data.account_id) {
      throw new Error("A transfer must go between two different accounts");
    }
    await sql`
      UPDATE transactions SET on_date = ${data.on_date}, account_id = ${data.account_id},
        category_id = ${data.category_id ?? null}, kind = ${data.kind}, amount = ${data.amount},
        currency = ${data.currency}, notes = ${data.notes ?? null},
        transfer_account_id = ${data.transfer_account_id ?? null},
        receipt_url = ${data.receipt_url ?? null},
        goal_id = ${data.goal_id ?? null}
      WHERE id = ${data.id}`;
    return { ok: true };
  });

export const deleteTransaction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    // Unlink any monthly-expense instances first so their status flips back to pending.
    await sql`UPDATE monthly_expense_instances SET transaction_id = NULL, status = 'pending' WHERE transaction_id = ${data.id}`;
    // Same for income instances: revert to expected + clear received amount.
    await sql`UPDATE income_instances SET transaction_id = NULL, status = 'expected', received_amount = NULL WHERE transaction_id = ${data.id}`;
    await sql`DELETE FROM transactions WHERE id = ${data.id}`;
    return { ok: true };
  });

// -------------------------- Subscriptions --------------------------
const subInput = z.object({
  name: z.string().min(1, "Name is required").max(80),
  amount: z.coerce.number().nonnegative("Amount must be >= 0"),
  currency: z.string().min(1).max(8).default("USD"),
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  next_charge_date: z.string().min(10, "Next charge date is required"),
  account_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  active: z.boolean().default(true),
  notes: z.string().max(500).nullable().optional(),
});

export const listSubscriptions = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const sql = await db();
  const rows = (await sql`
    SELECT id, name, amount, currency, frequency, next_charge_date, account_id, category_id, active, notes
    FROM subscriptions ORDER BY next_charge_date`) as any[];
  return rows.map((r) => ({ ...r, amount: n(r.amount), next_charge_date: d(r.next_charge_date), notes: s(r.notes) })) as Subscription[];
});

export const createSubscription = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => subInput.parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    try {
      const rows = (await sql`
        INSERT INTO subscriptions (name, amount, currency, frequency, next_charge_date, account_id, category_id, active, notes)
        VALUES (${data.name}, ${data.amount}, ${data.currency}, ${data.frequency}, ${data.next_charge_date}, ${data.account_id ?? null}, ${data.category_id ?? null}, ${data.active}, ${data.notes ?? null})
        RETURNING id`) as any[];
      return { id: rows[0].id as string };
    } catch (err) {
      throw new Error(`Failed to save subscription: ${(err as Error).message}`);
    }
  });

export const updateSubscription = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    subInput.extend({
      id: z.string().uuid(),
      from_month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      override_policy: z.enum(["overwrite", "keep"]).optional(),
    }).parse(data),
  )
  .handler(async ({ data }): Promise<PropagateResult> => {
    await requireUnlocked();
    const sql = await db();
    const from = `${data.from_month ?? new Date().toISOString().slice(0, 7)}-01`;
    const monthly = Math.round(
      (data.frequency === "weekly" ? (data.amount * 52) / 12
        : data.frequency === "quarterly" ? data.amount / 3
        : data.frequency === "yearly" ? data.amount / 12
        : data.amount) * 100,
    ) / 100;
    try {
      const exists = (await sql`SELECT 1 FROM subscriptions WHERE id = ${data.id}`) as any[];
      if (exists.length === 0) throw new Error("This subscription no longer exists.");

      const conflicts = (await sql`
        SELECT month FROM monthly_expense_instances
        WHERE subscription_id = ${data.id} AND month >= ${from}::date
          AND amount_overridden = true AND planned_amount <> ${monthly}
        ORDER BY month`) as any[];
      if (conflicts.length > 0 && !data.override_policy) {
        return { ok: false, needs_confirm: true, overridden_count: conflicts.length, overridden_months: conflicts.map((r) => d(r.month).slice(0, 7)) };
      }
      const overwrite = data.override_policy === "overwrite";

      await sql`
        UPDATE subscriptions SET name = ${data.name}, amount = ${data.amount}, currency = ${data.currency},
          frequency = ${data.frequency}, next_charge_date = ${data.next_charge_date},
          account_id = ${data.account_id ?? null}, category_id = ${data.category_id ?? null},
          active = ${data.active}, notes = ${data.notes ?? null}
        WHERE id = ${data.id}`;

      const updated = (await sql`
        UPDATE monthly_expense_instances SET
          name_snapshot = ${data.name}, category_id = ${data.category_id ?? null}, currency = ${data.currency},
          planned_amount = CASE WHEN amount_overridden AND NOT ${overwrite} THEN planned_amount ELSE ${monthly} END,
          amount_overridden = CASE WHEN ${overwrite} THEN false ELSE amount_overridden END
        WHERE subscription_id = ${data.id} AND month >= ${from}::date
        RETURNING id`) as any[];

      if (!data.active) {
        await sql`
          DELETE FROM monthly_expense_instances
          WHERE subscription_id = ${data.id} AND month >= ${from}::date
            AND status = 'pending' AND transaction_id IS NULL`;
      }
      return { ok: true, needs_confirm: false, updated_months: updated.length };
    } catch (err) {
      throw new Error(`Failed to update subscription: ${(err as Error).message}`);
    }
  });

export const deleteSubscription = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`DELETE FROM subscriptions WHERE id = ${data.id}`;
    return { ok: true };
  });

// -------------------------- Constant items --------------------------
const constInput = z.object({
  name: z.string().min(1).max(80),
  amount: z.coerce.number(),
  currency: z.string().min(1).max(8).default("USD"),
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  next_date: z.string().min(10),
  account_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  active: z.boolean().default(true),
  notes: z.string().max(500).nullable().optional(),
});

export const listConstants = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const sql = await db();
  const rows = (await sql`
    SELECT id, name, amount, currency, frequency, next_date, account_id, category_id, active, notes, moved_to
    FROM constant_items ORDER BY moved_to NULLS FIRST, next_date`) as any[];
  return rows.map((r) => ({ ...r, amount: n(r.amount), next_date: d(r.next_date), notes: s(r.notes), moved_to: s(r.moved_to) })) as ConstantItem[];
});

export const createConstant = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => constInput.parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const rows = (await sql`
      INSERT INTO constant_items (name, amount, currency, frequency, next_date, account_id, category_id, active, notes)
      VALUES (${data.name}, ${data.amount}, ${data.currency}, ${data.frequency}, ${data.next_date}, ${data.account_id ?? null}, ${data.category_id ?? null}, ${data.active}, ${data.notes ?? null})
      RETURNING id`) as any[];
    return { id: rows[0].id as string };
  });

export const updateConstant = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => constInput.extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`
      UPDATE constant_items SET name = ${data.name}, amount = ${data.amount}, currency = ${data.currency},
        frequency = ${data.frequency}, next_date = ${data.next_date},
        account_id = ${data.account_id ?? null}, category_id = ${data.category_id ?? null},
        active = ${data.active}, notes = ${data.notes ?? null}
      WHERE id = ${data.id}`;
    return { ok: true };
  });

export const deleteConstant = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`DELETE FROM constant_items WHERE id = ${data.id}`;
    return { ok: true };
  });

// Constants are being retired: each one moves to where the rest of the app already looks.
//   income category            -> Recurring income (Income page)
//   expense, monthly           -> Monthly Expenses (Bills), keeping its paying account
//   expense, weekly/qtr/yearly -> Subscriptions (recurring charges; budget uses the monthly equivalent)
// Constants were never counted in the budget, so a same-named item that already exists in the
// target is most likely the same bill entered twice. In that case nothing is created and the
// caller is told, so the user can choose "already there, just mark it moved".
export type MoveConstantResult =
  | { status: "moved"; target: string }
  | { status: "already_moved"; target: string }
  | { status: "duplicate"; target_label: string; existing_name: string };

export const moveConstant = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), mode: z.enum(["move", "mark_only"]).default("move") }).parse(data),
  )
  .handler(async ({ data }): Promise<MoveConstantResult> => {
    await requireUnlocked();
    const sql = await db();
    const rows = (await sql`
      SELECT ci.*, c.kind AS category_kind FROM constant_items ci
      LEFT JOIN categories c ON c.id = ci.category_id
      WHERE ci.id = ${data.id}`) as any[];
    if (rows.length === 0) throw new Error("Constant not found");
    const ci = rows[0];
    if (ci.moved_to) return { status: "already_moved", target: ci.moved_to as string };

    const isIncome = ci.category_kind === "income";
    const table = isIncome ? "recurring_income" : ci.frequency === "monthly" ? "monthly_expenses" : "subscriptions";
    const label = isIncome ? "Income" : table === "monthly_expenses" ? "Bills" : "Subscriptions";

    const markMoved = async (target: string) => {
      await sql`UPDATE constant_items SET moved_to = ${target}, moved_at = now(), active = false WHERE id = ${data.id}`;
    };

    if (data.mode === "mark_only") {
      await markMoved(`${table}:existing`);
      return { status: "moved", target: `${table}:existing` };
    }

    const dupe = (table === "recurring_income"
      ? await sql`SELECT name FROM recurring_income WHERE lower(name) = lower(${ci.name}) AND active = true LIMIT 1`
      : table === "monthly_expenses"
        ? await sql`SELECT name FROM monthly_expenses WHERE lower(name) = lower(${ci.name}) AND active = true LIMIT 1`
        : await sql`SELECT name FROM subscriptions WHERE lower(name) = lower(${ci.name}) AND active = true LIMIT 1`) as any[];
    if (dupe.length > 0) return { status: "duplicate", target_label: label, existing_name: dupe[0].name as string };

    let newId: string;
    if (table === "recurring_income") {
      const r = (await sql`
        INSERT INTO recurring_income (name, amount, currency, frequency, next_date, account_id, category_id, active, notes, is_variable)
        VALUES (${ci.name}, ${ci.amount}, ${ci.currency}, ${ci.frequency}, ${ci.next_date}, ${ci.account_id}, ${ci.category_id},
                ${ci.active}, ${ci.notes}, false)
        RETURNING id`) as any[];
      newId = r[0].id;
    } else if (table === "monthly_expenses") {
      const r = (await sql`
        INSERT INTO monthly_expenses (name, category_id, account_id, default_amount, currency, active, notes)
        VALUES (${ci.name}, ${ci.category_id}, ${ci.account_id}, ${ci.amount}, ${ci.currency}, ${ci.active}, ${ci.notes})
        RETURNING id`) as any[];
      newId = r[0].id;
    } else {
      const r = (await sql`
        INSERT INTO subscriptions (name, amount, currency, frequency, next_charge_date, account_id, category_id, active, notes)
        VALUES (${ci.name}, ${ci.amount}, ${ci.currency}, ${ci.frequency}, ${ci.next_date}, ${ci.account_id}, ${ci.category_id},
                ${ci.active}, ${ci.notes})
        RETURNING id`) as any[];
      newId = r[0].id;
    }
    const target = `${table}:${newId}`;
    await markMoved(target);
    return { status: "moved", target };
  });

// -------------------------- Recurring income --------------------------
const incomeFrequency = z.enum(["weekly", "biweekly", "semimonthly", "monthly", "quarterly", "yearly"]);
const incomeShape = {
  name: z.string().min(1, "Name is required").max(80),
  amount: z.coerce.number().nullable().optional(),
  currency: z.string().min(1).max(8).default("USD"),
  frequency: incomeFrequency,
  next_date: z.string().min(10),
  account_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  active: z.boolean().default(true),
  notes: z.string().max(500).nullable().optional(),
  anchor_date: z.string().min(10).nullable().optional(),
  semimonthly_day_1: z.coerce.number().int().min(1).max(31).nullable().optional(),
  semimonthly_day_2: z.coerce.number().int().min(1).max(31).nullable().optional(),
  is_variable: z.boolean().default(false),
  start_date: z.string().min(10).nullable().optional(),
  end_date: z.string().min(10).nullable().optional(),
};
const incomeRefine = <T extends z.ZodTypeAny>(schema: T) =>
  schema.superRefine((v: any, ctx) => {
    if (!v.is_variable && (v.amount == null || Number.isNaN(v.amount))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amount"], message: "Amount required unless variable" });
    }
    if (v.frequency === "semimonthly") {
      if (v.semimonthly_day_1 == null || v.semimonthly_day_2 == null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["semimonthly_day_1"], message: "Semi-monthly needs two days (1–31)" });
      } else if (v.semimonthly_day_1 === v.semimonthly_day_2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["semimonthly_day_2"], message: "Days must differ" });
      }
    }
  });
const incomeInput = incomeRefine(z.object(incomeShape));
const incomeUpdateInput = incomeRefine(z.object({ ...incomeShape, id: z.string().uuid() }));

function mapIncome(r: any): RecurringIncome {
  return {
    id: r.id,
    name: r.name,
    amount: r.amount == null ? null : n(r.amount),
    currency: r.currency,
    frequency: r.frequency,
    next_date: d(r.next_date),
    account_id: r.account_id,
    category_id: r.category_id,
    active: !!r.active,
    notes: s(r.notes),
    anchor_date: dOrNull(r.anchor_date),
    semimonthly_day_1: r.semimonthly_day_1 == null ? null : Number(r.semimonthly_day_1),
    semimonthly_day_2: r.semimonthly_day_2 == null ? null : Number(r.semimonthly_day_2),
    is_variable: !!r.is_variable,
    start_date: dOrNull(r.start_date),
    end_date: dOrNull(r.end_date),
  };
}

export const listRecurringIncome = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const sql = await db();
  const rows = (await sql`
    SELECT id, name, amount, currency, frequency, next_date, account_id, category_id, active, notes,
           anchor_date, semimonthly_day_1, semimonthly_day_2, is_variable, start_date, end_date
    FROM recurring_income ORDER BY name`) as any[];
  return rows.map(mapIncome);
});

export const createRecurringIncome = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => incomeInput.parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    // Biweekly: if no anchor given, use next_date as the anchor for the 14-day cycle.
    const anchor = data.frequency === "biweekly" ? (data.anchor_date ?? data.next_date) : (data.anchor_date ?? null);
    const amt = data.is_variable ? null : data.amount ?? 0;
    try {
      const rows = (await sql`
        INSERT INTO recurring_income
          (name, amount, currency, frequency, next_date, account_id, category_id, active, notes,
           anchor_date, semimonthly_day_1, semimonthly_day_2, is_variable, start_date, end_date)
        VALUES (${data.name}, ${amt}, ${data.currency}, ${data.frequency}, ${data.next_date},
                ${data.account_id ?? null}, ${data.category_id ?? null}, ${data.active}, ${data.notes ?? null},
                ${anchor}, ${data.semimonthly_day_1 ?? null}, ${data.semimonthly_day_2 ?? null}, ${data.is_variable},
                ${data.start_date ?? null}, ${data.end_date ?? null})
        RETURNING id`) as any[];
      return { id: rows[0].id as string };
    } catch (err) {
      throw new Error(`Failed to save income source: ${(err as Error).message}`);
    }
  });

export const updateRecurringIncome = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => incomeUpdateInput.parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const anchor = data.frequency === "biweekly" ? (data.anchor_date ?? data.next_date) : (data.anchor_date ?? null);
    const amt = data.is_variable ? null : data.amount ?? 0;
    try {
      await sql`
        UPDATE recurring_income SET name = ${data.name}, amount = ${amt}, currency = ${data.currency},
          frequency = ${data.frequency}, next_date = ${data.next_date},
          account_id = ${data.account_id ?? null}, category_id = ${data.category_id ?? null},
          active = ${data.active}, notes = ${data.notes ?? null},
          anchor_date = ${anchor},
          semimonthly_day_1 = ${data.semimonthly_day_1 ?? null},
          semimonthly_day_2 = ${data.semimonthly_day_2 ?? null},
          is_variable = ${data.is_variable},
          start_date = ${data.start_date ?? null},
          end_date = ${data.end_date ?? null}
        WHERE id = ${data.id}`;
      // Purge stale, unpaid instances that fall outside the new start/end window
      // so previously-materialized months don't show ghost rows.
      if (data.start_date) {
        await sql`DELETE FROM income_instances
          WHERE recurring_income_id = ${data.id}
            AND expected_date < ${data.start_date}
            AND transaction_id IS NULL
            AND status = 'expected'`;
      }
      if (data.end_date) {
        await sql`DELETE FROM income_instances
          WHERE recurring_income_id = ${data.id}
            AND expected_date > ${data.end_date}
            AND transaction_id IS NULL
            AND status = 'expected'`;
      }
      return { ok: true };
    } catch (err) {
      throw new Error(`Failed to update income source: ${(err as Error).message}`);
    }
  });

export const deleteRecurringIncome = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`DELETE FROM recurring_income WHERE id = ${data.id}`;
    return { ok: true };
  });

// Kept for backward compatibility with any old callers. The UI no longer uses it.
export const logRecurringIncomeReceived = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      id: z.string().uuid(),
      on_date: z.string().min(10),
      account_id: z.string().uuid().nullable().optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const rows = (await sql`SELECT id, name, amount, currency, frequency, next_date, account_id, category_id FROM recurring_income WHERE id = ${data.id}`) as any[];
    if (rows.length === 0) throw new Error("Recurring income not found");
    const inc = rows[0];
    const accountId = data.account_id ?? inc.account_id;
    if (!accountId) throw new Error("Pick an account to deposit into");
    const amt = inc.amount == null ? 0 : n(inc.amount);
    await sql`
      INSERT INTO transactions (on_date, account_id, category_id, kind, amount, currency, notes)
      VALUES (${data.on_date}, ${accountId}, ${inc.category_id ?? null}, 'income', ${amt}, ${inc.currency}, ${`Income: ${inc.name}`})`;
    return { ok: true };
  });

// -------------------------- Income date math --------------------------
// All helpers work on ISO YYYY-MM-DD strings in UTC to avoid tz drift.
function isoToUTC(iso: string): Date {
  const [y, m, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}
function utcToIso(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}
function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}
function addDays(iso: string, n: number): string {
  const dt = isoToUTC(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return utcToIso(dt);
}

// Enumerate all expected pay dates that fall inside [monthStart, monthEnd] (inclusive)
// for the given income source. Returns ISO date strings.
export function enumerateIncomeDatesInMonth(inc: {
  frequency: RecurringIncome["frequency"];
  next_date: string;
  anchor_date: string | null;
  semimonthly_day_1: number | null;
  semimonthly_day_2: number | null;
}, monthIso: string): string[] {
  const monthStart = monthIso; // YYYY-MM-01
  const [y, m] = monthStart.split("-").map(Number);
  const monthEndDay = daysInMonth(y, m);
  const monthEnd = `${monthStart.slice(0, 7)}-${String(monthEndDay).padStart(2, "0")}`;
  const out: string[] = [];

  if (inc.frequency === "semimonthly") {
    const d1 = Math.min(inc.semimonthly_day_1 ?? 1, monthEndDay);
    const d2 = Math.min(inc.semimonthly_day_2 ?? monthEndDay, monthEndDay);
    const iso1 = `${monthStart.slice(0, 7)}-${String(d1).padStart(2, "0")}`;
    const iso2 = `${monthStart.slice(0, 7)}-${String(d2).padStart(2, "0")}`;
    // Deduplicate + sort in case both days clamp to the same last day.
    return Array.from(new Set([iso1, iso2])).sort();
  }

  if (inc.frequency === "biweekly") {
    const anchor = inc.anchor_date ?? inc.next_date;
    // Walk forward or backward from anchor in 14-day steps until we enter the month.
    let cursor = anchor;
    if (cursor < monthStart) {
      const anchorDt = isoToUTC(anchor);
      const monthStartDt = isoToUTC(monthStart);
      const diffDays = Math.floor((monthStartDt.getTime() - anchorDt.getTime()) / 86400000);
      const skip = Math.floor(diffDays / 14) * 14;
      cursor = addDays(anchor, skip);
      while (cursor < monthStart) cursor = addDays(cursor, 14);
    } else {
      while (addDays(cursor, -14) >= monthStart) cursor = addDays(cursor, -14);
    }
    while (cursor <= monthEnd) {
      out.push(cursor);
      cursor = addDays(cursor, 14);
    }
    return out;
  }

  // weekly / monthly / quarterly / yearly: walk from next_date.
  let cursor = inc.next_date;
  const stepUnit: "days" | "months" | "years" =
    inc.frequency === "weekly" ? "days" : inc.frequency === "yearly" ? "years" : "months";
  const stepQty = inc.frequency === "weekly" ? 7 : inc.frequency === "quarterly" ? 3 : inc.frequency === "yearly" ? 1 : 1;

  const advance = (iso: string): string => {
    if (stepUnit === "days") return addDays(iso, stepQty);
    const dt = isoToUTC(iso);
    if (stepUnit === "months") dt.setUTCMonth(dt.getUTCMonth() + stepQty);
    else dt.setUTCFullYear(dt.getUTCFullYear() + stepQty);
    return utcToIso(dt);
  };
  const rewind = (iso: string): string => {
    if (stepUnit === "days") return addDays(iso, -stepQty);
    const dt = isoToUTC(iso);
    if (stepUnit === "months") dt.setUTCMonth(dt.getUTCMonth() - stepQty);
    else dt.setUTCFullYear(dt.getUTCFullYear() - stepQty);
    return utcToIso(dt);
  };

  while (cursor > monthEnd) cursor = rewind(cursor);
  while (cursor < monthStart) cursor = advance(cursor);
  while (cursor <= monthEnd) {
    out.push(cursor);
    cursor = advance(cursor);
  }
  return out;
}

// -------------------------- Income instances --------------------------
async function materializeIncomeMonth(sqlAny: any, monthIso: string): Promise<void> {
  const sources = (await sqlAny`
    SELECT id, name, currency, frequency, next_date, amount, anchor_date, semimonthly_day_1, semimonthly_day_2, is_variable, start_date, end_date
    FROM recurring_income WHERE active = true`) as any[];
  for (const src of sources) {
    const startDate = src.start_date ? d(src.start_date) : null;
    const endDate = src.end_date ? d(src.end_date) : null;
    const dates = enumerateIncomeDatesInMonth(
      {
        frequency: src.frequency,
        next_date: d(src.next_date),
        anchor_date: dOrNull(src.anchor_date),
        semimonthly_day_1: src.semimonthly_day_1 == null ? null : Number(src.semimonthly_day_1),
        semimonthly_day_2: src.semimonthly_day_2 == null ? null : Number(src.semimonthly_day_2),
      },
      monthIso,
    ).filter((iso) => (!startDate || iso >= startDate) && (!endDate || iso <= endDate));
    for (const dateIso of dates) {
      const expectedAmt = src.is_variable ? null : (src.amount == null ? null : n(src.amount));
      // Rely on the partial unique index (recurring_income_id, expected_date).
      await sqlAny`
        INSERT INTO income_instances
          (recurring_income_id, expected_date, name_snapshot, expected_amount, currency, status)
        VALUES (${src.id}, ${dateIso}, ${src.name}, ${expectedAmt}, ${src.currency}, 'expected')
        ON CONFLICT (recurring_income_id, expected_date) WHERE recurring_income_id IS NOT NULL DO NOTHING`;
    }
  }
}

export const getIncome = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    return loadIncome(sql, data.month);
  });

async function loadIncome(sql: any, month: string) {
    const data = { month };
    const monthIso = `${data.month}-01`;
    await materializeIncomeMonth(sql, monthIso);
    const monthEndDay = daysInMonth(Number(data.month.slice(0, 4)), Number(data.month.slice(5, 7)));
    const monthEndIso = `${data.month}-${String(monthEndDay).padStart(2, "0")}`;
    const rows = (await sql`
      SELECT ii.id, ii.recurring_income_id, ii.expected_date, ii.name_snapshot, ii.expected_amount,
             ii.currency, ii.status, ii.transaction_id, ii.received_amount, ii.notes,
             ri.frequency, ri.is_variable,
             t.on_date AS tx_date, t.amount AS tx_amount
      FROM income_instances ii
      LEFT JOIN recurring_income ri ON ri.id = ii.recurring_income_id
      LEFT JOIN transactions t ON t.id = ii.transaction_id
      WHERE ii.expected_date >= ${monthIso}::date AND ii.expected_date <= ${monthEndIso}::date
      ORDER BY ii.expected_date, ii.name_snapshot`) as any[];
    const instances: IncomeInstance[] = rows.map((r) => ({
      id: r.id,
      recurring_income_id: r.recurring_income_id,
      expected_date: d(r.expected_date),
      name: r.name_snapshot,
      expected_amount: r.expected_amount == null ? null : n(r.expected_amount),
      currency: r.currency,
      status: r.status,
      transaction_id: r.transaction_id,
      received_amount: r.received_amount == null ? (r.tx_amount == null ? null : n(r.tx_amount)) : n(r.received_amount),
      transaction_date: r.tx_date == null ? null : d(r.tx_date),
      notes: s(r.notes),
      frequency: r.frequency ?? null,
      is_variable: !!r.is_variable,
    }));
    const expectedTotal = instances
      .filter((i) => i.status !== "skipped" && i.expected_amount != null)
      .reduce((a, b) => a + (b.expected_amount ?? 0), 0);
    const receivedTotal = instances
      .filter((i) => i.status === "received")
      .reduce((a, b) => a + (b.received_amount ?? 0), 0);
    // Every income transaction this month, matched to an expected payment or not (Home uses the same figure).
    const allRows = (await sql`
      SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n FROM transactions
      WHERE kind = 'income' AND on_date >= ${monthIso}::date AND on_date <= ${monthEndIso}::date`) as any[];
    const matchedIds = new Set(instances.map((i) => i.transaction_id).filter(Boolean));
    const unmatchedRows = (await sql`
      SELECT id FROM transactions
      WHERE kind = 'income' AND on_date >= ${monthIso}::date AND on_date <= ${monthEndIso}::date`) as any[];
    const unmatchedCount = unmatchedRows.filter((r) => !matchedIds.has(r.id)).length;
    return {
      month: data.month, instances, expectedTotal, receivedTotal,
      receivedAll: n(allRows[0]?.total), unmatchedCount,
    };
}

export const updateIncomeInstance = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      id: z.string().uuid(),
      expected_amount: z.coerce.number().nullable().optional(),
      status: z.enum(["expected", "received", "skipped"]).optional(),
      notes: z.string().max(500).nullable().optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const cur = (await sql`SELECT expected_amount, status, notes FROM income_instances WHERE id = ${data.id}`) as any[];
    if (cur.length === 0) throw new Error("Income instance not found");
    const expected = data.expected_amount === undefined ? cur[0].expected_amount : data.expected_amount;
    const status = data.status ?? cur[0].status;
    const notes = data.notes === undefined ? cur[0].notes : data.notes;
    await sql`
      UPDATE income_instances
      SET expected_amount = ${expected}, status = ${status},
          transaction_id = CASE WHEN ${status} = 'received' THEN transaction_id ELSE NULL END,
          received_amount = CASE WHEN ${status} = 'received' THEN received_amount ELSE NULL END,
          notes = ${notes}
      WHERE id = ${data.id}`;
    return { ok: true };
  });

export const linkTransactionToIncome = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      instance_id: z.string().uuid(),
      transaction_id: z.string().uuid(),
      received_amount: z.coerce.number().nullable().optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    // A transaction can only be linked to one income instance at a time.
    await sql`UPDATE income_instances SET transaction_id = NULL, status = 'expected', received_amount = NULL WHERE transaction_id = ${data.transaction_id} AND id <> ${data.instance_id}`;
    let amt: number | null = data.received_amount ?? null;
    if (amt == null) {
      const t = (await sql`SELECT amount FROM transactions WHERE id = ${data.transaction_id}`) as any[];
      if (t.length === 0) throw new Error("Transaction not found");
      amt = n(t[0].amount);
    }
    await sql`
      UPDATE income_instances
      SET transaction_id = ${data.transaction_id}, status = 'received', received_amount = ${amt}
      WHERE id = ${data.instance_id}`;
    return { ok: true };
  });

export const unlinkIncomeInstance = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`UPDATE income_instances SET transaction_id = NULL, status = 'expected', received_amount = NULL WHERE id = ${data.id}`;
    return { ok: true };
  });

// Direct entry: mark an income instance received by creating (or updating in
// place) a real income Transaction against a chosen account. This is the only
// path that moves account balances — a status flag alone would not.
export const receiveIncomeDirect = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      instance_id: z.string().uuid(),
      account_id: z.string().uuid(),
      amount: z.coerce.number().positive("Amount must be greater than 0"),
      on_date: z.string().min(10).optional(),
      notes: z.string().max(500).nullable().optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const instRows = (await sql`
      SELECT ii.id, ii.recurring_income_id, ii.expected_date, ii.currency, ii.transaction_id,
             ri.category_id AS src_category_id
      FROM income_instances ii
      LEFT JOIN recurring_income ri ON ri.id = ii.recurring_income_id
      WHERE ii.id = ${data.instance_id}`) as any[];
    if (instRows.length === 0) throw new Error("Income instance not found");
    const inst = instRows[0];
    const onDate = data.on_date ?? d(inst.expected_date);
    const notes = data.notes ?? null;

    let txId: string | null = inst.transaction_id ?? null;
    if (txId) {
      await sql`
        UPDATE transactions
        SET on_date = ${onDate}, account_id = ${data.account_id},
            amount = ${data.amount}, currency = ${inst.currency},
            notes = ${notes}
        WHERE id = ${txId}`;
    } else {
      const rows = (await sql`
        INSERT INTO transactions (on_date, account_id, category_id, kind, amount, currency, notes)
        VALUES (${onDate}, ${data.account_id}, ${inst.src_category_id ?? null}, 'income',
                ${data.amount}, ${inst.currency}, ${notes})
        RETURNING id`) as any[];
      txId = rows[0].id as string;
    }
    await sql`
      UPDATE income_instances
      SET transaction_id = ${txId}, status = 'received', received_amount = ${data.amount}
      WHERE id = ${data.instance_id}`;
    return { ok: true, transaction_id: txId };
  });

// Direct entry: mark a monthly-expense instance paid by creating (or updating
// in place) a real expense Transaction against a chosen account.
export const payExpenseDirect = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      instance_id: z.string().uuid(),
      account_id: z.string().uuid(),
      amount: z.coerce.number().positive("Amount must be greater than 0"),
      on_date: z.string().min(10).optional(),
      notes: z.string().max(500).nullable().optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const instRows = (await sql`
      SELECT id, month, category_id, currency, transaction_id
      FROM monthly_expense_instances WHERE id = ${data.instance_id}`) as any[];
    if (instRows.length === 0) throw new Error("Expense instance not found");
    const inst = instRows[0];
    const onDate = data.on_date ?? d(inst.month);
    const notes = data.notes ?? null;

    let txId: string | null = inst.transaction_id ?? null;
    if (txId) {
      await sql`
        UPDATE transactions
        SET on_date = ${onDate}, account_id = ${data.account_id},
            category_id = ${inst.category_id ?? null},
            amount = ${data.amount}, currency = ${inst.currency},
            notes = ${notes}
        WHERE id = ${txId}`;
    } else {
      const rows = (await sql`
        INSERT INTO transactions (on_date, account_id, category_id, kind, amount, currency, notes)
        VALUES (${onDate}, ${data.account_id}, ${inst.category_id ?? null}, 'expense',
                ${data.amount}, ${inst.currency}, ${notes})
        RETURNING id`) as any[];
      txId = rows[0].id as string;
    }
    await sql`
      UPDATE monthly_expense_instances
      SET transaction_id = ${txId}, status = 'paid'
      WHERE id = ${data.instance_id}`;
    return { ok: true, transaction_id: txId };
  });




// -------------------------- Debts --------------------------
// How balances work:
// - When you enter or change a debt's balance, that figure is saved as the "anchor" with the
//   date it's accurate as of (balance_as_of in the form, default today).
// - The live balance is always recomputed from the anchor: interest accrues daily at the APR
//   (or promo APR) between payments, and each payment logged after the anchor reduces it.
// - Editing or deleting a payment, or changing the APR, just recomputes from the anchor.
const debtInput = z.object({
  name: z.string().min(1).max(80),
  balance: z.coerce.number().min(0).default(0),
  balance_as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  min_payment: z.coerce.number().min(0).default(0),
  extra_payment: z.coerce.number().min(0).default(0),
  apr: z.coerce.number().min(0).max(100).default(0),
  promo_apr: z.coerce.number().min(0).max(100).nullable().optional(),
  promo_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  due_day: z.coerce.number().int().min(1).max(31).nullable().optional(),
  currency: z.string().min(1).max(8).default("USD"),
  notes: z.string().max(500).nullable().optional(),
  original_balance: z.coerce.number().positive().nullable().optional(),
  start_date: z.string().nullable().optional(),
});

const round2 = (x: number) => Math.round(x * 100) / 100;

async function recomputeDebt(sql: any, debtId: string) {
  const rows = (await sql`
    SELECT balance, anchor_balance, anchor_date, apr, promo_apr, promo_end_date, paid_off_at
    FROM debts WHERE id = ${debtId}`) as any[];
  if (rows.length === 0) return;
  const r = rows[0];
  const anchorDate = dOrNull(r.anchor_date) ?? new Date().toISOString().slice(0, 10);
  const pays = (await sql`
    SELECT p.amount, p.payment_date FROM debt_payments p JOIN debts dd ON dd.id = p.debt_id
    WHERE p.debt_id = ${debtId}
      AND (p.payment_date > dd.anchor_date
           OR (p.payment_date = dd.anchor_date AND p.created_at > dd.anchor_set_at))
    ORDER BY p.payment_date, p.created_at`) as any[];
  const res = replayBalance(
    n(r.anchor_balance ?? r.balance),
    anchorDate,
    pays.map((p) => ({ amount: n(p.amount), date: d(p.payment_date) })),
    { apr: n(r.apr), promoApr: r.promo_apr == null ? null : n(r.promo_apr), promoEndDate: dOrNull(r.promo_end_date) },
  );
  const bal = Math.max(0, round2(res.balance));
  const paidOff = bal <= 0 ? (dOrNull(r.paid_off_at) ?? res.paidOffOn ?? res.asOf) : null;
  await sql`UPDATE debts SET balance = ${bal}, balance_as_of = ${res.asOf}, paid_off_at = ${paidOff} WHERE id = ${debtId}`;
}

export const listDebts = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const sql = await db();
  const rows = (await sql`
    SELECT id, name, balance, min_payment, apr, due_day, currency, notes, original_balance, start_date, paid_off_at,
           promo_apr, promo_end_date, extra_payment, balance_as_of
    FROM debts ORDER BY paid_off_at NULLS FIRST, name`) as any[];
  return rows.map((r) => ({
    ...r,
    balance: n(r.balance),
    min_payment: n(r.min_payment),
    apr: n(r.apr),
    notes: s(r.notes),
    original_balance: r.original_balance == null ? null : n(r.original_balance),
    start_date: dOrNull(r.start_date),
    paid_off_at: dOrNull(r.paid_off_at),
    promo_apr: r.promo_apr == null ? null : n(r.promo_apr),
    promo_end_date: dOrNull(r.promo_end_date),
    extra_payment: n(r.extra_payment),
    balance_as_of: dOrNull(r.balance_as_of),
  })) as Debt[];
});

export const createDebt = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => debtInput.parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    try {
      const asOf = data.balance_as_of || new Date().toISOString().slice(0, 10);
      const rows = (await sql`
        INSERT INTO debts (name, balance, min_payment, extra_payment, apr, promo_apr, promo_end_date, due_day, currency, notes,
                           original_balance, start_date, anchor_balance, anchor_date, anchor_set_at, balance_as_of)
        VALUES (${data.name}, ${data.balance}, ${data.min_payment}, ${data.extra_payment}, ${data.apr},
                ${data.promo_apr ?? null}, ${data.promo_end_date || null}, ${data.due_day ?? null}, ${data.currency},
                ${data.notes ?? null}, ${data.original_balance ?? null}, ${data.start_date || null},
                ${data.balance}, ${asOf}, now(), ${asOf})
        RETURNING id`) as any[];
      await recomputeDebt(sql, rows[0].id);
      return { id: rows[0].id as string };
    } catch (err) {
      throw new Error(`Failed to save debt: ${(err as Error).message}`);
    }
  });

export const updateDebt = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => debtInput.extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    try {
      const cur = (await sql`SELECT balance, balance_as_of FROM debts WHERE id = ${data.id}`) as any[];
      if (cur.length === 0) throw new Error("This debt no longer exists.");
      const curAsOf = dOrNull(cur[0].balance_as_of);
      const newAsOf = data.balance_as_of || null;
      // A changed balance or as-of date means "this is the real balance now": reset the anchor.
      const resetAnchor = round2(data.balance) !== round2(n(cur[0].balance)) || (newAsOf != null && newAsOf !== curAsOf);
      await sql`
        UPDATE debts SET name = ${data.name}, min_payment = ${data.min_payment}, extra_payment = ${data.extra_payment},
          apr = ${data.apr}, promo_apr = ${data.promo_apr ?? null}, promo_end_date = ${data.promo_end_date || null},
          due_day = ${data.due_day ?? null}, currency = ${data.currency}, notes = ${data.notes ?? null},
          original_balance = ${data.original_balance ?? null}, start_date = ${data.start_date || null}
        WHERE id = ${data.id}`;
      if (resetAnchor) {
        const asOf = newAsOf ?? new Date().toISOString().slice(0, 10);
        await sql`
          UPDATE debts SET anchor_balance = ${data.balance}, anchor_date = ${asOf}, anchor_set_at = now(), paid_off_at = NULL
          WHERE id = ${data.id}`;
      }
      await recomputeDebt(sql, data.id);
      return { ok: true };
    } catch (err) {
      throw new Error(`Failed to update debt: ${(err as Error).message}`);
    }
  });

export const deleteDebt = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`DELETE FROM debts WHERE id = ${data.id}`;
    return { ok: true };
  });

// -------------------------- Debt payments --------------------------
export const listDebtPayments = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ debt_id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const rows = (await sql`
      SELECT id, debt_id, amount, payment_date, note, account_id, transaction_id
      FROM debt_payments WHERE debt_id = ${data.debt_id} ORDER BY payment_date DESC, created_at DESC`) as any[];
    return rows.map((r) => ({
      ...r,
      amount: n(r.amount),
      payment_date: d(r.payment_date),
      note: s(r.note),
    })) as DebtPayment[];
  });

export const createDebtPayment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      debt_id: z.string().uuid(),
      amount: z.coerce.number().positive("Amount must be greater than 0"),
      payment_date: z.string().min(10),
      note: z.string().max(500).nullable().optional(),
      account_id: z.string().uuid().nullable().optional(),
      category_id: z.string().uuid().nullable().optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    try {
      const debtRows = (await sql`SELECT name, currency FROM debts WHERE id = ${data.debt_id}`) as any[];
      if (debtRows.length === 0) throw new Error("Debt not found");
      const debt = debtRows[0];

      let transactionId: string | null = null;
      if (data.account_id) {
        const txRows = (await sql`
          INSERT INTO transactions (on_date, account_id, category_id, kind, amount, currency, notes)
          VALUES (${data.payment_date}, ${data.account_id}, ${data.category_id ?? null}, 'expense', ${data.amount}, ${debt.currency}, ${`Debt payment: ${debt.name}`})
          RETURNING id`) as any[];
        transactionId = txRows[0].id;
      }

      await sql`
        INSERT INTO debt_payments (debt_id, amount, payment_date, note, account_id, transaction_id)
        VALUES (${data.debt_id}, ${data.amount}, ${data.payment_date}, ${data.note ?? null}, ${data.account_id ?? null}, ${transactionId})`;

      await recomputeDebt(sql, data.debt_id);
      return { ok: true };
    } catch (err) {
      throw new Error(`Failed to log payment: ${(err as Error).message}`);
    }
  });

export const updateDebtPayment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      id: z.string().uuid(),
      amount: z.coerce.number().positive(),
      payment_date: z.string().min(10),
      note: z.string().max(500).nullable().optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const prev = (await sql`SELECT debt_id, transaction_id FROM debt_payments WHERE id = ${data.id}`) as any[];
    if (prev.length === 0) throw new Error("Payment not found");
    const p = prev[0];
    await sql`UPDATE debt_payments SET amount = ${data.amount}, payment_date = ${data.payment_date}, note = ${data.note ?? null} WHERE id = ${data.id}`;
    if (p.transaction_id) {
      await sql`UPDATE transactions SET amount = ${data.amount}, on_date = ${data.payment_date} WHERE id = ${p.transaction_id}`;
    }
    await recomputeDebt(sql, p.debt_id);
    return { ok: true };
  });

export const deleteDebtPayment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const prev = (await sql`SELECT debt_id, transaction_id FROM debt_payments WHERE id = ${data.id}`) as any[];
    if (prev.length === 0) return { ok: true };
    const p = prev[0];
    await sql`DELETE FROM debt_payments WHERE id = ${data.id}`;
    if (p.transaction_id) await sql`DELETE FROM transactions WHERE id = ${p.transaction_id}`;
    await recomputeDebt(sql, p.debt_id);
    return { ok: true };
  });

// -------------------------- Goals --------------------------
// Progress is real money: a manual starting baseline (saved_amount) plus the
// sum of every transaction tagged to the goal. Contributions are computed live
// from the transactions table, never stored.
const goalInput = z.object({
  name: z.string().min(1).max(80),
  target_amount: z.coerce.number().default(0),
  saved_amount: z.coerce.number().default(0),
  target_date: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  account_id: z.string().uuid().nullable().optional(),
});

export const listGoals = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const sql = await db();
  const rows = (await sql`
    SELECT g.id, g.name, g.target_amount, g.saved_amount, g.target_date, g.notes, g.account_id,
      a.name AS account_name,
      COALESCE((
        SELECT SUM(CASE WHEN t.kind = 'expense' THEN -t.amount ELSE t.amount END)
        FROM transactions t WHERE t.goal_id = g.id), 0) AS contributed_amount
    FROM goals g
    LEFT JOIN accounts a ON a.id = g.account_id
    ORDER BY g.name`) as any[];
  return rows.map((r) => ({
    ...r,
    target_amount: n(r.target_amount),
    saved_amount: n(r.saved_amount),
    contributed_amount: n(r.contributed_amount),
    progress_amount: n(r.saved_amount) + n(r.contributed_amount),
    target_date: r.target_date ? d(r.target_date) : null,
    notes: s(r.notes),
    account_name: s(r.account_name),
  })) as Goal[];
});

// Transactions tagged to each goal, so they can be reviewed / untagged.
export const listGoalContributions = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const sql = await db();
  const rows = (await sql`
    SELECT t.id, t.goal_id, t.on_date, t.kind, t.amount, t.currency, t.notes,
           a.name AS account_name
    FROM transactions t
    LEFT JOIN accounts a ON a.id = t.account_id
    WHERE t.goal_id IS NOT NULL
    ORDER BY t.on_date DESC`) as any[];
  return rows.map((r) => ({
    id: r.id as string,
    goal_id: r.goal_id as string,
    on_date: d(r.on_date),
    kind: r.kind as Transaction["kind"],
    amount: n(r.amount),
    currency: String(r.currency),
    notes: s(r.notes),
    account_name: s(r.account_name),
  }));
});

// Tag / untag a transaction as contributing to a goal.
export const setTransactionGoal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      transaction_id: z.string().uuid(),
      goal_id: z.string().uuid().nullable(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const rows = (await sql`
      UPDATE transactions SET goal_id = ${data.goal_id}
      WHERE id = ${data.transaction_id} RETURNING id`) as any[];
    if (rows.length === 0) throw new Error("Transaction not found");
    return { ok: true };
  });

export const createGoal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => goalInput.parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const rows = (await sql`
      INSERT INTO goals (name, target_amount, saved_amount, target_date, notes, account_id)
      VALUES (${data.name}, ${data.target_amount}, ${data.saved_amount}, ${data.target_date || null}, ${data.notes ?? null}, ${data.account_id ?? null})
      RETURNING id`) as any[];
    return { id: rows[0].id as string };
  });

export const updateGoal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => goalInput.extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`
      UPDATE goals SET name = ${data.name}, target_amount = ${data.target_amount},
        saved_amount = ${data.saved_amount}, target_date = ${data.target_date || null},
        notes = ${data.notes ?? null}, account_id = ${data.account_id ?? null}
      WHERE id = ${data.id}`;
    return { ok: true };
  });

export const deleteGoal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`DELETE FROM goals WHERE id = ${data.id}`;
    return { ok: true };
  });

// -------------------------- Net worth snapshots --------------------------
const nwInput = z.object({
  on_date: z.string().min(10),
  assets_total: z.coerce.number().default(0),
  debts_total: z.coerce.number().default(0),
  notes: z.string().max(500).nullable().optional(),
});

export const listNetWorth = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const sql = await db();
  const rows = (await sql`SELECT id, on_date, assets_total, debts_total, net_worth, notes FROM net_worth_snapshots ORDER BY on_date DESC`) as any[];
  return rows.map((r) => ({
    ...r,
    on_date: d(r.on_date),
    assets_total: n(r.assets_total),
    debts_total: n(r.debts_total),
    net_worth: n(r.net_worth),
    notes: s(r.notes),
  })) as NetWorthSnapshot[];
});

export const createNetWorth = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => nwInput.parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const net = data.assets_total - data.debts_total;
    const rows = (await sql`
      INSERT INTO net_worth_snapshots (on_date, assets_total, debts_total, net_worth, notes)
      VALUES (${data.on_date}, ${data.assets_total}, ${data.debts_total}, ${net}, ${data.notes ?? null})
      RETURNING id`) as any[];
    return { id: rows[0].id as string };
  });

export const deleteNetWorth = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`DELETE FROM net_worth_snapshots WHERE id = ${data.id}`;
    return { ok: true };
  });

// -------------------------- FX --------------------------
const fxInput = z.object({
  base: z.string().min(1).max(8),
  quote: z.string().min(1).max(8),
  rate: z.coerce.number().positive(),
  as_of: z.string().min(10),
});

export const listFxRates = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const sql = await db();
  const rows = (await sql`SELECT id, base, quote, rate, as_of FROM fx_rates ORDER BY as_of DESC, base, quote`) as any[];
  return rows.map((r) => ({ ...r, rate: n(r.rate), as_of: d(r.as_of) })) as FxRate[];
});

export const upsertFxRate = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => fxInput.parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`
      INSERT INTO fx_rates (base, quote, rate, as_of)
      VALUES (${data.base.toUpperCase()}, ${data.quote.toUpperCase()}, ${data.rate}, ${data.as_of})
      ON CONFLICT (base, quote, as_of) DO UPDATE SET rate = EXCLUDED.rate`;
    return { ok: true };
  });

export const deleteFxRate = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`DELETE FROM fx_rates WHERE id = ${data.id}`;
    return { ok: true };
  });

// FX helper: build a rate map keyed by from->to => rate (latest as_of wins).
// Handles direct rates, identity, and inverse.
type RateMap = Map<string, number>;

async function loadRateMap(sql: any): Promise<RateMap> {
  const rows = (await sql`
    SELECT DISTINCT ON (base, quote) base, quote, rate
    FROM fx_rates
    ORDER BY base, quote, as_of DESC`) as any[];
  const map: RateMap = new Map();
  for (const r of rows) {
    const rate = n(r.rate);
    map.set(`${r.base}->${r.quote}`, rate);
    if (rate !== 0 && !map.has(`${r.quote}->${r.base}`)) {
      map.set(`${r.quote}->${r.base}`, 1 / rate);
    }
  }
  return map;
}

export function convertToBase(amount: number, from: string, base: string, rates: RateMap): { value: number; converted: boolean } {
  if (!from || from.toUpperCase() === base.toUpperCase()) return { value: amount, converted: true };
  const r = rates.get(`${from.toUpperCase()}->${base.toUpperCase()}`);
  if (r == null) return { value: amount, converted: false };
  return { value: amount * r, converted: true };
}

// Compute live net worth from accounts + transactions, converted to base currency.
export const getLiveNetWorth = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const sql = await db();
  const [settingsRows, accts, txSums, debts, rates] = await Promise.all([
    sql`SELECT base_currency FROM app_settings LIMIT 1` as Promise<any[]>,
    // Credit cards are tracked as debts (Debts page), so they are left out here to avoid counting them twice.
    sql`SELECT id, name, currency, opening_balance, kind FROM accounts WHERE archived = false AND kind <> 'credit'` as Promise<any[]>,
    sql`
      SELECT account_id, kind, SUM(amount) AS total
      FROM transactions GROUP BY account_id, kind` as Promise<any[]>,
    sql`SELECT balance, currency FROM debts WHERE paid_off_at IS NULL` as Promise<any[]>,
    loadRateMap(await db()),
  ]);
  const base = String(settingsRows[0]?.base_currency ?? "USD");

  // Per-account net (opening + income - expense + transferIn - transferOut is complex; use simplified).
  const deltaByAccount = new Map<string, { income: number; expense: number; transferIn: number; transferOut: number }>();
  for (const t of txSums) {
    const cur = deltaByAccount.get(t.account_id) ?? { income: 0, expense: 0, transferIn: 0, transferOut: 0 };
    if (t.kind === "income") cur.income += n(t.total);
    else if (t.kind === "expense") cur.expense += n(t.total);
    else if (t.kind === "transfer") cur.transferOut += n(t.total);
    deltaByAccount.set(t.account_id, cur);
  }
  // transferIn per destination:
  const inRows = (await sql`SELECT transfer_account_id, SUM(amount) AS total FROM transactions WHERE kind='transfer' AND transfer_account_id IS NOT NULL GROUP BY transfer_account_id`) as any[];
  for (const t of inRows) {
    const cur = deltaByAccount.get(t.transfer_account_id) ?? { income: 0, expense: 0, transferIn: 0, transferOut: 0 };
    cur.transferIn += n(t.total);
    deltaByAccount.set(t.transfer_account_id, cur);
  }

  let assets = 0;
  let unconverted = 0;
  for (const a of accts) {
    const dlt = deltaByAccount.get(a.id) ?? { income: 0, expense: 0, transferIn: 0, transferOut: 0 };
    const bal = n(a.opening_balance) + dlt.income - dlt.expense + dlt.transferIn - dlt.transferOut;
    const c = convertToBase(bal, a.currency, base, rates);
    if (!c.converted) unconverted++;
    assets += c.value;
  }
  let debtsTotal = 0;
  for (const dbt of debts) {
    const c = convertToBase(n(dbt.balance), dbt.currency, base, rates);
    if (!c.converted) unconverted++;
    debtsTotal += c.value;
  }
  return {
    base_currency: base,
    assets_total: Math.round(assets * 100) / 100,
    debts_total: Math.round(debtsTotal * 100) / 100,
    net_worth: Math.round((assets - debtsTotal) * 100) / 100,
    unconverted_count: unconverted,
  };
});

// -------------------------- Reminders --------------------------
const reminderInput = z.object({
  title: z.string().min(1).max(120),
  due_date: z.string().min(10),
  amount: z.coerce.number().nullable().optional(),
  account_id: z.string().uuid().nullable().optional(),
  done: z.boolean().default(false),
  notes: z.string().max(500).nullable().optional(),
});

export const listReminders = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const sql = await db();
  const rows = (await sql`SELECT id, title, due_date, amount, account_id, done, notes FROM reminders ORDER BY done, due_date`) as any[];
  return rows.map((r) => ({
    ...r,
    due_date: d(r.due_date),
    amount: r.amount == null ? null : n(r.amount),
    notes: s(r.notes),
  })) as Reminder[];
});

export const createReminder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => reminderInput.parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const rows = (await sql`
      INSERT INTO reminders (title, due_date, amount, account_id, done, notes)
      VALUES (${data.title}, ${data.due_date}, ${data.amount ?? null}, ${data.account_id ?? null}, ${data.done}, ${data.notes ?? null})
      RETURNING id`) as any[];
    return { id: rows[0].id as string };
  });

export const updateReminder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => reminderInput.extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`
      UPDATE reminders SET title = ${data.title}, due_date = ${data.due_date}, amount = ${data.amount ?? null},
        account_id = ${data.account_id ?? null}, done = ${data.done}, notes = ${data.notes ?? null}
      WHERE id = ${data.id}`;
    return { ok: true };
  });

export const deleteReminder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`DELETE FROM reminders WHERE id = ${data.id}`;
    return { ok: true };
  });

// -------------------------- Budget --------------------------
function mapInstance(r: any): MonthlyExpenseInstance {
  return {
    id: r.id,
    monthly_expense_id: r.monthly_expense_id,
    subscription_id: r.subscription_id ?? null,
    amount_overridden: !!r.amount_overridden,
    month: d(r.month),
    name: r.name_snapshot,
    account_id: r.eff_account_id ?? null,
    account_overridden: r.own_account_id != null,
    due_day: r.due_day == null ? null : Number(r.due_day),
    category_id: r.category_id,
    category_name: r.category_name,
    category_color: r.category_color,
    planned_amount: n(r.planned_amount),
    currency: r.currency,
    status: r.status,
    transaction_id: r.transaction_id,
    transaction_amount: r.tx_amount == null ? null : n(r.tx_amount),
    transaction_date: r.tx_date == null ? null : d(r.tx_date),
    is_ad_hoc: !!r.is_ad_hoc,
    notes: s(r.notes),
  };
}

export const getBudget = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM") }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    return loadBudget(sql, data.month);
  });

// Shared by the Budget page and Home: materializes this month's bills and returns groups.
async function loadBudget(sql: any, monthYm: string) {
    const monthDate = `${monthYm}-01`;

    const monthRows = (await sql`
      INSERT INTO budget_months (month) VALUES (${monthDate})
      ON CONFLICT (month) DO UPDATE SET month = EXCLUDED.month
      RETURNING id, month, notes`) as any[];
    const month = { id: monthRows[0].id as string, month: d(monthRows[0].month), notes: s(monthRows[0].notes) };

    const lines = (await sql`
      SELECT bl.id, bl.month_id, bl.category_id, bl.planned, bl.notes,
             c.name AS category_name, c.color AS category_color,
             COALESCE((
               SELECT SUM(t.amount) FROM transactions t
               WHERE t.kind = 'expense' AND t.category_id = bl.category_id
                 AND date_trunc('month', t.on_date) = date_trunc('month', ${monthDate}::date)
             ), 0) AS actual
      FROM budget_lines bl
      JOIN categories c ON c.id = bl.category_id
      WHERE bl.month_id = ${month.id}
      ORDER BY c.sort_order, c.name`) as any[];

    const lineIds = lines.map((l: any) => l.id as string);
    let itemsByLine = new Map<string, BudgetLineItem[]>();
    if (lineIds.length > 0) {
      const itemRows = (await sql`
        SELECT id, budget_line_id, name, amount, sort_order
        FROM budget_line_items WHERE budget_line_id = ANY(${lineIds})
        ORDER BY sort_order, created_at`) as any[];
      for (const r of itemRows) {
        const arr = itemsByLine.get(r.budget_line_id) ?? [];
        arr.push({ id: r.id, budget_line_id: r.budget_line_id, name: r.name, amount: n(r.amount), sort_order: r.sort_order });
        itemsByLine.set(r.budget_line_id, arr);
      }
    }

    // ---- Monthly Expenses: materialize instances for this month ----
    await sql`
      INSERT INTO monthly_expense_instances
        (monthly_expense_id, month, name_snapshot, category_id, planned_amount, currency, status, is_ad_hoc)
      SELECT me.id, ${monthDate}::date, me.name, me.category_id, me.default_amount, me.currency, 'pending', false
      FROM monthly_expenses me
      WHERE me.active = true
        AND (me.start_month IS NULL OR me.start_month <= ${monthDate}::date)
        AND (me.end_month IS NULL OR me.end_month >= ${monthDate}::date)
      ON CONFLICT (monthly_expense_id, month) WHERE monthly_expense_id IS NOT NULL DO NOTHING`;

    // ---- Subscriptions: materialize at their monthly-equivalent amount ----
    await sql`
      INSERT INTO monthly_expense_instances
        (subscription_id, month, name_snapshot, category_id, planned_amount, currency, status, is_ad_hoc)
      SELECT s.id, ${monthDate}::date, s.name, s.category_id,
             ROUND(CASE s.frequency
               WHEN 'weekly' THEN s.amount * 52 / 12
               WHEN 'quarterly' THEN s.amount / 3
               WHEN 'yearly' THEN s.amount / 12
               ELSE s.amount END, 2),
             s.currency, 'pending', false
      FROM subscriptions s
      WHERE s.active = true
        AND date_trunc('month', s.created_at)::date <= ${monthDate}::date
      ON CONFLICT (subscription_id, month) WHERE subscription_id IS NOT NULL DO NOTHING`;

    const instanceRows = (await sql`
      SELECT mei.id, mei.monthly_expense_id, mei.month, mei.name_snapshot, mei.category_id,
             mei.planned_amount, mei.currency, mei.status, mei.transaction_id, mei.is_ad_hoc, mei.notes,
             mei.subscription_id, mei.amount_overridden,
             mei.account_id AS own_account_id,
             COALESCE(mei.account_id, me.account_id, sub.account_id) AS eff_account_id,
             COALESCE(me.due_day, EXTRACT(DAY FROM sub.next_charge_date)::int) AS due_day,
             c.name AS category_name, c.color AS category_color,
             t.amount AS tx_amount, t.on_date AS tx_date
      FROM monthly_expense_instances mei
      LEFT JOIN categories c ON c.id = mei.category_id
      LEFT JOIN transactions t ON t.id = mei.transaction_id
      LEFT JOIN monthly_expenses me ON me.id = mei.monthly_expense_id
      LEFT JOIN subscriptions sub ON sub.id = mei.subscription_id
      WHERE mei.month = ${monthDate}::date
      ORDER BY c.sort_order NULLS LAST, c.name NULLS LAST, mei.name_snapshot`) as any[];

    const instances: MonthlyExpenseInstance[] = instanceRows.map(mapInstance);

    // Actuals-per-category from transactions this month.
    const actualsRows = (await sql`
      SELECT category_id, COALESCE(SUM(amount),0) AS total
      FROM transactions
      WHERE kind = 'expense'
        AND date_trunc('month', on_date) = date_trunc('month', ${monthDate}::date)
      GROUP BY category_id`) as any[];
    const actualByCat = new Map<string | null, number>();
    for (const r of actualsRows) actualByCat.set(r.category_id, n(r.total));

    // All expense categories (so a category with no instances/actuals still shows up if desired).
    const allCatsRows = (await sql`SELECT id, name, color, sort_order, monthly_limit, icon FROM categories WHERE kind = 'expense' AND archived = false ORDER BY sort_order, name`) as any[];
    const iconByCat = new Map<string, string | null>(allCatsRows.map((c) => [c.id as string, s(c.icon)]));

    const groupMap = new Map<string | null, BudgetGroup>();
    const upsertGroup = (id: string | null, name: string, color: string) => {
      if (!groupMap.has(id)) {
        groupMap.set(id, {
          category_id: id, category_name: name, category_color: color,
          category_icon: id ? (iconByCat.get(id) ?? null) : null,
          planned: 0, actual: 0, limit: null, limit_overridden: false, default_limit: null, instances: [],
        });
      }
      return groupMap.get(id)!;
    };

    for (const inst of instances) {
      const g = upsertGroup(inst.category_id, inst.category_name ?? "Uncategorized", inst.category_color ?? "#94a3b8");
      g.instances.push(inst);
      if (inst.status !== "paused" && inst.status !== "skipped") g.planned += inst.planned_amount;
    }
    for (const [catId, total] of actualByCat) {
      const cat = allCatsRows.find((c) => c.id === catId);
      const g = upsertGroup(catId, cat?.name ?? "Uncategorized", cat?.color ?? "#94a3b8");
      g.actual = total;
    }

    // Everyday spending limits. Each month starts from the category default (nothing carries
    // over); a budget_lines row for this month overrides it for this month only.
    const monthOverride = new Map<string, number>();
    for (const r of lines) {
      const items = itemsByLine.get(r.id) ?? [];
      // A typed limit (planned > 0) wins; an older itemized plan with no typed amount uses its items' sum.
      const typed = n(r.planned);
      monthOverride.set(r.category_id, typed === 0 && items.length > 0 ? items.reduce((acc, i) => acc + i.amount, 0) : typed);
    }
    for (const cat of allCatsRows) {
      const def = cat.monthly_limit == null ? null : n(cat.monthly_limit);
      const over = monthOverride.get(cat.id);
      const limit = over !== undefined ? over : def;
      if (limit == null) continue;
      const g = upsertGroup(cat.id, cat.name, cat.color);
      g.limit = limit;
      g.default_limit = def;
      g.limit_overridden = over !== undefined;
      g.planned += limit;
    }

    const groups = Array.from(groupMap.values()).sort((a, b) => {
      if (a.category_id === null) return 1;
      if (b.category_id === null) return -1;
      const ai = allCatsRows.findIndex((c) => c.id === a.category_id);
      const bi = allCatsRows.findIndex((c) => c.id === b.category_id);
      return (ai < 0 ? 1e9 : ai) - (bi < 0 ? 1e9 : bi);
    });

    return {
      month,
      groups,
      lines: lines.map((r: any) => {
        const items = itemsByLine.get(r.id) ?? [];
        const hasItems = items.length > 0;
        const planned = hasItems ? items.reduce((s, i) => s + i.amount, 0) : n(r.planned);
        return {
          id: r.id,
          month_id: r.month_id,
          category_id: r.category_id,
          category_name: r.category_name,
          category_color: r.category_color,
          planned,
          actual: n(r.actual),
          notes: s(r.notes),
          items,
          planned_from_items: hasItems,
        } as BudgetLine;
      }),
    };
}

export const upsertBudgetLine = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        month_id: z.string().uuid(),
        category_id: z.string().uuid(),
        planned: z.coerce.number(),
        notes: z.string().max(500).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`
      INSERT INTO budget_lines (month_id, category_id, planned, notes)
      VALUES (${data.month_id}, ${data.category_id}, ${data.planned}, ${data.notes ?? null})
      ON CONFLICT (month_id, category_id) DO UPDATE
        SET planned = EXCLUDED.planned, notes = EXCLUDED.notes`;
    return { ok: true };
  });

export const deleteBudgetLine = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`DELETE FROM budget_lines WHERE id = ${data.id}`;
    return { ok: true };
  });

// Everyday spending limit for one month. Spending starts fresh each month from the category's
// default limit; this sets (or clears) a one-month override without touching the default.
export const setMonthLimit = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      category_id: z.string().uuid(),
      /** null = remove the override and go back to the category default */
      limit: z.coerce.number().nonnegative().nullable(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const monthDate = `${data.month}-01`;
    const m = (await sql`
      INSERT INTO budget_months (month) VALUES (${monthDate})
      ON CONFLICT (month) DO UPDATE SET month = EXCLUDED.month
      RETURNING id`) as any[];
    const monthId = m[0].id as string;
    // Never deletes data that existed before limits: a plan row that has a sub-item breakdown
    // (from an older version of Keel) is left in place on reset, and its items are never removed.
    if (data.limit == null) {
      const del = (await sql`
        DELETE FROM budget_lines bl
        WHERE bl.month_id = ${monthId} AND bl.category_id = ${data.category_id}
          AND NOT EXISTS (SELECT 1 FROM budget_line_items i WHERE i.budget_line_id = bl.id)
        RETURNING bl.id`) as any[];
      const remaining = (await sql`SELECT 1 FROM budget_lines WHERE month_id = ${monthId} AND category_id = ${data.category_id}`) as any[];
      if (del.length === 0 && remaining.length > 0) {
        throw new Error("This month has an older itemized plan for this category, so it can't be reset. Type a new limit instead.");
      }
    } else {
      await sql`
        INSERT INTO budget_lines (month_id, category_id, planned)
        VALUES (${monthId}, ${data.category_id}, ${data.limit})
        ON CONFLICT (month_id, category_id) DO UPDATE SET planned = EXCLUDED.planned`;
    }
    return { ok: true };
  });

// Budget line items
export const createBudgetLineItem = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      budget_line_id: z.string().uuid(),
      name: z.string().min(1).max(80),
      amount: z.coerce.number().default(0),
      sort_order: z.coerce.number().int().default(0),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const rows = (await sql`
      INSERT INTO budget_line_items (budget_line_id, name, amount, sort_order)
      VALUES (${data.budget_line_id}, ${data.name}, ${data.amount}, ${data.sort_order})
      RETURNING id`) as any[];
    return { id: rows[0].id as string };
  });

export const updateBudgetLineItem = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(80),
      amount: z.coerce.number(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`UPDATE budget_line_items SET name = ${data.name}, amount = ${data.amount} WHERE id = ${data.id}`;
    return { ok: true };
  });

export const deleteBudgetLineItem = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`DELETE FROM budget_line_items WHERE id = ${data.id}`;
    return { ok: true };
  });

// -------------------------- Dashboard --------------------------
export const getDashboard = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const sql = await db();

  // Materialize income for current + next month so upcoming widget shows real projected dates
  // (biweekly + semimonthly need per-occurrence rows, not per-source).
  const now = new Date();
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const nextDt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const nextMonth = `${nextDt.getUTCFullYear()}-${String(nextDt.getUTCMonth() + 1).padStart(2, "0")}`;
  await materializeIncomeMonth(sql, `${thisMonth}-01`);
  await materializeIncomeMonth(sql, `${nextMonth}-01`);

  const [settingsRows, upcomingSubs, upcomingReminders, upcomingIncome, totals, live] = await Promise.all([
    sql`SELECT base_currency FROM app_settings LIMIT 1` as Promise<any[]>,
    sql`SELECT id, name, amount, currency, next_charge_date FROM subscriptions WHERE active = true ORDER BY next_charge_date LIMIT 5` as Promise<any[]>,
    sql`SELECT id, title, due_date, amount FROM reminders WHERE done = false ORDER BY due_date LIMIT 5` as Promise<any[]>,
    sql`
      SELECT id, name_snapshot AS name, expected_amount AS amount, currency, expected_date, status
      FROM income_instances
      WHERE status = 'expected' AND expected_date >= CURRENT_DATE
      ORDER BY expected_date LIMIT 8` as Promise<any[]>,
    sql`
      SELECT
        COALESCE(SUM(CASE WHEN kind = 'income' AND date_trunc('month', on_date) = date_trunc('month', CURRENT_DATE) THEN amount ELSE 0 END),0) AS income_mtd,
        COALESCE(SUM(CASE WHEN kind = 'expense' AND date_trunc('month', on_date) = date_trunc('month', CURRENT_DATE) THEN amount ELSE 0 END),0) AS expense_mtd
      FROM transactions` as Promise<any[]>,
    getLiveNetWorth(),
  ]);

  const base = String(settingsRows[0]?.base_currency ?? "USD");

  return {
    base_currency: base,
    liveNetWorth: live,
    upcomingSubscriptions: upcomingSubs.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      amount: n(r.amount),
      currency: r.currency as string,
      next_charge_date: d(r.next_charge_date),
    })),
    upcomingIncome: upcomingIncome.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      amount: r.amount == null ? null : n(r.amount),
      currency: r.currency as string,
      next_date: d(r.expected_date),
    })),
    upcomingReminders: upcomingReminders.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      due_date: d(r.due_date),
      amount: r.amount == null ? null : n(r.amount),
    })),
    incomeMTD: n(totals[0]?.income_mtd),
    expenseMTD: n(totals[0]?.expense_mtd),
  };
});

// -------------------------- Monthly Expenses (recurring definitions) --------------------------
const monthlyExpenseInput = z.object({
  name: z.string().min(1, "Name is required").max(80),
  category_id: z.string().uuid().nullable().optional(),
  account_id: z.string().uuid().nullable().optional(),
  due_day: z.coerce.number().int().min(1).max(31).nullable().optional(),
  default_amount: z.coerce.number().nonnegative(),
  currency: z.string().min(1).max(8).default("USD"),
  active: z.boolean().default(true),
  start_month: z.string().nullable().optional(),
  end_month: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  sort_order: z.coerce.number().int().default(0),
});

const monthStartOrNull = (v: string | null | undefined): string | null => {
  if (!v) return null;
  if (/^\d{4}-\d{2}$/.test(v)) return `${v}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v.slice(0, 7)}-01`;
  return null;
};

export const listMonthlyExpenses = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const sql = await db();
  const rows = (await sql`
    SELECT id, name, category_id, account_id, due_day, default_amount, currency, active, start_month, end_month, notes, sort_order
    FROM monthly_expenses ORDER BY sort_order, name`) as any[];
  return rows.map((r) => ({
    ...r,
    due_day: r.due_day == null ? null : Number(r.due_day),
    default_amount: n(r.default_amount),
    start_month: dOrNull(r.start_month),
    end_month: dOrNull(r.end_month),
    notes: s(r.notes),
  })) as MonthlyExpense[];
});

export const createMonthlyExpense = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => monthlyExpenseInput.parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    try {
      const rows = (await sql`
        INSERT INTO monthly_expenses (name, category_id, account_id, due_day, default_amount, currency, active, start_month, end_month, notes, sort_order)
        VALUES (${data.name}, ${data.category_id ?? null}, ${data.account_id ?? null}, ${data.due_day ?? null}, ${data.default_amount}, ${data.currency}, ${data.active},
                ${monthStartOrNull(data.start_month)}, ${monthStartOrNull(data.end_month)}, ${data.notes ?? null}, ${data.sort_order})
        RETURNING id`) as any[];
      return { id: rows[0].id as string };
    } catch (err) {
      throw new Error(`Failed to save monthly expense: ${(err as Error).message}`);
    }
  });

export type PropagateResult =
  | { ok: true; needs_confirm: false; updated_months: number }
  | { ok: false; needs_confirm: true; overridden_count: number; overridden_months: string[] };

const propagationInput = {
  from_month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  override_policy: z.enum(["overwrite", "keep"]).optional(),
};
const fromMonthDate = (m?: string) => `${m ?? new Date().toISOString().slice(0, 7)}-01`;

export const updateMonthlyExpense = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    monthlyExpenseInput.extend({ id: z.string().uuid(), ...propagationInput }).parse(data),
  )
  .handler(async ({ data }): Promise<PropagateResult> => {
    await requireUnlocked();
    const sql = await db();
    const from = fromMonthDate(data.from_month);
    try {
      const exists = (await sql`SELECT 1 FROM monthly_expenses WHERE id = ${data.id}`) as any[];
      if (exists.length === 0) throw new Error("This monthly expense no longer exists.");

      // 1. Before writing anything, check for manual overrides in current/future months.
      const conflicts = (await sql`
        SELECT month FROM monthly_expense_instances
        WHERE monthly_expense_id = ${data.id} AND month >= ${from}::date
          AND amount_overridden = true AND planned_amount <> ${data.default_amount}
        ORDER BY month`) as any[];
      if (conflicts.length > 0 && !data.override_policy) {
        return { ok: false, needs_confirm: true, overridden_count: conflicts.length, overridden_months: conflicts.map((r) => d(r.month).slice(0, 7)) };
      }
      const overwrite = data.override_policy === "overwrite";
      const start = monthStartOrNull(data.start_month);
      const end = monthStartOrNull(data.end_month);

      // 2. Update the definition (drives months not yet materialized).
      await sql`
        UPDATE monthly_expenses SET
          name = ${data.name}, category_id = ${data.category_id ?? null}, account_id = ${data.account_id ?? null},
          due_day = ${data.due_day ?? null},
          default_amount = ${data.default_amount}, currency = ${data.currency},
          active = ${data.active}, start_month = ${start}, end_month = ${end},
          notes = ${data.notes ?? null}, sort_order = ${data.sort_order}
        WHERE id = ${data.id}`;

      // 3. Push to already-materialized current + future months. Past months untouched.
      const updated = (await sql`
        UPDATE monthly_expense_instances SET
          name_snapshot = ${data.name}, category_id = ${data.category_id ?? null}, currency = ${data.currency},
          planned_amount = CASE WHEN amount_overridden AND NOT ${overwrite} THEN planned_amount ELSE ${data.default_amount} END,
          amount_overridden = CASE WHEN ${overwrite} THEN false ELSE amount_overridden END
        WHERE monthly_expense_id = ${data.id} AND month >= ${from}::date
        RETURNING id`) as any[];

      // 4. Drop untouched future instances that fall outside the new active window.
      await sql`
        DELETE FROM monthly_expense_instances
        WHERE monthly_expense_id = ${data.id} AND month >= ${from}::date
          AND status = 'pending' AND transaction_id IS NULL
          AND (${!data.active} OR (${start}::date IS NOT NULL AND month < ${start}::date)
               OR (${end}::date IS NOT NULL AND month > ${end}::date))`;

      return { ok: true, needs_confirm: false, updated_months: updated.length };
    } catch (err) {
      throw new Error(`Failed to update monthly expense: ${(err as Error).message}`);
    }
  });

export const deleteMonthlyExpense = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    // Instance rows keep their history via ON DELETE SET NULL on monthly_expense_id.
    await sql`DELETE FROM monthly_expenses WHERE id = ${data.id}`;
    return { ok: true };
  });

// -------------------------- Monthly Expense Instances --------------------------
export const listMonthInstances = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const monthDate = `${data.month}-01`;
    const rows = (await sql`
      SELECT mei.id, mei.monthly_expense_id, mei.month, mei.name_snapshot, mei.category_id,
             mei.planned_amount, mei.currency, mei.status, mei.transaction_id, mei.is_ad_hoc, mei.notes,
             mei.subscription_id, mei.amount_overridden,
             mei.account_id AS own_account_id,
             COALESCE(mei.account_id, me.account_id, sub.account_id) AS eff_account_id,
             COALESCE(me.due_day, EXTRACT(DAY FROM sub.next_charge_date)::int) AS due_day,
             c.name AS category_name, c.color AS category_color,
             t.amount AS tx_amount, t.on_date AS tx_date
      FROM monthly_expense_instances mei
      LEFT JOIN categories c ON c.id = mei.category_id
      LEFT JOIN transactions t ON t.id = mei.transaction_id
      LEFT JOIN monthly_expenses me ON me.id = mei.monthly_expense_id
      LEFT JOIN subscriptions sub ON sub.id = mei.subscription_id
      WHERE mei.month = ${monthDate}::date
      ORDER BY c.sort_order NULLS LAST, mei.name_snapshot`) as any[];
    return rows.map(mapInstance);
  });

export const createAdHocInstance = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      name: z.string().min(1).max(80),
      category_id: z.string().uuid().nullable().optional(),
      planned_amount: z.coerce.number().nonnegative(),
      currency: z.string().min(1).max(8).default("USD"),
      notes: z.string().max(500).nullable().optional(),
      account_id: z.string().uuid().nullable().optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const monthDate = `${data.month}-01`;
    const rows = (await sql`
      INSERT INTO monthly_expense_instances
        (monthly_expense_id, month, name_snapshot, category_id, planned_amount, currency, status, is_ad_hoc, notes, account_id)
      VALUES (NULL, ${monthDate}, ${data.name}, ${data.category_id ?? null}, ${data.planned_amount}, ${data.currency}, 'pending', true, ${data.notes ?? null}, ${data.account_id ?? null})
      RETURNING id`) as any[];
    return { id: rows[0].id as string };
  });

export const updateInstance = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(80).optional(),
      category_id: z.string().uuid().nullable().optional(),
      planned_amount: z.coerce.number().nonnegative().optional(),
      notes: z.string().max(500).nullable().optional(),
      /** Paying account for this month only; null clears the override (back to the bill's default). */
      account_id: z.string().uuid().nullable().optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    // Build a partial update — only overwrite provided fields.
    const cur = (await sql`SELECT name_snapshot, category_id, planned_amount, notes, account_id FROM monthly_expense_instances WHERE id = ${data.id}`) as any[];
    if (cur.length === 0) throw new Error("Instance not found");
    const name = data.name ?? cur[0].name_snapshot;
    const categoryId = data.category_id === undefined ? cur[0].category_id : data.category_id;
    const planned = data.planned_amount === undefined ? n(cur[0].planned_amount) : data.planned_amount;
    const notes = data.notes === undefined ? cur[0].notes : data.notes;
    const overridden = data.planned_amount !== undefined && data.planned_amount !== n(cur[0].planned_amount);
    const accountId = data.account_id === undefined ? cur[0].account_id : data.account_id;
    await sql`
      UPDATE monthly_expense_instances
      SET name_snapshot = ${name}, category_id = ${categoryId}, planned_amount = ${planned}, notes = ${notes},
          account_id = ${accountId},
          amount_overridden = amount_overridden OR ${overridden}
      WHERE id = ${data.id}`;
    return { ok: true };
  });

export const setInstanceStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "paused", "skipped"]),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    // Pausing/skipping also unlinks any transaction (can't be both paid and paused).
    await sql`
      UPDATE monthly_expense_instances
      SET status = ${data.status},
          transaction_id = CASE WHEN ${data.status} = 'pending' THEN transaction_id ELSE NULL END
      WHERE id = ${data.id}`;
    return { ok: true };
  });

export const deleteInstance = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    // Only allow deleting ad-hoc rows; def-backed instances should be paused instead.
    const rows = (await sql`SELECT is_ad_hoc FROM monthly_expense_instances WHERE id = ${data.id}`) as any[];
    if (rows.length === 0) return { ok: true };
    if (!rows[0].is_ad_hoc) throw new Error("Delete the Monthly Expense definition instead, or pause this month.");
    await sql`DELETE FROM monthly_expense_instances WHERE id = ${data.id}`;
    return { ok: true };
  });

export const linkTransactionToInstance = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      instance_id: z.string().uuid(),
      transaction_id: z.string().uuid(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    // A transaction can only be linked to one instance at a time.
    await sql`UPDATE monthly_expense_instances SET transaction_id = NULL, status = 'pending' WHERE transaction_id = ${data.transaction_id} AND id <> ${data.instance_id}`;
    await sql`UPDATE monthly_expense_instances SET transaction_id = ${data.transaction_id}, status = 'paid' WHERE id = ${data.instance_id}`;
    return { ok: true };
  });

export const unlinkInstance = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`UPDATE monthly_expense_instances SET transaction_id = NULL, status = 'pending' WHERE id = ${data.id}`;
    return { ok: true };
  });

// -------------------------- Home --------------------------
export type HomeAccount = {
  id: string;
  name: string;
  currency: string;
  balance: number;
  /** Bills still to pay this month from this account. */
  due: number;
  /** Names of those bills, for the "which bills does this pay" line. */
  bill_names: string[];
  short: number;
};
export type HomeData = {
  month: string;
  start_month: string;
  income_expected: number;
  income_received: number;
  income_still_expected: number;
  next_income: { name: string; date: string; amount: number | null } | null;
  /** Every expense transaction this month (bills paid + everyday). */
  spent: number;
  bills_total: number;
  bills_paid: number;
  bills_due: number;
  /** Income received this month, minus spending so far, minus bills still due. */
  safe_to_spend: number;
  days_left: number;
  groups: BudgetGroup[];
  accounts: HomeAccount[];
  goals: Goal[];
  debt: { total: number; minimums: number; extra: number; count: number };
  reminders: { id: string; title: string; due_date: string; amount: number | null }[];
  /** "after" (HH:MM) means show only from that local time on. */
  nudges: { kind: "log" | "bill" | "income"; text: string; after?: string }[];
  /** Progress through first-time setup, for the checklist on Home. */
  setup: { accounts_with_balance: number; bank_accounts: number; income_sources: number; bills: number; bills_without_account: number; limits: number };
};

const clampMonth = (month: string, start: string) => (month < start ? start : month);

export const getHome = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      /** Today's date on the viewer's device, so "days left" follows their time zone. */
      today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(data),
  )
  .handler(async ({ data }): Promise<HomeData> => {
    await requireUnlocked();
    const sql = await db();
    return loadHome(sql, data.month, data.today);
  });

async function loadHome(sql: any, monthIn: string, today: string): Promise<HomeData> {
    const data = { month: monthIn, today };
    const settings = (await sql`SELECT start_month, remind_log, remind_time, remind_bills, remind_income FROM app_settings LIMIT 1`) as any[];
    const start = settings[0]?.start_month ? d(settings[0].start_month).slice(0, 7) : DEFAULT_START_MONTH;
    const month = clampMonth(data.month, start);

    const [budget, income, accounts, goalRows, debtRows, reminderRows, incomeTx] = await Promise.all([
      loadBudget(sql, month),
      loadIncome(sql, month),
      loadAccounts(sql),
      sql`
        SELECT g.id, g.name, g.target_amount, g.saved_amount, g.target_date, g.notes, g.account_id,
          a.name AS account_name,
          COALESCE((SELECT SUM(CASE WHEN t.kind = 'expense' THEN -t.amount ELSE t.amount END)
                    FROM transactions t WHERE t.goal_id = g.id), 0) AS contributed_amount
        FROM goals g LEFT JOIN accounts a ON a.id = g.account_id ORDER BY g.name` as Promise<any[]>,
      sql`SELECT balance, min_payment, extra_payment FROM debts WHERE paid_off_at IS NULL` as Promise<any[]>,
      sql`
        SELECT id, title, due_date, amount FROM reminders
        WHERE done = false AND due_date < (${month + "-01"}::date + interval '1 month')
        ORDER BY due_date LIMIT 5` as Promise<any[]>,
      // Money in = every income transaction this month, whether or not it was matched to an expected payment.
      sql`
        SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
        WHERE kind = 'income' AND date_trunc('month', on_date) = date_trunc('month', ${month + "-01"}::date)` as Promise<any[]>,
    ]);
    const received = n(incomeTx[0]?.total);

    const instances = budget.groups.flatMap((g) => g.instances).filter((i) => i.status !== "paused" && i.status !== "skipped");
    const billsTotal = instances.reduce((a, i) => a + i.planned_amount, 0);
    const pending = instances.filter((i) => i.status === "pending");
    const billsDue = pending.reduce((a, i) => a + i.planned_amount, 0);
    const billsPaid = billsTotal - billsDue;
    const spent = budget.groups.reduce((a, g) => a + g.actual, 0);

    const dueByAccount = new Map<string, { due: number; names: string[] }>();
    for (const i of pending) {
      if (!i.account_id) continue;
      const cur = dueByAccount.get(i.account_id) ?? { due: 0, names: [] };
      cur.due += i.planned_amount;
      cur.names.push(i.name);
      dueByAccount.set(i.account_id, cur);
    }
    const homeAccounts: HomeAccount[] = accounts
      .filter((a) => !a.archived && a.kind !== "credit")
      .map((a) => {
        const due = dueByAccount.get(a.id);
        return {
          id: a.id, name: a.name, currency: a.currency, balance: a.current_balance,
          due: round2(due?.due ?? 0), bill_names: due?.names ?? [],
          short: round2(Math.max(0, (due?.due ?? 0) - a.current_balance)),
        };
      })
      .sort((x, y) => (y.due > 0 ? 1 : 0) - (x.due > 0 ? 1 : 0));

    // What's still to come: the month's expected income not yet covered by money that came in.
    const stillExpected = Math.max(0, income.expectedTotal - received);
    const next = income.instances.find((i) => i.status === "expected" && i.expected_date >= data.today) ?? null;

    const [y, m] = month.split("-").map(Number);
    const monthDays = daysInMonth(y, m);
    const todayYm = data.today.slice(0, 7);
    const daysLeft = todayYm === month ? monthDays - Number(data.today.slice(8, 10)) + 1 : todayYm < month ? monthDays : 0;

    return {
      month,
      start_month: start,
      income_expected: round2(income.expectedTotal),
      income_received: round2(received),
      income_still_expected: round2(stillExpected),
      next_income: next ? { name: next.name, date: next.expected_date, amount: next.expected_amount } : null,
      spent: round2(spent),
      bills_total: round2(billsTotal),
      bills_paid: round2(billsPaid),
      bills_due: round2(billsDue),
      safe_to_spend: round2(received - spent - billsDue),
      days_left: daysLeft,
      groups: budget.groups,
      accounts: homeAccounts,
      goals: goalRows.map((r) => ({
        ...r,
        target_amount: n(r.target_amount),
        saved_amount: n(r.saved_amount),
        contributed_amount: n(r.contributed_amount),
        progress_amount: n(r.saved_amount) + n(r.contributed_amount),
        target_date: r.target_date ? d(r.target_date) : null,
        notes: s(r.notes),
        account_name: s(r.account_name),
      })) as Goal[],
      debt: {
        total: round2(debtRows.reduce((a, r) => a + n(r.balance), 0)),
        minimums: round2(debtRows.reduce((a, r) => a + n(r.min_payment), 0)),
        extra: round2(debtRows.reduce((a, r) => a + n(r.extra_payment), 0)),
        count: debtRows.length,
      },
      reminders: reminderRows.map((r) => ({ id: r.id, title: r.title, due_date: d(r.due_date), amount: r.amount == null ? null : n(r.amount) })),
      nudges: await buildNudges(sql, settings[0] ?? {}, data.today, month, pending, income.instances),
      setup: {
        accounts_with_balance: accounts.filter((a) => !a.archived && a.kind !== "credit" && a.current_balance !== 0).length,
        bank_accounts: accounts.filter((a) => !a.archived && a.kind !== "credit").length,
        income_sources: n(((await sql`SELECT COUNT(*) AS c FROM recurring_income WHERE active = true`) as any[])[0]?.c),
        bills: instances.length,
        bills_without_account: instances.filter((i) => !i.account_id).length,
        limits: budget.groups.filter((g) => g.limit != null).length,
      },
    };
}

// In-app reminders shown on Home: nothing logged today (after the chosen time), bills due today or
// tomorrow, and pay expected today. Each can be switched off in Settings.
async function buildNudges(sql: any, st: any, today: string, month: string, pending: MonthlyExpenseInstance[], incomeInst: IncomeInstance[]) {
  const out: { kind: "log" | "bill" | "income"; text: string; after?: string }[] = [];
  if (!today.startsWith(month)) return out;
  const dayNum = Number(today.slice(8, 10));
  if (st.remind_bills !== false) {
    for (const i of pending) {
      if (i.due_day === dayNum) out.push({ kind: "bill", text: `${i.name} (${i.planned_amount.toFixed(2)}) is due today.` });
      else if (i.due_day === dayNum + 1) out.push({ kind: "bill", text: `${i.name} (${i.planned_amount.toFixed(2)}) is due tomorrow.` });
    }
  }
  if (st.remind_income !== false) {
    for (const i of incomeInst) {
      if (i.status === "expected" && i.expected_date === today) out.push({ kind: "income", text: `${i.name} is expected today. Mark it received when it lands.` });
    }
  }
  if (st.remind_log !== false) {
    const logged = (await sql`SELECT 1 FROM transactions WHERE on_date = ${today}::date LIMIT 1`) as any[];
    if (logged.length === 0) out.push({ kind: "log", text: "Nothing logged today yet. Anything to add?", after: String(st.remind_time ?? "20:30") });
  }
  return out;
}

// -------------------------- Plan the month --------------------------
// The extra figures the Plan page needs beside the budget itself.
export const getPlanExtras = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const income = await loadIncome(sql, data.month);
    const [y, m] = data.month.split("-").map(Number);
    const prev = new Date(Date.UTC(y, m - 2, 1));
    const prevIso = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const [debtRows, lastRows] = await Promise.all([
      sql`SELECT COALESCE(SUM(extra_payment), 0) AS extra FROM debts WHERE paid_off_at IS NULL` as Promise<any[]>,
      // Everyday spending last month per category: expenses not recorded as a bill payment.
      sql`
        SELECT t.category_id, COALESCE(SUM(t.amount), 0) AS total FROM transactions t
        WHERE t.kind = 'expense' AND date_trunc('month', t.on_date) = ${prevIso}::date
          AND NOT EXISTS (SELECT 1 FROM monthly_expense_instances i WHERE i.transaction_id = t.id)
        GROUP BY t.category_id` as Promise<any[]>,
    ]);
    return {
      income_expected: round2(income.expectedTotal),
      debt_extra: round2(n(debtRows[0]?.extra)),
      last_month: prevIso.slice(0, 7),
      last_month_spent: Object.fromEntries(lastRows.filter((r) => r.category_id).map((r) => [r.category_id as string, round2(n(r.total))])) as Record<string, number>,
    };
  });

// -------------------------- Monthly recap --------------------------
export type RecapData = {
  month: string;
  start_month: string;
  came_in: number;
  went_out: number;
  to_goals: number;
  to_debt: number;
  left_over: number;
  categories: { id: string | null; name: string; color: string; icon: string | null; spent: number; limit: number | null; count: number }[];
  everyday_total: number;
  bills: { total: number; paid: number; count: number; paid_count: number; late_count: number };
  months: { month: string; out: number }[];
  notes: string[];
};

export const getRecap = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(data))
  .handler(async ({ data }): Promise<RecapData> => {
    await requireUnlocked();
    const sql = await db();
    const st = (await sql`SELECT start_month FROM app_settings LIMIT 1`) as any[];
    const start = st[0]?.start_month ? d(st[0].start_month).slice(0, 7) : DEFAULT_START_MONTH;
    const month = clampMonth(data.month, start);
    const m1 = `${month}-01`;
    const budget = await loadBudget(sql, month);
    const [inOut, goalRows, debtRows, catRows, monthRows, prevRows] = await Promise.all([
      sql`SELECT kind, COALESCE(SUM(amount),0) AS total FROM transactions
          WHERE date_trunc('month', on_date) = ${m1}::date AND kind IN ('income','expense') GROUP BY kind` as Promise<any[]>,
      sql`SELECT COALESCE(SUM(CASE WHEN kind = 'expense' THEN -amount ELSE amount END),0) AS total FROM transactions
          WHERE goal_id IS NOT NULL AND date_trunc('month', on_date) = ${m1}::date` as Promise<any[]>,
      sql`SELECT COALESCE(SUM(amount),0) AS total FROM debt_payments WHERE date_trunc('month', payment_date) = ${m1}::date` as Promise<any[]>,
      // Everyday spending by category: expenses that are not a recorded bill payment.
      sql`SELECT t.category_id, c.name, c.color, c.icon, COALESCE(SUM(t.amount),0) AS total, COUNT(*) AS n
          FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
          WHERE t.kind = 'expense' AND date_trunc('month', t.on_date) = ${m1}::date
            AND NOT EXISTS (SELECT 1 FROM monthly_expense_instances i WHERE i.transaction_id = t.id)
          GROUP BY t.category_id, c.name, c.color, c.icon ORDER BY total DESC` as Promise<any[]>,
      sql`SELECT to_char(date_trunc('month', on_date), 'YYYY-MM') AS m, COALESCE(SUM(amount),0) AS total FROM transactions
          WHERE kind = 'expense' AND on_date >= GREATEST(${start + "-01"}::date, ${m1}::date - interval '5 months')
            AND on_date < ${m1}::date + interval '1 month'
          GROUP BY 1 ORDER BY 1` as Promise<any[]>,
      sql`SELECT COALESCE(SUM(amount),0) AS total FROM transactions
          WHERE kind = 'expense' AND date_trunc('month', on_date) = (${m1}::date - interval '1 month')` as Promise<any[]>,
    ]);
    const cameIn = n(inOut.find((r) => r.kind === "income")?.total);
    const wentOut = n(inOut.find((r) => r.kind === "expense")?.total);
    const limitByCat = new Map(budget.groups.filter((g) => g.limit != null).map((g) => [g.category_id, g.limit as number]));
    const categories = catRows.map((r) => ({
      id: r.category_id as string | null, name: r.name ?? "Uncategorized", color: r.color ?? "#94a3b8", icon: s(r.icon),
      spent: round2(n(r.total)), limit: limitByCat.get(r.category_id) ?? null, count: Number(r.n),
    }));
    // Categories with a limit but no spending still show, at $0.
    for (const g of budget.groups) {
      if (g.limit != null && !categories.some((c) => c.id === g.category_id)) {
        categories.push({ id: g.category_id, name: g.category_name, color: g.category_color, icon: g.category_icon, spent: 0, limit: g.limit, count: 0 });
      }
    }
    const inst = budget.groups.flatMap((g) => g.instances).filter((i) => i.status !== "paused" && i.status !== "skipped");
    const paid = inst.filter((i) => i.status === "paid");
    const late = paid.filter((i) => i.due_day && i.transaction_date && Number(i.transaction_date.slice(8, 10)) > i.due_day && i.transaction_date.startsWith(month));

    // Month-by-month outflow, filling empty months with zero.
    const months: { month: string; out: number }[] = [];
    const [y, mm] = month.split("-").map(Number);
    for (let k = 5; k >= 0; k--) {
      const dt = new Date(Date.UTC(y, mm - 1 - k, 1));
      const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
      if (key < start) continue;
      months.push({ month: key, out: round2(n(monthRows.find((r) => r.m === key)?.total)) });
    }

    const notes: string[] = [];
    for (const c of categories) {
      if (c.limit != null && c.spent > c.limit) notes.push(`${c.name} went over its ${money2(c.limit)} limit by ${money2(c.spent - c.limit)}, across ${c.count} purchase${c.count === 1 ? "" : "s"}.`);
    }
    if (inst.length > 0) {
      notes.push(paid.length === inst.length
        ? `All ${inst.length} bills were paid${late.length ? `, ${late.length} after the due day` : ", none late"}.`
        : `${paid.length} of ${inst.length} bills are marked paid${late.length ? `, ${late.length} after the due day` : ""}.`);
    }
    const prevOut = n(prevRows[0]?.total);
    const prevMonthKey = (() => { const dt = new Date(Date.UTC(y, mm - 2, 1)); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`; })();
    if (prevOut > 0 && prevMonthKey >= start) {
      const pct = Math.round(((wentOut - prevOut) / prevOut) * 100);
      notes.push(pct === 0 ? "Spending was about the same as last month." : `You spent ${Math.abs(pct)}% ${pct > 0 ? "more" : "less"} than last month.`);
    }
    if (categories[0] && categories[0].spent > 0) notes.push(`Most everyday spending went to ${categories[0].name} (${money2(categories[0].spent)}).`);
    const toGoals = n(goalRows[0]?.total);
    if (toGoals > 0) notes.push(`${money2(toGoals)} went toward your goals.`);

    return {
      month, start_month: start,
      came_in: round2(cameIn), went_out: round2(wentOut), to_goals: round2(toGoals), to_debt: round2(n(debtRows[0]?.total)),
      left_over: round2(cameIn - wentOut),
      categories,
      everyday_total: round2(categories.reduce((a, c) => a + c.spent, 0)),
      bills: { total: round2(inst.reduce((a, i) => a + i.planned_amount, 0)), paid: round2(paid.reduce((a, i) => a + (i.transaction_amount ?? i.planned_amount), 0)), count: inst.length, paid_count: paid.length, late_count: late.length },
      months, notes,
    };
  });

const money2 = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// -------------------------- Ask Keel --------------------------
// Answers common questions from Keel's own data. No outside AI service is involved.
export type AskAnswer = {
  text: string;
  rows?: { label: string; sub?: string; amount: number | null }[];
  link?: { to: string; label: string; search?: Record<string, string> };
};

const periodBounds = (p: Period) => {
  if (p.kind === "range") return { from: p.from, to: p.to, label: p.label };
  const [y, m] = p.month.split("-").map(Number);
  const last = daysInMonth(y, m);
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return { from: `${p.month}-01`, to: `${p.month}-${String(last).padStart(2, "0")}`, label: `in ${label}` };
};

export const askKeel = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ question: z.string().min(1).max(300), today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(data),
  )
  .handler(async ({ data }): Promise<AskAnswer> => {
    await requireUnlocked();
    const sql = await db();
    const [yy, mo, dd] = data.today.split("-").map(Number);
    const parsed = parseAsk(data.question, new Date(yy, mo - 1, dd));
    // Before Keel's start month, "this month" means the start month (same as Home).
    const st = (await sql`SELECT start_month FROM app_settings LIMIT 1`) as any[];
    const start = st[0]?.start_month ? d(st[0].start_month).slice(0, 7) : DEFAULT_START_MONTH;
    const month = clampMonth(data.today.slice(0, 7), start);
    const clampP = (p: Period): Period => (p.kind === "month" ? { kind: "month", month: clampMonth(p.month, start) } : p);
    const intent = "period" in parsed ? { ...parsed, period: clampP(parsed.period) }
      : parsed.type === "compare" ? { ...parsed, month: clampMonth(parsed.month, start) } : parsed;

    switch (intent.type) {
      case "spent_on": {
        const b = periodBounds(intent.period);
        const like = `%${intent.term.replace(/[%_]/g, "")}%`;
        const rows = (await sql`
          SELECT t.on_date, t.amount, t.notes, c.name AS cat FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
          WHERE t.kind = 'expense' AND t.on_date BETWEEN ${b.from}::date AND ${b.to}::date
            AND (c.name ILIKE ${like} OR t.notes ILIKE ${like})
          ORDER BY t.amount DESC`) as any[];
        const total = rows.reduce((a, r) => a + n(r.amount), 0);
        const lim = (await sql`SELECT monthly_limit FROM categories WHERE name ILIKE ${like} AND monthly_limit IS NOT NULL LIMIT 1`) as any[];
        const limit = intent.period.kind === "month" && lim[0] ? n(lim[0].monthly_limit) : null;
        const top = rows[0];
        let text = rows.length === 0
          ? `Nothing matching "${intent.term}" ${b.label}.`
          : `${money2(total)} on ${intent.term} ${b.label}, across ${rows.length} purchase${rows.length === 1 ? "" : "s"}.`;
        if (limit != null && rows.length) text += total > limit ? ` That's ${money2(total - limit)} over your ${money2(limit)} limit.` : ` ${money2(limit - total)} left of your ${money2(limit)} limit.`;
        if (top && rows.length > 1) text += ` The biggest was ${top.notes || top.cat || "one purchase"} at ${money2(n(top.amount))}.`;
        return {
          text,
          rows: rows.slice(0, 6).map((r) => ({ label: r.notes || r.cat || "Expense", sub: d(r.on_date), amount: n(r.amount) })),
          link: rows.length ? { to: "/transactions", label: `See all ${rows.length}`, search: { view: "list", q: intent.term, from: b.from, to: b.to } } : undefined,
        };
      }
      case "spent_total":
      case "biggest": {
        const b = periodBounds(intent.period);
        const rows = (await sql`
          SELECT t.on_date, t.amount, t.notes, c.name AS cat FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
          WHERE t.kind = 'expense' AND t.on_date BETWEEN ${b.from}::date AND ${b.to}::date ORDER BY t.amount DESC`) as any[];
        const total = rows.reduce((a, r) => a + n(r.amount), 0);
        if (intent.type === "biggest") {
          return {
            text: rows.length ? `Your biggest expenses ${b.label}:` : `No expenses logged ${b.label}.`,
            rows: rows.slice(0, 5).map((r) => ({ label: r.notes || r.cat || "Expense", sub: `${d(r.on_date)}${r.cat ? ` · ${r.cat}` : ""}`, amount: n(r.amount) })),
          };
        }
        return { text: `You spent ${money2(total)} ${b.label}, across ${rows.length} transaction${rows.length === 1 ? "" : "s"}.`,
          link: { to: "/transactions", label: "Open Activity", search: { view: "list", from: b.from, to: b.to } } };
      }
      case "income": {
        const b = periodBounds(intent.period);
        const rows = (await sql`SELECT on_date, amount, notes FROM transactions WHERE kind = 'income' AND on_date BETWEEN ${b.from}::date AND ${b.to}::date ORDER BY on_date`) as any[];
        const total = rows.reduce((a, r) => a + n(r.amount), 0);
        return { text: `${money2(total)} came in ${b.label}.`, rows: rows.map((r) => ({ label: r.notes || "Income", sub: d(r.on_date), amount: n(r.amount) })),
          link: { to: "/income", label: "Open Income" } };
      }
      case "due": {
        const b = periodBounds(intent.period);
        const home = await loadHome(sql, b.from.slice(0, 7), data.today);
        const [by, bm] = b.from.slice(0, 7).split("-").map(Number);
        const last = daysInMonth(by, bm);
        const items = home.groups.flatMap((g) => g.instances).filter((i) => i.status === "pending").map((i) => ({
          label: i.name, date: i.due_day ? `${b.from.slice(0, 7)}-${String(Math.min(i.due_day, last)).padStart(2, "0")}` : null, amount: i.planned_amount,
        })).filter((i) => !i.date || (i.date >= b.from && i.date <= b.to && i.date >= data.today));
        const rem = (await sql`SELECT title, due_date, amount FROM reminders WHERE done = false AND due_date BETWEEN ${b.from}::date AND ${b.to}::date`) as any[];
        const all = [...items, ...rem.map((r) => ({ label: r.title, date: d(r.due_date), amount: r.amount == null ? null : n(r.amount) }))]
          .sort((a, c) => (a.date ?? "9").localeCompare(c.date ?? "9"));
        const total = all.reduce((a, r) => a + (r.amount ?? 0), 0);
        return {
          text: all.length ? `${all.length} thing${all.length === 1 ? "" : "s"} due ${b.label.replace(/^in /, "in ")}, ${money2(total)} in total.` : `Nothing due ${b.label}.`,
          rows: all.map((r) => ({ label: r.label, sub: r.date ?? "no due day set", amount: r.amount })),
          link: { to: "/transactions", label: "Open the calendar", search: { view: "calendar" } },
        };
      }
      case "safe": {
        const home = await loadHome(sql, month, data.today);
        return {
          text: home.safe_to_spend >= 0
            ? `${money2(home.safe_to_spend)} is safe to spend for the rest of the month${home.days_left > 0 ? `, about ${money2(home.safe_to_spend / home.days_left)} a day` : ""}. That's what has come in, minus spending so far and ${money2(home.bills_due)} in bills still due.`
            : `You're ${money2(-home.safe_to_spend)} over what has come in this month once the ${money2(home.bills_due)} in bills still due are paid.${home.income_still_expected > 0 ? ` ${money2(home.income_still_expected)} more is still expected.` : ""}`,
          link: { to: "/home", label: "Open Home" },
        };
      }
      case "afford": {
        const home = await loadHome(sql, month, data.today);
        const after = home.safe_to_spend - intent.amount;
        const withExpected = after + home.income_still_expected;
        const text = after >= 0
          ? `Yes. ${money2(intent.amount)} would leave ${money2(after)} safe to spend this month.`
          : withExpected >= 0
            ? `Only once more pay comes in. Right now it would put you ${money2(-after)} over, but ${money2(home.income_still_expected)} is still expected this month.`
            : `Not this month. It would put you ${money2(-after)} over, even counting the ${money2(home.income_still_expected)} still expected.`;
        return { text, link: { to: "/budget", label: "Open Plan the month" } };
      }
      case "compare": {
        const rows = (await sql`
          SELECT to_char(date_trunc('month', t.on_date), 'YYYY-MM') AS m, COALESCE(c.name, 'Uncategorized') AS cat, SUM(t.amount) AS total
          FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
          WHERE t.kind = 'expense' AND t.on_date >= ${intent.prev + "-01"}::date AND t.on_date < (${intent.month + "-01"}::date + interval '1 month')
          GROUP BY 1, 2`) as any[];
        const tot = (m: string) => rows.filter((r) => r.m === m).reduce((a, r) => a + n(r.total), 0);
        const cur = tot(intent.month), prev = tot(intent.prev);
        const cats = Array.from(new Set(rows.map((r) => r.cat as string)));
        const diffs = cats.map((c) => ({
          label: c,
          amount: round2(n(rows.find((r) => r.m === intent.month && r.cat === c)?.total) - n(rows.find((r) => r.m === intent.prev && r.cat === c)?.total)),
        })).filter((x) => x.amount !== 0).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 5);
        return {
          text: prev === 0 ? `Nothing was logged the month before, so there's nothing to compare yet. This month so far: ${money2(cur)}.`
            : `This month so far ${money2(cur)}, last month ${money2(prev)}. Biggest changes by category:`,
          rows: prev === 0 ? undefined : diffs.map((x) => ({ label: x.label, sub: x.amount > 0 ? "more" : "less", amount: Math.abs(x.amount) })),
          link: { to: "/recap", label: "Open the monthly recap" },
        };
      }
      case "debt_free": {
        const debts = (await sql`SELECT id, name, balance, apr, min_payment, extra_payment, promo_apr, promo_end_date FROM debts WHERE paid_off_at IS NULL`) as any[];
        if (debts.length === 0) return { text: "You have no open debts in Keel." };
        const extra = debts.reduce((a, r) => a + n(r.extra_payment), 0);
        const plan = simulateStrategy(debts.map((r) => ({
          id: r.id, name: r.name, balance: n(r.balance), apr: n(r.apr), minPayment: n(r.min_payment), extraPayment: 0,
          promoApr: r.promo_apr == null ? null : n(r.promo_apr), promoEndDate: dOrNull(r.promo_end_date),
        })), extra, "avalanche", firstPaymentMonth(null, data.today));
        if (plan.neverPaysOff) return { text: "At the current payments the balances don't go down. Raise a minimum or add an extra payment on the Debts page.", link: { to: "/debts", label: "Open Debts" } };
        const when = new Date(`${plan.debtFreeMonth}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
        return {
          text: `On the avalanche plan${extra > 0 ? ` with ${money2(extra)} extra a month` : ""}, you'd be debt free in ${when}, paying about ${money2(plan.totalInterest)} in interest.`,
          rows: plan.order.map((o) => ({ label: o.name, sub: `paid off ${o.payoffMonth}`, amount: null })),
          link: { to: "/debts", label: "Open Debts" },
        };
      }
      default:
        return { text: "I can answer questions like: how much did I spend on groceries this month, what's due this week, how much is safe to spend, can I afford $90 on Saturday, compare to last month, my biggest expenses, or when will I be debt free." };
    }
  });
