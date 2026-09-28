// Run with: npx tsx src/lib/payoff.test.ts
import assert from "node:assert/strict";
import { buildSchedule, replayBalance, simulateStrategy, firstPaymentMonth } from "./payoff";

const r2 = (x: number) => Math.round(x * 100) / 100;

// 1. Reference case: $5,000 at 24% APR, $200/month.
const s = buildSchedule({ balance: 5000, apr: 24, minPayment: 200 }, "2026-10");
assert.equal(r2(s.rows[0].interest), 100);
assert.equal(r2(s.rows[0].principal), 100);
assert.equal(r2(s.rows[0].endBalance), 4900);
assert.equal(s.months, 36);
assert.ok(s.totalInterest > 1990 && s.totalInterest < 2010, `interest ${s.totalInterest}`);
assert.ok(s.rows[s.rows.length - 1].payment < 200, "final payment is only what's needed");
assert.ok(Math.abs(s.rows[s.rows.length - 1].endBalance) < 0.005);
console.log("ref:", s.months, "months, interest", r2(s.totalInterest), "final payment", r2(s.rows.at(-1)!.payment), "payoff", s.payoffMonth);

// 2. Payment that doesn't cover interest never pays off.
const bad = buildSchedule({ balance: 5000, apr: 24, minPayment: 100 }, "2026-10");
assert.equal(bad.neverPaysOff, true);
assert.equal(bad.months, null);
assert.ok(bad.shortfall && r2(bad.shortfall.monthlyInterest) === 100);

// 3. 0% APR.
const zero = buildSchedule({ balance: 1000, apr: 0, minPayment: 300 }, "2026-10");
assert.equal(zero.months, 4);
assert.equal(zero.totalInterest, 0);
assert.equal(r2(zero.rows[3].payment), 100);

// 4. Promo 0% for the first 6 months, then 24%.
const promo = buildSchedule({ balance: 3000, apr: 24, minPayment: 200, promoApr: 0, promoEndDate: "2027-04-01" }, "2026-10");
assert.equal(promo.rows[0].interest, 0);
assert.equal(promo.rows[5].interest, 0); // 2027-03
assert.ok(promo.rows[6].interest > 0); // 2027-04
console.log("promo:", promo.months, "months, interest", r2(promo.totalInterest));

// 5. A promo payment below regular interest is fine during the promo, flagged after.
const promoBad = buildSchedule({ balance: 10000, apr: 24, minPayment: 150, promoApr: 0, promoEndDate: "2027-01-01" }, "2026-10");
assert.equal(promoBad.rows[2].interest, 0); // still in promo
assert.equal(promoBad.neverPaysOff, true); // $150 < ~$191 interest once the promo ends

// 6. Strategies.
const debts = [
  { id: "a", name: "Card A", balance: 5000, apr: 24, minPayment: 150 },
  { id: "b", name: "Card B", balance: 1200, apr: 18, minPayment: 50 },
  { id: "c", name: "Loan", balance: 8000, apr: 7, minPayment: 200 },
];
const av = simulateStrategy(debts, 300, "avalanche", "2026-10");
const sn = simulateStrategy(debts, 300, "snowball", "2026-10");
const mins = simulateStrategy(debts, 0, "minimums", "2026-10");
assert.ok(!av.neverPaysOff && !sn.neverPaysOff);
assert.ok(av.totalInterest <= sn.totalInterest + 1e-6, "avalanche never costs more interest");
assert.equal(sn.order[0].id, "b", "snowball clears smallest first");
assert.equal(av.order[0].id, "a", "avalanche clears highest APR first");
assert.ok(mins.totalInterest > av.totalInterest);
// Totals reconcile: paid = starting balances + interest.
const start = debts.reduce((x, d) => x + d.balance, 0);
assert.ok(Math.abs(av.totalPaid - (start + av.totalInterest)) < 0.01);
assert.ok(Math.abs(sn.totalPaid - (start + sn.totalInterest)) < 0.01);
console.log("avalanche:", av.months, "mo", r2(av.totalInterest), "| snowball:", sn.months, "mo", r2(sn.totalInterest), "| minimums:", mins.months, "mo", r2(mins.totalInterest));

// 7. Replaying payments accrues interest between them.
const rep = replayBalance(1000, "2026-01-01", [{ amount: 100, date: "2026-01-31" }], { apr: 36.5 });
// 30 days at 0.1%/day = $30 interest
assert.equal(r2(rep.balance), 930);
assert.equal(r2(rep.interest), 30);
const rep2 = replayBalance(100, "2026-01-01", [{ amount: 100, date: "2026-01-01" }], { apr: 20 });
assert.equal(rep2.paidOffOn, "2026-01-01");

// 8. First payment month from due day.
assert.equal(firstPaymentMonth(15, "2026-09-10"), "2026-09");
assert.equal(firstPaymentMonth(15, "2026-09-20"), "2026-10");
assert.equal(firstPaymentMonth(null, "2026-09-20"), "2026-10");

console.log("all debt math tests passed");
