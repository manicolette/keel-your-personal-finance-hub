// Turns a one-line entry like "lunch 12 chipotle yesterday" into a transaction draft.
// Pure and dependency-free so it can be unit tested (see quick-parse.test.ts).

export type ParseCategory = { id: string; name: string; kind: "income" | "expense" };
export type ParseAccount = { id: string; name: string };
/** Recent transactions, newest first, used to learn "publix" -> Groceries. */
export type ParseHistory = { notes: string | null; category_id: string | null; account_id: string }[];

export type QuickDraft = {
  amount: number | null;
  date: string; // YYYY-MM-DD
  kind: "expense" | "income";
  description: string;
  category_id: string | null;
  account_id: string | null;
};

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Common words -> a pattern for the category name they most likely belong to.
const KEYWORDS: [RegExp, RegExp][] = [
  [/^(publix|walmart|aldi|kroger|costco|groceries|grocery|trader|wholefoods|sams|lidl|winn)$/, /grocer|food/],
  [/^(coffee|lunch|dinner|breakfast|chipotle|starbucks|mcdonalds|pizza|takeout|doordash|ubereats|restaurant|chick|wendys|panera)$/, /eat|dining|restaurant|food/],
  [/^(gas|fuel|shell|exxon|chevron|bp|wawa|circlek|racetrac)$/, /gas|fuel|transport|car/],
  [/^(uber|lyft|parking|toll|oil|tires|mechanic)$/, /transport|car/],
  [/^(netflix|spotify|hulu|disney|icloud|youtube|prime|claude|chatgpt|microsoft)$/, /stream|tech|subscri/],
  [/^(gym|crunch|yoga|pharmacy|cvs|walgreens|doctor|dentist)$/, /health|fitness|medical/],
  [/^(rent|electric|electricity|water|trash|wifi|internet|xfinity|talgov)$/, /rent|electric|housing|utilit|wifi/],
  [/^(hair|nails|salon|beauty|skincare|lashes|braids)$/, /beauty|self|care|hair/],
];
const INCOME_WORDS = /^(income|stipend|salary|paycheck|pay|refund|reimbursement|received|deposit)$/;

// A date with no year means this year, unless that is more than two months away, in which case
// it is last year ("dec 28" typed in January). Near-future dates are kept for logging ahead.
const tooFarAhead = (d: Date, today: Date) => d.getTime() - today.getTime() > 62 * 86400000;
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

export function parseQuickEntry(
  input: string,
  today: Date,
  ctx: { categories: ParseCategory[]; accounts: ParseAccount[]; history: ParseHistory },
): QuickDraft {
  let rest = ` ${input.trim()} `;
  let amount: number | null = null;
  let date = iso(today);
  let kind: QuickDraft["kind"] = "expense";

  // Leading "+" means money in.
  if (/^\s*\+/.test(rest)) { kind = "income"; rest = rest.replace(/^\s*\+/, " "); }

  // Dates first, so "9/26" is not read as an amount.
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = rest.match(re);
    if (m) { fn(m); rest = rest.replace(m[0], " "); }
  };
  take(/\s(today)\s/i, () => {});
  take(/\s(yesterday)\s/i, () => { const d = new Date(today); d.setDate(d.getDate() - 1); date = iso(d); });
  take(new RegExp(`\\s(?:last\\s+|on\\s+)?(${WEEKDAYS.join("|")})\\s`, "i"), (m) => {
    const target = WEEKDAYS.indexOf(m[1].toLowerCase());
    const d = new Date(today);
    let back = (d.getDay() - target + 7) % 7;
    if (/last\s/i.test(m[0]) && back === 0) back = 7;
    d.setDate(d.getDate() - back);
    date = iso(d);
  });
  take(/\s(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/, (m) => {
    const mo = Number(m[1]), da = Number(m[2]);
    let yr = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : today.getFullYear();
    if (!m[3] && tooFarAhead(new Date(yr, mo - 1, da), today)) yr -= 1;
    date = `${yr}-${pad(mo)}-${pad(da)}`;
  });
  take(new RegExp(`\\s(?:on\\s+)?(${MONTHS.join("|")})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s`, "i"), (m) => {
    const mo = MONTHS.indexOf(m[1].toLowerCase().slice(0, 3)) + 1, da = Number(m[2]);
    let yr = today.getFullYear();
    if (tooFarAhead(new Date(yr, mo - 1, da), today)) yr -= 1;
    date = `${yr}-${pad(mo)}-${pad(da)}`;
  });

  // Amount: "$12", "12.50", "12,50".
  take(/\s\$?(\d{1,6}(?:[.,]\d{1,2})?)\s/, (m) => { amount = Number(m[1].replace(",", ".")); });

  // Account: "from sofi", "on capital one".
  let account_id: string | null = null;
  const lw = words(rest);
  for (const a of ctx.accounts) {
    const aw = words(a.name).filter((w) => w.length > 2 && !/^(checking|savings|account|bank|card|credit)$/.test(w));
    const hits = aw.filter((w) => lw.includes(w));
    if (hits.length) {
      account_id = a.id;
      // Drop the account words (and a "from"/"on" before them) from the description.
      rest = rest.replace(/\s(?:from|on|with|via)\s/i, " ");
      for (const w of hits) rest = rest.replace(new RegExp(`\\b${w}\\b`, "ig"), " ");
      break;
    }
  }

  const description = rest.replace(/\s+/g, " ").trim();
  const dw = words(description);
  if (kind === "expense" && dw.some((w) => INCOME_WORDS.test(w))) kind = "income";

  const cats = ctx.categories.filter((c) => c.kind === kind);
  let category_id: string | null = null;
  // 1. A word matches a category name.
  for (const c of cats) {
    const cw = words(c.name).filter((w) => w.length > 2 && w !== "and");
    if (cw.some((w) => dw.some((x) => x === w || (x.length > 3 && w.startsWith(x)) || (w.length > 3 && x.startsWith(w))))) { category_id = c.id; break; }
  }
  // 2. The same word was used before: reuse that category (and account if none given).
  if (!category_id || !account_id) {
    for (const h of ctx.history) {
      const hw = words(h.notes ?? "");
      if (hw.length && dw.some((w) => w.length > 2 && hw.includes(w))) {
        if (!category_id && h.category_id && cats.some((c) => c.id === h.category_id)) category_id = h.category_id;
        if (!account_id) account_id = h.account_id;
        break;
      }
    }
  }
  // 3. Common keywords.
  if (!category_id) {
    outer: for (const [wordRe, catRe] of KEYWORDS) {
      if (dw.some((w) => wordRe.test(w))) {
        for (const c of cats) if (catRe.test(c.name.toLowerCase())) { category_id = c.id; break outer; }
      }
    }
  }
  if (!account_id && ctx.history[0]) account_id = ctx.history[0].account_id;

  return { amount, date, kind, description, category_id, account_id };
}
