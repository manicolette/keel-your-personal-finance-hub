import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  createRecurringIncome,
  deleteRecurringIncome,
  listAccounts,
  listCategories,
  listRecurringIncome,
  logRecurringIncomeReceived,
  updateRecurringIncome,
  type RecurringIncome,
} from "@/lib/keel.functions";
import { Button, Card, EmptyState, Field, PageHeader, Select, Table, Td, TextInput, Textarea, Th, money } from "@/components/keel-ui";

const incQuery = queryOptions({ queryKey: ["recurring_income"], queryFn: () => listRecurringIncome() });
const acctQuery = queryOptions({ queryKey: ["accounts"], queryFn: () => listAccounts() });
const catQuery = queryOptions({ queryKey: ["categories"], queryFn: () => listCategories() });

export const Route = createFileRoute("/_gated/income")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(incQuery),
      context.queryClient.ensureQueryData(acctQuery),
      context.queryClient.ensureQueryData(catQuery),
    ]);
  },
  component: IncomePage,
  errorComponent: ({ error }) => <div role="alert" className="text-sm text-destructive">{error.message}</div>,
});

const today = () => new Date().toISOString().slice(0, 10);

function IncomePage() {
  const { data: items } = useSuspenseQuery(incQuery);
  const { data: accts } = useSuspenseQuery(acctQuery);
  const { data: cats } = useSuspenseQuery(catQuery);
  const qc = useQueryClient();
  const create = useServerFn(createRecurringIncome);
  const update = useServerFn(updateRecurringIncome);
  const remove = useServerFn(deleteRecurringIncome);
  const logReceived = useServerFn(logRecurringIncomeReceived);
  const [editing, setEditing] = useState<RecurringIncome | null>(null);
  const [showForm, setShowForm] = useState(false);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["recurring_income"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
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
  const mLog = useMutation({ mutationFn: logReceived,
    onSuccess: () => { toast.success("Income logged"); invalidate(); },
    onError: (e: Error) => toast.error(e.message) });

  const initial: Partial<RecurringIncome> = editing ?? {
    name: "", amount: 0, currency: "USD", frequency: "monthly", next_date: today(),
    account_id: null, category_id: null, active: true, notes: "",
  };
  const formOpen = showForm || !!editing;

  return (
    <div className="space-y-5">
      <PageHeader title="Recurring Income" subtitle="Paychecks and other regular income."
        actions={!formOpen && <Button onClick={() => { setShowForm(true); setEditing(null); }}>Add income</Button>} />

      {formOpen && (
        <Card>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const payload = {
              name: String(fd.get("name") || ""),
              amount: Number(fd.get("amount") || 0),
              currency: String(fd.get("currency") || "USD"),
              frequency: String(fd.get("frequency") || "monthly") as RecurringIncome["frequency"],
              next_date: String(fd.get("next_date") || today()),
              account_id: String(fd.get("account_id") || "") || null,
              category_id: String(fd.get("category_id") || "") || null,
              active: fd.get("active") === "on",
              notes: String(fd.get("notes") || "") || null,
            };
            if (editing) mUpdate.mutate({ data: { ...payload, id: editing.id } });
            else mCreate.mutate({ data: payload });
          }}>
            <Field label="Name"><TextInput name="name" defaultValue={initial.name} required /></Field>
            <Field label="Amount"><TextInput type="number" step="0.01" name="amount" defaultValue={String(initial.amount ?? 0)} required /></Field>
            <Field label="Currency"><TextInput name="currency" defaultValue={initial.currency} /></Field>
            <Field label="Frequency">
              <Select name="frequency" defaultValue={initial.frequency}>
                <option value="weekly">weekly</option>
                <option value="monthly">monthly</option>
                <option value="quarterly">quarterly</option>
                <option value="yearly">yearly</option>
              </Select>
            </Field>
            <Field label="Next expected date"><TextInput type="date" name="next_date" defaultValue={initial.next_date} required /></Field>
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

      {items.length === 0 ? <EmptyState>No recurring income yet.</EmptyState> : (
        <Table head={<><Th>Name</Th><Th>Freq</Th><Th>Next</Th><Th className="text-right">Amount</Th><Th></Th></>}>
          {items.map((s) => (
            <tr key={s.id} className={s.active ? "" : "opacity-60"}>
              <Td className="font-medium">{s.name}</Td>
              <Td className="capitalize">{s.frequency}</Td>
              <Td>{s.next_date}</Td>
              <Td className="text-right tabular-nums text-[color:var(--positive)]">{money(s.amount, s.currency)}</Td>
              <Td className="text-right">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" onClick={() => mLog.mutate({ data: { id: s.id, on_date: today(), account_id: s.account_id } })} disabled={mLog.isPending}>
                    Log received
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditing(s); setShowForm(false); }}>Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => confirm(`Delete ${s.name}?`) && mDelete.mutate({ data: { id: s.id } })}>Delete</Button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
