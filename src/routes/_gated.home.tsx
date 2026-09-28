import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { ChevronLeft, ChevronRight, PencilLine, Plus, ShieldCheck, Landmark, Bell, MessageSquare, Check, X } from "lucide-react";
import { useState } from "react";
import { getHome, type BudgetGroup, type HomeData, type MonthlyExpenseInstance } from "@/lib/keel.functions";
import { CategoryIcon, money } from "@/components/keel-ui";
import { useQuickAdd } from "@/components/quick-add";

const pad = (n: number) => String(n).padStart(2, "0");
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const currentMonth = () => localToday().slice(0, 7);
const shiftMonth = (m: string, delta: number) => {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mm - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};
const monthName = (m: string) =>
  new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
const shortDate = (iso: string) =>
  new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const homeQuery = (month: string) =>
  queryOptions({ queryKey: ["home", month] as const, queryFn: () => getHome({ data: { month, today: localToday() } }) });

export const Route = createFileRoute("/_gated/home")({
  validateSearch: zodValidator(z.object({ month: fallback(z.string(), "").default("") })),
  loaderDeps: ({ search }) => ({ month: search.month || currentMonth() }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(homeQuery(deps.month)),
  component: HomePage,
  errorComponent: ({ error }) => <div role="alert" className="text-sm text-destructive">{error.message}</div>,
});

function HomePage() {
  const { month: searchMonth } = Route.useSearch();
  const { data } = useSuspenseQuery(homeQuery(searchMonth || currentMonth()));
  const quickAdd = useQuickAdd();
  const month = data.month; // clamped to the start month on the server

  const billGroups = data.groups.filter((g) => g.instances.length > 0);
  const spendGroups = data.groups.filter((g) => g.limit != null);
  const payingAccounts = data.accounts.filter((a) => a.due > 0);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <header className="flex items-center justify-between">
        <span className="font-display text-[30px] font-semibold text-primary md:invisible">keel</span>
        <Link to="/ask" className="flex h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-bold">
          <MessageSquare size={17} /> Ask
        </Link>
      </header>

      <SetupChecklist data={data} />
      <Nudges data={data} onLog={() => quickAdd.open()} />

      <SafeToSpendCard data={data} month={month} />

      <button
        onClick={() => quickAdd.open()}
        className="flex h-[52px] items-center gap-2.5 rounded-full bg-foreground pl-5 pr-2 text-left text-background"
      >
        <PencilLine size={18} />
        <span className="flex-1 text-[15px] text-[#c9d1d6]">Type “coffee 4.50” to log…</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary">
          <Plus size={18} strokeWidth={2.4} />
        </span>
      </button>

      {payingAccounts.length > 0 && (
        <Section title="Accounts" note="bills still due from each" tone="text-[#34495e]">
          <div className="flex flex-col gap-2.5">
            {payingAccounts.map((a) => (
              <div key={a.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#e3e8ee] text-[#34495e]"><Landmark size={19} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">{a.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{a.bill_names.join(", ")}</div>
                  </div>
                  <span className="text-base font-bold tabular-nums">{money(a.balance, a.currency)}</span>
                </div>
                {a.short > 0 ? (
                  <div className="text-xs font-semibold text-[color:var(--negative)]">
                    {money(a.short, a.currency)} short for the {money(a.due, a.currency)} still due
                  </div>
                ) : (
                  <div className="text-xs font-semibold text-[color:var(--positive)]">Covers the {money(a.due, a.currency)} still due</div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Bills"
        note={`${money(data.bills_paid)} of ${money(data.bills_total)} paid`}
        tone="text-[#b24c2c]"
        action={<Link to="/budget" search={{ month }} className="text-sm font-semibold text-primary">Manage</Link>}
      >
        {billGroups.length === 0 ? (
          <Empty>
            No bills for {monthName(month)} yet. Add them on the <Link to="/monthly-expenses" className="font-semibold text-primary underline">Bills</Link> page.
          </Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {billGroups.map((g) => <BillGroup key={g.category_id ?? "none"} group={g} month={month} />)}
          </div>
        )}
      </Section>

      {spendGroups.length > 0 && (
        <Section title="Everyday spending" note={`${money(spendGroups.reduce((a, g) => a + (g.limit ?? 0), 0))} planned`} tone="text-[#2d6a45]">
          <div className="grid grid-cols-2 gap-2.5">
            {spendGroups.map((g) => <SpendCard key={g.category_id} group={g} />)}
          </div>
        </Section>
      )}

      {(data.goals.length > 0 || data.debt.count > 0) && (
        <Section title="Goals and debt" tone="text-primary">
          <div className="flex flex-col gap-2.5">
            {data.goals.map((g) => {
              const pct = g.target_amount > 0 ? Math.min(100, Math.round((g.progress_amount / g.target_amount) * 100)) : 0;
              return (
                <Link key={g.id} to="/goals" className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-accent text-primary"><ShieldCheck size={19} /></span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="truncate text-sm font-semibold">{g.name}</span>
                    <Bar pct={pct} color="var(--primary)" label={`${g.name}: ${pct}% saved`} />
                    <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{g.account_name ? `Held in ${g.account_name}` : "No account linked"}</span>
                      <span className="shrink-0 tabular-nums">{money(g.progress_amount)} of {money(g.target_amount)}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
            {data.debt.count > 0 && (
              <Link to="/debts" className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#e3e8ee] text-[#34495e]"><Landmark size={19} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="font-semibold">{data.debt.count} debt{data.debt.count === 1 ? "" : "s"}</span>
                    <span className="font-bold tabular-nums">{money(data.debt.total)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {money(data.debt.minimums)} minimums{data.debt.extra > 0 ? ` + ${money(data.debt.extra)} extra` : ""} a month · payoff plan
                  </div>
                </div>
              </Link>
            )}
          </div>
        </Section>
      )}

      {data.reminders.length > 0 && (
        <Section title="Reminders" tone="text-[#4e3f99]" action={<Link to="/reminders" className="text-sm font-semibold text-primary">All</Link>}>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {data.reminders.map((r) => (
              <div key={r.id} className="flex items-center gap-3 border-b border-muted px-3.5 py-3 last:border-0">
                <Bell size={16} className="text-[#4e3f99]" />
                <span className="flex-1 text-sm font-semibold">{r.title}</span>
                <span className="text-xs text-muted-foreground">{shortDate(r.due_date)}</span>
                {r.amount != null && <span className="text-sm font-bold tabular-nums">{money(r.amount)}</span>}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function SafeToSpendCard({ data, month }: { data: HomeData; month: string }) {
  const atStart = month <= data.start_month;
  // Gauge: share of this month's received income still safe to spend.
  const base = data.income_received > 0 ? data.income_received : 0;
  const frac = base > 0 ? Math.max(0, Math.min(1, data.safe_to_spend / base)) : 0;
  const track = 424; // 3/4 of the circle's 566px circumference
  const negative = data.safe_to_spend < 0;
  const perDay = data.days_left > 0 ? data.safe_to_spend / data.days_left : null;
  const dollars = Math.trunc(Math.abs(data.safe_to_spend));
  const cents = pad(Math.round((Math.abs(data.safe_to_spend) - dollars) * 100) % 100);

  return (
    <section aria-label="This month" className="flex flex-col items-center gap-1 rounded-3xl border border-border bg-card p-5">
      <div className="flex w-full items-center justify-between">
        {atStart ? (
          <span className="h-11 w-11" />
        ) : (
          <Link to="/home" search={{ month: shiftMonth(month, -1) }} aria-label="Previous month"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-background"><ChevronLeft size={18} /></Link>
        )}
        <div className="flex flex-col items-center">
          <span className="text-[15px] font-bold">{monthName(month)}</span>
          <Link to="/budget" search={{ month }} className="text-xs font-semibold text-primary">Plan this month</Link>
        </div>
        <Link to="/home" search={{ month: shiftMonth(month, 1) }} aria-label="Next month"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-background"><ChevronRight size={18} /></Link>
      </div>

      <div className="relative flex h-[190px] w-[220px] items-center justify-center">
        <svg width="220" height="220" viewBox="0 0 220 220" className="absolute left-0 top-0" aria-hidden>
          <circle cx="110" cy="110" r="90" fill="none" stroke="#efe9df" strokeWidth="16" strokeLinecap="round"
            strokeDasharray={`${track} 566`} transform="rotate(135 110 110)" />
          {frac > 0 && (
            <circle cx="110" cy="110" r="90" fill="none" stroke="var(--primary)" strokeWidth="16" strokeLinecap="round"
              strokeDasharray={`${Math.max(1, track * frac)} 566`} transform="rotate(135 110 110)" />
          )}
        </svg>
        <div className="mt-5 flex flex-col items-center">
          <div className={`font-display ${dollars >= 1000 ? "text-[34px]" : "text-[42px]"} font-semibold leading-none tabular-nums ${negative ? "text-[color:var(--negative)]" : ""}`}>
            {negative ? "−" : ""}${dollars.toLocaleString("en-US")}<span className="text-[22px]">.{cents}</span>
          </div>
          <div className={`mt-1 text-sm font-semibold ${negative ? "text-[color:var(--negative)]" : "text-primary"}`}>
            {negative ? "over what's come in" : "safe to spend"}
          </div>
          <div className="text-xs text-muted-foreground">
            {data.days_left > 0 && perDay != null && perDay > 0
              ? `${data.days_left} days left · about ${money(perDay)} a day`
              : data.days_left > 0 ? `${data.days_left} days left` : "month ended"}
          </div>
        </div>
      </div>

      <div className="grid w-full grid-cols-3 gap-2">
        <Stat label="Received" value={money(data.income_received)} tone="text-[color:var(--positive)]" />
        <Stat label="Expected" value={money(data.income_still_expected)}
          sub={data.next_income ? `${data.next_income.name} · ${shortDate(data.next_income.date)}` : undefined} />
        <Stat label="Spent" value={money(data.spent)} />
      </div>
      <p className="pt-1.5 text-center text-xs text-muted-foreground">
        Money received this month, minus what you've spent and the {money(data.bills_due)} in bills still due.
      </p>
    </section>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[14px] bg-background p-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-[14px] font-bold leading-tight tabular-nums ${tone ?? ""}`}>{value}</span>
      {sub && <span className="truncate text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function Section({ title, note, tone, action, children }: { title: string; note?: string; tone?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={`font-sans text-[17px] font-bold ${tone ?? ""}`}>{title}</h2>
        <div className="flex items-baseline gap-3">
          {note && <span className="text-sm text-muted-foreground">{note}</span>}
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">{children}</div>;
}

function Bar({ pct, color, label }: { pct: number; color: string; label: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-1.5 rounded-full bg-muted">
      <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  );
}

function BillGroup({ group, month }: { group: BudgetGroup; month: string }) {
  const items = group.instances.filter((i) => i.status !== "paused").sort((x, y) => (x.due_day ?? 99) - (y.due_day ?? 99));
  return (
    <div className="overflow-hidden rounded-[20px] border border-border bg-card">
      <div className="flex items-center gap-2 px-3.5 pb-1 pt-3">
        <span className="flex-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{group.category_name}</span>
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
          {money(items.filter((i) => i.status !== "skipped").reduce((a, i) => a + i.planned_amount, 0))}
        </span>
      </div>
      {items.map((i) => <BillRow key={i.id} inst={i} group={group} month={month} />)}
    </div>
  );
}

function BillRow({ inst, group, month }: { inst: MonthlyExpenseInstance; group: BudgetGroup; month: string }) {
  const due = inst.due_day ? `${new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString("en-US", { month: "short" })} ${inst.due_day}` : null;
  const status =
    inst.status === "paid" ? { text: "Paid", cls: "text-[color:var(--positive)]" }
      : inst.status === "skipped" ? { text: "Skipped", cls: "text-muted-foreground" }
        : { text: "Upcoming", cls: "text-[color:var(--warning)]" };
  return (
    <Link to="/budget" search={{ month }} className="flex items-center gap-3 px-3.5 py-2">
      <CategoryIcon icon={group.category_icon} color={group.category_color} size={32} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{inst.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {[due, inst.account_id ? null : "no paying account set"].filter(Boolean).join(" · ") || " "}
        </div>
      </div>
      <div className="flex flex-col items-end">
        <span className={`text-sm font-bold tabular-nums ${inst.status === "skipped" ? "line-through text-muted-foreground" : ""}`}>
          {money(inst.transaction_amount ?? inst.planned_amount, inst.currency)}
        </span>
        <span className={`text-[11px] font-bold ${status.cls}`}>{status.text}</span>
      </div>
    </Link>
  );
}

function SpendCard({ group }: { group: BudgetGroup }) {
  const limit = group.limit ?? 0;
  const billsPaid = group.instances.reduce((a, i) => a + (i.transaction_amount ?? 0), 0);
  const spent = Math.max(0, group.actual - billsPaid);
  const left = limit - spent;
  const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
  const over = left < 0;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <CategoryIcon icon={group.category_icon} color={group.category_color} size={32} />
        <span className="truncate text-sm font-semibold">{group.category_name}</span>
      </div>
      <div className={`text-[17px] font-bold tabular-nums ${over ? "text-[color:var(--negative)]" : ""}`}>
        {money(Math.abs(left))} <span className="text-xs font-medium">{over ? "over" : "left"}</span>
      </div>
      <Bar pct={over ? 100 : pct} color={over ? "var(--negative)" : group.category_color} label={`${group.category_name}: ${money(spent)} of ${money(limit)} spent`} />
    </div>
  );
}

function Nudges({ data, onLog }: { data: HomeData; onLog: () => void }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const now = new Date();
  const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const items = data.nudges.filter((n) => !hidden.includes(n.text) && (!n.after || hhmm >= n.after));
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      {items.map((n) => (
        <div key={n.text} className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm ${n.kind === "bill" ? "bg-[#fbe1d5] text-[#6e2a17]" : n.kind === "income" ? "bg-[#dcefe3] text-[#1e4a31]" : "bg-accent text-accent-foreground"}`}>
          <Bell size={17} className="shrink-0" />
          <span className="flex-1">{n.text}</span>
          {n.kind === "log" && <button onClick={onLog} className="h-9 shrink-0 rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground">Log it</button>}
          {n.kind === "income" && <Link to="/income" className="h-9 shrink-0 rounded-full bg-foreground px-3 py-2 text-xs font-bold text-background">Income</Link>}
          <button onClick={() => setHidden((h) => [...h, n.text])} aria-label="Dismiss" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"><X size={16} /></button>
        </div>
      ))}
    </div>
  );
}

// First-run guide. Disappears once every step is done.
function SetupChecklist({ data }: { data: HomeData }) {
  const s = data.setup;
  const steps = [
    { done: s.bank_accounts > 0 && s.accounts_with_balance > 0, title: "Your accounts and balances", sub: s.bank_accounts === 0 ? "Add your bank accounts" : `${s.bank_accounts - s.accounts_with_balance} still at $0. Enter what's in them now`, to: "/accounts" },
    { done: s.income_sources > 0, title: "Income you expect", sub: "Stipend, paychecks, anything regular", to: "/income" },
    { done: s.bills > 0 && s.bills_without_account === 0, title: "Bills and the account that pays each", sub: s.bills === 0 ? "Rent, phone, subscriptions, debt minimums" : `${s.bills_without_account} bill${s.bills_without_account === 1 ? "" : "s"} still need a paying account`, to: "/monthly-expenses" },
    { done: s.limits > 0, title: "Spending limits", sub: "Groceries, eating out, gas, fun", to: "/categories" },
  ];
  const left = steps.filter((x) => !x.done).length;
  if (left === 0) return null;
  return (
    <section className="flex flex-col gap-2.5 rounded-3xl border border-border bg-card p-4">
      <div>
        <h2 className="text-[22px]">Finish setting up</h2>
        <p className="text-[13px] text-muted-foreground">{left} step{left === 1 ? "" : "s"} left. Home gets accurate once these are in.</p>
      </div>
      <ol className="flex flex-col gap-2">
        {steps.map((st, i) => (
          <li key={st.title}>
            <Link to={st.to} className={`flex items-center gap-3 rounded-2xl border p-3 ${st.done ? "border-border" : "border-primary"}`}>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${st.done ? "bg-[color:var(--positive)] text-white" : "border-2 border-primary text-primary"}`}>
                {st.done ? <Check size={16} strokeWidth={2.6} /> : i + 1}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className={`text-[15px] font-bold ${st.done ? "text-muted-foreground line-through" : ""}`}>{st.title}</span>
                {!st.done && <span className="text-xs text-muted-foreground">{st.sub}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
