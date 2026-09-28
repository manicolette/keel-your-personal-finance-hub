// Reads a plain-English question about money into an intent Keel can answer from its own data.
// Pure and dependency-free; see ask-parse.test.ts.

export type Period = { kind: "month"; month: string } | { kind: "range"; from: string; to: string; label: string };
export type AskIntent =
  | { type: "spent_on"; term: string; period: Period }
  | { type: "spent_total"; period: Period }
  | { type: "due"; period: Period }
  | { type: "safe" }
  | { type: "afford"; amount: number; when: string | null }
  | { type: "compare"; month: string; prev: string }
  | { type: "biggest"; period: Period }
  | { type: "income"; period: Period }
  | { type: "debt_free" }
  | { type: "unknown" };

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ym = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const prevMonth = (m: string) => { const [y, mm] = m.split("-").map(Number); return ym(new Date(y, mm - 2, 1)); };

function periodOf(q: string, today: Date): Period {
  const month = ym(today);
  if (/\blast month\b/.test(q)) return { kind: "month", month: prevMonth(month) };
  if (/\btoday\b/.test(q)) return { kind: "range", from: iso(today), to: iso(today), label: "today" };
  if (/\btomorrow\b/.test(q)) { const t = iso(addDays(today, 1)); return { kind: "range", from: t, to: t, label: "tomorrow" }; }
  if (/\blast week(end)?\b/.test(q)) {
    const end = addDays(today, -(today.getDay() || 7)); // the most recent Sunday before today
    const weekend = /weekend/.test(q);
    return { kind: "range", from: iso(addDays(end, weekend ? -1 : -6)), to: iso(end), label: weekend ? "last weekend" : "last week" };
  }
  if (/\b(this|next) week\b/.test(q) || /\bweek\b/.test(q)) {
    const next = /next week/.test(q);
    const start = addDays(today, next ? 7 - today.getDay() : 0);
    return { kind: "range", from: iso(start), to: iso(addDays(start, next ? 6 : 6 - today.getDay())), label: next ? "next week" : "this week" };
  }
  const named = MONTHS.findIndex((mn) => new RegExp(`\\b(in )?${mn}\\b|\\b${mn.slice(0, 3)}\\b`).test(q));
  if (named >= 0) {
    let y = today.getFullYear();
    if (named > today.getMonth() + 2) y -= 1; // "in december" asked in january means last december
    return { kind: "month", month: `${y}-${pad(named + 1)}` };
  }
  return { kind: "month", month };
}

const STOP = new Set(["how", "much", "did", "i", "spend", "spent", "on", "for", "at", "in", "this", "last", "month", "week", "the", "my", "have", "has", "been", "so", "far", "what", "was", "total", "money", "a", "an", "of", "do", "today", "yesterday", "weekend", "is", "whats", "what's"]);

export function parseAsk(question: string, today: Date): AskIntent {
  const q = question.toLowerCase().replace(/[?!.]/g, " ").replace(/\s+/g, " ").trim();
  if (!q) return { type: "unknown" };

  if (/debt[ -]?free|pay (off|down) (my )?(debt|loan|card)s?|when .*paid off/.test(q)) return { type: "debt_free" };

  const money = q.match(/\$?\s?(\d{1,6}(?:\.\d{1,2})?)/);
  if (/\b(afford|can i (buy|spend|get))\b/.test(q) && money) {
    const when = /\b(saturday|sunday|monday|tuesday|wednesday|thursday|friday|tomorrow|today|this weekend|next week)\b/.exec(q)?.[1] ?? null;
    return { type: "afford", amount: Number(money[1]), when };
  }

  if (/\b(safe to spend|left to spend|how much (is |do i have )?left|how much can i spend|what do i have left)\b/.test(q)) return { type: "safe" };

  if (/\b(compare|compared|vs|versus|than last month|more than|less than)\b/.test(q)) {
    const p = periodOf(q.replace(/last month/g, ""), today);
    const month = p.kind === "month" ? p.month : ym(today);
    return { type: "compare", month, prev: prevMonth(month) };
  }

  if (/\b(due|bills? (coming|left|this)|upcoming|owe this)\b/.test(q)) return { type: "due", period: periodOf(q, today) };

  if (/\b(biggest|largest|most expensive|top)\b/.test(q)) return { type: "biggest", period: periodOf(q, today) };

  if (/\b(income|earned|received|got paid|paid me|stipend|paycheck|salary)\b/.test(q) && !/\bspen[dt]\b/.test(q)) return { type: "income", period: periodOf(q, today) };

  if (/\bspen[dt]\b|\bcost\b|\bhow much\b/.test(q)) {
    const period = periodOf(q, today);
    const m = q.match(/\b(?:on|for|at)\s+([a-z][a-z &'-]*?)(?=\s+(?:this|last|in|so|today|yesterday|since|during)\b|$)/);
    const term = (m?.[1] ?? q.split(" ").filter((w) => !STOP.has(w) && !MONTHS.includes(w) && !/^\d/.test(w)).join(" ")).trim();
    if (term && !/^(everything|all|total|in total)$/.test(term)) return { type: "spent_on", term, period };
    return { type: "spent_total", period };
  }

  return { type: "unknown" };
}
