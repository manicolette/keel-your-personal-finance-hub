import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { Button, Card, EmptyState, Field, PageHeader, Select, Table, Td, TextInput, Textarea, Th, money } from "@/components/keel-ui";


const incQuery = queryOptions({ queryKey: ["recurring_income"], queryFn: () => listRecurringIncome() });
const acctQuery = queryOptions({ queryKey: ["accounts"], queryFn: () => listAccounts() });
const catQuery = queryOptions({ queryKey: ["categories"], queryFn: () => listCategories() });
const txQuery = queryOptions({ queryKey: ["transactions"], queryFn: () => listTransactions() });

const searchSchema = z.object({
  month: fallback(z.string().regex(/^\d{4}-\d{2}$/), "").default(""),
});

const currentMonth = () => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
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

const today = () => new Date().toISOString().slice(0, 10);

function IncomePage() {
  const { data: sources } = useSuspenseQuery(incQuery);
  const { data: accts } = useSuspenseQuery(acctQuery);
  const { data: cats } = useSuspenseQuery(catQuery);
  const { data: allTxs } = useSuspenseQuery(txQuery);
  const rawMonth = Route.useSearch().month;
  const month = rawMonth || currentMonth();
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Income"
        subtitle="Sources of income and each month's expected vs received."
        actions={!formOpen && <Button onClick={openCreate}>Add income source</Button>}
      />

      {formOpen && (
        <Card>
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
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

      {/* Sources list */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Income sources</h2>
        {sources.length === 0 ? (
          <EmptyState>No income sources yet. Add one to start projecting monthly income.</EmptyState>
        ) : (
          <Table head={<><Th>Name</Th><Th>Frequency</Th><Th>Schedule</Th><Th className="text-right">Amount</Th><Th></Th></>}>
            {sources.map((s) => (
              <tr key={s.id} className={s.active ? "" : "opacity-60"}>
                <Td className="font-medium">
                  {s.name}
                  {s.is_variable && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">variable</span>}
                </Td>
                <Td className="capitalize">{labelForFrequency(s.frequency)}</Td>
                <Td className="text-xs text-muted-foreground">{scheduleSummary(s)}</Td>
                <Td className="text-right tabular-nums text-[color:var(--positive)]">
                  {s.is_variable || s.amount == null ? "—" : money(s.amount, s.currency)}
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => openEdit(s)}>Edit</Button>
                    <Button size="sm" variant="danger" onClick={() => confirm(`Delete ${s.name}? Historical income instances will remain.`) && mDelete.mutate({ data: { id: s.id } })}>Delete</Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </section>

      {/* Monthly instances */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">This month</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => goMonth(shiftMonth(month, -1))}>← Prev</Button>
            <div className="min-w-24 text-center text-sm font-medium tabular-nums">{month}</div>
            <Button size="sm" variant="outline" onClick={() => goMonth(shiftMonth(month, +1))}>Next →</Button>
            <Button size="sm" variant="ghost" onClick={() => goMonth(currentMonth())}>Today</Button>
          </div>
        </div>

        <Card>
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Expected</div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums">{money(monthData.expectedTotal)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Received</div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums text-[color:var(--positive)]">{money(monthData.receivedTotal)}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Outstanding</div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums">
                {money(Math.max(0, monthData.expectedTotal - monthData.receivedTotal))}
              </div>
            </div>
          </div>
        </Card>

        {monthData.instances.length === 0 ? (
          <EmptyState>No income projected for {month}. Add a source above.</EmptyState>
        ) : (
          <Table head={<><Th>Date</Th><Th>Source</Th><Th className="text-right">Expected</Th><Th>Status</Th><Th className="text-right">Received</Th><Th></Th></>}>

            {monthData.instances.map((i) => (
              <IncomeInstanceRow
                key={i.id}
                inst={i}
                accounts={accts}
                monthTxOptions={monthTxOptions}
                onLink={handleLink}
                onUnlink={handleUnlink}
                onSkip={handleSkip}
                onUnskip={handleUnskip}
                onInvalidate={invalidate}
              />
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}

type IncomeInst = Awaited<ReturnType<typeof getIncome>>["instances"][number];

function IncomeInstanceRow({
  inst, accounts, monthTxOptions, onLink, onUnlink, onSkip, onUnskip, onInvalidate,
}: {
  inst: IncomeInst;
  accounts: { id: string; name: string }[];
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
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? "");
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

  return (
    <>
      <tr className={inst.status === "skipped" ? "opacity-50" : ""}>
        <Td className="whitespace-nowrap tabular-nums">{inst.expected_date}</Td>
        <Td>
          <div className="font-medium">{inst.name}</div>
          {inst.is_variable && <div className="text-[10px] uppercase tracking-wide text-muted-foreground">variable</div>}
        </Td>
        <Td className="text-right tabular-nums">
          {inst.expected_amount == null ? <span className="text-xs text-muted-foreground">variable</span> : money(inst.expected_amount, inst.currency)}
        </Td>
        <Td><StatusPill status={inst.status} /></Td>
        <Td className="text-right tabular-nums text-[color:var(--positive)]">
          {inst.status === "received" && inst.received_amount != null ? money(inst.received_amount, inst.currency) : "—"}
          {inst.transaction_date && <div className="text-[10px] text-muted-foreground">on {inst.transaction_date}</div>}
        </Td>
        <Td className="text-right">
          <div className="flex flex-wrap justify-end gap-1">
            {inst.status === "received" ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setEntryOpen((v) => !v)}>{entryOpen ? "Close" : "Edit received"}</Button>
                <Button size="sm" variant="ghost" onClick={() => onUnlink(inst.id)}>Unlink</Button>
              </>
            ) : inst.status === "skipped" ? (
              <Button size="sm" variant="outline" onClick={() => onUnskip(inst.id)}>Un-skip</Button>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setEntryOpen((v) => !v)}>{entryOpen ? "Close" : "Enter received"}</Button>
                <Select
                  className="max-w-[180px] text-xs"
                  value=""
                  onChange={(e) => onLink(inst.id, e.target.value)}
                  title="Or link an existing transaction"
                >
                  <option value="">Link transaction…</option>
                  {monthTxOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.on_date} · {money(t.amount, t.currency)}{t.notes ? ` · ${t.notes.slice(0, 30)}` : ""}
                    </option>
                  ))}
                </Select>
                <Button size="sm" variant="ghost" onClick={() => onSkip(inst.id)}>Skip</Button>
              </>
            )}
          </div>
        </Td>
      </tr>
      {entryOpen && (
        <tr className="bg-muted/30">
          <td colSpan={6} className="px-3">
            <div className="flex flex-wrap items-end gap-2 px-1 py-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium">Amount received</span>
                <TextInput type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-32" />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium">Into account</span>
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-44">
                  <option value="">— pick account —</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium">Date</span>
                <TextInput type="date" value={onDate} onChange={(e) => setOnDate(e.target.value)} className="w-40" />
              </label>
              <label className="flex flex-col gap-1 text-xs flex-1 min-w-[180px]">
                <span className="font-medium">Note (optional)</span>
                <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. tip week" />
              </label>
              <Button size="sm" onClick={submit} disabled={!canSubmit}>
                {inst.status === "received" ? "Save changes" : "Mark received"}
              </Button>
            </div>
            <div className="px-1 pb-2 text-[11px] text-muted-foreground">
              This creates (or updates) a real income Transaction on the chosen account, so its balance moves.
            </div>
          </td>

        </tr>
      )}
    </>
  );
}


function labelForFrequency(f: RecurringIncome["frequency"]) {
  switch (f) {
    case "biweekly": return "bi-weekly";
    case "semimonthly": return "semi-monthly";
    default: return f;
  }
}

function scheduleSummary(s: RecurringIncome): string {
  if (s.frequency === "biweekly") return `every 14 days from ${s.anchor_date ?? s.next_date}`;
  if (s.frequency === "semimonthly") return `days ${s.semimonthly_day_1 ?? "?"} & ${s.semimonthly_day_2 ?? "?"} each month`;
  if (s.frequency === "weekly") return `every 7 days from ${s.next_date}`;
  return `next ${s.next_date}`;
}

function StatusPill({ status }: { status: "expected" | "received" | "skipped" }) {
  const map: Record<string, string> = {
    expected: "bg-muted text-foreground",
    received: "bg-[color:var(--positive)]/15 text-[color:var(--positive)]",
    skipped: "bg-muted text-muted-foreground line-through",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${map[status]}`}>
      {status}
    </span>
  );
}
