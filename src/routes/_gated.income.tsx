import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createRecurringIncome,
  deleteRecurringIncome,
  getIncome,
  getSettings,
  linkTransactionToIncome,
  listAccounts,
  listCategories,
  listRecurringIncome,
  listTransactions,
  receiveIncomeDirect,
  unlinkIncomeInstance,
  updateIncomeInstance,
  updateRecurringIncome,
  type RecurringIncome,
} from "@/lib/keel.functions";
import { Check, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Button, Card, EmptyState, Field, Select, Sheet, TextInput, Textarea, money } from "@/components/keel-ui";


const incQuery = queryOptions({ queryKey: ["recurring_income"], queryFn: () => listRecurringIncome() });
const acctQuery = queryOptions({ queryKey: ["accounts"], queryFn: () => listAccounts() });
const catQuery = queryOptions({ queryKey: ["categories"], queryFn: () => listCategories() });
const txQuery = queryOptions({ queryKey: ["transactions"], queryFn: () => listTransactions() });
const settingsQuery = queryOptions({ queryKey: ["settings"], queryFn: () => getSettings() });
const monthLabel = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
const dayLabel = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

const searchSchema = z.object({
  month: fallback(z.string().regex(/^\d{4}-\d{2}$/), "").default(""),
});

// Local month (not UTC), so evenings at month end don't jump ahead.
const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};
const shiftMonth = (m: string, delta: number) => {
  const [y, mm] = m.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mm - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const Route = createFileRoute("/_gated/income")({
  validateSearch: zodValidator(searchSchema),
  loaderDeps: ({ search: { month } }) => ({ month: month || currentMonth() }),
  loader: async ({ context, deps }) => {
    const settings = await context.queryClient.ensureQueryData(settingsQuery);
    if (deps.month < settings.start_month) throw redirect({ to: "/income", search: { month: settings.start_month } });
    await Promise.all([
      context.queryClient.ensureQueryData(incQuery),
      context.queryClient.ensureQueryData(acctQuery),
      context.queryClient.ensureQueryData(catQuery),
      context.queryClient.ensureQueryData(txQuery),
      context.queryClient.ensureQueryData({
        queryKey: ["income_month", deps.month],
        queryFn: () => getIncome({ data: { month: deps.month } }),
      }),
    ]);
  },
  component: IncomePage,
  errorComponent: ({ error }) => <div role="alert" className="text-sm text-destructive">{error.message}</div>,
});

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function IncomePage() {
  const { data: sources } = useSuspenseQuery(incQuery);
  const { data: accts } = useSuspenseQuery(acctQuery);
  const { data: cats } = useSuspenseQuery(catQuery);
  const { data: allTxs } = useSuspenseQuery(txQuery);
  const rawMonth = Route.useSearch().month;
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const month = rawMonth || currentMonth();
  const thisMonth = currentMonth() < settings.start_month ? settings.start_month : currentMonth();
  const monthQ = useSuspenseQuery(
    queryOptions({ queryKey: ["income_month", month], queryFn: () => getIncome({ data: { month } }) }),
  );
  const monthData = monthQ.data;
  const navigate = useNavigate();
  const goMonth = (m: string) => navigate({ to: "/income", search: { month: m } });

  const qc = useQueryClient();
  const create = useServerFn(createRecurringIncome);
  const update = useServerFn(updateRecurringIncome);
  const remove = useServerFn(deleteRecurringIncome);
  const linkFn = useServerFn(linkTransactionToIncome);
  const unlinkFn = useServerFn(unlinkIncomeInstance);
  const updateInst = useServerFn(updateIncomeInstance);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["recurring_income"] });
    qc.invalidateQueries({ queryKey: ["income_month"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["networth-live"] });
  };


  const [editing, setEditing] = useState<RecurringIncome | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [freq, setFreq] = useState<RecurringIncome["frequency"]>("monthly");
  const [isVariable, setIsVariable] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
    setFreq("monthly");
    setIsVariable(false);
  };
  const openEdit = (s: RecurringIncome) => {
    setEditing(s);
    setShowForm(false);
    setFreq(s.frequency);
    setIsVariable(s.is_variable);
  };

  const mCreate = useMutation({
    mutationFn: create,
    onSuccess: () => { toast.success("Income source saved"); invalidate(); setShowForm(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mUpdate = useMutation({
    mutationFn: update,
    onSuccess: () => { toast.success("Saved"); invalidate(); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mDelete = useMutation({
    mutationFn: remove,
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const initial: Partial<RecurringIncome> = editing ?? {
    name: "", amount: 0, currency: "USD", frequency: "monthly", next_date: today(),
    account_id: null, category_id: null, active: true, notes: "",
    anchor_date: null, semimonthly_day_1: 1, semimonthly_day_2: 15, is_variable: false,
    start_date: null, end_date: null,
  };
  const formOpen = showForm || !!editing;

  // Only unlinked income transactions for the current month, so linking dropdown is short.
  const monthTxOptions = useMemo(() => {
    const linkedIds = new Set(monthData.instances.map((i) => i.transaction_id).filter(Boolean) as string[]);
    return allTxs.filter(
      (t) => t.kind === "income" && t.on_date.slice(0, 7) === month && !linkedIds.has(t.id),
    );
  }, [allTxs, monthData, month]);

  function handleLink(instanceId: string, txId: string) {
    if (!txId) return;
    linkFn({ data: { instance_id: instanceId, transaction_id: txId } })
      .then(() => { toast.success("Linked"); invalidate(); })
      .catch((e: Error) => toast.error(e.message));
  }
  function handleUnlink(id: string) {
    unlinkFn({ data: { id } })
      .then(() => { toast.success("Unlinked"); invalidate(); })
      .catch((e: Error) => toast.error(e.message));
  }
  function handleSkip(id: string) {
    updateInst({ data: { id, status: "skipped" } })
      .then(() => { toast.success("Skipped"); invalidate(); })
      .catch((e: Error) => toast.error(e.message));
  }
  function handleUnskip(id: string) {
    updateInst({ data: { id, status: "expected" } })
      .then(() => { toast.success("Restored"); invalidate(); })
      .catch((e: Error) => toast.error(e.message));
  }

  const closeForm = () => { setShowForm(false); setEditing(null); };
  const received = monthData.receivedAll;
  const expected = monthData.expectedTotal;
  const pct = expected > 0 ? Math.min(100, Math.round((received / expected) * 100)) : 0;
  const acctName = (id: string | null) => accts.find((a) => a.id === id)?.name ?? null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <h1 className="text-[28px]">Income</h1>

      <Card className="flex flex-col gap-3 p-[18px]">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => goMonth(shiftMonth(month, -1))} disabled={month <= settings.start_month} aria-label="Previous month"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-background disabled:opacity-30"><ChevronLeft size={18} /></button>
          <div className="flex flex-col items-center">
            <span className="text-[15px] font-bold">{monthLabel(month)}</span>
            {month !== thisMonth && <button type="button" onClick={() => goMonth(thisMonth)} className="text-xs font-semibold text-primary">Back to {monthLabel(thisMonth)}</button>}
          </div>
          <button type="button" onClick={() => goMonth(shiftMonth(month, 1))} aria-label="Next month"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-background"><ChevronRight size={18} /></button>
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-display text-[34px] font-semibold tabular-nums text-[color:var(--positive)]">{money(received)}</span>
          <span className="text-sm text-muted-foreground">of {money(expected)} received</span>
        </div>
        <div role="progressbar" aria-label="Share of expected income received" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2.5 rounded-full bg-muted">
          <div className="h-2.5 rounded-full bg-[#4e9a6b]" style={{ width: `${pct}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[["Expected", money(expected), ""], ["Received", money(received), "text-[color:var(--positive)]"], ["Still coming", money(Math.max(0, expected - received)), ""]].map(([l, v, c]) => (
            <div key={l} className="rounded-[14px] bg-background p-2.5"><div className="text-xs text-muted-foreground">{l}</div><div className={`text-[14px] font-bold tabular-nums ${c}`}>{v}</div></div>
          ))}
        </div>
      </Card>

      <section className="flex flex-col gap-2.5">
        <h2 className="font-sans text-[17px] font-bold">This month</h2>
        {monthData.unmatchedCount > 0 && (
          <p className="rounded-2xl bg-accent px-3.5 py-2.5 text-[13px] text-accent-foreground">
            {monthData.unmatchedCount === 1 ? "1 deposit this month isn't" : `${monthData.unmatchedCount} deposits this month aren't`} matched to an expected payment yet.
            Use "Match a transaction" below so the right payment shows as received.
          </p>
        )}
        {monthData.instances.length === 0 ? (
          <EmptyState>No income expected in {monthLabel(month)}. Add a source below.</EmptyState>
        ) : (
          <ul className="divide-y divide-muted overflow-hidden rounded-[20px] border border-border bg-card">
            {monthData.instances.map((i) => (
              <IncomeInstanceRow
                key={i.id}
                inst={i}
                accounts={accts.filter((a) => a.kind !== "credit")}
                defaultAccountId={sources.find((src) => src.id === i.recurring_income_id)?.account_id ?? null}
                monthTxOptions={monthTxOptions}
                onLink={handleLink}
                onUnlink={handleUnlink}
                onSkip={handleSkip}
                onUnskip={handleUnskip}
                onInvalidate={invalidate}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-sans text-[17px] font-bold">Sources</h2>
          <span className="text-sm text-muted-foreground">repeat automatically</span>
        </div>
        {sources.length === 0 ? (
          <EmptyState>No income sources yet. Add your stipend or paycheck so each month knows what to expect.</EmptyState>
        ) : (
          sources.map((src) => (
            <button key={src.id} type="button" onClick={() => openEdit(src)}
              className={`flex flex-col gap-2 rounded-2xl border border-border bg-card p-3.5 text-left ${src.active ? "" : "opacity-60"}`}>
              <span className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-semibold">{src.name}</span>
                <span className="text-[15px] font-bold tabular-nums">{src.is_variable || src.amount == null ? "Varies" : money(src.amount, src.currency)}</span>
              </span>
              <span className="flex flex-wrap gap-1.5">
                <span className="rounded-lg bg-muted px-2 py-1 text-xs font-semibold">{scheduleSummary(src)}</span>
                {src.is_variable && <span className="rounded-lg bg-[#fff0c9] px-2 py-1 text-xs font-semibold text-[#6e500e]">Amount varies</span>}
                {acctName(src.account_id) && <span className="rounded-lg bg-[#e3e8ee] px-2 py-1 text-xs font-semibold text-[#34495e]">Into {acctName(src.account_id)}</span>}
                {!src.active && <span className="rounded-lg bg-muted px-2 py-1 text-xs font-semibold">Paused</span>}
              </span>
            </button>
          ))
        )}
        <Button onClick={openCreate} className="bg-foreground">Add income source</Button>
      </section>

      {formOpen && (
        <Sheet title={editing ? "Edit income source" : "Add income source"} onClose={closeForm} wide>
          <form
            key={editing?.id ?? "new"}
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const payload = {
                name: String(fd.get("name") || ""),
                amount: isVariable ? null : Number(fd.get("amount") || 0),
                currency: String(fd.get("currency") || "USD"),
                frequency: String(fd.get("frequency") || "monthly") as RecurringIncome["frequency"],
                next_date: String(fd.get("next_date") || today()),
                account_id: String(fd.get("account_id") || "") || null,
                category_id: String(fd.get("category_id") || "") || null,
                active: fd.get("active") === "on",
                notes: String(fd.get("notes") || "") || null,
                anchor_date: freq === "biweekly" ? (String(fd.get("anchor_date") || "") || null) : null,
                semimonthly_day_1: freq === "semimonthly" ? Number(fd.get("semimonthly_day_1") || 1) : null,
                semimonthly_day_2: freq === "semimonthly" ? Number(fd.get("semimonthly_day_2") || 15) : null,
                is_variable: isVariable,
                start_date: String(fd.get("start_date") || "") || null,
                end_date: String(fd.get("end_date") || "") || null,
              };
              if (editing) mUpdate.mutate({ data: { ...payload, id: editing.id } });
              else mCreate.mutate({ data: payload });
            }}
          >
            <Field label="Name"><TextInput name="name" defaultValue={initial.name ?? ""} required /></Field>
            <Field label="Frequency">
              <Select
                name="frequency"
                defaultValue={initial.frequency}
                onChange={(e) => setFreq(e.target.value as RecurringIncome["frequency"])}
              >
                <option value="weekly">weekly (every 7 days)</option>
                <option value="biweekly">bi-weekly (every 14 days)</option>
                <option value="semimonthly">semi-monthly (twice a month)</option>
                <option value="monthly">monthly</option>
                <option value="quarterly">quarterly</option>
                <option value="yearly">yearly</option>
              </Select>
            </Field>
            <Field label={isVariable ? "Amount (variable — leave blank)" : "Amount"}>
              <TextInput
                type="number"
                step="0.01"
                name="amount"
                defaultValue={String(initial.amount ?? 0)}
                disabled={isVariable}
              />
            </Field>
            <Field label="Currency"><TextInput name="currency" defaultValue={initial.currency ?? "USD"} /></Field>
            <Field label={freq === "biweekly" ? "Next expected pay date" : freq === "semimonthly" ? "Effective from" : "Next expected date"}>
              <TextInput type="date" name="next_date" defaultValue={initial.next_date ?? today()} required />
            </Field>
            {freq === "biweekly" && (
              <Field
                label="Bi-weekly anchor date"
                hint="Any real paycheck date on this cycle. We step ±14 days from here. Defaults to the next expected date."
              >
                <TextInput type="date" name="anchor_date" defaultValue={initial.anchor_date ?? initial.next_date ?? today()} />
              </Field>
            )}
            {freq === "semimonthly" && (
              <>
                <Field label="First pay day (1–31)">
                  <TextInput type="number" min={1} max={31} name="semimonthly_day_1" defaultValue={String(initial.semimonthly_day_1 ?? 1)} />
                </Field>
                <Field label="Second pay day (1–31)" hint="Use 31 for 'last day of the month' (auto-clamped in shorter months).">
                  <TextInput type="number" min={1} max={31} name="semimonthly_day_2" defaultValue={String(initial.semimonthly_day_2 ?? 15)} />
                </Field>
              </>
            )}
            <Field label="Start date" hint="No instances materialize before this date. Leave blank for no lower bound.">
              <TextInput type="date" name="start_date" defaultValue={initial.start_date ?? ""} />
            </Field>
            <Field label="End date (optional)" hint="No instances materialize after this date. Leave blank to continue indefinitely.">
              <TextInput type="date" name="end_date" defaultValue={initial.end_date ?? ""} />
            </Field>
            <Field label="Deposit to account">
              <Select name="account_id" defaultValue={initial.account_id ?? ""}>
                <option value="">— none —</option>
                {accts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            <Field label="Category">
              <Select name="category_id" defaultValue={initial.category_id ?? ""}>
                <option value="">— none —</option>
                {cats.filter((c) => c.kind === "income").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input type="checkbox" name="active" defaultChecked={initial.active !== false} /> Active
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input
                type="checkbox"
                checked={isVariable}
                onChange={(e) => setIsVariable(e.target.checked)}
              /> Variable amount (freelance, tips, commission)
            </label>
            <div className="sm:col-span-2">
              <Field label="Notes"><Textarea name="notes" defaultValue={initial.notes ?? ""} /></Field>
            </div>
            <div className="col-span-full flex flex-wrap justify-end gap-2 pt-1">
              {editing && (
                <Button variant="danger" className="mr-auto" onClick={() => {
                  if (confirm(`Delete ${editing.name}? Past months keep their history.`)) { mDelete.mutate({ data: { id: editing.id } }); closeForm(); }
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

type IncomeInst = Awaited<ReturnType<typeof getIncome>>["instances"][number];

function IncomeInstanceRow({
  inst, accounts, defaultAccountId, monthTxOptions, onLink, onUnlink, onSkip, onUnskip, onInvalidate,
}: {
  inst: IncomeInst;
  accounts: { id: string; name: string }[];
  defaultAccountId: string | null;
  monthTxOptions: { id: string; on_date: string; amount: number; currency: string; notes: string | null }[];
  onLink: (id: string, tx: string) => void;
  onUnlink: (id: string) => void;
  onSkip: (id: string) => void;
  onUnskip: (id: string) => void;
  onInvalidate: () => void;
}) {
  const receiveFn = useServerFn(receiveIncomeDirect);
  const [entryOpen, setEntryOpen] = useState(false);
  const [amount, setAmount] = useState<string>(
    inst.received_amount != null ? String(inst.received_amount) : (inst.expected_amount != null ? String(inst.expected_amount) : ""),
  );
  const [accountId, setAccountId] = useState<string>(defaultAccountId ?? accounts[0]?.id ?? "");
  const [onDate, setOnDate] = useState<string>(inst.transaction_date ?? inst.expected_date);
  const [notes, setNotes] = useState<string>("");
  const [pending, setPending] = useState(false);

  const canSubmit = !!accountId && Number(amount) > 0 && !pending;

  const submit = () => {
    if (!canSubmit) {
      if (!accountId) toast.error("Pick which account received the money");
      else if (!(Number(amount) > 0)) toast.error("Enter an amount greater than 0");
      return;
    }
    setPending(true);
    receiveFn({ data: { instance_id: inst.id, account_id: accountId, amount: Number(amount), on_date: onDate, notes: notes || null } })
      .then(() => { toast.success(inst.status === "received" ? "Updated" : "Received"); setEntryOpen(false); onInvalidate(); })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setPending(false));
  };

  const received = inst.status === "received";
  const diff = received && inst.received_amount != null && inst.expected_amount != null ? inst.received_amount - inst.expected_amount : 0;
  return (
    <li className={`flex flex-col gap-2.5 p-3.5 ${inst.status === "skipped" ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] ${received ? "bg-[#dcefe3] text-[#2d6a45]" : "bg-[#fff0c9] text-[#8a6412]"}`}>
          {received ? <Check size={18} strokeWidth={2.4} /> : <Clock size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{inst.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {dayLabel(inst.transaction_date ?? inst.expected_date)}
            {inst.expected_amount == null ? " · amount varies" : received && diff !== 0 ? ` · expected ${money(inst.expected_amount, inst.currency)}` : ""}
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className={`text-[15px] font-bold tabular-nums ${received ? "text-[color:var(--positive)]" : ""}`}>
            {received && inst.received_amount != null ? `+${money(inst.received_amount, inst.currency)}` : inst.expected_amount != null ? money(inst.expected_amount, inst.currency) : "Varies"}
          </span>
          <span className={`text-[11px] font-bold ${received ? "text-[color:var(--positive)]" : inst.status === "skipped" ? "text-muted-foreground" : "text-[color:var(--warning)]"}`}>
            {received ? (diff > 0 ? `${money(diff)} more than expected` : diff < 0 ? `${money(-diff)} less than expected` : "Received") : inst.status === "skipped" ? "Skipped" : "Expected"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pl-12">
        {received ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setEntryOpen((v) => !v)}>{entryOpen ? "Close" : "Edit"}</Button>
            <Button size="sm" variant="ghost" onClick={() => onUnlink(inst.id)}>Unmatch</Button>
          </>
        ) : inst.status === "skipped" ? (
          <Button size="sm" variant="outline" onClick={() => onUnskip(inst.id)}>Undo skip</Button>
        ) : (
          <>
            <Button size="sm" onClick={() => setEntryOpen((v) => !v)}>{entryOpen ? "Close" : "Mark received"}</Button>
            {monthTxOptions.length > 0 && (
              <label className="inline-flex">
                <span className="sr-only">Match a transaction</span>
                <select value="" onChange={(e) => onLink(inst.id, e.target.value)}
                  className="h-9 max-w-[190px] rounded-full border border-border bg-card px-3 text-xs font-semibold">
                  <option value="">Match a transaction</option>
                  {monthTxOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.on_date.slice(5)} · {money(t.amount, t.currency)}{t.notes ? ` · ${t.notes.slice(0, 24)}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button size="sm" variant="ghost" onClick={() => onSkip(inst.id)}>Skip</Button>
          </>
        )}
      </div>

      {entryOpen && (
        <div className="ml-12 grid gap-2 rounded-2xl border border-dashed border-border bg-background p-3 sm:grid-cols-2">
          <Field label="Amount received">
            <TextInput type="number" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Into account">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Pick account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Date"><TextInput type="date" value={onDate} onChange={(e) => setOnDate(e.target.value)} /></Field>
          <Field label="Note (optional)"><TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. tip week" /></Field>
          <div className="col-span-full flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Saves a real income transaction, so the account balance moves.</span>
            <Button size="sm" onClick={submit} disabled={!canSubmit}>{received ? "Save" : "Mark received"}</Button>
          </div>
        </div>
      )}
    </li>
  );
}


function scheduleSummary(s: RecurringIncome): string {
  const ord = (n: number | null) => (n == null ? "?" : n >= 31 ? "last day" : `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`);
  if (s.frequency === "biweekly") return `Every 2 weeks from ${dayLabel(s.anchor_date ?? s.next_date)}`;
  if (s.frequency === "semimonthly") return `Twice a month · ${ord(s.semimonthly_day_1)} and ${ord(s.semimonthly_day_2)}`;
  if (s.frequency === "weekly") return `Weekly from ${dayLabel(s.next_date)}`;
  return `${s.frequency === "monthly" ? "Monthly" : s.frequency === "quarterly" ? "Quarterly" : "Yearly"} · next ${dayLabel(s.next_date)}`;
}

