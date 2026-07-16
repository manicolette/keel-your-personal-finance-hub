import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { createGoal, deleteGoal, listGoals, updateGoal, type Goal } from "@/lib/keel.functions";
import { Button, Card, EmptyState, Field, PageHeader, Table, Td, TextInput, Textarea, Th, money } from "@/components/keel-ui";

const goalsQuery = queryOptions({ queryKey: ["goals"], queryFn: () => listGoals() });

export const Route = createFileRoute("/_gated/goals")({
  loader: ({ context }) => context.queryClient.ensureQueryData(goalsQuery),
  component: GoalsPage,
  errorComponent: ({ error }) => <div role="alert" className="text-sm text-destructive">{error.message}</div>,
});

function GoalsPage() {
  const { data: goals } = useSuspenseQuery(goalsQuery);
  const qc = useQueryClient();
  const create = useServerFn(createGoal);
  const update = useServerFn(updateGoal);
  const remove = useServerFn(deleteGoal);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [showForm, setShowForm] = useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["goals"] });

  const mCreate = useMutation({ mutationFn: create,
    onSuccess: () => { toast.success("Saved"); invalidate(); setShowForm(false); },
    onError: (e: Error) => toast.error(e.message) });
  const mUpdate = useMutation({ mutationFn: update,
    onSuccess: () => { toast.success("Saved"); invalidate(); setEditing(null); },
    onError: (e: Error) => toast.error(e.message) });
  const mDelete = useMutation({ mutationFn: remove,
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message) });

  const initial: Partial<Goal> = editing ?? { name: "", target_amount: 0, saved_amount: 0, target_date: null, notes: "" };
  const formOpen = showForm || !!editing;

  return (
    <div className="space-y-5">
      <PageHeader title="Goals"
        actions={!formOpen && <Button onClick={() => { setShowForm(true); setEditing(null); }}>Add goal</Button>} />

      {formOpen && (
        <Card>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const payload = {
              name: String(fd.get("name") || ""),
              target_amount: Number(fd.get("target_amount") || 0),
              saved_amount: Number(fd.get("saved_amount") || 0),
              target_date: String(fd.get("target_date") || "") || null,
              notes: String(fd.get("notes") || "") || null,
            };
            if (editing) mUpdate.mutate({ data: { ...payload, id: editing.id } });
            else mCreate.mutate({ data: payload });
          }}>
            <Field label="Name"><TextInput name="name" defaultValue={initial.name} required /></Field>
            <Field label="Target amount"><TextInput type="number" step="0.01" name="target_amount" defaultValue={String(initial.target_amount ?? 0)} /></Field>
            <Field label="Saved amount"><TextInput type="number" step="0.01" name="saved_amount" defaultValue={String(initial.saved_amount ?? 0)} /></Field>
            <Field label="Target date"><TextInput type="date" name="target_date" defaultValue={initial.target_date ?? ""} /></Field>
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Notes"><Textarea name="notes" defaultValue={initial.notes ?? ""} /></Field>
            </div>
            <div className="col-span-full flex justify-end gap-2 pt-1">
              <Button variant="ghost" type="button" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Button>
              <Button type="submit" disabled={mCreate.isPending || mUpdate.isPending}>{editing ? "Save" : "Create"}</Button>
            </div>
          </form>
        </Card>
      )}

      {goals.length === 0 ? <EmptyState>No goals yet.</EmptyState> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((g) => {
            const pct = g.target_amount > 0 ? Math.min(100, Math.round((g.saved_amount / g.target_amount) * 100)) : 0;
            return (
              <Card key={g.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{g.name}</div>
                    {g.target_date && <div className="text-xs text-muted-foreground">by {g.target_date}</div>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => { setEditing(g); setShowForm(false); }}>Edit</Button>
                    <Button size="sm" variant="danger" onClick={() => confirm(`Delete ${g.name}?`) && mDelete.mutate({ data: { id: g.id } })}>×</Button>
                  </div>
                </div>
                <div className="mt-3 flex items-baseline justify-between text-sm">
                  <span className="tabular-nums">{money(g.saved_amount)} / {money(g.target_amount)}</span>
                  <span className="text-muted-foreground">{pct}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                {g.notes && <p className="mt-3 text-xs text-muted-foreground">{g.notes}</p>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
