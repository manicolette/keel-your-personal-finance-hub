// Run with: npx tsx src/lib/quick-parse.test.ts
import assert from "node:assert/strict";
import { parseQuickEntry } from "./quick-parse";

const today = new Date(2026, 9, 14); // Wed Oct 14 2026, local time
const ctx = {
  categories: [
    { id: "groc", name: "Groceries", kind: "expense" as const },
    { id: "eat", name: "Eating out", kind: "expense" as const },
    { id: "trans", name: "Transportation", kind: "expense" as const },
    { id: "rent", name: "Rent, Electricity and WiFi", kind: "expense" as const },
    { id: "stip", name: "Stipend", kind: "income" as const },
  ],
  accounts: [
    { id: "cap", name: "Capital One Checking" },
    { id: "sofi", name: "SoFi Checking" },
  ],
  history: [
    { notes: "Target run", category_id: "groc", account_id: "sofi" },
    { notes: "rent", category_id: "rent", account_id: "cap" },
  ],
};

let r = parseQuickEntry("coffee 4.50", today, ctx);
assert.deepEqual([r.amount, r.date, r.kind, r.category_id, r.description], [4.5, "2026-10-14", "expense", "eat", "coffee"]);
assert.equal(r.account_id, "sofi", "defaults to most recently used account");

r = parseQuickEntry("lunch 12 chipotle yesterday", today, ctx);
assert.deepEqual([r.amount, r.date, r.category_id, r.description], [12, "2026-10-13", "eat", "lunch chipotle"]);

r = parseQuickEntry("$62.40 publix from capital one", today, ctx);
assert.deepEqual([r.amount, r.category_id, r.account_id, r.description], [62.4, "groc", "cap", "publix"]);

r = parseQuickEntry("target 30 monday", today, ctx);
assert.deepEqual([r.amount, r.date, r.category_id], [30, "2026-10-12", "groc"], "learned target -> groceries");

r = parseQuickEntry("gas 35 on 10/9", today, ctx);
assert.deepEqual([r.amount, r.date, r.category_id], [35, "2026-10-09", "trans"]);

r = parseQuickEntry("groceries 80 oct 3rd", today, ctx);
assert.deepEqual([r.amount, r.date, r.category_id], [80, "2026-10-03", "groc"]);

r = parseQuickEntry("stipend 1650", today, ctx);
assert.deepEqual([r.kind, r.amount, r.category_id], ["income", 1650, "stip"]);

r = parseQuickEntry("+200 refund", today, ctx);
assert.deepEqual([r.kind, r.amount], ["income", 200]);

r = parseQuickEntry("something odd", today, ctx);
assert.deepEqual([r.amount, r.category_id], [null, null]);

r = parseQuickEntry("wednesday dinner 25", today, ctx);
assert.equal(r.date, "2026-10-14", "today's weekday means today");
r = parseQuickEntry("last wednesday dinner 25", today, ctx);
assert.equal(r.date, "2026-10-07");

r = parseQuickEntry("rent 1022 oct 5", new Date(2026, 8, 27), ctx);
assert.equal(r.date, "2026-10-05", "a date a week ahead stays this year");
r = parseQuickEntry("gift 40 dec 28", new Date(2027, 0, 3), ctx);
assert.equal(r.date, "2026-12-28", "late December typed in January is last year");
r = parseQuickEntry("gift 40 12/28", new Date(2027, 0, 3), ctx);
assert.equal(r.date, "2026-12-28");

console.log("all quick-parse tests passed");
