// Debt math for Keel. Pure functions only (no DB, no React) so they can be tested directly.
//
// Conventions
// - APR values are percentages (24 means 24%).
// - Projections use standard monthly amortization: interest = balance * APR / 12 each month,
//   the payment covers interest first, the rest reduces principal.
// - Actual balance history (between a known balance and logged payments) accrues interest
//   daily at APR / 365, which is how card issuers and most loan servicers compute it.
// - Everything is kept at full precision. Round only when displaying or saving to the DB.

export type DebtTerms = {
  balance: number;
  apr: number;
  minPayment: number;
  extraPayment?: number;
  promoApr?: number | null;
  promoEndDate?: string | null; // YYYY-MM-DD; the promo rate applies before this date
};

export type ScheduleRow = {
  month: string; // YYYY-MM of the payment
  apr: number; // rate that applied this month
  startBalance: number;
  interest: number;
  payment: number;
  principal: number;
  endBalance: number;
};

export type Schedule = {
  rows: ScheduleRow[];
  months: number | null; // null when the debt never pays off
  totalInterest: number; // over the rows computed (up to payoff, or the cap)
  totalPaid: number;
  payoffMonth: string | null; // YYYY-MM of the final payment
  neverPaysOff: boolean;
  // Set when the payment can't keep up with interest at the regular APR.
  shortfall: { monthlyInterest: number; payment: number } | null;
};

const EPS = 0.005; // half a cent
const MAX_MONTHS = 600; // 50 years

export const monthlyRate = (apr: number) => apr / 100 / 12;

// ---------- date helpers (UTC, month granularity) ----------
export function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Month (YYYY-MM) of the next scheduled payment, based on the due day. */
export function firstPaymentMonth(dueDay: number | null | undefined, today: string = todayIso()): string {
  const ym = today.slice(0, 7);
  const day = Number(today.slice(8, 10));
  if (dueDay && day < dueDay) return ym;
  return addMonths(ym, 1);
}

function rateForMonth(t: DebtTerms, ym: string): number {
  if (t.promoApr != null && t.promoEndDate && `${ym}-01` < t.promoEndDate) return t.promoApr;
  return t.apr;
}

// ---------- single-debt schedule ----------
export function buildSchedule(t: DebtTerms, startMonth: string, maxMonths = MAX_MONTHS): Schedule {
  const payment = Math.max(0, t.minPayment) + Math.max(0, t.extraPayment ?? 0);
  const rows: ScheduleRow[] = [];
  let bal = t.balance;
  let totalInterest = 0;
  let totalPaid = 0;

  if (bal <= EPS) {
    return { rows, months: 0, totalInterest: 0, totalPaid: 0, payoffMonth: null, neverPaysOff: false, shortfall: null };
  }

  // Can the payment ever beat interest at the regular rate?
  const regularInterest = bal * monthlyRate(t.apr);
  const shortfall = payment <= regularInterest + 1e-9 && t.apr > 0
    ? { monthlyInterest: regularInterest, payment }
    : null;

  for (let i = 0; i < maxMonths && bal > EPS; i++) {
    const month = addMonths(startMonth, i);
    const apr = rateForMonth(t, month);
    const interest = bal * monthlyRate(apr);
    const due = bal + interest;
    const pay = Math.min(payment, due);
    const principal = pay - interest;
    const end = due - pay;
    rows.push({ month, apr, startBalance: bal, interest, payment: pay, principal, endBalance: end });
    totalInterest += interest;
    totalPaid += pay;
    // Balance not shrinking at the regular rate means it never will.
    if (apr === t.apr && end >= bal - 1e-9) {
      return { rows, months: null, totalInterest, totalPaid, payoffMonth: null, neverPaysOff: true,
        shortfall: shortfall ?? { monthlyInterest: interest, payment: pay } };
    }
    bal = end;
  }

  if (bal > EPS) {
    return { rows, months: null, totalInterest, totalPaid, payoffMonth: null, neverPaysOff: true, shortfall };
  }
  return {
    rows,
    months: rows.length,
    totalInterest,
    totalPaid,
    payoffMonth: rows[rows.length - 1].month,
    neverPaysOff: false,
    shortfall: null,
  };
}

// ---------- multi-debt payoff strategies ----------
export type StrategyDebt = DebtTerms & { id: string; name: string };
export type Strategy = "avalanche" | "snowball" | "minimums";

export type StrategyResult = {
  strategy: Strategy;
  months: number | null;
  debtFreeMonth: string | null;
  totalInterest: number;
  totalPaid: number;
  neverPaysOff: boolean;
  order: { id: string; name: string; payoffMonth: string | null; interest: number }[];
};

/**
 * Pay every debt's minimum each month; the extra amount plus the minimums of debts already
 * paid off ("rollover") go to one target debt, chosen by highest APR (avalanche) or smallest
 * balance (snowball). "minimums" pays only minimums with no extra and no rollover.
 * Per-debt extraPayment is ignored here; the shared `extra` is the lever.
 */
export function simulateStrategy(
  debts: StrategyDebt[],
  extra: number,
  strategy: Strategy,
  startMonth: string,
  maxMonths = MAX_MONTHS,
): StrategyResult {
  const state = debts
    .filter((d) => d.balance > EPS)
    .map((d) => ({ ...d, bal: d.balance, interest: 0, payoffMonth: null as string | null }));
  let totalInterest = 0;
  let totalPaid = 0;
  let month = startMonth;
  let i = 0;

  for (; i < maxMonths && state.some((d) => d.bal > EPS); i++) {
    month = addMonths(startMonth, i);
    const startTotal = state.reduce((s, d) => s + d.bal, 0);

    // 1. Accrue interest.
    for (const d of state) {
      if (d.bal <= EPS) continue;
      const int = d.bal * monthlyRate(rateForMonth(d, month));
      d.bal += int;
      d.interest += int;
      totalInterest += int;
    }

    // 2. Minimums. Freed-up minimums from finished debts join the pool (except in "minimums").
    let pool = strategy === "minimums" ? 0 : Math.max(0, extra);
    for (const d of state) {
      const min = Math.max(0, d.minPayment);
      if (d.bal <= EPS) {
        if (strategy !== "minimums") pool += min;
        continue;
      }
      const pay = Math.min(min, d.bal);
      d.bal -= pay;
      totalPaid += pay;
      if (strategy !== "minimums") pool += min - pay; // leftover when the minimum overshoots
    }

    // 3. Pool to targets in strategy order, cascading when a target is cleared.
    if (pool > 0) {
      const targets = state
        .filter((d) => d.bal > EPS)
        .sort((a, b) =>
          strategy === "avalanche"
            ? rateForMonth(b, month) - rateForMonth(a, month) || a.bal - b.bal
            : a.bal - b.bal || rateForMonth(b, month) - rateForMonth(a, month),
        );
      for (const d of targets) {
        if (pool <= 0) break;
        const pay = Math.min(pool, d.bal);
        d.bal -= pay;
        pool -= pay;
        totalPaid += pay;
      }
    }

    for (const d of state) {
      if (d.bal <= EPS && d.payoffMonth == null) {
        d.bal = 0;
        d.payoffMonth = month;
      }
    }

    const endTotal = state.reduce((s, d) => s + d.bal, 0);
    if (endTotal >= startTotal - 1e-9) break; // not making progress: never pays off
  }

  const done = state.every((d) => d.bal <= EPS);
  const order = [...state]
    .sort((a, b) => (a.payoffMonth ?? "9999").localeCompare(b.payoffMonth ?? "9999"))
    .map((d) => ({ id: d.id, name: d.name, payoffMonth: d.payoffMonth, interest: d.interest }));
  return {
    strategy,
    months: done ? (state.length === 0 ? 0 : i) : null,
    debtFreeMonth: done && state.length > 0 ? month : null,
    totalInterest,
    totalPaid,
    neverPaysOff: !done,
    order,
  };
}

// ---------- actual balance from a known balance plus logged payments ----------
export type ReplayPayment = { amount: number; date: string };

function accrueDaily(bal: number, fromIso: string, toIso: string, t: Pick<DebtTerms, "apr" | "promoApr" | "promoEndDate">): number {
  if (bal <= 0 || toIso <= fromIso) return 0;
  const promoEnd = t.promoApr != null && t.promoEndDate ? t.promoEndDate : null;
  let interest = 0;
  if (promoEnd && fromIso < promoEnd) {
    const promoTo = toIso < promoEnd ? toIso : promoEnd;
    interest += bal * ((t.promoApr ?? 0) / 100 / 365) * daysBetween(fromIso, promoTo);
    if (toIso > promoEnd) interest += bal * (t.apr / 100 / 365) * daysBetween(promoEnd, toIso);
  } else {
    interest += bal * (t.apr / 100 / 365) * daysBetween(fromIso, toIso);
  }
  return interest;
}

/**
 * Starting from a balance known on `anchorDate`, apply payments in date order, accruing
 * daily interest between them. Returns the balance right after the last payment.
 */
export function replayBalance(
  anchorBalance: number,
  anchorDate: string,
  payments: ReplayPayment[],
  t: Pick<DebtTerms, "apr" | "promoApr" | "promoEndDate">,
): { balance: number; asOf: string; interest: number; paidOffOn: string | null } {
  let bal = anchorBalance;
  let at = anchorDate;
  let interest = 0;
  let paidOffOn: string | null = null;
  const sorted = [...payments].sort((a, b) => a.date.localeCompare(b.date));
  for (const p of sorted) {
    const int = accrueDaily(bal, at, p.date, t);
    interest += int;
    bal += int;
    if (p.date > at) at = p.date;
    bal -= p.amount;
    if (bal <= EPS && paidOffOn == null) paidOffOn = p.date;
    if (bal > EPS) paidOffOn = null;
  }
  return { balance: bal, asOf: at, interest, paidOffOn };
}

/** Interest that has built up since the last known balance, as of `toIso`. */
export function accruedSince(balance: number, sinceIso: string, toIso: string, t: Pick<DebtTerms, "apr" | "promoApr" | "promoEndDate">): number {
  return accrueDaily(balance, sinceIso, toIso, t);
}
