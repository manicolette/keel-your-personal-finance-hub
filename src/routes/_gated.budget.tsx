import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";

import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useState } from "react";
import { toast } from "sonner";
import {
  createBudgetLineItem,
  deleteBudgetLine,
  deleteBudgetLineItem,
  getBudget,
  listCategories,
  updateBudgetLineItem,
  upsertBudgetLine,
  type BudgetLine,
} from "@/lib/keel.functions";
import { Button, Card, EmptyState, PageHeader, Select, Table, Td, TextInput, Th, money } from "@/components/keel-ui";

const budgetQueryOptions = (month: string) =>
  queryOptions({
    queryKey: ["budget", month] as const,
    queryFn: () => getBudget({ data: { month } }),
  });

const catsQueryOptions = queryOptions({ queryKey: ["categories"], queryFn: () => listCategories() });

const currentMonth = () => new Date().toISOString().slice(0, 7);
const shiftMonth = (m: string, delta: number) => {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, (mm - 1) + delta, 1));
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
  const qc = useQueryClient();
  const upsert = useServerFn(upsertBudgetLine);
  const remove = useServerFn(deleteBudgetLine);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["budget", month] });
  const mUpsert = useMutation({ mutationFn: upsert,
    onSuccess: () => { toast.success("Saved"); invalidate(); },
    onError: (e: Error) => toast.error(e.message) });
  const mDelete = useMutation({ mutationFn: remove,
    onSuccess: () => { toast.success("Removed"); invalidate(); },
    onError: (e: Error) => toast.error(e.message) });

  const usedIds = new Set(data.lines.map((l) => l.category_id));
  const addable = cats.filter((c) => c.kind === "expense" && !usedIds.has(c.id) && !c.archived);

  const plannedTotal = data.lines.reduce((s, l) => s + l.planned, 0);
  const actualTotal = data.lines.reduce((s, l) => s + l.actual, 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Budget" subtitle="Plan monthly spending by category."
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
        } />

      <div className="grid gap-3 sm:grid-cols-3">
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
      </div>

      {addable.length > 0 && (
        <Card>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const category_id = String(fd.get("category_id") || "");
            const planned = Number(fd.get("planned") || 0);
            if (!category_id) return;
            mUpsert.mutate({ data: { month_id: data.month.id, category_id, planned, notes: null } });
            (e.currentTarget as HTMLFormElement).reset();
          }}>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Category</span>
              <Select name="category_id" defaultValue="">
                <option value="" disabled>Choose…</option>
                {addable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Planned</span>
              <TextInput type="number" step="0.01" name="planned" defaultValue="0" />
            </label>
            <Button type="submit" disabled={mUpsert.isPending}>Add line</Button>
          </form>
        </Card>
      )}

      {data.lines.length === 0 ? (
        <EmptyState>No budget lines for {month} yet. Add expense categories above.</EmptyState>
      ) : (
        <div className="space-y-3">
          {data.lines.map((l) => (
            <BudgetLineCard
              key={l.id}
              line={l}
              monthId={data.month.id}
              onUpsertPlanned={(val) => mUpsert.mutate({ data: { month_id: data.month.id, category_id: l.category_id, planned: val, notes: l.notes } })}
              onRemove={() => confirm(`Remove ${l.category_name} from this month?`) && mDelete.mutate({ data: { id: l.id } })}
              invalidate={invalidate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BudgetLineCard({
  line, onUpsertPlanned, onRemove, invalidate,
}: {
  line: BudgetLine;
  monthId: string;
  onUpsertPlanned: (val: number) => void;
  onRemove: () => void;
  invalidate: () => void;
}) {
  const [expanded, setExpanded] = useState(line.items.length > 0);
  const createItem = useServerFn(createBudgetLineItem);
  const updateItem = useServerFn(updateBudgetLineItem);
  const deleteItem = useServerFn(deleteBudgetLineItem);
  const mCreate = useMutation({ mutationFn: createItem, onSuccess: () => { toast.success("Item added"); invalidate(); }, onError: (e: Error) => toast.error(e.message) });
  const mUpdate = useMutation({ mutationFn: updateItem, onSuccess: () => invalidate(), onError: (e: Error) => toast.error(e.message) });
  const mDelete = useMutation({ mutationFn: deleteItem, onSuccess: () => { toast.success("Removed"); invalidate(); }, onError: (e: Error) => toast.error(e.message) });

  const pct = line.planned > 0 ? Math.min(150, Math.round((line.actual / line.planned) * 100)) : 0;
  const over = line.actual > line.planned;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 text-left">
          <span className="text-xs text-muted-foreground w-3">{expanded ? "▾" : "▸"}</span>
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: line.category_color }} />
          <span className="font-medium">{line.category_name}</span>
          {line.planned_from_items && <span className="rounded bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">SUM OF {line.items.length}</span>}
        </button>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Planned</div>
            {line.planned_from_items ? (
              <div className="w-28 text-right text-sm tabular-nums font-medium">{money(line.planned)}</div>
            ) : (
              <input
                type="number" step="0.01"
                defaultValue={line.planned}
                key={line.planned}
                onBlur={(e) => {
                  const val = Number(e.target.value);
                  if (val !== line.planned) onUpsertPlanned(val);
                }}
                className="w-28 rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums"
              />
            )}
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Actual</div>
            <div className={`text-sm tabular-nums ${over ? "text-[color:var(--negative)]" : ""}`}>{money(line.actual)}</div>
          </div>
          <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
            <div className={`h-full ${over ? "bg-[color:var(--negative)]" : "bg-primary"}`} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <Button size="sm" variant="danger" onClick={onRemove}>×</Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 rounded-md border border-border bg-muted/30 p-2 space-y-2">
          {line.items.length === 0 ? (
            <p className="text-xs text-muted-foreground">No named items yet. Add sub-items to itemize this category — the total will sum automatically.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md bg-background">
              {line.items.map((it) => (
                <li key={it.id} className="flex items-center gap-2 px-2 py-1">
                  <input
                    defaultValue={it.name}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (name && name !== it.name) mUpdate.mutate({ data: { id: it.id, name, amount: it.amount } });
                    }}
                    className="flex-1 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm focus:border-input focus:bg-background focus:outline-none"
                  />
                  <input
                    type="number" step="0.01"
                    defaultValue={it.amount}
                    onBlur={(e) => {
                      const amount = Number(e.target.value);
                      if (amount !== it.amount) mUpdate.mutate({ data: { id: it.id, name: it.name, amount } });
                    }}
                    className="w-24 rounded border border-transparent bg-transparent px-1.5 py-1 text-right text-sm tabular-nums focus:border-input focus:bg-background focus:outline-none"
                  />
                  <button
                    onClick={() => confirm(`Remove ${it.name}?`) && mDelete.mutate({ data: { id: it.id } })}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove item"
                  >×</button>
                </li>
              ))}
            </ul>
          )}
          <form className="flex items-end gap-2" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const name = String(fd.get("name") || "").trim();
            const amount = Number(fd.get("amount") || 0);
            if (!name) return;
            mCreate.mutate({ data: { budget_line_id: line.id, name, amount, sort_order: line.items.length } });
            (e.currentTarget as HTMLFormElement).reset();
          }}>
            <TextInput name="name" placeholder="Item name (e.g. Rent)" className="flex-1" required />
            <TextInput type="number" step="0.01" name="amount" placeholder="0.00" className="w-28" defaultValue="0" />
            <Button size="sm" type="submit">+ Item</Button>
          </form>
        </div>
      )}
    </Card>
  );
}
