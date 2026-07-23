import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createTransaction,
  deleteTransaction,
  linkTransactionToInstance,
  listAccounts,
  listCategories,
  listMonthInstances,
  listTransactions,
  unlinkInstance,
  updateTransaction,
  type Transaction,
} from "@/lib/keel.functions";
import { Button, Card, EmptyState, Field, PageHeader, Select, Table, Td, TextInput, Textarea, Th, money } from "@/components/keel-ui";

const txQuery = queryOptions({ queryKey: ["transactions"], queryFn: () => listTransactions() });
const acctQuery = queryOptions({ queryKey: ["accounts"], queryFn: () => listAccounts() });
const catQuery = queryOptions({ queryKey: ["categories"], queryFn: () => listCategories() });

const searchSchema = z.object({
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  account: fallback(z.string(), "").default(""),
  category: fallback(z.string(), "").default(""),
  q: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_gated/transactions")({
  validateSearch: zodValidator(searchSchema),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(txQuery),
      context.queryClient.ensureQueryData(acctQuery),
      context.queryClient.ensureQueryData(catQuery),
    ]);
  },
  component: TransactionsPage,
  errorComponent: ({ error }) => <div role="alert" className="text-sm text-destructive">{error.message}</div>,
});

const today = () => new Date().toISOString().slice(0, 10);
const monthOf = (dateStr: string) => (dateStr && dateStr.length >= 7 ? dateStr.slice(0, 7) : new Date().toISOString().slice(0, 7));

function TransactionsPage() {
  const { data: allTxs } = useSuspenseQuery(txQuery);
  const { data: accts } = useSuspenseQuery(acctQuery);
  const { data: cats } = useSuspenseQuery(catQuery);
  const { from, to, account, category, q } = Route.useSearch();
  const navigate = useNavigate();
  const setFilter = (patch: Partial<{ from: string; to: string; account: string; category: string; q: string }>) =>
    navigate({ to: "/transactions", search: (prev: { from: string; to: string; account: string; category: string; q: string }) => ({ ...prev, ...patch }) });
  const qLower = q.trim().toLowerCase();
  const txs = allTxs.filter((t) => {
    if (from && t.on_date < from) return false;
    if (to && t.on_date > to) return false;
    if (account && t.account_id !== account && t.transfer_account_id !== account) return false;
    if (category && t.category_id !== category) return false;
    if (qLower && !(t.notes ?? "").toLowerCase().includes(qLower)) return false;
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
  const openForCreate = () => {
    setEditing(null);
    setShowForm(true);
    setReceiptUrl(null);
    setFormDate(today());
    setLinkInstanceId("");
    setInitialLinkId("");
  };

  // Once instances load for the editing tx, pre-select the linked one.
  const preLinked = useMemo(() => {
    if (!editing) return "";
    return instances.find((i) => i.transaction_id === editing.id)?.id ?? "";
  }, [editing, instances]);
  if (editing && preLinked && preLinked !== initialLinkId && linkInstanceId === "" && initialLinkId === "") {
    // one-shot sync when instance data arrives
    setInitialLinkId(preLinked);
    setLinkInstanceId(preLinked);
  }

  const initial: Partial<Transaction> = editing ?? {
    on_date: today(), account_id: accts[0]?.id, category_id: null, kind: "expense",
    amount: 0, currency: accts[0]?.currency ?? "USD", notes: "", transfer_account_id: null, receipt_url: null,
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

  return (
    <div className="space-y-5">
      <PageHeader title="Transactions"
        actions={<div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
          {!formOpen && <Button onClick={openForCreate}>Add</Button>}
        </div>} />

      {accts.length === 0 && <EmptyState>Add an account first before creating transactions.</EmptyState>}

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">Search notes</span>
            <TextInput type="search" value={q} onChange={(e) => setFilter({ q: e.target.value })} placeholder="Search…" className="w-52" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">From</span>
            <TextInput type="date" value={from} onChange={(e) => setFilter({ from: e.target.value })} className="w-40" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">To</span>
            <TextInput type="date" value={to} onChange={(e) => setFilter({ to: e.target.value })} className="w-40" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">Account</span>
            <Select value={account} onChange={(e) => setFilter({ account: e.target.value })} className="w-44">
              <option value="">All accounts</option>
              {accts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium">Category</span>
            <Select value={category} onChange={(e) => setFilter({ category: e.target.value })} className="w-44">
              <option value="">All categories</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.kind})</option>)}
            </Select>
          </label>
          {(from || to || account || category || q) && (
            <Button size="sm" variant="ghost" onClick={() => navigate({ to: "/transactions", search: { from: "", to: "", account: "", category: "", q: "" } })}>Clear</Button>
          )}
          <div className="ml-auto text-xs text-muted-foreground tabular-nums">{txs.length} of {allTxs.length}</div>
        </div>
      </Card>

      {formOpen && accts.length > 0 && (
        <Card>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => {
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
                <option value="expense">expense</option>
                <option value="income">income</option>
                <option value="transfer">transfer</option>
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
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Notes"><Textarea name="notes" defaultValue={initial.notes ?? ""} /></Field>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
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
            <div className="col-span-full flex justify-end gap-2 pt-1">
              <Button variant="ghost" type="button" onClick={() => { setShowForm(false); setEditing(null); setReceiptUrl(null); setLinkInstanceId(""); setInitialLinkId(""); }}>Cancel</Button>
              <Button type="submit" disabled={mCreate.isPending || mUpdate.isPending}>{editing ? "Save" : "Create"}</Button>
            </div>
          </form>
        </Card>
      )}

      {txs.length === 0 ? <EmptyState>No transactions match.</EmptyState> : (
        <Table head={<>
          <Th>Date</Th><Th>Kind</Th><Th>Account</Th><Th>Category</Th>
          <Th className="text-right">Amount</Th><Th></Th>
        </>}>
          {txs.map((t) => (
            <tr key={t.id}>
              <Td className="whitespace-nowrap">{t.on_date}</Td>
              <Td className="capitalize">{t.kind}</Td>
              <Td>{acctName(t.account_id)}{t.kind === "transfer" && ` → ${acctName(t.transfer_account_id)}`}</Td>
              <Td>
                <div className="flex items-center gap-2">
                  {catName(t.category_id)}
                  {t.receipt_url && <a href={t.receipt_url} target="_blank" rel="noreferrer" title="Receipt" className="text-xs text-primary">📎</a>}
                </div>
                {t.notes && <div className="text-xs text-muted-foreground line-clamp-1">{t.notes}</div>}
              </Td>
              <Td className={`text-right tabular-nums ${t.kind === "expense" ? "text-[color:var(--negative)]" : t.kind === "income" ? "text-[color:var(--positive)]" : ""}`}>
                {money(t.amount, t.currency)}
              </Td>
              <Td className="text-right">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" onClick={() => openForEdit(t)}>Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => confirm("Delete this transaction?") && mDelete.mutate({ data: { id: t.id } })}>×</Button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
