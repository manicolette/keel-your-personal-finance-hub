import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useState } from "react";
import { toast } from "sonner";
import {
  createTransaction,
  deleteTransaction,
  listAccounts,
  listCategories,
  listTransactions,
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

function TransactionsPage() {
  const { data: allTxs } = useSuspenseQuery(txQuery);
  const { data: accts } = useSuspenseQuery(acctQuery);
  const { data: cats } = useSuspenseQuery(catQuery);
  const { from, to, account, category } = Route.useSearch();
  const navigate = useNavigate({ from: "/_gated/transactions" });
  const setFilter = (patch: Partial<{ from: string; to: string; account: string; category: string }>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }) });
  const txs = allTxs.filter((t) => {
    if (from && t.on_date < from) return false;
    if (to && t.on_date > to) return false;
    if (account && t.account_id !== account && t.transfer_account_id !== account) return false;
    if (category && t.category_id !== category) return false;
    return true;
  });
  const qc = useQueryClient();
  const create = useServerFn(createTransaction);
  const update = useServerFn(updateTransaction);
  const remove = useServerFn(deleteTransaction);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [showForm, setShowForm] = useState(false);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["budget"] });
  };

  const mCreate = useMutation({
    mutationFn: create,
    onSuccess: () => { toast.success("Transaction added"); invalidate(); setShowForm(false); },
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

  const acctName = (id: string | null) => (id ? accts.find((a) => a.id === id)?.name ?? "—" : "—");
  const catName = (id: string | null) => (id ? cats.find((c) => c.id === id)?.name ?? "—" : "—");

  const initial: Partial<Transaction> = editing ?? {
    on_date: today(), account_id: accts[0]?.id, category_id: null, kind: "expense",
    amount: 0, currency: accts[0]?.currency ?? "USD", notes: "", transfer_account_id: null,
  };
  const formOpen = showForm || !!editing;

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
          {!formOpen && <Button onClick={() => { setShowForm(true); setEditing(null); }}>Add</Button>}
        </div>} />

      {accts.length === 0 && <EmptyState>Add an account first before creating transactions.</EmptyState>}

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
            };
            if (editing) mUpdate.mutate({ data: { ...payload, id: editing.id } });
            else mCreate.mutate({ data: payload });
          }}>
            <Field label="Date"><TextInput type="date" name="on_date" defaultValue={initial.on_date} required /></Field>
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

      {txs.length === 0 ? <EmptyState>No transactions yet.</EmptyState> : (
        <Table head={<>
          <Th>Date</Th><Th>Kind</Th><Th>Account</Th><Th>Category</Th>
          <Th className="text-right">Amount</Th><Th></Th>
        </>}>
          {txs.map((t) => (
            <tr key={t.id}>
              <Td className="whitespace-nowrap">{t.on_date}</Td>
              <Td className="capitalize">{t.kind}</Td>
              <Td>{acctName(t.account_id)}{t.kind === "transfer" && ` → ${acctName(t.transfer_account_id)}`}</Td>
              <Td>{catName(t.category_id)}</Td>
              <Td className={`text-right tabular-nums ${t.kind === "expense" ? "text-[color:var(--negative)]" : t.kind === "income" ? "text-[color:var(--positive)]" : ""}`}>
                {money(t.amount, t.currency)}
              </Td>
              <Td className="text-right">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(t); setShowForm(false); }}>Edit</Button>
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
