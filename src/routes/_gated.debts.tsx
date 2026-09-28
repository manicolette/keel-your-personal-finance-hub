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
import {
  accruedSince,
  buildSchedule,
  firstPaymentMonth,
  simulateStrategy,
  todayIso,
  type DebtTerms,
  type Schedule,
  type StrategyResult,
} from "@/lib/payoff";
import { Button, Card, EmptyState, Field, PageHeader, Select, Table, Td, TextInput, Textarea, Th, money } from "@/components/keel-ui";

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

const today = () => todayIso();

const termsOf = (d: Debt, extra?: number): DebtTerms => ({
  balance: d.balance,
  apr: d.apr,
  minPayment: d.min_payment,
  extraPayment: extra ?? d.extra_payment,
  promoApr: d.promo_apr,
  promoEndDate: d.promo_end_date,
});

const fmtMonth = (ym: string | null) =>
  ym ? new Date(`${ym}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" }) : "—";
const fmtDuration = (m: number) => {
  const y = Math.floor(m / 12);
  const r = m % 12;
  return y === 0 ? `${r} mo` : r === 0 ? `${y} yr` : `${y} yr ${r} mo`;
};

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
    qc.invalidateQueries({ queryKey: ["networth-live"] });
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
    name: "", balance: 0, min_payment: 0, extra_payment: 0, apr: 0, promo_apr: null, promo_end_date: null,
    due_day: null, currency: "USD", notes: "", original_balance: null, start_date: null, balance_as_of: today(),
  };
  const formOpen = showForm || !!editing;

  const active = debts.filter((d) => !d.paid_off_at);
  const paid = debts.filter((d) => d.paid_off_at);

  return (
    <div className="space-y-5">
      <PageHeader title="Debts"
        subtitle="Balances accrue interest daily between payments. Projections use standard monthly amortization."
        actions={!formOpen && <Button onClick={() => { setShowForm(true); setEditing(null); }}>Add debt</Button>} />

      {formOpen && (
        <Card>
          <form key={editing?.id ?? "new"} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const str = (k: string) => String(fd.get(k) || "").trim();
            const numOrNull = (k: string) => (str(k) === "" ? null : Number(str(k)));
            const payload = {
              name: str("name"),
              balance: Number(str("balance") || 0),
              balance_as_of: str("balance_as_of") || null,
              min_payment: Number(str("min_payment") || 0),
              extra_payment: Number(str("extra_payment") || 0),
              apr: Number(str("apr") || 0),
              promo_apr: numOrNull("promo_apr"),
              promo_end_date: str("promo_end_date") || null,
              due_day: numOrNull("due_day"),
              currency: str("currency") || "USD",
              notes: str("notes") || null,
              original_balance: numOrNull("original_balance"),
              start_date: str("start_date") || null,
            };
            if ((payload.promo_apr == null) !== (payload.promo_end_date == null)) {
              toast.error("Enter both a promo APR and the date the promo ends, or leave both blank.");
              return;
            }
            if (editing) mUpdate.mutate({ data: { ...payload, id: editing.id } });
            else mCreate.mutate({ data: payload });
          }}>
            <Field label="Name"><TextInput name="name" defaultValue={initial.name} required /></Field>
            <Field label="Current balance" hint="From your latest statement or account page">
              <TextInput type="number" step="0.01" min={0} name="balance" defaultValue={String(initial.balance ?? 0)} />
            </Field>
            <Field label="Balance as of" hint="Payments you log after this date reduce it">
              <TextInput type="date" name="balance_as_of" defaultValue={initial.balance_as_of ?? today()} />
            </Field>
            <Field label="APR %"><TextInput type="number" step="0.001" min={0} name="apr" defaultValue={String(initial.apr ?? 0)} /></Field>
            <Field label="Min payment"><TextInput type="number" step="0.01" min={0} name="min_payment" defaultValue={String(initial.min_payment ?? 0)} /></Field>
            <Field label="Extra per month (optional)" hint="Planned on top of the minimum">
              <TextInput type="number" step="0.01" min={0} name="extra_payment" defaultValue={initial.extra_payment ? String(initial.extra_payment) : ""} />
            </Field>
            <Field label="Promo APR % (optional)" hint="e.g. 0 for a 0% balance transfer">
              <TextInput type="number" step="0.001" min={0} name="promo_apr" defaultValue={initial.promo_apr ?? ""} />
            </Field>
            <Field label="Promo ends (optional)" hint="Regular APR applies from this date">
              <TextInput type="date" name="promo_end_date" defaultValue={initial.promo_end_date ?? ""} />
            </Field>
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

      {active.length >= 2 && <StrategyCard debts={active} />}

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

function StrategyCard({ debts }: { debts: Debt[] }) {
  const [extra, setExtra] = useState<number>(() => debts.reduce((s, d) => s + d.extra_payment, 0));
  const currency = debts[0]?.currency ?? "USD";
  const mixedCurrency = debts.some((d) => d.currency !== currency);
  const start = firstPaymentMonth(null);
  const input = debts.map((d) => ({ ...termsOf(d, 0), id: d.id, name: d.name }));
  const results: StrategyResult[] = [
    simulateStrategy(input, 0, "minimums", start),
    simulateStrategy(input, extra, "avalanche", start),
    simulateStrategy(input, extra, "snowball", start),
  ];
  const label = { minimums: "Minimums only", avalanche: "Avalanche (highest APR first)", snowball: "Snowball (smallest balance first)" };
  const totalMin = debts.reduce((s, d) => s + d.min_payment, 0);
  const best = results[1].totalInterest <= results[2].totalInterest ? "avalanche" : "snowball";

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Payoff strategy</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pays every minimum ({money(totalMin, currency)}/mo), then puts the extra amount, plus each paid-off debt's minimum, toward one debt at a time.
          </p>
        </div>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Extra per month</span>
          <TextInput type="number" step="0.01" min={0} value={extra || ""} placeholder="0"
            onChange={(e) => setExtra(Math.max(0, Number(e.target.value) || 0))} className="w-32" />
        </label>
      </div>
      {mixedCurrency && <p className="mt-2 text-xs text-destructive">Your debts use different currencies, so these combined totals mix them.</p>}
      <div className="mt-3">
        <Table head={<><Th>Plan</Th><Th>Debt free</Th><Th className="text-right">Total interest</Th><Th>Payoff order</Th></>}>
          {results.map((r) => (
            <tr key={r.strategy} className={r.strategy === best && extra > 0 ? "bg-[color:var(--positive)]/5" : ""}>
              <Td className="font-medium">{label[r.strategy]}</Td>
              <Td className="tabular-nums">
                {r.neverPaysOff ? <span className="text-destructive">Never at these payments</span>
                  : `${fmtMonth(r.debtFreeMonth)} (${fmtDuration(r.months ?? 0)})`}
              </Td>
              <Td className="text-right tabular-nums">{r.neverPaysOff ? "—" : money(r.totalInterest, currency)}</Td>
              <Td className="text-xs text-muted-foreground">
                {r.order.map((o) => `${o.name} (${fmtMonth(o.payoffMonth)})`).join(" → ")}
              </Td>
            </tr>
          ))}
        </Table>
      </div>
      {extra > 0 && !results[1].neverPaysOff && !results[2].neverPaysOff && (
        <p className="mt-2 text-xs text-muted-foreground">
          Avalanche saves {money(Math.max(0, results[2].totalInterest - results[1].totalInterest), currency)} in interest compared to snowball.
          {!results[0].neverPaysOff && <> Either one saves {money(Math.max(0, results[0].totalInterest - Math.max(results[1].totalInterest, results[2].totalInterest)), currency)} or more compared to paying minimums only.</>}
        </p>
      )}
    </Card>
  );
}

function ProjectionLine({ label, sched, currency }: { label: string; sched: Schedule; currency: string }) {
  return (
    <div className="text-xs">
      <span className="text-muted-foreground">{label}: </span>
      {sched.neverPaysOff ? (
        <span className="font-medium text-destructive">
          This payment does not reduce the balance.
          {sched.shortfall && <> Interest is about {money(sched.shortfall.monthlyInterest, currency)}/mo and the payment is {money(sched.shortfall.payment, currency)}.</>}
        </span>
      ) : (
        <span className="tabular-nums font-medium">
          {fmtMonth(sched.payoffMonth)} ({fmtDuration(sched.months ?? 0)}), total interest {money(sched.totalInterest, currency)}
        </span>
      )}
    </div>
  );
}

function DebtRow({ debt, onEdit, onDelete }: { debt: Debt; onEdit: () => void; onDelete: () => void }) {
  const [extra, setExtra] = useState<number>(debt.extra_payment);
  const [showPayments, setShowPayments] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const start = firstPaymentMonth(debt.due_day);
  const base = buildSchedule(termsOf(debt, 0), start);
  const sim = buildSchedule(termsOf(debt, extra), start);
  const cur = debt.currency;
  const accrued = debt.balance_as_of && !debt.paid_off_at ? accruedSince(debt.balance, debt.balance_as_of, today(), { apr: debt.apr, promoApr: debt.promo_apr, promoEndDate: debt.promo_end_date }) : 0;
  const promoActive = debt.promo_apr != null && debt.promo_end_date != null && today() < debt.promo_end_date;

  const showProgress = debt.original_balance != null && debt.original_balance > 0;
  const paidAmt = showProgress ? Math.max(0, (debt.original_balance ?? 0) - debt.balance) : 0;
  const pct = showProgress ? Math.min(100, Math.round((paidAmt / (debt.original_balance ?? 1)) * 100)) : 0;
  const canCompare = extra > 0 && !base.neverPaysOff && !sim.neverPaysOff;

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
            {promoActive && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {debt.promo_apr}% UNTIL {debt.promo_end_date}
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {money(debt.balance, cur)} @ {debt.apr}% · min {money(debt.min_payment, cur)}
            {debt.due_day ? ` · due day ${debt.due_day}` : ""}
            {debt.balance_as_of ? ` · as of ${debt.balance_as_of}` : ""}
          </div>
          {accrued >= 0.01 && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              About {money(accrued, cur)} interest has built up since then (payoff amount today ≈ {money(debt.balance + accrued, cur)}).
            </div>
          )}
          {showProgress && (
            <div className="mt-2">
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted-foreground">
                  {money(paidAmt, cur)} of {money(debt.original_balance ?? 0, cur)} paid ({pct}%)
                </span>
                {debt.start_date && <span className="text-muted-foreground">since {debt.start_date}</span>}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-[color:var(--positive)]" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
          {!debt.paid_off_at && <div className="mt-2"><ProjectionLine label="Payoff at minimum" sched={base} currency={cur} /></div>}
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
                onChange={(e) => setExtra(Math.max(0, Number(e.target.value) || 0))} className="w-32" />
            </label>
            <div className="flex-1 space-y-1">
              <ProjectionLine label={`Paying ${money(debt.min_payment + extra, cur)}/mo`} sched={sim} currency={cur} />
              {canCompare && (
                <div className="text-xs text-[color:var(--positive)]">
                  Saves {money(Math.max(0, base.totalInterest - sim.totalInterest), cur)} in interest and {fmtDuration(Math.max(0, (base.months ?? 0) - (sim.months ?? 0)))} compared to the minimum.
                </div>
              )}
            </div>
            <Button size="sm" variant="ghost" onClick={() => setShowSchedule(!showSchedule)}>
              {showSchedule ? "Hide schedule" : "Show schedule"}
            </Button>
          </div>
          {showSchedule && <ScheduleTable sched={sim} currency={cur} />}
        </div>
      )}

      {showPayments && <PaymentsPanel debtId={debt.id} debtName={debt.name} debtCurrency={debt.currency} />}
    </Card>
  );
}

function ScheduleTable({ sched, currency }: { sched: Schedule; currency: string }) {
  if (sched.rows.length === 0) return null;
  const rows = sched.neverPaysOff ? sched.rows.slice(0, 24) : sched.rows;
  return (
    <div className="mt-3 max-h-80 overflow-auto">
      <Table head={<><Th>Month</Th><Th className="text-right">Start</Th><Th className="text-right">Interest</Th><Th className="text-right">Payment</Th><Th className="text-right">Principal</Th><Th className="text-right">End</Th></>}>
        {rows.map((r) => (
          <tr key={r.month}>
            <Td className="text-xs">{fmtMonth(r.month)}</Td>
            <Td className="text-right text-xs tabular-nums">{money(r.startBalance, currency)}</Td>
            <Td className="text-right text-xs tabular-nums">{money(r.interest, currency)}</Td>
            <Td className="text-right text-xs tabular-nums">{money(r.payment, currency)}</Td>
            <Td className={`text-right text-xs tabular-nums ${r.principal < 0 ? "text-destructive" : ""}`}>{money(r.principal, currency)}</Td>
            <Td className="text-right text-xs tabular-nums">{money(Math.max(0, r.endBalance), currency)}</Td>
          </tr>
        ))}
      </Table>
      {sched.neverPaysOff && <p className="mt-1 text-xs text-destructive">Showing the first 24 months. The balance keeps growing at this payment.</p>}
    </div>
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
