import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { createDebt, deleteDebt, listDebts, updateDebt, type Debt } from "@/lib/keel.functions";
import { computePayoff } from "@/lib/payoff";
import { Button, Card, EmptyState, Field, PageHeader, Table, Td, TextInput, Textarea, Th, money } from "@/components/keel-ui";

const debtsQuery = queryOptions({ queryKey: ["debts"], queryFn: () => listDebts() });

export const Route = createFileRoute("/_gated/debts")({
  loader: ({ context }) => context.queryClient.ensureQueryData(debtsQuery),
  component: DebtsPage,
  errorComponent: ({ error }) => <div role="alert" className="text-sm text-destructive">{error.message}</div>,
});

function DebtsPage() {
  const { data: debts } = useSuspenseQuery(debtsQuery);
  const qc = useQueryClient();
  const create = useServerFn(createDebt);
  const update = useServerFn(updateDebt);
  const remove = useServerFn(deleteDebt);
  const [editing, setEditing] = useState<Debt | null>(null);
  const [showForm, setShowForm] = useState(false);
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["debts"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };

  const mCreate = useMutation({ mutationFn: create,
    onSuccess: () => { toast.success("Saved"); invalidate(); setShowForm(false); },
    onError: (e: Error) => toast.error(e.message) });
  const mUpdate = useMutation({ mutationFn: update,
    onSuccess: () => { toast.success("Saved"); invalidate(); setEditing(null); },
    onError: (e: Error) => toast.error(e.message) });
  const mDelete = useMutation({ mutationFn: remove,
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message) });

  const initial: Partial<Debt> = editing ?? { name: "", balance: 0, min_payment: 0, apr: 0, due_day: null, currency: "USD", notes: "" };
  const formOpen = showForm || !!editing;

  return (
    <div className="space-y-5">
      <PageHeader title="Debts"
        actions={!formOpen && <Button onClick={() => { setShowForm(true); setEditing(null); }}>Add debt</Button>} />

      {formOpen && (
        <Card>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const dueRaw = String(fd.get("due_day") || "");
            const payload = {
              name: String(fd.get("name") || ""),
              balance: Number(fd.get("balance") || 0),
              min_payment: Number(fd.get("min_payment") || 0),
              apr: Number(fd.get("apr") || 0),
              due_day: dueRaw ? Number(dueRaw) : null,
              currency: String(fd.get("currency") || "USD"),
              notes: String(fd.get("notes") || "") || null,
            };
            if (editing) mUpdate.mutate({ data: { ...payload, id: editing.id } });
            else mCreate.mutate({ data: payload });
          }}>
            <Field label="Name"><TextInput name="name" defaultValue={initial.name} required /></Field>
            <Field label="Balance"><TextInput type="number" step="0.01" name="balance" defaultValue={String(initial.balance ?? 0)} /></Field>
            <Field label="Min payment"><TextInput type="number" step="0.01" name="min_payment" defaultValue={String(initial.min_payment ?? 0)} /></Field>
            <Field label="APR %"><TextInput type="number" step="0.001" name="apr" defaultValue={String(initial.apr ?? 0)} /></Field>
            <Field label="Due day (1-31)"><TextInput type="number" min={1} max={31} name="due_day" defaultValue={initial.due_day ?? ""} /></Field>
            <Field label="Currency"><TextInput name="currency" defaultValue={initial.currency} /></Field>
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

      {debts.length === 0 ? <EmptyState>No debts tracked.</EmptyState> : (
        <div className="space-y-3">
          {debts.map((d) => <DebtRow key={d.id} debt={d} onEdit={() => { setEditing(d); setShowForm(false); }} onDelete={() => confirm(`Delete ${d.name}?`) && mDelete.mutate({ data: { id: d.id } })} />)}
        </div>
      )}
    </div>
  );
}

function DebtRow({ debt, onEdit, onDelete }: { debt: Debt; onEdit: () => void; onDelete: () => void }) {
  const [extra, setExtra] = useState<number>(0);
  const base = computePayoff(debt.balance, debt.apr, debt.min_payment);
  const sim = computePayoff(debt.balance, debt.apr, debt.min_payment + (extra || 0));
  const savedInterest = base.months != null && sim.months != null ? Math.max(0, base.totalInterest - sim.totalInterest) : 0;
  const savedMonths = base.months != null && sim.months != null ? Math.max(0, base.months - sim.months) : 0;
  const fmtDate = (iso: string | null) => iso ? new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "—";

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-medium">{debt.name}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {money(debt.balance, debt.currency)} @ {debt.apr}% · min {money(debt.min_payment, debt.currency)}
            {debt.due_day ? ` · due day ${debt.due_day}` : ""}
          </div>
          <div className="mt-1 text-xs">
            <span className="text-muted-foreground">Payoff (min only): </span>
            <span className="tabular-nums font-medium">
              {base.months == null ? "never — payment doesn't cover interest" :
                `${base.months} mo (${fmtDate(base.payoffDate)}), interest ${money(base.totalInterest, debt.currency)}`}
            </span>
          </div>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button>
          <Button size="sm" variant="danger" onClick={onDelete}>Delete</Button>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-border bg-muted/40 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">Extra per month</span>
            <TextInput type="number" step="0.01" min={0} value={extra || ""} placeholder="0"
              onChange={(e) => setExtra(Number(e.target.value) || 0)} className="w-32" />
          </label>
          <div className="text-xs text-muted-foreground">
            Paying <span className="tabular-nums font-medium text-foreground">{money(debt.min_payment + (extra || 0), debt.currency)}</span>/mo →
            {sim.months == null ? " never pays off" :
              <> pays off in <span className="tabular-nums font-medium text-foreground">{sim.months} mo</span> ({fmtDate(sim.payoffDate)}), interest <span className="tabular-nums font-medium text-foreground">{money(sim.totalInterest, debt.currency)}</span></>}
            {extra > 0 && sim.months != null && base.months != null && (
              <div className="mt-1 text-[color:var(--positive)]">
                Save {money(savedInterest, debt.currency)} in interest, {savedMonths} months sooner.
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
    </div>
  );
}
