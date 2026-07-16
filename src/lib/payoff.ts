// Standard amortization payoff calculator.
// r = APR / 100 / 12 (monthly rate).
// If r == 0: months = ceil(balance / payment), interest = 0.
// If payment <= balance * r: never pays off (payment doesn't cover interest).
// Else: months = ceil( -ln(1 - balance*r/payment) / ln(1+r) ).
//       total interest = payment * months - balance (last payment may be smaller,
//       but this bounds it; we clamp interest by recomputing the true last payment).

export type Payoff = {
  months: number | null; // null => never pays off
  totalInterest: number;
  payoffDate: string | null; // YYYY-MM-DD, first-of-month N months from now
};

export function computePayoff(balance: number, apr: number, payment: number): Payoff {
  if (balance <= 0) return { months: 0, totalInterest: 0, payoffDate: todayIso() };
  if (payment <= 0) return { months: null, totalInterest: 0, payoffDate: null };
  const r = apr / 100 / 12;
  if (r === 0) {
    const months = Math.ceil(balance / payment);
    return { months, totalInterest: 0, payoffDate: monthsFromNow(months) };
  }
  const interestOnly = balance * r;
  if (payment <= interestOnly) return { months: null, totalInterest: 0, payoffDate: null };
  const months = Math.ceil(-Math.log(1 - (balance * r) / payment) / Math.log(1 + r));
  // Simulate exact interest by iterating; keeps last-payment rounding correct.
  let bal = balance;
  let interest = 0;
  for (let i = 0; i < months; i++) {
    const monthInterest = bal * r;
    const principal = Math.min(bal, payment - monthInterest);
    interest += monthInterest;
    bal -= principal;
    if (bal <= 0.005) break;
  }
  return {
    months,
    totalInterest: Math.max(0, Math.round(interest * 100) / 100),
    payoffDate: monthsFromNow(months),
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function monthsFromNow(m: number) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + m, 1));
  return d.toISOString().slice(0, 10);
}
