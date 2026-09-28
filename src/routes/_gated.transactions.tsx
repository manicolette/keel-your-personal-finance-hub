import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, ChevronLeft, ChevronRight, Paperclip, SlidersHorizontal, TrendingUp } from "lucide-react";
import {
  createTransaction,
  deleteTransaction,
  getIncome,
  getSettings,
  linkTransactionToInstance,
  listAccounts,
  listCategories,
  listGoals,
  listMonthInstances,
  listReminders,
  listTransactions,
  unlinkInstance,
  updateTransaction,
  type Transaction,
} from "@/lib/keel.functions";
import { Button, Card, CategoryIcon, EmptyState, Field, Segmented, Select, Sheet, TextInput, Textarea, money } from "@/components/keel-ui";

const txQuery = queryOptions({ queryKey: ["transactions"], queryFn: () => listTransactions() });
const acctQuery = queryOptions({ queryKey: ["accounts"], queryFn: () => listAccounts() });
const catQuery = queryOptions({ queryKey: ["categories"], queryFn: () => listCategories() });
const goalsQuery = queryOptions({ queryKey: ["goals"], queryFn: () => listGoals() });
const settingsQuery = queryOptions({ queryKey: ["settings"], queryFn: () => getSettings() });

const pad = (n: number) => String(n).padStart(2, "0");
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const shiftMonth = (m: string, delta: number) => {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mm - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};
const monthLabel = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
const dayLabel = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

const searchSchema = z.object({
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  account: fallback(z.string(), "").default(""),
  category: fallback(z.string(), "").default(""),
  q: fallback(z.string(), "").default(""),
  view: fallback(z.enum(["calendar", "list"]), "calendar").default("calendar"),
  month: fallback(z.string(), "").default(""),
  day: fallback(z.string(), "").default(""),
  kind: fallback(z.enum(["", "expense", "income", "transfer"]), "").default(""),
});

export const Route = createFileRoute("/_gated/transactions")({
  validateSearch: zodValidator(searchSchema),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(txQuery),
      context.queryClient.ensureQueryData(acctQuery),
      context.queryClient.ensureQueryData(catQuery),
      context.queryClient.ensureQueryData(goalsQuery),
      context.queryClient.ensureQueryData(settingsQuery),
    ]);
  },
  component: TransactionsPage,
  errorComponent: ({ error }) => <div role="alert" className="text-sm text-destructive">{error.message}</div>,
});

const today = localToday;
const monthOf = (dateStr: string) => (dateStr && dateStr.length >= 7 ? dateStr.slice(0, 7) : new Date().toISOString().slice(0, 7));

function TransactionsPage() {
  const { data: allTxs } = useSuspenseQuery(txQuery);
  const { data: accts } = useSuspenseQuery(acctQuery);
  const { data: cats } = useSuspenseQuery(catQuery);
  const { data: goals } = useSuspenseQuery(goalsQuery);
  const search = Route.useSearch();
  const { from, to, account, category, q, view, kind } = search;
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const thisMonth = today().slice(0, 7) < settings.start_month ? settings.start_month : today().slice(0, 7);
  const month = search.month && search.month >= settings.start_month ? search.month : thisMonth;
  const navigate = useNavigate();
  const setFilter = (patch: Partial<typeof search>) =>
    navigate({ to: "/transactions", search: { ...search, ...patch }, replace: true });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const qLower = q.trim().toLowerCase();
  const txs = allTxs.filter((t) => {
    if (from && t.on_date < from) return false;
    if (to && t.on_date > to) return false;
    if (account && t.account_id !== account && t.transfer_account_id !== account) return false;
    if (category && t.category_id !== category) return false;
    if (qLower && !(t.notes ?? "").toLowerCase().includes(qLower)) return false;
    if (kind && t.kind !== kind) return false;
    return true;
  });
  const qc = useQueryClient();
  const create = useServerFn(createTransaction);
  const update = useServerFn(updateTransaction);
  const remove = useServerFn(deleteTransaction);
  const linkFn = useServerFn(linkTransactionToInstance);
  const unlinkFn = useServerFn(unlinkInstance);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [formDate, setFormDate] = useState<string>(today());
  const [linkInstanceId, setLinkInstanceId] = useState<string>("");
  const [initialLinkId, setInitialLinkId] = useState<string>("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["budget"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["networth-live"] });
    qc.invalidateQueries({ queryKey: ["goals"] });
    qc.invalidateQueries({ queryKey: ["goal-contributions"] });
  };

  const formMonth = monthOf(formDate);
  const instancesQ = useQuery({
    queryKey: ["month_instances", formMonth],
    queryFn: () => listMonthInstances({ data: { month: formMonth } }),
    enabled: showForm || !!editing,
  });
  const instances = instancesQ.data ?? [];

  // Applies the link/unlink delta after a create/update succeeds.
  async function applyLinkDelta(txId: string) {
    if (linkInstanceId === initialLinkId) return;
    try {
      if (linkInstanceId) {
        await linkFn({ data: { instance_id: linkInstanceId, transaction_id: txId } });
      } else if (initialLinkId) {
        await unlinkFn({ data: { id: initialLinkId } });
      }
    } catch (e) {
      toast.error(`Linked, but failed to update Monthly Expense: ${(e as Error).message}`);
    }
  }

  const mCreate = useMutation({
    mutationFn: create,
    onSuccess: async ({ id }) => {
      await applyLinkDelta(id);
      toast.success("Transaction added");
      invalidate();
      setShowForm(false);
      setReceiptUrl(null);
      setLinkInstanceId("");
      setInitialLinkId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const mUpdate = useMutation({
    mutationFn: update,
    onSuccess: async (_res, vars) => {
      await applyLinkDelta((vars as any).data.id);
      toast.success("Saved");
      invalidate();
      setEditing(null);
      setReceiptUrl(null);
      setLinkInstanceId("");
      setInitialLinkId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const mDelete = useMutation({
    mutationFn: remove,
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const acctName = (id: string | null) => (id ? accts.find((a) => a.id === id)?.name ?? "—" : "—");
  const catName = (id: string | null) => (id ? cats.find((c) => c.id === id)?.name ?? "—" : "—");

  const openForEdit = (t: Transaction) => {
    setEditing(t);
    setShowForm(false);
    setReceiptUrl(t.receipt_url);
    setFormDate(t.on_date);
    // Fetch will populate instances; we set the initial link after data lands (see effect-less pattern below).
    setLinkInstanceId("");
    setInitialLinkId("");
  };
  const [createKind, setCreateKind] = useState<Transaction["kind"]>("expense");
  const openForCreate = (k: Transaction["kind"] = "expense") => {
    setCreateKind(k);
    setEditing(null);
    setShowForm(true);
    setReceiptUrl(null);
    setFormDate(today());
    setLinkInstanceId("");
    setInitialLinkId("");
  };

  // Once instances load for the editing tx, pre-select the linked one (one-shot per edit).
  const preLinked = useMemo(() => {
    if (!editing) return "";
    return instances.find((i) => i.transaction_id === editing.id)?.id ?? "";
  }, [editing, instances]);
  useEffect(() => {
    if (!editing) return;
    setInitialLinkId(preLinked);
    setLinkInstanceId(preLinked);
  }, [editing, preLinked]);

  const initial: Partial<Transaction> = editing ?? {
    on_date: search.day || today(), account_id: accts.find((a) => a.kind !== "credit")?.id ?? accts[0]?.id, category_id: null, kind: createKind,
    amount: 0, currency: accts[0]?.currency ?? "USD", notes: "", transfer_account_id: null, receipt_url: null, goal_id: null,
  };
  const formOpen = showForm || !!editing;

  // Which instances are selectable: unpaid ones for this month + the currently-linked one (even if paid).
  const selectableInstances = instances.filter(
    (i) => i.status === "pending" || i.id === initialLinkId,
  );

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload-receipt", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "Upload failed");
      }
      const { url } = await res.json();
      setReceiptUrl(url);
      toast.success("Receipt uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function exportCsv() {
    const header = ["date", "kind", "account", "category", "amount", "currency", "transfer_to", "notes"];
    const rows = txs.map((t) => [
      t.on_date, t.kind, acctName(t.account_id), catName(t.category_id),
      String(t.amount), t.currency, acctName(t.transfer_account_id), (t.notes ?? "").replace(/\n/g, " "),
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `keel-transactions-${today()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const closeForm = () => { setShowForm(false); setEditing(null); setReceiptUrl(null); setLinkInstanceId(""); setInitialLinkId(""); };
  const catOf = (id: string | null) => (id ? cats.find((c) => c.id === id) ?? null : null);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px]">Activity</h1>
        <Segmented
          label="View"
          value={view}
          options={[{ value: "calendar", label: "Calendar" }, { value: "list", label: "List" }]}
          onChange={(v) => setFilter({ view: v })}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => openForCreate("expense")}>Add transaction</Button>
        <Button variant="outline" onClick={() => openForCreate("transfer")}><ArrowLeftRight size={16} /> Move money</Button>
        {view === "list" && <Button variant="outline" onClick={exportCsv}>Export CSV</Button>}
      </div>

      {accts.length === 0 && <EmptyState>Add an account first before creating transactions.</EmptyState>}

      {view === "calendar" ? (
        <CalendarView
          month={month}
          startMonth={settings.start_month}
          selectedDay={search.day}
          txs={allTxs}
          onMonth={(m) => setFilter({ month: m, day: "" })}
          onDay={(d) => setFilter({ day: d === search.day ? "" : d })}
          renderRow={(t) => <TxRow key={t.id} t={t} cat={catOf(t.category_id)} acctName={acctName} onOpen={() => openForEdit(t)} />}
        />
      ) : (
        <>
          <div className="flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Search notes</span>
              <TextInput type="search" value={q} onChange={(e) => setFilter({ q: e.target.value })} placeholder="Search Publix, rent, notes…" />
            </label>
            <Button variant="outline" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen} aria-label="More filters">
              <SlidersHorizontal size={16} />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {([["", "All"], ["expense", "Spending"], ["income", "Income"], ["transfer", "Transfers"]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setFilter({ kind: k })} aria-pressed={kind === k}
                className={`h-9 rounded-full px-3.5 text-[13px] font-semibold ${kind === k ? "bg-foreground text-background" : "border border-border bg-card"}`}>
                {label}
              </button>
            ))}
          </div>
          {filtersOpen && (
            <Card className="grid gap-3 sm:grid-cols-2">
              <Field label="From"><TextInput type="date" value={from} onChange={(e) => setFilter({ from: e.target.value })} /></Field>
              <Field label="To"><TextInput type="date" value={to} onChange={(e) => setFilter({ to: e.target.value })} /></Field>
              <Field label="Account">
                <Select value={account} onChange={(e) => setFilter({ account: e.target.value })}>
                  <option value="">All accounts</option>
                  {accts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </Field>
              <Field label="Category">
                <Select value={category} onChange={(e) => setFilter({ category: e.target.value })}>
                  <option value="">All categories</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.kind})</option>)}
                </Select>
              </Field>
              <div className="col-span-full flex items-center justify-between">
                <span className="text-xs text-muted-foreground tabular-nums">{txs.length} of {allTxs.length} shown</span>
                {(from || to || account || category || q || kind) && (
                  <Button size="sm" variant="ghost" onClick={() => setFilter({ from: "", to: "", account: "", category: "", q: "", kind: "" })}>Clear filters</Button>
                )}
              </div>
            </Card>
          )}
          {txs.length === 0 ? <EmptyState>No transactions match.</EmptyState> : (
            <DayGroups txs={txs} render={(t) => <TxRow key={t.id} t={t} cat={catOf(t.category_id)} acctName={acctName} onOpen={() => openForEdit(t)} />} />
          )}
        </>
      )}

      {formOpen && accts.length > 0 && (
        <Sheet title={editing ? "Edit transaction" : createKind === "transfer" ? "Move money" : "Add transaction"} onClose={closeForm} wide>
          <form key={editing?.id ?? `new-${createKind}`} className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const kind = String(fd.get("kind") || "expense") as Transaction["kind"];
            const payload = {
              on_date: String(fd.get("on_date") || today()),
              account_id: String(fd.get("account_id") || ""),
              category_id: kind === "transfer" ? null : (String(fd.get("category_id") || "") || null),
              kind,
              amount: Number(fd.get("amount") || 0),
              currency: String(fd.get("currency") || "USD"),
              notes: String(fd.get("notes") || "") || null,
              transfer_account_id: kind === "transfer" ? (String(fd.get("transfer_account_id") || "") || null) : null,
              receipt_url: receiptUrl,
              goal_id: String(fd.get("goal_id") || "") || null,
            };
            if (editing) mUpdate.mutate({ data: { ...payload, id: editing.id } });
            else mCreate.mutate({ data: payload });
          }}>
            <Field label="Date">
              <TextInput
                type="date" name="on_date" defaultValue={initial.on_date} required
                onChange={(e) => setFormDate(e.target.value || today())}
              />
            </Field>
            <Field label="Kind">
              <Select name="kind" defaultValue={initial.kind}>
                <option value="expense">Spent</option>
                <option value="income">Money in</option>
                <option value="transfer">Transfer between accounts</option>
              </Select>
            </Field>
            <Field label="Amount"><TextInput type="number" step="0.01" name="amount" defaultValue={String(initial.amount ?? 0)} required /></Field>
            <Field label="Account">
              <Select name="account_id" defaultValue={initial.account_id}>
                {accts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            <Field label="Category">
              <Select name="category_id" defaultValue={initial.category_id ?? ""}>
                <option value="">— none —</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.kind})</option>)}
              </Select>
            </Field>
            <Field label="Transfer to (for transfers)">
              <Select name="transfer_account_id" defaultValue={initial.transfer_account_id ?? ""}>
                <option value="">— none —</option>
                {accts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            <Field label="Currency"><TextInput name="currency" defaultValue={initial.currency} /></Field>
            <Field label="Contributes to Goal" hint="Tag this transaction so it counts toward a savings goal.">
              <Select name="goal_id" defaultValue={initial.goal_id ?? ""}>
                <option value="">— none —</option>
                {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label={`Pays Monthly Expense (${formMonth})`} hint="Manually link this transaction to a planned monthly expense.">
                <Select value={linkInstanceId} onChange={(e) => setLinkInstanceId(e.target.value)}>
                  <option value="">— don't link —</option>
                  {selectableInstances.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} · {i.category_name ?? "Uncategorized"} · planned {money(i.planned_amount, i.currency)}
                      {i.id === initialLinkId ? " (currently linked)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Notes"><Textarea name="notes" defaultValue={initial.notes ?? ""} /></Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Receipt (optional)">
                <div className="flex items-center gap-3">
                  <input
                    type="file" accept="image/*,application/pdf"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(f);
                    }}
                    disabled={uploading}
                    className="text-sm"
                  />
                  {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
                  {receiptUrl && (
                    <>
                      <a href={receiptUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">View receipt</a>
                      <button type="button" onClick={() => setReceiptUrl(null)} className="text-xs text-destructive">Remove</button>
                    </>
                  )}
                </div>
              </Field>
            </div>
            <div className="col-span-full flex flex-wrap justify-end gap-2 pt-1">
              {editing && (
                <Button variant="danger" className="mr-auto" onClick={() => {
                  if (confirm("Delete this transaction?")) { mDelete.mutate({ data: { id: editing.id } }); closeForm(); }
                }}>Delete</Button>
              )}
              <Button variant="ghost" type="button" onClick={closeForm}>Cancel</Button>
              <Button type="submit" disabled={mCreate.isPending || mUpdate.isPending}>{editing ? "Save" : "Save"}</Button>
            </div>
          </form>
        </Sheet>
      )}

    </div>
  );
}

type Cat = { id: string; name: string; color: string; icon: string | null } | null;

function TxRow({ t, cat, acctName, onOpen }: { t: Transaction; cat: Cat; acctName: (id: string | null) => string; onOpen: () => void }) {
  const isTransfer = t.kind === "transfer";
  const title = t.notes || (isTransfer ? "Transfer" : cat?.name ?? (t.kind === "income" ? "Money in" : "Expense"));
  const sub = isTransfer
    ? `${acctName(t.account_id)} to ${acctName(t.transfer_account_id)}`
    : [cat?.name, acctName(t.account_id)].filter(Boolean).join(" · ");
  const sign = t.kind === "expense" ? "−" : t.kind === "income" ? "+" : "";
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-muted/40">
        {isTransfer ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[#e3e8ee] text-[#34495e]"><ArrowLeftRight size={17} /></span>
        ) : t.kind === "income" && !cat?.icon ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[#dcefe3] text-[#2d6a45]"><TrendingUp size={17} /></span>
        ) : (
          <CategoryIcon icon={cat?.icon} color={cat?.color ?? "#8a847b"} size={36} />
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 truncate text-[15px] font-semibold">
            <span className="truncate">{title}</span>
            {t.receipt_url && <Paperclip size={13} aria-label="Has receipt" className="shrink-0 text-muted-foreground" />}
          </span>
          <span className="truncate text-xs text-muted-foreground">{sub}</span>
        </span>
        <span className={`shrink-0 text-[15px] font-bold tabular-nums ${t.kind === "income" ? "text-[color:var(--positive)]" : isTransfer ? "text-muted-foreground" : ""}`}>
          {sign}{money(t.amount, t.currency)}
        </span>
      </button>
    </li>
  );
}

function DayGroups({ txs, render }: { txs: Transaction[]; render: (t: Transaction) => React.ReactNode }) {
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) groups.set(t.on_date, [...(groups.get(t.on_date) ?? []), t]);
  const todayIso = localToday();
  return (
    <div className="flex flex-col gap-4">
      {Array.from(groups.entries()).map(([day, list]) => {
        const net = list.reduce((a, t) => a + (t.kind === "income" ? t.amount : t.kind === "expense" ? -t.amount : 0), 0);
        return (
          <section key={day} className="flex flex-col gap-2">
            <div className="flex justify-between px-1 text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
              <span>{day === todayIso ? `Today · ${dayLabel(day)}` : dayLabel(day)}</span>
              <span className="tabular-nums">{net === 0 ? "" : `${net > 0 ? "+" : "−"}${money(Math.abs(net))}`}</span>
            </div>
            <ul className="divide-y divide-muted overflow-hidden rounded-[20px] border border-border bg-card">{list.map(render)}</ul>
          </section>
        );
      })}
    </div>
  );
}

function CalendarView({
  month, startMonth, selectedDay, txs, onMonth, onDay, renderRow,
}: {
  month: string; startMonth: string; selectedDay: string; txs: Transaction[];
  onMonth: (m: string) => void; onDay: (d: string) => void; renderRow: (t: Transaction) => React.ReactNode;
}) {
  const bills = useQuery({ queryKey: ["month_instances", month], queryFn: () => listMonthInstances({ data: { month } }) });
  const income = useQuery({ queryKey: ["income_month", month], queryFn: () => getIncome({ data: { month } }) });
  const reminders = useQuery({ queryKey: ["reminders"], queryFn: () => listReminders() });

  const [y, m] = month.split("-").map(Number);
  const daysIn = new Date(y, m, 0).getDate();
  const firstDow = new Date(y, m - 1, 1).getDay();
  const todayIso = localToday();
  const monthTx = txs.filter((t) => t.on_date.startsWith(month));
  const spentByDay = new Map<string, number>();
  for (const t of monthTx) if (t.kind === "expense") spentByDay.set(t.on_date, (spentByDay.get(t.on_date) ?? 0) + t.amount);
  const monthSpent = Array.from(spentByDay.values()).reduce((a, b) => a + b, 0);
  const dayTx = selectedDay ? monthTx.filter((t) => t.on_date === selectedDay) : [];

  // What's still coming this month: unpaid bills by due day, expected income, open reminders.
  const fromIso = todayIso > `${month}-01` ? todayIso : `${month}-01`;
  const coming = [
    ...(bills.data ?? []).filter((i) => i.status === "pending").map((i) => ({
      kind: "Bill" as const, date: i.due_day ? `${month}-${pad(Math.min(i.due_day, daysIn))}` : null, name: i.name, amount: i.planned_amount,
    })),
    ...(income.data?.instances ?? []).filter((i) => i.status === "expected").map((i) => ({
      kind: "Income" as const, date: i.expected_date, name: i.name, amount: i.expected_amount,
    })),
    ...(reminders.data ?? []).filter((r) => !r.done && r.due_date.startsWith(month)).map((r) => ({
      kind: "Reminder" as const, date: r.due_date, name: r.title, amount: r.amount,
    })),
  ]
    .filter((c) => !c.date || c.date >= fromIso)
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
  const tag = { Bill: "bg-[#fbe1d5] text-[#8c3520]", Income: "bg-[#dcefe3] text-[#245a3a]", Reminder: "bg-[#e6e1f7] text-[#3f3285]" };

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-3">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={() => onMonth(shiftMonth(month, -1))} disabled={month <= startMonth} aria-label="Previous month"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-background disabled:opacity-30"><ChevronLeft size={18} /></button>
          <div className="text-center">
            <div className="text-[15px] font-bold">{monthLabel(month)}</div>
            <div className="text-xs text-muted-foreground tabular-nums">{money(monthSpent)} spent</div>
          </div>
          <button type="button" onClick={() => onMonth(shiftMonth(month, 1))} aria-label="Next month"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-background"><ChevronRight size={18} /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i} aria-hidden className="py-1 text-[11px] font-bold text-muted-foreground">{d}</span>)}
          {Array.from({ length: firstDow }).map((_, i) => <span key={`b${i}`} />)}
          {Array.from({ length: daysIn }).map((_, i) => {
            const iso = `${month}-${pad(i + 1)}`;
            const spent = spentByDay.get(iso);
            const sel = iso === selectedDay;
            const isToday = iso === todayIso;
            return (
              <button key={iso} type="button" onClick={() => onDay(iso)} aria-pressed={sel}
                aria-label={`${dayLabel(iso)}${spent ? `, ${money(spent)} spent` : ""}`}
                className={`flex h-12 flex-col items-center justify-center rounded-[10px] text-[13px] ${sel ? "bg-accent font-bold text-accent-foreground" : isToday ? "font-bold ring-2 ring-primary ring-inset" : iso > todayIso ? "text-[#8a847b]" : ""}`}>
                {i + 1}
                <span className="text-[10px] tabular-nums text-muted-foreground">{spent ? `$${Math.round(spent)}` : "\u00a0"}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {selectedDay && (
        <section className="flex flex-col gap-2">
          <div className="flex justify-between px-1 text-[15px] font-bold">
            <span>{dayLabel(selectedDay)}</span>
            <span className="font-normal text-muted-foreground tabular-nums">{money(spentByDay.get(selectedDay) ?? 0)} spent</span>
          </div>
          {dayTx.length === 0 ? (
            <EmptyState>Nothing logged this day.</EmptyState>
          ) : (
            <ul className="divide-y divide-muted overflow-hidden rounded-[20px] border border-border bg-card">{dayTx.map(renderRow)}</ul>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="px-1 font-sans text-[17px] font-bold">Coming up</h2>
        {coming.length === 0 ? (
          <EmptyState>Nothing else due in {monthLabel(month)}.</EmptyState>
        ) : (
          <ul className="divide-y divide-muted overflow-hidden rounded-[20px] border border-border bg-card">
            {coming.map((c, i) => (
              <li key={i} className="flex items-center gap-3 px-3.5 py-3">
                <span className={`w-[76px] shrink-0 rounded-lg py-1 text-center text-[11px] font-bold uppercase ${tag[c.kind]}`}>{c.kind}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.date ? dayLabel(c.date) : "No due day set"}</span>
                </span>
                {c.amount != null && (
                  <span className={`shrink-0 text-sm font-bold tabular-nums ${c.kind === "Income" ? "text-[color:var(--positive)]" : ""}`}>
                    {c.kind === "Income" ? "+" : ""}{money(c.amount)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!selectedDay && monthTx.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 font-sans text-[17px] font-bold">This month</h2>
          <DayGroups txs={monthTx} render={renderRow} />
        </section>
      )}
    </div>
  );
}
