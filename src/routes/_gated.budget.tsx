import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useState } from "react";
import { toast } from "sonner";
import {
  createAdHocInstance,
  deleteInstance,
  getBudget,
  getPlanExtras,
  getSettings,
  listAccounts,
  listCategories,
  payExpenseDirect,
  setInstanceStatus,
  setMonthLimit,
  unlinkInstance,
  updateInstance,
  type Account,
  type BudgetGroup,
  type MonthlyExpenseInstance,
} from "@/lib/keel.functions";
import { Button, Card, CategoryIcon, EmptyState, PageHeader, Select, TextInput, money } from "@/components/keel-ui";

type PayAccount = Pick<Account, "id" | "name">;


const budgetQueryOptions = (month: string) =>
  queryOptions({
    queryKey: ["budget", month] as const,
    queryFn: () => getBudget({ data: { month } }),
  });

const catsQueryOptions = queryOptions({ queryKey: ["categories"], queryFn: () => listCategories() });
const acctsQueryOptions = queryOptions({ queryKey: ["accounts"], queryFn: () => listAccounts() });
const settingsQueryOptions = queryOptions({ queryKey: ["settings"], queryFn: () => getSettings() });
const extrasQueryOptions = (month: string) => queryOptions({ queryKey: ["plan_extras", month] as const, queryFn: () => getPlanExtras({ data: { month } }) });
const monthLabel = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });


// Local month, matching the Monthly Expenses and Subscriptions pages (UTC would flip to next month on evenings at month end).
const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const shiftMonth = (m: string, delta: number) => {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mm - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

const searchSchema = z.object({
  month: fallback(z.string(), currentMonth()).default(currentMonth()),
});

export const Route = createFileRoute("/_gated/budget")({
  validateSearch: zodValidator(searchSchema),
  loaderDeps: ({ search }) => ({ month: search.month }),
  loader: async ({ context, deps }) => {
    // Months before Keel's start month are never shown.
    const settings = await context.queryClient.ensureQueryData(settingsQueryOptions);
    if (deps.month < settings.start_month) throw redirect({ to: "/budget", search: { month: settings.start_month } });
    await Promise.all([
      context.queryClient.ensureQueryData(budgetQueryOptions(deps.month)),
      context.queryClient.ensureQueryData(catsQueryOptions),
      context.queryClient.ensureQueryData(acctsQueryOptions),
      context.queryClient.ensureQueryData(extrasQueryOptions(deps.month)),
    ]);

  },
  component: BudgetPage,
  errorComponent: ({ error }) => <div role="alert" className="text-sm text-destructive">{error.message}</div>,
});

function BudgetPage() {
  const { month } = Route.useSearch();
  const navigate = useNavigate();
  const go = (month: string) => navigate({ to: "/budget", search: { month } });
  const { data } = useSuspenseQuery(budgetQueryOptions(month));
  const { data: cats } = useSuspenseQuery(catsQueryOptions);
  const { data: accounts } = useSuspenseQuery(acctsQueryOptions);
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const startMonth = settings.start_month;
  const thisMonth = currentMonth() < startMonth ? startMonth : currentMonth();
  const expenseCats = cats.filter((c) => c.kind === "expense" && !c.archived);
  const activeAccounts = accounts.filter((a) => !a.archived);
  const payingAccounts = activeAccounts.filter((a) => a.kind !== "credit");

  // Does each account hold enough for the bills still due from it this month?
  const dueByAccount = new Map<string, number>();
  for (const g of data.groups) {
    for (const i of g.instances) {
      if (i.status === "pending" && i.account_id) dueByAccount.set(i.account_id, (dueByAccount.get(i.account_id) ?? 0) + i.planned_amount);
    }
  }
  const coverage = accounts
    .filter((a) => dueByAccount.has(a.id))
    .map((a) => ({ account: a, due: dueByAccount.get(a.id)!, short: Math.max(0, dueByAccount.get(a.id)! - a.current_balance) }));
  const showCoverage = month >= currentMonth() && coverage.length > 0;


  const { data: extras } = useSuspenseQuery(extrasQueryOptions(month));
  const billGroups = data.groups.filter((g) => g.instances.length > 0);
  const limitGroups = data.groups.filter((g) => g.limit != null && g.category_id);
  const billsPlanned = data.groups.reduce((a, g) => a + g.instances.filter((i) => i.status !== "paused" && i.status !== "skipped").reduce((x, i) => x + i.planned_amount, 0), 0);
  const limitsPlanned = limitGroups.reduce((a, g) => a + (g.limit ?? 0), 0);
  const leftToPlan = extras.income_expected - billsPlanned - limitsPlanned - extras.debt_extra;
  const paidCount = data.groups.reduce((s, g) => s + g.instances.filter((i) => i.status === "paid").length, 0);
  const pendingCount = data.groups.reduce((s, g) => s + g.instances.filter((i) => i.status === "pending").length, 0);
  const noLimitCats = expenseCats.filter((c) => c.monthly_limit == null && !limitGroups.some((g) => g.category_id === c.id));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <h1 className="text-[28px]">Plan {monthLabel(month).split(" ")[0]}</h1>
      <div className="flex items-center gap-2">
        <Link to="/budget" search={{ month: shiftMonth(month, -1) }} aria-label="Previous month" aria-disabled={month <= startMonth}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card aria-disabled:pointer-events-none aria-disabled:opacity-40">←</Link>
        <TextInput type="month" value={month} min={startMonth} aria-label="Month"
          onChange={(e) => go(e.target.value && e.target.value >= startMonth ? e.target.value : startMonth)} className="w-44" />
        <Link to="/budget" search={{ month: shiftMonth(month, 1) }} aria-label="Next month"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card">→</Link>
        {month !== thisMonth && <Link to="/budget" search={{ month: thisMonth }} className="text-sm font-semibold text-primary">This month</Link>}
      </div>

      <div className="flex gap-2.5 rounded-[18px] bg-accent p-3.5 text-accent-foreground">
        <span aria-hidden className="text-lg leading-none">↻</span>
        <p className="text-[13px]">
          <span className="font-bold">Each month starts fresh.</span> Bills and spending limits carry over; leftover money and overspending don't.
          Change anything below for {monthLabel(month)} only.
        </p>
      </div>

      <Card className="flex flex-col gap-2.5 p-[18px]">
        {[
          ["Income expected", extras.income_expected, "text-[color:var(--positive)]", ""],
          ["Bills and subscriptions", -billsPlanned, "", ""],
          ["Spending limits", -limitsPlanned, "", ""],
          ["Extra debt payments", -extras.debt_extra, "", ""],
        ].map(([label, v, cls]) => (
          <div key={label as string} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className={`font-bold tabular-nums ${cls}`}>{(v as number) < 0 ? "−" : ""}{money(Math.abs(v as number))}</span>
          </div>
        ))}
        <div className="h-px bg-muted" />
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-bold">{leftToPlan >= 0 ? "Left to plan" : "Over by"}</span>
          <span className={`font-display text-[28px] font-semibold tabular-nums ${leftToPlan >= 0 ? "text-primary" : "text-[color:var(--negative)]"}`}>{money(Math.abs(leftToPlan))}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {extras.income_expected === 0
            ? <>No income expected yet. Add a source on the <Link to="/income" className="font-semibold text-primary underline">Income</Link> page.</>
            : leftToPlan >= 0 ? "Give it a job with a spending limit, or leave it as a buffer." : "Planned spending is more than the income you expect this month."}
          {" "}{paidCount} bill{paidCount === 1 ? "" : "s"} paid, {pendingCount} still to pay.
        </p>
      </Card>

      {showCoverage && (
        <Card>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Bills still due, by account</div>
          <ul className="divide-y divide-muted">
            {coverage.map(({ account, due, short }) => (
              <li key={account.id} className="flex flex-col gap-0.5 py-2 text-sm sm:flex-row sm:items-center sm:gap-3">
                <span className="min-w-0 flex-1 font-semibold">{account.name}</span>
                <span className="tabular-nums text-muted-foreground">{money(due, account.currency)} due · {money(account.current_balance, account.currency)} in account</span>
                {short > 0 ? <span className="font-semibold text-[color:var(--negative)]">{money(short, account.currency)} short</span>
                  : <span className="font-semibold text-[color:var(--positive)]">Covered</span>}
              </li>
            ))}
          </ul>
          {coverage.some((c) => c.short > 0) && (
            <Link to="/transactions" search={{ view: "list", kind: "transfer" }} className="mt-2 inline-block text-sm font-semibold text-primary">Move money between accounts</Link>
          )}
        </Card>
      )}

      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-sans text-[17px] font-bold text-[#2d6a45]">Spending limits</h2>
          {extras.last_month >= startMonth && <span className="text-xs text-muted-foreground">{monthLabel(extras.last_month).split(" ")[0]} spent in grey</span>}
        </div>
        {limitGroups.length === 0 ? (
          <EmptyState>No spending limits yet. Give everyday categories like groceries a monthly limit on the <Link to="/categories" className="font-semibold text-primary underline">Categories</Link> page.</EmptyState>
        ) : (
          limitGroups.map((g) => <LimitRow key={g.category_id} group={g} month={month} lastSpent={extras.last_month_spent[g.category_id!] ?? 0} lastLabel={extras.last_month >= startMonth ? monthLabel(extras.last_month).split(" ")[0] : ""} />)
        )}
        {noLimitCats.length > 0 && limitGroups.length > 0 && (
          <p className="text-xs text-muted-foreground">Add limits to other categories on the <Link to="/categories" className="font-semibold text-primary underline">Categories</Link> page.</p>
        )}
      </section>

      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-sans text-[17px] font-bold text-[#b24c2c]">Bills</h2>
          <Link to="/monthly-expenses" className="text-sm font-semibold text-primary">Edit bills</Link>
        </div>
        {billGroups.length === 0 ? (
          <EmptyState>No bills for {monthLabel(month)}. Add recurring ones on the <Link to="/monthly-expenses" className="font-semibold text-primary underline">Bills</Link> page, or a one-off below.</EmptyState>
        ) : (
          billGroups.map((g) => <GroupCard key={g.category_id ?? "null"} group={g} month={month} accounts={payingAccounts} />)
        )}
      </section>

      <AdHocForm month={month} expenseCats={expenseCats} accounts={payingAccounts} />
    </div>
  );
}

function useInvalidateBudget(month: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["budget", month] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["networth-live"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

function GroupCard({ group, month, accounts }: { group: BudgetGroup; month: string; accounts: PayAccount[] }) {
  const pct = group.planned > 0 ? Math.round((group.actual / group.planned) * 100) : 0;
  const over = group.actual > group.planned && group.planned > 0;

  return (
    <Card className="p-0">
      <div className="flex items-center gap-3 px-3.5 pt-3.5">
        <CategoryIcon icon={group.category_icon} color={group.category_color} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{group.category_name}</div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {money(group.instances.filter((i) => i.status === "paid").reduce((x, i) => x + (i.transaction_amount ?? i.planned_amount), 0))} paid of {money(group.instances.filter((i) => i.status !== "paused" && i.status !== "skipped").reduce((x, i) => x + i.planned_amount, 0))}
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{group.instances.length} bill{group.instances.length === 1 ? "" : "s"}</span>
      </div>
      <div className="px-3.5 pt-2"><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full ${over ? "bg-[color:var(--negative)]" : "bg-primary"}`} style={{ width: `${Math.min(100, pct)}%` }} /></div></div>

      {group.instances.length > 0 && (
        <ul className="mt-2 divide-y divide-muted">
          {[...group.instances].sort((x, y) => (x.due_day ?? 99) - (y.due_day ?? 99)).map((inst) => (
            <InstanceRow key={inst.id} inst={inst} month={month} accounts={accounts} />
          ))}
        </ul>
      )}
    </Card>
  );
}


// Everyday spending against this month's limit. Bill payments in the same category are not
// counted here; they already show on their own rows below.
function LimitRow({ group, month, lastSpent, lastLabel }: { group: BudgetGroup; month: string; lastSpent: number; lastLabel: string }) {
  const invalidate = useInvalidateBudget(month);
  const setLimit = useServerFn(setMonthLimit);
  const mLimit = useMutation({ mutationFn: setLimit, onSuccess: invalidate, onError: (e: Error) => toast.error(e.message) });
  const limit = group.limit ?? 0;
  const billsPaid = group.instances.reduce((acc, i) => acc + (i.transaction_amount ?? 0), 0);
  const spent = Math.max(0, group.actual - billsPaid);
  const left = limit - spent;
  const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : spent > 0 ? 100 : 0;

  return (
    <div className="rounded-2xl border border-border bg-card px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <CategoryIcon icon={group.category_icon} color={group.category_color} size={32} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{group.category_name}</div>
          {lastLabel && <div className="text-xs text-muted-foreground tabular-nums">{money(lastSpent)} in {lastLabel}</div>}
          <div className={`text-xs tabular-nums ${left < 0 ? "font-medium text-[color:var(--negative)]" : "text-muted-foreground"}`}>
            {money(spent)} spent · {left < 0 ? `${money(-left)} over` : `${money(left)} left`}
          </div>
        </div>
        <label className="text-right">
          <span className="block text-[10px] uppercase text-muted-foreground">Limit this month</span>
          <input
            type="number"
            step="0.01"
            min="0"
            defaultValue={limit}
            key={`${month}-${limit}`}
            onBlur={(e) => {
              const val = Number(e.target.value);
              if (Number.isFinite(val) && val >= 0 && val !== limit) {
                mLimit.mutate({ data: { month, category_id: group.category_id!, limit: val } });
              }
            }}
            className="w-24 rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums"
          />
        </label>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${left < 0 ? "bg-[color:var(--negative)]" : "bg-primary"}`} style={{ width: `${pct}%` }} />
      </div>
      {group.limit_overridden && (
        <div className="mt-1.5 text-xs text-muted-foreground">
          Changed for this month only.{" "}
          <button
            className="font-medium text-primary hover:underline"
            onClick={() => mLimit.mutate({ data: { month, category_id: group.category_id!, limit: null } })}
          >
            {group.default_limit == null ? "Remove" : `Reset to ${money(group.default_limit)}`}
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: MonthlyExpenseInstance["status"] }) {
  const map: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-800",
    pending: "bg-amber-100 text-amber-800",
    paused: "bg-slate-200 text-slate-700",
    skipped: "bg-slate-200 text-slate-700",
  };
  const label: Record<string, string> = { paid: "Paid", pending: "Upcoming", paused: "Paused", skipped: "Skipped" };
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${map[status]}`}>{label[status]}</span>;
}

function InstanceRow({ inst, month, accounts }: { inst: MonthlyExpenseInstance; month: string; accounts: PayAccount[] }) {
  const invalidate = useInvalidateBudget(month);
  const update = useServerFn(updateInstance);
  const status = useServerFn(setInstanceStatus);
  const unlink = useServerFn(unlinkInstance);
  const remove = useServerFn(deleteInstance);
  const payFn = useServerFn(payExpenseDirect);
  const mUpdate = useMutation({ mutationFn: update, onSuccess: invalidate, onError: (e: Error) => toast.error(e.message) });
  const mStatus = useMutation({ mutationFn: status, onSuccess: invalidate, onError: (e: Error) => toast.error(e.message) });
  const mUnlink = useMutation({ mutationFn: unlink, onSuccess: () => { toast.success("Unlinked"); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const mDelete = useMutation({ mutationFn: remove, onSuccess: () => { toast.success("Removed"); invalidate(); }, onError: (e: Error) => toast.error(e.message) });

  const [editingName, setEditingName] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmt, setPayAmt] = useState<string>(String(inst.transaction_amount ?? inst.planned_amount ?? 0));
  const [payAcct, setPayAcct] = useState<string>(inst.account_id ?? accounts[0]?.id ?? "");
  const paysFrom = inst.account_id ? accounts.find((a) => a.id === inst.account_id)?.name ?? null : null;
  const [payDate, setPayDate] = useState<string>(inst.transaction_date ?? new Date().toISOString().slice(0, 10));
  const [payNote, setPayNote] = useState("");
  const [payPending, setPayPending] = useState(false);

  const submitPay = () => {
    if (!payAcct) { toast.error("Pick which account paid it"); return; }
    if (!(Number(payAmt) > 0)) { toast.error("Enter an amount greater than 0"); return; }
    setPayPending(true);
    payFn({ data: { instance_id: inst.id, account_id: payAcct, amount: Number(payAmt), on_date: payDate, notes: payNote || null } })
      .then(() => { toast.success(inst.status === "paid" ? "Updated" : "Marked paid"); setPayOpen(false); invalidate(); })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setPayPending(false));
  };

  const dueText = inst.due_day ? `due ${new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString("en-US", { month: "short" })} ${inst.due_day}` : null;
  return (
    <li className={`flex flex-col gap-2 px-3.5 py-3 ${inst.status === "paused" || inst.status === "skipped" ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {editingName ? (
            <input autoFocus defaultValue={inst.name} aria-label="Bill name"
              onBlur={(e) => { const name = e.target.value.trim(); setEditingName(false); if (name && name !== inst.name) mUpdate.mutate({ data: { id: inst.id, name } }); }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm" />
          ) : (
            <button onClick={() => setEditingName(true)} className="text-left text-[15px] font-semibold hover:underline">{inst.name}</button>
          )}
          <div className="text-xs text-muted-foreground">
            {[dueText, paysFrom ? `from ${paysFrom}${inst.account_overridden ? " (this month)" : ""}` : "paying account not set"].filter(Boolean).join(" · ")}
          </div>
          {inst.transaction_id && inst.transaction_amount != null && (
            <div className="text-xs text-[color:var(--positive)]">
              Paid {money(inst.transaction_amount, inst.currency)} on {inst.transaction_date}
              <button onClick={() => mUnlink.mutate({ data: { id: inst.id } })} className="ml-2 font-semibold text-muted-foreground underline">Unmatch</button>
            </div>
          )}
          <div className="mt-1 flex flex-wrap gap-1">
            <StatusBadge status={inst.status} />
            {inst.is_ad_hoc && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">One-off</span>}
            {inst.subscription_id && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">Subscription</span>}
            {inst.amount_overridden && <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent-foreground">Changed this month</span>}
          </div>
        </div>
        <label className="flex shrink-0 flex-col items-end">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">This month</span>
          <input type="number" step="0.01" inputMode="decimal" defaultValue={inst.planned_amount} key={inst.planned_amount}
            onBlur={(e) => { const val = Number(e.target.value); if (val !== inst.planned_amount) mUpdate.mutate({ data: { id: inst.id, planned_amount: val } }); }}
            className="h-10 w-24 rounded-xl border border-input bg-background px-2 text-right text-sm font-semibold tabular-nums" />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {inst.status === "paid" ? (
          <Button size="sm" variant="outline" onClick={() => setPayOpen((v) => !v)}>{payOpen ? "Close" : "Edit payment"}</Button>
        ) : inst.status === "paused" || inst.status === "skipped" ? (
          <Button size="sm" variant="outline" onClick={() => mStatus.mutate({ data: { id: inst.id, status: "pending" } })}>Undo skip</Button>
        ) : (
          <>
            <Button size="sm" onClick={() => setPayOpen((v) => !v)}>{payOpen ? "Close" : "Mark paid"}</Button>
            <Button size="sm" variant="ghost" onClick={() => mStatus.mutate({ data: { id: inst.id, status: "skipped" } })}>Skip this month</Button>
          </>
        )}
        {inst.is_ad_hoc && (
          <Button size="sm" variant="ghost" className="text-[color:var(--negative)]" onClick={() => confirm(`Remove "${inst.name}"?`) && mDelete.mutate({ data: { id: inst.id } })}>Remove</Button>
        )}
      </div>

      {payOpen && (
        <div className="grid gap-2 rounded-2xl border border-dashed border-border bg-background p-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">Amount paid</span>
            <TextInput type="number" step="0.01" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} className="w-28" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">From account</span>
            <Select value={payAcct} onChange={(e) => setPayAcct(e.target.value)} className="w-44">
              <option value="">— pick account —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">Date</span>
            <TextInput type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="w-40" />
          </label>
          <label className="flex flex-col gap-1 text-xs flex-1 min-w-[180px]">
            <span className="font-medium">Note (optional)</span>
            <TextInput value={payNote} onChange={(e) => setPayNote(e.target.value)} />
          </label>
          <Button size="sm" onClick={submitPay} disabled={payPending}>
            {inst.status === "paid" ? "Save changes" : "Mark paid"}
          </Button>
        </div>
      )}
    </li>
  );
}


function AdHocForm({ month, expenseCats, accounts }: { month: string; expenseCats: { id: string; name: string }[]; accounts: PayAccount[] }) {
  const invalidate = useInvalidateBudget(month);
  const create = useServerFn(createAdHocInstance);
  const mCreate = useMutation({
    mutationFn: create,
    onSuccess: () => { toast.success("Added"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="border-dashed">
      <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Add one-off item ({month} only)</div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const name = String(fd.get("name") || "").trim();
          const category_id = String(fd.get("category_id") || "") || null;
          const planned_amount = Number(fd.get("planned_amount") || 0);
          const account_id = String(fd.get("account_id") || "") || null;
          if (!name) return;
          mCreate.mutate({ data: { month, name, category_id, planned_amount, currency: "USD", account_id } });
          (e.currentTarget as HTMLFormElement).reset();
        }}
      >
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Name</span>
          <TextInput name="name" placeholder="e.g. Car repair" required className="w-56" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Category</span>
          <Select name="category_id" defaultValue="" className="w-44">
            <option value="">— none —</option>
            {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Amount</span>
          <TextInput type="number" step="0.01" name="planned_amount" defaultValue="0" className="w-28" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Paid from</span>
          <Select name="account_id" defaultValue="" className="w-44">
            <option value="">Not set</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </label>
        <Button type="submit" disabled={mCreate.isPending}>Add one-off</Button>
      </form>
    </Card>
  );
}
