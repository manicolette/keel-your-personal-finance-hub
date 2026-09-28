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
import { CreditCard } from "lucide-react";
import { Button, Card, EmptyState, Field, Segmented, Select, Sheet, Table, Td, TextInput, Textarea, Th, money } from "@/components/keel-ui";

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
  const closeForm = () => { setShowForm(false); setEditing(null); };

  // One plan drives the summary, the plan card and the "extra goes here first" badge.
  const [strategy, setStrategy] = useState<"avalanche" | "snowball" | "minimums">("avalanche");
  const [extra, setExtra] = useState<number>(() => debts.filter((d) => !d.paid_off_at).reduce((a, d) => a + d.extra_payment, 0));
  const currency = active[0]?.currency ?? "USD";
  const planInput = active.map((d) => ({ ...termsOf(d, 0), id: d.id, name: d.name }));
  const planStart = firstPaymentMonth(null);
  const plan = active.length > 0 ? simulateStrategy(planInput, strategy === "minimums" ? 0 : extra, strategy, planStart) : null;
  const minimumsPlan = active.length > 0 ? simulateStrategy(planInput, 0, "minimums", planStart) : null;
  const firstTarget = strategy !== "minimums" && extra > 0 ? plan?.order[0]?.id ?? null : null;
  const totalOwed = active.reduce((a, d) => a + d.balance, 0);
  const totalMin = active.reduce((a, d) => a + d.min_payment, 0);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[28px]">Debts</h1>
        <Button variant="outline" onClick={() => { setShowForm(true); setEditing(null); }}>Add debt</Button>
      </div>

      {active.length > 0 && plan && (
        <section className="flex flex-col gap-3 rounded-3xl bg-foreground p-[18px] text-background">
          <div className="flex items-baseline justify-between text-[13px] text-[#c9d1d6]">
            <span className="font-semibold">Total owed</span>
            <span className="text-xs">as of each debt's last statement or payment</span>
          </div>
          <div className="font-display text-[36px] font-semibold tabular-nums">{money(totalOwed, currency)}</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-[#2a3a45] p-2.5">
              <div className="text-xs text-[#c9d1d6]">Paying each month</div>
              <div className="font-bold tabular-nums">{money(totalMin + (strategy === "minimums" ? 0 : extra), currency)}</div>
            </div>
            <div className="rounded-xl bg-[#2a3a45] p-2.5">
              <div className="text-xs text-[#c9d1d6]">Debt free by</div>
              <div className="font-bold">{plan.neverPaysOff ? "Not at these payments" : fmtMonth(plan.debtFreeMonth)}</div>
            </div>
          </div>
        </section>
      )}

      {active.length > 0 && plan && minimumsPlan && (
        <PlanCard
          strategy={strategy} setStrategy={setStrategy} extra={extra} setExtra={setExtra}
          plan={plan} minimumsPlan={minimumsPlan} totalMin={totalMin} currency={currency}
          mixedCurrency={active.some((d) => d.currency !== currency)}
        />
      )}

      {active.length === 0 && paid.length === 0 ? <EmptyState>No debts tracked.</EmptyState> : (
        <section className="flex flex-col gap-3">
          {active.length > 0 && <h2 className="font-sans text-[17px] font-bold">Your debts</h2>}
          {active.map((d) => (
            <DebtRow key={d.id} debt={d} isTarget={d.id === firstTarget}
              onEdit={() => { setEditing(d); setShowForm(false); }}
              onDelete={() => confirm(`Delete ${d.name}?`) && mDelete.mutate({ data: { id: d.id } })} />
          ))}
        </section>
      )}

      {paid.length > 0 && (
        <div className="flex flex-col gap-3">
          <button onClick={() => setShowPaid(!showPaid)} aria-expanded={showPaid}
            className="self-start text-sm font-semibold text-muted-foreground hover:text-foreground">
            {showPaid ? "Hide" : "Show"} paid off ({paid.length})
          </button>
          {showPaid && paid.map((d) => (
            <DebtRow key={d.id} debt={d} isTarget={false} onEdit={() => { setEditing(d); setShowForm(false); }} onDelete={() => confirm(`Delete ${d.name}?`) && mDelete.mutate({ data: { id: d.id } })} />
          ))}
        </div>
      )}

      {formOpen && (
        <Sheet title={editing ? `Edit ${editing.name}` : "Add debt"} onClose={closeForm} wide>
          <form key={editing?.id ?? "new"} className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
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
            <div className="sm:col-span-2">
              <Field label="Notes"><Textarea name="notes" defaultValue={initial.notes ?? ""} /></Field>
            </div>
            <div className="col-span-full flex flex-wrap justify-end gap-2 pt-1">
              {editing && (
                <Button variant="danger" className="mr-auto" onClick={() => {
                  if (confirm(`Delete ${editing.name}?`)) { mDelete.mutate({ data: { id: editing.id } }); closeForm(); }
                }}>Delete</Button>
              )}
              <Button variant="ghost" type="button" onClick={closeForm}>Cancel</Button>
              <Button type="submit" disabled={mCreate.isPending || mUpdate.isPending}>Save</Button>
            </div>
          </form>
        </Sheet>
      )}

    </div>
  );
}

function PlanCard({
  strategy, setStrategy, extra, setExtra, plan, minimumsPlan, totalMin, currency, mixedCurrency,
}: {
  strategy: "avalanche" | "snowball" | "minimums"; setStrategy: (s: "avalanche" | "snowball" | "minimums") => void;
  extra: number; setExtra: (n: number) => void; plan: StrategyResult; minimumsPlan: StrategyResult;
  totalMin: number; currency: string; mixedCurrency: boolean;
}) {
  const blurb = {
    avalanche: "Highest APR first. Every extra dollar goes to the costliest balance, which saves the most interest.",
    snowball: "Smallest balance first. You clear whole debts sooner, which some people find more motivating.",
    minimums: "Only the minimum on each debt, for comparison.",
  }[strategy];
  const saves = !plan.neverPaysOff && !minimumsPlan.neverPaysOff ? Math.max(0, minimumsPlan.totalInterest - plan.totalInterest) : null;
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="font-sans text-[17px] font-bold">Payoff plan</h2>
      <Segmented label="Payoff plan" value={strategy} onChange={setStrategy}
        options={[{ value: "avalanche", label: "Avalanche" }, { value: "snowball", label: "Snowball" }, { value: "minimums", label: "Minimums" }]} />
      <Card className="flex flex-col gap-3">
        <p className="text-[13px] text-muted-foreground">{blurb}</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="flex flex-col"><span className="text-[11px] font-bold uppercase text-muted-foreground">Interest</span>
            <span className="text-[15px] font-bold tabular-nums">{plan.neverPaysOff ? "Never ends" : money(plan.totalInterest, currency)}</span></div>
          <div className="flex flex-col"><span className="text-[11px] font-bold uppercase text-muted-foreground">Done by</span>
            <span className="text-[15px] font-bold">{plan.neverPaysOff ? "Never" : fmtMonth(plan.debtFreeMonth)}</span>
            {!plan.neverPaysOff && <span className="text-[11px] text-muted-foreground">{fmtDuration(plan.months ?? 0)}</span>}</div>
          <div className="flex flex-col"><span className="text-[11px] font-bold uppercase text-[color:var(--positive)]">Vs minimums</span>
            <span className="text-[15px] font-bold tabular-nums text-[color:var(--positive)]">{strategy === "minimums" || saves == null ? "None" : `Save ${money(saves, currency)}`}</span></div>
        </div>
        {strategy !== "minimums" && (
          <Field label="Extra each month, on top of minimums" hint={`Minimums add up to ${money(totalMin, currency)} a month.`}>
            <TextInput type="number" inputMode="decimal" step="0.01" min={0} value={extra || ""} placeholder="0"
              onChange={(e) => setExtra(Math.max(0, Number(e.target.value) || 0))} />
          </Field>
        )}
        {plan.order.length > 1 && !plan.neverPaysOff && (
          <ol className="flex flex-col gap-1 text-[13px]">
            {plan.order.map((o, i) => (
              <li key={o.id} className="flex justify-between gap-2">
                <span className="truncate"><span className="font-bold text-muted-foreground">{i + 1}.</span> {o.name}</span>
                <span className="shrink-0 text-muted-foreground">paid off {fmtMonth(o.payoffMonth)}</span>
              </li>
            ))}
          </ol>
        )}
        {mixedCurrency && <p className="text-xs text-destructive">Your debts use different currencies, so these combined totals mix them.</p>}
      </Card>
    </section>
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

function DebtRow({ debt, isTarget, onEdit, onDelete }: { debt: Debt; isTarget: boolean; onEdit: () => void; onDelete: () => void }) {
  const [whatIf, setWhatIf] = useState(false);
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
    <Card className={`flex flex-col gap-3 ${isTarget ? "border-2 border-primary" : ""}`}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[#e3e8ee] text-[#34495e]"><CreditCard size={19} /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold">{debt.name}</div>
          {isTarget && <div className="text-xs font-bold text-primary">Extra payment goes here first</div>}
          {debt.paid_off_at && <div className="text-xs font-bold text-[color:var(--positive)]">Paid off {debt.paid_off_at}</div>}
        </div>
        <span className="text-[17px] font-bold tabular-nums">{money(debt.balance, cur)}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-lg bg-[#fde2e4] px-2 py-1 text-xs font-semibold text-[#8c2a3f]">{debt.apr}% APR</span>
        {promoActive && <span className="rounded-lg bg-[#dcefe3] px-2 py-1 text-xs font-semibold text-[#245a3a]">{debt.promo_apr}% promo until {debt.promo_end_date}</span>}
        <span className="rounded-lg bg-muted px-2 py-1 text-xs font-semibold">Min {money(debt.min_payment, cur)}{debt.due_day ? ` · due the ${debt.due_day}${debt.due_day % 10 === 1 && debt.due_day !== 11 ? "st" : debt.due_day % 10 === 2 && debt.due_day !== 12 ? "nd" : debt.due_day % 10 === 3 && debt.due_day !== 13 ? "rd" : "th"}` : ""}</span>
        {!debt.paid_off_at && !base.neverPaysOff && <span className="rounded-lg bg-muted px-2 py-1 text-xs font-semibold">At minimum: paid off {fmtMonth(base.payoffMonth)}</span>}
      </div>
      {debt.balance_as_of && (
        <div className="text-xs text-muted-foreground">
          Balance as of {debt.balance_as_of}.{accrued >= 0.01 && <> About {money(accrued, cur)} interest since then, so the payoff amount today is about {money(debt.balance + accrued, cur)}.</>}
        </div>
      )}
      {!debt.paid_off_at && base.neverPaysOff && <ProjectionLine label="At minimum" sched={base} currency={cur} />}
      {showProgress && (
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>{money(paidAmt, cur)} of {money(debt.original_balance ?? 0, cur)} paid ({pct}%)</span>
            {debt.start_date && <span>since {debt.start_date}</span>}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-[color:var(--positive)]" style={{ width: `${pct}%` }} /></div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={isTarget ? "primary" : "outline"} onClick={() => setShowPayments(!showPayments)} aria-expanded={showPayments}>
          {showPayments ? "Hide payments" : "Log payment"}
        </Button>
        <Button size="sm" variant="outline" onClick={onEdit}>Update statement</Button>
        {!debt.paid_off_at && <Button size="sm" variant="ghost" onClick={() => setWhatIf(!whatIf)} aria-expanded={whatIf}>What if I pay more</Button>}
        <Button size="sm" variant="ghost" onClick={onDelete} className="ml-auto text-[color:var(--negative)]">Delete</Button>
      </div>

      {whatIf && !debt.paid_off_at && (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-background p-3">
          <Field label="Extra per month on this debt">
            <TextInput type="number" inputMode="decimal" step="0.01" min={0} value={extra || ""} placeholder="0"
              onChange={(e) => setExtra(Math.max(0, Number(e.target.value) || 0))} />
          </Field>
          <ProjectionLine label={`Paying ${money(debt.min_payment + extra, cur)} a month`} sched={sim} currency={cur} />
          {canCompare && (
            <div className="text-xs font-semibold text-[color:var(--positive)]">
              Saves {money(Math.max(0, base.totalInterest - sim.totalInterest), cur)} in interest and {fmtDuration(Math.max(0, (base.months ?? 0) - (sim.months ?? 0)))} compared with the minimum.
            </div>
          )}
          <Button size="sm" variant="ghost" className="self-start" onClick={() => setShowSchedule(!showSchedule)}>
            {showSchedule ? "Hide month by month" : "Show month by month"}
          </Button>
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
    <div className="space-y-3 rounded-2xl border border-border bg-background p-3">
      <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => {
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
          <TextInput name="note" placeholder="optional" />
        </label>
        <div className="flex items-end">
          <Button type="submit" disabled={mCreate.isPending} className="w-full">Log payment</Button>
        </div>
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
