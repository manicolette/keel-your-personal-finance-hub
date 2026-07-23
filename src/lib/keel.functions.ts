import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "./db.server";
import { requireUnlocked } from "./session.server";

// -------------------------- Types --------------------------
export type Account = {
  id: string;
  name: string;
  kind: "bank" | "cash" | "credit" | "investment" | "other";
  currency: string;
  opening_balance: number;
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
  target_date: string | null;
  notes: string | null;
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
  month: string;
  name: string;
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
  planned: number;
  actual: number;
  instances: MonthlyExpenseInstance[];
};

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
  const rows = (await sql`SELECT id, base_currency, week_start FROM app_settings LIMIT 1`) as any[];
  return rows[0] as Settings;
});

export const updateSettings = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        base_currency: z.string().min(1).max(8),
        week_start: z.enum(["sunday", "monday"]),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`UPDATE app_settings SET base_currency = ${data.base_currency}, week_start = ${data.week_start} WHERE id = ${data.id}`;
    return { ok: true };
  });

// -------------------------- Accounts --------------------------
export const listAccounts = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const sql = await db();
  const rows = (await sql`SELECT id, name, kind, currency, opening_balance, archived, sort_order FROM accounts ORDER BY sort_order, name`) as any[];
  return rows.map((r) => ({ ...r, opening_balance: n(r.opening_balance) })) as Account[];
});

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
  const rows = (await sql`SELECT id, name, kind, color, archived, sort_order FROM categories ORDER BY kind, sort_order, name`) as any[];
  return rows as Category[];
});

const categoryInput = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(["income", "expense"]),
  color: z.string().min(1).max(16).default("#0d9488"),
  archived: z.boolean().default(false),
  sort_order: z.coerce.number().int().default(0),
});

export const createCategory = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => categoryInput.parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const rows = (await sql`
      INSERT INTO categories (name, kind, color, archived, sort_order)
      VALUES (${data.name}, ${data.kind}, ${data.color}, ${data.archived}, ${data.sort_order})
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
        archived = ${data.archived}, sort_order = ${data.sort_order}
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
    SELECT id, on_date, account_id, category_id, kind, amount, currency, notes, transfer_account_id, receipt_url
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
});

export const createTransaction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => txInput.parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const rows = (await sql`
      INSERT INTO transactions (on_date, account_id, category_id, kind, amount, currency, notes, transfer_account_id, receipt_url)
      VALUES (${data.on_date}, ${data.account_id}, ${data.category_id ?? null}, ${data.kind}, ${data.amount}, ${data.currency}, ${data.notes ?? null}, ${data.transfer_account_id ?? null}, ${data.receipt_url ?? null})
      RETURNING id`) as any[];
    return { id: rows[0].id as string };
  });

export const updateTransaction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => txInput.extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`
      UPDATE transactions SET on_date = ${data.on_date}, account_id = ${data.account_id},
        category_id = ${data.category_id ?? null}, kind = ${data.kind}, amount = ${data.amount},
        currency = ${data.currency}, notes = ${data.notes ?? null},
        transfer_account_id = ${data.transfer_account_id ?? null},
        receipt_url = ${data.receipt_url ?? null}
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
  .inputValidator((data: unknown) => subInput.extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    try {
      await sql`
        UPDATE subscriptions SET name = ${data.name}, amount = ${data.amount}, currency = ${data.currency},
          frequency = ${data.frequency}, next_charge_date = ${data.next_charge_date},
          account_id = ${data.account_id ?? null}, category_id = ${data.category_id ?? null},
          active = ${data.active}, notes = ${data.notes ?? null}
        WHERE id = ${data.id}`;
      return { ok: true };
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
    SELECT id, name, amount, currency, frequency, next_date, account_id, category_id, active, notes
    FROM constant_items ORDER BY next_date`) as any[];
  return rows.map((r) => ({ ...r, amount: n(r.amount), next_date: d(r.next_date), notes: s(r.notes) })) as ConstantItem[];
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
  };
}

export const listRecurringIncome = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const sql = await db();
  const rows = (await sql`
    SELECT id, name, amount, currency, frequency, next_date, account_id, category_id, active, notes,
           anchor_date, semimonthly_day_1, semimonthly_day_2, is_variable
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
           anchor_date, semimonthly_day_1, semimonthly_day_2, is_variable)
        VALUES (${data.name}, ${amt}, ${data.currency}, ${data.frequency}, ${data.next_date},
                ${data.account_id ?? null}, ${data.category_id ?? null}, ${data.active}, ${data.notes ?? null},
                ${anchor}, ${data.semimonthly_day_1 ?? null}, ${data.semimonthly_day_2 ?? null}, ${data.is_variable})
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
          is_variable = ${data.is_variable}
        WHERE id = ${data.id}`;
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
    SELECT id, name, currency, frequency, next_date, amount, anchor_date, semimonthly_day_1, semimonthly_day_2, is_variable
    FROM recurring_income WHERE active = true`) as any[];
  for (const src of sources) {
    const dates = enumerateIncomeDatesInMonth(
      {
        frequency: src.frequency,
        next_date: d(src.next_date),
        anchor_date: dOrNull(src.anchor_date),
        semimonthly_day_1: src.semimonthly_day_1 == null ? null : Number(src.semimonthly_day_1),
        semimonthly_day_2: src.semimonthly_day_2 == null ? null : Number(src.semimonthly_day_2),
      },
      monthIso,
    );
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
    return { month: data.month, instances, expectedTotal, receivedTotal };
  });

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


// -------------------------- Debts --------------------------
const debtInput = z.object({
  name: z.string().min(1).max(80),
  balance: z.coerce.number().default(0),
  min_payment: z.coerce.number().default(0),
  apr: z.coerce.number().default(0),
  due_day: z.coerce.number().int().min(1).max(31).nullable().optional(),
  currency: z.string().min(1).max(8).default("USD"),
  notes: z.string().max(500).nullable().optional(),
  original_balance: z.coerce.number().positive().nullable().optional(),
  start_date: z.string().nullable().optional(),
});

export const listDebts = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const sql = await db();
  const rows = (await sql`SELECT id, name, balance, min_payment, apr, due_day, currency, notes, original_balance, start_date, paid_off_at FROM debts ORDER BY paid_off_at NULLS FIRST, name`) as any[];
  return rows.map((r) => ({
    ...r,
    balance: n(r.balance),
    min_payment: n(r.min_payment),
    apr: n(r.apr),
    notes: s(r.notes),
    original_balance: r.original_balance == null ? null : n(r.original_balance),
    start_date: dOrNull(r.start_date),
    paid_off_at: dOrNull(r.paid_off_at),
  })) as Debt[];
});

export const createDebt = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => debtInput.parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const rows = (await sql`
      INSERT INTO debts (name, balance, min_payment, apr, due_day, currency, notes, original_balance, start_date)
      VALUES (${data.name}, ${data.balance}, ${data.min_payment}, ${data.apr}, ${data.due_day ?? null}, ${data.currency}, ${data.notes ?? null}, ${data.original_balance ?? null}, ${data.start_date || null})
      RETURNING id`) as any[];
    return { id: rows[0].id as string };
  });

export const updateDebt = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => debtInput.extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`
      UPDATE debts SET name = ${data.name}, balance = ${data.balance}, min_payment = ${data.min_payment},
        apr = ${data.apr}, due_day = ${data.due_day ?? null}, currency = ${data.currency}, notes = ${data.notes ?? null},
        original_balance = ${data.original_balance ?? null}, start_date = ${data.start_date || null}
      WHERE id = ${data.id}`;
    return { ok: true };
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

async function recomputePaidOff(sql: any, debtId: string, todayIso: string) {
  const rows = (await sql`SELECT balance FROM debts WHERE id = ${debtId}`) as any[];
  if (rows.length === 0) return;
  const bal = n(rows[0].balance);
  if (bal <= 0) {
    await sql`UPDATE debts SET paid_off_at = COALESCE(paid_off_at, ${todayIso}) WHERE id = ${debtId}`;
  } else {
    await sql`UPDATE debts SET paid_off_at = NULL WHERE id = ${debtId}`;
  }
}

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

      await sql`UPDATE debts SET balance = balance - ${data.amount} WHERE id = ${data.debt_id}`;
      await recomputePaidOff(sql, data.debt_id, data.payment_date);
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
    const prev = (await sql`SELECT debt_id, amount, transaction_id FROM debt_payments WHERE id = ${data.id}`) as any[];
    if (prev.length === 0) throw new Error("Payment not found");
    const p = prev[0];
    const delta = data.amount - n(p.amount);
    await sql`UPDATE debt_payments SET amount = ${data.amount}, payment_date = ${data.payment_date}, note = ${data.note ?? null} WHERE id = ${data.id}`;
    if (delta !== 0) await sql`UPDATE debts SET balance = balance - ${delta} WHERE id = ${p.debt_id}`;
    if (p.transaction_id) {
      await sql`UPDATE transactions SET amount = ${data.amount}, on_date = ${data.payment_date} WHERE id = ${p.transaction_id}`;
    }
    await recomputePaidOff(sql, p.debt_id, data.payment_date);
    return { ok: true };
  });

export const deleteDebtPayment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const prev = (await sql`SELECT debt_id, amount, transaction_id, payment_date FROM debt_payments WHERE id = ${data.id}`) as any[];
    if (prev.length === 0) return { ok: true };
    const p = prev[0];
    await sql`DELETE FROM debt_payments WHERE id = ${data.id}`;
    await sql`UPDATE debts SET balance = balance + ${n(p.amount)} WHERE id = ${p.debt_id}`;
    if (p.transaction_id) await sql`DELETE FROM transactions WHERE id = ${p.transaction_id}`;
    await recomputePaidOff(sql, p.debt_id, d(p.payment_date));
    return { ok: true };
  });

// -------------------------- Goals --------------------------
const goalInput = z.object({
  name: z.string().min(1).max(80),
  target_amount: z.coerce.number().default(0),
  saved_amount: z.coerce.number().default(0),
  target_date: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const listGoals = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const sql = await db();
  const rows = (await sql`SELECT id, name, target_amount, saved_amount, target_date, notes FROM goals ORDER BY name`) as any[];
  return rows.map((r) => ({
    ...r,
    target_amount: n(r.target_amount),
    saved_amount: n(r.saved_amount),
    target_date: r.target_date ? d(r.target_date) : null,
    notes: s(r.notes),
  })) as Goal[];
});

export const createGoal = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => goalInput.parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const rows = (await sql`
      INSERT INTO goals (name, target_amount, saved_amount, target_date, notes)
      VALUES (${data.name}, ${data.target_amount}, ${data.saved_amount}, ${data.target_date || null}, ${data.notes ?? null})
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
        saved_amount = ${data.saved_amount}, target_date = ${data.target_date || null}, notes = ${data.notes ?? null}
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
    sql`SELECT id, name, currency, opening_balance, kind FROM accounts WHERE archived = false` as Promise<any[]>,
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
export const getBudget = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) =>
    z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM") }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const monthDate = `${data.month}-01`;

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

    const instanceRows = (await sql`
      SELECT mei.id, mei.monthly_expense_id, mei.month, mei.name_snapshot, mei.category_id,
             mei.planned_amount, mei.currency, mei.status, mei.transaction_id, mei.is_ad_hoc, mei.notes,
             c.name AS category_name, c.color AS category_color,
             t.amount AS tx_amount, t.on_date AS tx_date
      FROM monthly_expense_instances mei
      LEFT JOIN categories c ON c.id = mei.category_id
      LEFT JOIN transactions t ON t.id = mei.transaction_id
      WHERE mei.month = ${monthDate}::date
      ORDER BY c.sort_order NULLS LAST, c.name NULLS LAST, mei.name_snapshot`) as any[];

    const instances: MonthlyExpenseInstance[] = instanceRows.map((r) => ({
      id: r.id,
      monthly_expense_id: r.monthly_expense_id,
      month: d(r.month),
      name: r.name_snapshot,
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
    }));

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
    const allCatsRows = (await sql`SELECT id, name, color, sort_order FROM categories WHERE kind = 'expense' AND archived = false ORDER BY sort_order, name`) as any[];

    const groupMap = new Map<string | null, BudgetGroup>();
    const upsertGroup = (id: string | null, name: string, color: string) => {
      if (!groupMap.has(id)) groupMap.set(id, { category_id: id, category_name: name, category_color: color, planned: 0, actual: 0, instances: [] });
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
  });

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
    SELECT id, name, category_id, default_amount, currency, active, start_month, end_month, notes, sort_order
    FROM monthly_expenses ORDER BY sort_order, name`) as any[];
  return rows.map((r) => ({
    ...r,
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
        INSERT INTO monthly_expenses (name, category_id, default_amount, currency, active, start_month, end_month, notes, sort_order)
        VALUES (${data.name}, ${data.category_id ?? null}, ${data.default_amount}, ${data.currency}, ${data.active},
                ${monthStartOrNull(data.start_month)}, ${monthStartOrNull(data.end_month)}, ${data.notes ?? null}, ${data.sort_order})
        RETURNING id`) as any[];
      return { id: rows[0].id as string };
    } catch (err) {
      throw new Error(`Failed to save monthly expense: ${(err as Error).message}`);
    }
  });

export const updateMonthlyExpense = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => monthlyExpenseInput.extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    try {
      await sql`
        UPDATE monthly_expenses SET
          name = ${data.name}, category_id = ${data.category_id ?? null},
          default_amount = ${data.default_amount}, currency = ${data.currency},
          active = ${data.active},
          start_month = ${monthStartOrNull(data.start_month)},
          end_month = ${monthStartOrNull(data.end_month)},
          notes = ${data.notes ?? null}, sort_order = ${data.sort_order}
        WHERE id = ${data.id}`;
      return { ok: true };
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
             c.name AS category_name, c.color AS category_color,
             t.amount AS tx_amount, t.on_date AS tx_date
      FROM monthly_expense_instances mei
      LEFT JOIN categories c ON c.id = mei.category_id
      LEFT JOIN transactions t ON t.id = mei.transaction_id
      WHERE mei.month = ${monthDate}::date
      ORDER BY c.sort_order NULLS LAST, mei.name_snapshot`) as any[];
    return rows.map((r) => ({
      id: r.id,
      monthly_expense_id: r.monthly_expense_id,
      month: d(r.month),
      name: r.name_snapshot,
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
    })) as MonthlyExpenseInstance[];
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
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const monthDate = `${data.month}-01`;
    const rows = (await sql`
      INSERT INTO monthly_expense_instances
        (monthly_expense_id, month, name_snapshot, category_id, planned_amount, currency, status, is_ad_hoc, notes)
      VALUES (NULL, ${monthDate}, ${data.name}, ${data.category_id ?? null}, ${data.planned_amount}, ${data.currency}, 'pending', true, ${data.notes ?? null})
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
    }).parse(data),
  )
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    // Build a partial update — only overwrite provided fields.
    const cur = (await sql`SELECT name_snapshot, category_id, planned_amount, notes FROM monthly_expense_instances WHERE id = ${data.id}`) as any[];
    if (cur.length === 0) throw new Error("Instance not found");
    const name = data.name ?? cur[0].name_snapshot;
    const categoryId = data.category_id === undefined ? cur[0].category_id : data.category_id;
    const planned = data.planned_amount === undefined ? n(cur[0].planned_amount) : data.planned_amount;
    const notes = data.notes === undefined ? cur[0].notes : data.notes;
    await sql`
      UPDATE monthly_expense_instances
      SET name_snapshot = ${name}, category_id = ${categoryId}, planned_amount = ${planned}, notes = ${notes}
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
