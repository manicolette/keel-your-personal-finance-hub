import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  createSubscription,
  deleteSubscription,
  listAccounts,
  listCategories,
  listSubscriptions,
  updateSubscription,
  type Subscription,
} from "@/lib/keel.functions";
import { Button, Card, EmptyState, Field, PageHeader, Select, Table, Td, TextInput, Textarea, Th, money } from "@/components/keel-ui";

const subsQuery = queryOptions({ queryKey: ["subscriptions"], queryFn: () => listSubscriptions() });
const acctQuery = queryOptions({ queryKey: ["accounts"], queryFn: () => listAccounts() });
const catQuery = queryOptions({ queryKey: ["categories"], queryFn: () => listCategories() });

export const Route = createFileRoute("/_gated/subscriptions")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(subsQuery),
      context.queryClient.ensureQueryData(acctQuery),
      context.queryClient.ensureQueryData(catQuery),
    ]);
  },
  component: SubscriptionsPage,
  errorComponent: ({ error }) => <div role="alert" className="text-sm text-destructive">{error.message}</div>,
});

const today = () => new Date().toISOString().slice(0, 10);

function SubscriptionsPage() {
  const { data: subs } = useSuspenseQuery(subsQuery);
  const { data: accts } = useSuspenseQuery(acctQuery);
  const { data: cats } = useSuspenseQuery(catQuery);
  const qc = useQueryClient();
  const create = useServerFn(createSubscription);
  const update = useServerFn(updateSubscription);
  const remove = useServerFn(deleteSubscription);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [showForm, setShowForm] = useState(false);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["subscriptions"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const mCreate = useMutation({
    mutationFn: create,
    onSuccess: () => { toast.success("Subscription saved"); invalidate(); setShowForm(false); },
    onError: (e: Error) => toast.error(e.message || "Failed to save subscription"),
  });
  const mUpdate = useMutation({
    mutationFn: update,
    onSuccess: () => { toast.success("Subscription updated"); invalidate(); setEditing(null); },
    onError: (e: Error) => toast.error(e.message || "Failed to update subscription"),
  });
  const mDelete = useMutation({
    mutationFn: remove,
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const initial: Partial<Subscription> = editing ?? {
    name: "", amount: 0, currency: "USD", frequency: "monthly", next_charge_date: today(),
    account_id: null, category_id: null, active: true, notes: "",
  };
  const formOpen = showForm || !!editing;

  return (
    <div className="space-y-5">
      <PageHeader title="Subscriptions" subtitle="Recurring paid services."
        actions={!formOpen && <Button onClick={() => { setShowForm(true); setEditing(null); }}>Add subscription</Button>} />

      {formOpen && (
        <Card>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const payload = {
              name: String(fd.get("name") || ""),
              amount: Number(fd.get("amount") || 0),
              currency: String(fd.get("currency") || "USD"),
              frequency: String(fd.get("frequency") || "monthly") as Subscription["frequency"],
              next_charge_date: String(fd.get("next_charge_date") || today()),
              account_id: String(fd.get("account_id") || "") || null,
              category_id: String(fd.get("category_id") || "") || null,
              active: fd.get("active") === "on",
              notes: String(fd.get("notes") || "") || null,
            };
            try {
              if (editing) await mUpdate.mutateAsync({ data: { ...payload, id: editing.id } });
              else await mCreate.mutateAsync({ data: payload });
            } catch {/* toast handled in onError */}
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
            <Field label="Next charge date"><TextInput type="date" name="next_charge_date" defaultValue={initial.next_charge_date} required /></Field>
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

      {subs.length === 0 ? <EmptyState>No subscriptions yet.</EmptyState> : (
        <Table head={<><Th>Name</Th><Th>Freq</Th><Th>Next</Th><Th className="text-right">Amount</Th><Th></Th></>}>
          {subs.map((s) => (
            <tr key={s.id} className={s.active ? "" : "opacity-60"}>
              <Td className="font-medium">{s.name}</Td>
              <Td className="capitalize">{s.frequency}</Td>
              <Td>{s.next_charge_date}</Td>
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
