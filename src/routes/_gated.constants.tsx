import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  createConstant,
  deleteConstant,
  listAccounts,
  listCategories,
  listConstants,
  updateConstant,
  type ConstantItem,
} from "@/lib/keel.functions";
import { Button, Card, EmptyState, Field, PageHeader, Select, Table, Td, TextInput, Textarea, Th, money } from "@/components/keel-ui";

const constQuery = queryOptions({ queryKey: ["constants"], queryFn: () => listConstants() });
const acctQuery = queryOptions({ queryKey: ["accounts"], queryFn: () => listAccounts() });
const catQuery = queryOptions({ queryKey: ["categories"], queryFn: () => listCategories() });

export const Route = createFileRoute("/_gated/constants")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(constQuery),
      context.queryClient.ensureQueryData(acctQuery),
      context.queryClient.ensureQueryData(catQuery),
    ]);
  },
  component: ConstantsPage,
  errorComponent: ({ error }) => <div role="alert" className="text-sm text-destructive">{error.message}</div>,
});

const today = () => new Date().toISOString().slice(0, 10);

function ConstantsPage() {
  const { data: items } = useSuspenseQuery(constQuery);
  const { data: accts } = useSuspenseQuery(acctQuery);
  const { data: cats } = useSuspenseQuery(catQuery);
  const qc = useQueryClient();
  const create = useServerFn(createConstant);
  const update = useServerFn(updateConstant);
  const remove = useServerFn(deleteConstant);
  const [editing, setEditing] = useState<ConstantItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["constants"] });

  const mCreate = useMutation({ mutationFn: create,
    onSuccess: () => { toast.success("Saved"); invalidate(); setShowForm(false); },
    onError: (e: Error) => toast.error(e.message) });
  const mUpdate = useMutation({ mutationFn: update,
    onSuccess: () => { toast.success("Saved"); invalidate(); setEditing(null); },
    onError: (e: Error) => toast.error(e.message) });
  const mDelete = useMutation({ mutationFn: remove,
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message) });

  const initial: Partial<ConstantItem> = editing ?? {
    name: "", amount: 0, currency: "USD", frequency: "monthly", next_date: today(),
    account_id: null, category_id: null, active: true, notes: "",
  };
  const formOpen = showForm || !!editing;

  return (
    <div className="space-y-5">
      <PageHeader title="Constants" subtitle="Fixed recurring items (rent, salary, insurance…)"
        actions={!formOpen && <Button onClick={() => { setShowForm(true); setEditing(null); }}>Add</Button>} />

      {formOpen && (
        <Card>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const payload = {
              name: String(fd.get("name") || ""),
              amount: Number(fd.get("amount") || 0),
              currency: String(fd.get("currency") || "USD"),
              frequency: String(fd.get("frequency") || "monthly") as ConstantItem["frequency"],
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
                <option value="weekly">weekly</option><option value="monthly">monthly</option>
                <option value="quarterly">quarterly</option><option value="yearly">yearly</option>
              </Select>
            </Field>
            <Field label="Next date"><TextInput type="date" name="next_date" defaultValue={initial.next_date} required /></Field>
            <Field label="Account">
              <Select name="account_id" defaultValue={initial.account_id ?? ""}>
                <option value="">— none —</option>
                {accts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            <Field label="Category">
              <Select name="category_id" defaultValue={initial.category_id ?? ""}>
                <option value="">— none —</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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

      {items.length === 0 ? <EmptyState>No constants yet.</EmptyState> : (
        <Table head={<><Th>Name</Th><Th>Freq</Th><Th>Next</Th><Th className="text-right">Amount</Th><Th></Th></>}>
          {items.map((s) => (
            <tr key={s.id} className={s.active ? "" : "opacity-60"}>
              <Td className="font-medium">{s.name}</Td>
              <Td className="capitalize">{s.frequency}</Td>
              <Td>{s.next_date}</Td>
              <Td className="text-right tabular-nums">{money(s.amount, s.currency)}</Td>
              <Td className="text-right">
                <div className="flex justify-end gap-1">
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
