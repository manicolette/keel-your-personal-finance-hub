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
export type RecurringIncome = ConstantItem;
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
export const listRecurringIncome = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const sql = await db();
  const rows = (await sql`
    SELECT id, name, amount, currency, frequency, next_date, account_id, category_id, active, notes
    FROM recurring_income ORDER BY next_date`) as any[];
  return rows.map((r) => ({ ...r, amount: n(r.amount), next_date: d(r.next_date), notes: s(r.notes) })) as RecurringIncome[];
});

export const createRecurringIncome = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => constInput.parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    const rows = (await sql`
      INSERT INTO recurring_income (name, amount, currency, frequency, next_date, account_id, category_id, active, notes)
      VALUES (${data.name}, ${data.amount}, ${data.currency}, ${data.frequency}, ${data.next_date}, ${data.account_id ?? null}, ${data.category_id ?? null}, ${data.active}, ${data.notes ?? null})
      RETURNING id`) as any[];
    return { id: rows[0].id as string };
  });

export const updateRecurringIncome = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => constInput.extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`
      UPDATE recurring_income SET name = ${data.name}, amount = ${data.amount}, currency = ${data.currency},
        frequency = ${data.frequency}, next_date = ${data.next_date},
        account_id = ${data.account_id ?? null}, category_id = ${data.category_id ?? null},
        active = ${data.active}, notes = ${data.notes ?? null}
      WHERE id = ${data.id}`;
    return { ok: true };
  });

export const deleteRecurringIncome = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireUnlocked();
    const sql = await db();
    await sql`DELETE FROM recurring_income WHERE id = ${data.id}`;
    return { ok: true };
  });

// Log a received income: create transaction, advance next_date by frequency.
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
    await sql`
      INSERT INTO transactions (on_date, account_id, category_id, kind, amount, currency, notes)
      VALUES (${data.on_date}, ${accountId}, ${inc.category_id ?? null}, 'income', ${inc.amount}, ${inc.currency}, ${`Income: ${inc.name}`})`;
    // Advance next_date by frequency.
    const nextIso = advanceByFrequency(d(inc.next_date), inc.frequency);
    await sql`UPDATE recurring_income SET next_date = ${nextIso} WHERE id = ${data.id}`;
    return { ok: true };
  });

function advanceByFrequency(iso: string, freq: string): string {
  const [y, m, day] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  if (freq === "weekly") dt.setUTCDate(dt.getUTCDate() + 7);
  else if (freq === "monthly") dt.setUTCMonth(dt.getUTCMonth() + 1);
  else if (freq === "quarterly") dt.setUTCMonth(dt.getUTCMonth() + 3);
  else if (freq === "yearly") dt.setUTCFullYear(dt.getUTCFullYear() + 1);
  return dt.toISOString().slice(0, 10);
}

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

    return {
      month,
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

  const [settingsRows, upcomingSubs, upcomingReminders, upcomingIncome, totals, live] = await Promise.all([
    sql`SELECT base_currency FROM app_settings LIMIT 1` as Promise<any[]>,
    sql`SELECT id, name, amount, currency, next_charge_date FROM subscriptions WHERE active = true ORDER BY next_charge_date LIMIT 5` as Promise<any[]>,
    sql`SELECT id, title, due_date, amount FROM reminders WHERE done = false ORDER BY due_date LIMIT 5` as Promise<any[]>,
    sql`SELECT id, name, amount, currency, next_date FROM recurring_income WHERE active = true ORDER BY next_date LIMIT 5` as Promise<any[]>,
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
      amount: n(r.amount),
      currency: r.currency as string,
      next_date: d(r.next_date),
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
