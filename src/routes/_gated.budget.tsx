import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  listAccounts,
  listCategories,
  payExpenseDirect,
  setInstanceStatus,
  unlinkInstance,
  updateInstance,
  type BudgetGroup,
  type MonthlyExpenseInstance,
} from "@/lib/keel.functions";
import { Button, Card, EmptyState, PageHeader, Select, TextInput, money } from "@/components/keel-ui";


const budgetQueryOptions = (month: string) =>
  queryOptions({
    queryKey: ["budget", month] as const,
    queryFn: () => getBudget({ data: { month } }),
  });

const catsQueryOptions = queryOptions({ queryKey: ["categories"], queryFn: () => listCategories() });
const acctsQueryOptions = queryOptions({ queryKey: ["accounts"], queryFn: () => listAccounts() });


const currentMonth = () => new Date().toISOString().slice(0, 7);
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
    await Promise.all([
      context.queryClient.ensureQueryData(budgetQueryOptions(deps.month)),
      context.queryClient.ensureQueryData(catsQueryOptions),
      context.queryClient.ensureQueryData(acctsQueryOptions),
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
  const expenseCats = cats.filter((c) => c.kind === "expense" && !c.archived);
  const activeAccounts = accounts.filter((a) => !a.archived);


  const plannedTotal = data.groups.reduce((s, g) => s + g.planned, 0);
  const actualTotal = data.groups.reduce((s, g) => s + g.actual, 0);
  const paidCount = data.groups.reduce((s, g) => s + g.instances.filter((i) => i.status === "paid").length, 0);
  const pendingCount = data.groups.reduce((s, g) => s + g.instances.filter((i) => i.status === "pending").length, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Budget"
        subtitle="Everything you're expected to pay this month — and what's actually been paid."
        actions={
          <div className="flex items-center gap-2">
            <Link
              to="/budget"
              search={{ month: shiftMonth(month, -1) }}
              aria-label="Previous month"
              className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-muted"
            >←</Link>
            <TextInput
              type="month"
              value={month}
              onChange={(e) => go(e.target.value || currentMonth())}
              className="w-40"
            />
            <Link
              to="/budget"
              search={{ month: shiftMonth(month, 1) }}
              aria-label="Next month"
              className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:bg-muted"
            >→</Link>
            <Link
              to="/budget"
              search={{ month: currentMonth() }}
              aria-disabled={month === currentMonth()}
              className="inline-flex h-8 items-center justify-center rounded-md px-2.5 text-xs font-medium text-foreground hover:bg-muted aria-disabled:pointer-events-none aria-disabled:opacity-50"
            >Today</Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Planned</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{money(plannedTotal)}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Actual</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{money(actualTotal)}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Remaining</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{money(plannedTotal - actualTotal)}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Status</div>
          <div className="mt-1 text-sm font-medium tabular-nums">
            <span className="text-[color:var(--positive)]">{paidCount} paid</span>
            <span className="mx-1 text-muted-foreground">·</span>
            <span>{pendingCount} pending</span>
          </div>
        </Card>
      </div>

      <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        Manage recurring items on the{" "}
        <Link to="/monthly-expenses" className="font-medium text-primary underline">Monthly Expenses</Link>{" "}
        page — anything active there shows up here automatically. Use "Add one-off" below only for an unusual expense that isn't part of your normal monthly plan.
      </div>

      {data.groups.length === 0 ? (
        <EmptyState>
          No expenses budgeted for {month}. Add a recurring one on the{" "}
          <Link to="/monthly-expenses" className="text-primary underline">Monthly Expenses</Link>{" "}
          page, or add a one-off below.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {data.groups.map((g) => (
            <GroupCard key={g.category_id ?? "null"} group={g} month={month} accounts={activeAccounts} />
          ))}
        </div>

      )}

      <AdHocForm month={month} expenseCats={expenseCats} />
    </div>
  );
}

function useInvalidateBudget(month: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["budget", month] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
  };
}

function GroupCard({ group, month }: { group: BudgetGroup; month: string }) {
  const pct = group.planned > 0 ? Math.round((group.actual / group.planned) * 100) : 0;
  const over = group.actual > group.planned && group.planned > 0;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-block h-3 w-3 rounded-full" style={{ background: group.category_color }} />
        <span className="font-medium">{group.category_name}</span>
        <span className="text-xs text-muted-foreground">{group.instances.length} item{group.instances.length === 1 ? "" : "s"}</span>
        <div className="ml-auto flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Planned</div>
            <div className="text-sm tabular-nums font-medium">{money(group.planned)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Actual</div>
            <div className={`text-sm tabular-nums ${over ? "text-[color:var(--negative)]" : ""}`}>{money(group.actual)}</div>
          </div>
          <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
            <div className={`h-full ${over ? "bg-[color:var(--negative)]" : "bg-primary"}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        </div>
      </div>

      {group.instances.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-md border border-border bg-background">
          {group.instances.map((inst) => (
            <InstanceRow key={inst.id} inst={inst} month={month} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function StatusBadge({ status }: { status: MonthlyExpenseInstance["status"] }) {
  const map: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-800",
    pending: "bg-amber-100 text-amber-800",
    paused: "bg-slate-200 text-slate-700",
    skipped: "bg-slate-200 text-slate-700",
  };
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${map[status]}`}>{status}</span>;
}

function InstanceRow({ inst, month }: { inst: MonthlyExpenseInstance; month: string }) {
  const invalidate = useInvalidateBudget(month);
  const update = useServerFn(updateInstance);
  const status = useServerFn(setInstanceStatus);
  const unlink = useServerFn(unlinkInstance);
  const remove = useServerFn(deleteInstance);
  const mUpdate = useMutation({ mutationFn: update, onSuccess: invalidate, onError: (e: Error) => toast.error(e.message) });
  const mStatus = useMutation({ mutationFn: status, onSuccess: invalidate, onError: (e: Error) => toast.error(e.message) });
  const mUnlink = useMutation({ mutationFn: unlink, onSuccess: () => { toast.success("Unlinked"); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const mDelete = useMutation({ mutationFn: remove, onSuccess: () => { toast.success("Removed"); invalidate(); }, onError: (e: Error) => toast.error(e.message) });

  const [editingName, setEditingName] = useState(false);

  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {editingName ? (
            <input
              autoFocus
              defaultValue={inst.name}
              onBlur={(e) => {
                const name = e.target.value.trim();
                setEditingName(false);
                if (name && name !== inst.name) mUpdate.mutate({ data: { id: inst.id, name } });
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="rounded border border-input bg-background px-1.5 py-0.5 text-sm"
            />
          ) : (
            <button onClick={() => setEditingName(true)} className="text-sm font-medium hover:underline">
              {inst.name}
            </button>
          )}
          {inst.is_ad_hoc && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">ONE-OFF</span>}
          {inst.monthly_expense_id === null && !inst.is_ad_hoc && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">ORPHANED</span>
          )}
          <StatusBadge status={inst.status} />
        </div>
        {inst.transaction_id && inst.transaction_amount != null && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            Paid {money(inst.transaction_amount, inst.currency)} on {inst.transaction_date}
            <button onClick={() => mUnlink.mutate({ data: { id: inst.id } })} className="ml-2 text-destructive hover:underline">unlink</button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="text-right">
          <div className="text-[10px] uppercase text-muted-foreground">This month</div>
          <input
            type="number"
            step="0.01"
            defaultValue={inst.planned_amount}
            key={inst.planned_amount}
            onBlur={(e) => {
              const val = Number(e.target.value);
              if (val !== inst.planned_amount) mUpdate.mutate({ data: { id: inst.id, planned_amount: val } });
            }}
            className="w-24 rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums"
            title="Override the planned amount for this month only"
          />
        </div>
        {inst.status !== "paid" && (
          inst.status === "paused" ? (
            <Button size="sm" variant="outline" onClick={() => mStatus.mutate({ data: { id: inst.id, status: "pending" } })}>Resume</Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => mStatus.mutate({ data: { id: inst.id, status: "paused" } })}>Pause</Button>
          )
        )}
        {inst.is_ad_hoc && (
          <Button size="sm" variant="danger" onClick={() => confirm(`Remove "${inst.name}"?`) && mDelete.mutate({ data: { id: inst.id } })}>×</Button>
        )}
      </div>
    </li>
  );
}

function AdHocForm({ month, expenseCats }: { month: string; expenseCats: { id: string; name: string }[] }) {
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
          if (!name) return;
          mCreate.mutate({ data: { month, name, category_id, planned_amount, currency: "USD" } });
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
        <Button type="submit" disabled={mCreate.isPending}>Add one-off</Button>
      </form>
    </Card>
  );
}
