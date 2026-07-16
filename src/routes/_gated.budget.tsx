import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";

import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
import {
  deleteBudgetLine,
  getBudget,
  listCategories,
  upsertBudgetLine,
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
        <Table head={<>
          <Th>Category</Th><Th className="text-right">Planned</Th>
          <Th className="text-right">Actual</Th><Th>Usage</Th><Th></Th>
        </>}>
          {data.lines.map((l) => {
            const pct = l.planned > 0 ? Math.min(150, Math.round((l.actual / l.planned) * 100)) : 0;
            const over = l.actual > l.planned;
            return (
              <tr key={l.id}>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ background: l.category_color }} />
                    <span className="font-medium">{l.category_name}</span>
                  </div>
                </Td>
                <Td className="text-right">
                  <input
                    type="number" step="0.01"
                    defaultValue={l.planned}
                    onBlur={(e) => {
                      const val = Number(e.target.value);
                      if (val !== l.planned) mUpsert.mutate({ data: { month_id: data.month.id, category_id: l.category_id, planned: val, notes: l.notes } });
                    }}
                    className="w-28 rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums"
                  />
                </Td>
                <Td className={`text-right tabular-nums ${over ? "text-[color:var(--negative)]" : ""}`}>{money(l.actual)}</Td>
                <Td>
                  <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full ${over ? "bg-[color:var(--negative)]" : "bg-primary"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </Td>
                <Td className="text-right">
                  <Button size="sm" variant="danger" onClick={() => confirm(`Remove ${l.category_name} from this month?`) && mDelete.mutate({ data: { id: l.id } })}>×</Button>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
