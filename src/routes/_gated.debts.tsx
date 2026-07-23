import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  createDebt,
  createDebtPayment,
  deleteDebt,
  deleteDebtPayment,
  listAccounts,
  listCategories,
  listDebtPayments,
  listDebts,
  updateDebt,
  updateDebtPayment,
  type Debt,
  type DebtPayment,
} from "@/lib/keel.functions";
import { computePayoff } from "@/lib/payoff";
import { Button, Card, EmptyState, Field, PageHeader, Select, TextInput, Textarea, money } from "@/components/keel-ui";

const debtsQuery = queryOptions({ queryKey: ["debts"], queryFn: () => listDebts() });
const acctQuery = queryOptions({ queryKey: ["accounts"], queryFn: () => listAccounts() });
const catQuery = queryOptions({ queryKey: ["categories"], queryFn: () => listCategories() });

export const Route = createFileRoute("/_gated/debts")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(debtsQuery),
      context.queryClient.ensureQueryData(acctQuery),
      context.queryClient.ensureQueryData(catQuery),
    ]);
  },
  component: DebtsPage,
  errorComponent: ({ error }) => <div role="alert" className="text-sm text-destructive">{error.message}</div>,
});

const today = () => new Date().toISOString().slice(0, 10);

function DebtsPage() {
  const { data: debts } = useSuspenseQuery(debtsQuery);
  const qc = useQueryClient();
  const create = useServerFn(createDebt);
  const update = useServerFn(updateDebt);
  const remove = useServerFn(deleteDebt);
  const [editing, setEditing] = useState<Debt | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showPaid, setShowPaid] = useState(false);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["debts"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const mCreate = useMutation({ mutationFn: create,
    onSuccess: () => { toast.success("Saved"); invalidate(); setShowForm(false); },
    onError: (e: Error) => toast.error(e.message) });
  const mUpdate = useMutation({ mutationFn: update,
    onSuccess: () => { toast.success("Saved"); invalidate(); setEditing(null); },
    onError: (e: Error) => toast.error(e.message) });
  const mDelete = useMutation({ mutationFn: remove,
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message) });

  const initial: Partial<Debt> = editing ?? {
    name: "", balance: 0, min_payment: 0, apr: 0, due_day: null, currency: "USD", notes: "",
    original_balance: null, start_date: null,
  };
  const formOpen = showForm || !!editing;

  const active = debts.filter((d) => !d.paid_off_at);
  const paid = debts.filter((d) => d.paid_off_at);

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
            const origRaw = String(fd.get("original_balance") || "");
            const startRaw = String(fd.get("start_date") || "");
            const payload = {
              name: String(fd.get("name") || ""),
              balance: Number(fd.get("balance") || 0),
              min_payment: Number(fd.get("min_payment") || 0),
              apr: Number(fd.get("apr") || 0),
              due_day: dueRaw ? Number(dueRaw) : null,
              currency: String(fd.get("currency") || "USD"),
              notes: String(fd.get("notes") || "") || null,
              original_balance: origRaw ? Number(origRaw) : null,
              start_date: startRaw || null,
            };
            if (editing) mUpdate.mutate({ data: { ...payload, id: editing.id } });
            else mCreate.mutate({ data: payload });
          }}>
            <Field label="Name"><TextInput name="name" defaultValue={initial.name} required /></Field>
            <Field label="Current balance"><TextInput type="number" step="0.01" name="balance" defaultValue={String(initial.balance ?? 0)} /></Field>
            <Field label="Min payment"><TextInput type="number" step="0.01" name="min_payment" defaultValue={String(initial.min_payment ?? 0)} /></Field>
            <Field label="APR %"><TextInput type="number" step="0.001" name="apr" defaultValue={String(initial.apr ?? 0)} /></Field>
            <Field label="Due day (1-31)"><TextInput type="number" min={1} max={31} name="due_day" defaultValue={initial.due_day ?? ""} /></Field>
            <Field label="Currency"><TextInput name="currency" defaultValue={initial.currency} /></Field>
            <Field label="Original balance (optional)" hint="Starting amount when you began paying">
              <TextInput type="number" step="0.01" name="original_balance" defaultValue={initial.original_balance ?? ""} />
            </Field>
            <Field label="Start date (optional)">
              <TextInput type="date" name="start_date" defaultValue={initial.start_date ?? ""} />
            </Field>
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

      {active.length === 0 && paid.length === 0 ? <EmptyState>No debts tracked.</EmptyState> : (
        <div className="space-y-3">
          {active.map((d) => <DebtRow key={d.id} debt={d} onEdit={() => { setEditing(d); setShowForm(false); }} onDelete={() => confirm(`Delete ${d.name}?`) && mDelete.mutate({ data: { id: d.id } })} />)}
        </div>
      )}

      {paid.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowPaid(!showPaid)}
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {showPaid ? "▾" : "▸"} Paid off ({paid.length})
          </button>
          {showPaid && paid.map((d) => (
            <DebtRow key={d.id} debt={d} onEdit={() => { setEditing(d); setShowForm(false); }} onDelete={() => confirm(`Delete ${d.name}?`) && mDelete.mutate({ data: { id: d.id } })} />
          ))}
        </div>
      )}
    </div>
  );
}

function DebtRow({ debt, onEdit, onDelete }: { debt: Debt; onEdit: () => void; onDelete: () => void }) {
  const [extra, setExtra] = useState<number>(0);
  const [showPayments, setShowPayments] = useState(false);
  const base = computePayoff(debt.balance, debt.apr, debt.min_payment);
  const sim = computePayoff(debt.balance, debt.apr, debt.min_payment + (extra || 0));
  const savedInterest = base.months != null && sim.months != null ? Math.max(0, base.totalInterest - sim.totalInterest) : 0;
  const savedMonths = base.months != null && sim.months != null ? Math.max(0, base.months - sim.months) : 0;
  const fmtDate = (iso: string | null) => iso ? new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "—";

  const showProgress = debt.original_balance != null && debt.start_date != null && debt.original_balance > 0;
  const paid = showProgress ? Math.max(0, (debt.original_balance ?? 0) - debt.balance) : 0;
  const pct = showProgress ? Math.min(100, Math.round((paid / (debt.original_balance ?? 1)) * 100)) : 0;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{debt.name}</span>
            {debt.paid_off_at && (
              <span className="rounded-full bg-[color:var(--positive)]/15 px-2 py-0.5 text-[10px] font-medium text-[color:var(--positive)]">
                PAID OFF {debt.paid_off_at}
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {money(debt.balance, debt.currency)} @ {debt.apr}% · min {money(debt.min_payment, debt.currency)}
            {debt.due_day ? ` · due day ${debt.due_day}` : ""}
          </div>
          {showProgress && (
            <div className="mt-2">
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted-foreground">
                  {money(paid, debt.currency)} of {money(debt.original_balance ?? 0, debt.currency)} paid ({pct}%)
                </span>
                {debt.start_date && <span className="text-muted-foreground">since {debt.start_date}</span>}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-[color:var(--positive)]" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
          {!debt.paid_off_at && (
            <div className="mt-2 text-xs">
              <span className="text-muted-foreground">Payoff (min only): </span>
              <span className="tabular-nums font-medium">
                {base.months == null ? "never — payment doesn't cover interest" :
                  `${base.months} mo (${fmtDate(base.payoffDate)}), interest ${money(base.totalInterest, debt.currency)}`}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => setShowPayments(!showPayments)}>{showPayments ? "Hide" : "Payments"}</Button>
          <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button>
          <Button size="sm" variant="danger" onClick={onDelete}>Delete</Button>
        </div>
      </div>

      {!debt.paid_off_at && (
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
      )}

      {showPayments && <PaymentsPanel debtId={debt.id} debtName={debt.name} debtCurrency={debt.currency} />}
    </Card>
  );
}

function PaymentsPanel({ debtId, debtName, debtCurrency }: { debtId: string; debtName: string; debtCurrency: string }) {
  const paymentsQuery = queryOptions({
    queryKey: ["debt_payments", debtId] as const,
    queryFn: () => listDebtPayments({ data: { debt_id: debtId } }),
  });
  const { data: payments } = useSuspenseQuery(paymentsQuery);
  const { data: accts } = useSuspenseQuery(acctQuery);
  const { data: cats } = useSuspenseQuery(catQuery);
  const qc = useQueryClient();
  const create = useServerFn(createDebtPayment);
  const update = useServerFn(updateDebtPayment);
  const remove = useServerFn(deleteDebtPayment);
  const [editing, setEditing] = useState<DebtPayment | null>(null);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["debt_payments", debtId] });
    qc.invalidateQueries({ queryKey: ["debts"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const mCreate = useMutation({ mutationFn: create,
    onSuccess: () => { toast.success("Payment logged"); invalidate(); },
    onError: (e: Error) => toast.error(e.message) });
  const mUpdate = useMutation({ mutationFn: update,
    onSuccess: () => { toast.success("Saved"); invalidate(); setEditing(null); },
    onError: (e: Error) => toast.error(e.message) });
  const mDelete = useMutation({ mutationFn: remove,
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message) });

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/20 p-3 space-y-3">
      <form className="grid gap-2 sm:grid-cols-5" onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        mCreate.mutate({ data: {
          debt_id: debtId,
          amount: Number(fd.get("amount") || 0),
          payment_date: String(fd.get("payment_date") || today()),
          note: String(fd.get("note") || "") || null,
          account_id: String(fd.get("account_id") || "") || null,
          category_id: String(fd.get("category_id") || "") || null,
        }}, { onSuccess: () => (e.target as HTMLFormElement).reset() });
      }}>
        <label className="flex flex-col gap-1 text-xs">
          <span>Amount</span>
          <TextInput type="number" step="0.01" name="amount" required />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>Date</span>
          <TextInput type="date" name="payment_date" defaultValue={today()} required />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>From account (optional)</span>
          <Select name="account_id" defaultValue="">
            <option value="">— none —</option>
            {accts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>Category (if logged)</span>
          <Select name="category_id" defaultValue="">
            <option value="">— none —</option>
            {cats.filter((c) => c.kind === "expense").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>Note</span>
          <div className="flex gap-1">
            <TextInput name="note" placeholder="optional" />
            <Button type="submit" size="sm" disabled={mCreate.isPending}>Log</Button>
          </div>
        </label>
      </form>

      {payments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No payments logged for {debtName} yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-background">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 text-xs">
              {editing?.id === p.id ? (
                <form className="flex flex-1 flex-wrap items-end gap-2" onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  mUpdate.mutate({ data: {
                    id: p.id,
                    amount: Number(fd.get("amount") || 0),
                    payment_date: String(fd.get("payment_date") || p.payment_date),
                    note: String(fd.get("note") || "") || null,
                  }});
                }}>
                  <TextInput type="number" step="0.01" name="amount" defaultValue={String(p.amount)} className="w-24" required />
                  <TextInput type="date" name="payment_date" defaultValue={p.payment_date} className="w-36" required />
                  <TextInput name="note" defaultValue={p.note ?? ""} placeholder="note" className="flex-1 min-w-32" />
                  <Button size="sm" type="submit">Save</Button>
                  <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(null)}>×</Button>
                </form>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums font-medium">{money(p.amount, debtCurrency)}</span>
                    <span className="text-muted-foreground">{p.payment_date}</span>
                    {p.transaction_id && <span className="rounded bg-primary/10 px-1.5 text-[10px] font-medium text-primary">logged</span>}
                    {p.note && <span className="text-muted-foreground">{p.note}</span>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm("Delete this payment? Balance will be restored.") && mDelete.mutate({ data: { id: p.id } })}>×</Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
