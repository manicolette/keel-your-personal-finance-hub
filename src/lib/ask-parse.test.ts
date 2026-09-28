// Run with: npx tsx src/lib/ask-parse.test.ts
import assert from "node:assert/strict";
import { parseAsk } from "./ask-parse";

const today = new Date(2026, 9, 14); // Wed Oct 14 2026
const t = (q: string) => parseAsk(q, today);

assert.deepEqual(t("How much did I spend on eating out this month?"), { type: "spent_on", term: "eating out", period: { kind: "month", month: "2026-10" } });
assert.deepEqual(t("how much on groceries last month"), { type: "spent_on", term: "groceries", period: { kind: "month", month: "2026-09" } });
assert.deepEqual(t("What did I spend at Publix?"), { type: "spent_on", term: "publix", period: { kind: "month", month: "2026-10" } });
assert.deepEqual(t("how much have I spent in total this month"), { type: "spent_total", period: { kind: "month", month: "2026-10" } });
assert.deepEqual(t("how much did I spend"), { type: "spent_total", period: { kind: "month", month: "2026-10" } });
assert.equal(t("What's due this week?").type, "due");
assert.deepEqual((t("what's due this week") as any).period, { kind: "range", from: "2026-10-14", to: "2026-10-17", label: "this week" });
assert.deepEqual(t("How much is safe to spend?"), { type: "safe" });
assert.deepEqual(t("how much do I have left"), { type: "safe" });
assert.deepEqual(t("Can I afford a $90 dinner Saturday?"), { type: "afford", amount: 90, when: "saturday" });
assert.deepEqual(t("compare to last month"), { type: "compare", month: "2026-10", prev: "2026-09" });
assert.deepEqual(t("biggest purchase this month").type, "biggest");
assert.deepEqual(t("when will I be debt free"), { type: "debt_free" });
assert.deepEqual(t("how much income did I get in october"), { type: "income", period: { kind: "month", month: "2026-10" } });
assert.deepEqual(t("what did I spend last weekend"), { type: "spent_total", period: { kind: "range", from: "2026-10-10", to: "2026-10-11", label: "last weekend" } });
assert.deepEqual(t("tell me a joke"), { type: "unknown" });
console.log("all ask-parse tests passed");
