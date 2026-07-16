import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  createReminder,
  deleteReminder,
  listAccounts,
  listReminders,
  updateReminder,
  type Reminder,
} from "@/lib/keel.functions";
import { Button, Card, EmptyState, Field, PageHeader, Select, Table, Td, TextInput, Textarea, Th, money } from "@/components/keel-ui";

const remQuery = queryOptions({ queryKey: ["reminders"], queryFn: () => listReminders() });
const acctQuery = queryOptions({ queryKey: ["accounts"], queryFn: () => listAccounts() });
const today = () => new Date().toISOString().slice(0, 10);

export const Route = createFileRoute("/_gated/reminders")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(remQuery),
      context.queryClient.ensureQueryData(acctQuery),
    ]);
  },
  component: RemindersPage,
  errorComponent: ({ error }) => <div role="alert" className="text-sm text-destructive">{error.message}</div>,
});

function RemindersPage() {
  const { data: rems } = useSuspenseQuery(remQuery);
  const { data: accts } = useSuspenseQuery(acctQuery);
  const qc = useQueryClient();
  const create = useServerFn(createReminder);
  const update = useServerFn(updateReminder);
  const remove = useServerFn(deleteReminder);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [showForm, setShowForm] = useState(false);
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["reminders"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };

  const mCreate = useMutation({ mutationFn: create,
    onSuccess: () => { toast.success("Saved"); invalidate(); setShowForm(false); },
    onError: (e: Error) => toast.error(e.message) });
  const mUpdate = useMutation({ mutationFn: update,
    onSuccess: () => { invalidate(); setEditing(null); },
    onError: (e: Error) => toast.error(e.message) });
  const mDelete = useMutation({ mutationFn: remove,
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message) });

  const initial: Partial<Reminder> = editing ?? { title: "", due_date: today(), amount: null, account_id: null, done: false, notes: "" };
  const formOpen = showForm || !!editing;

  function toggleDone(r: Reminder) {
    mUpdate.mutate({ data: { ...r, done: !r.done } });
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Reminders"
        actions={!formOpen && <Button onClick={() => { setShowForm(true); setEditing(null); }}>Add reminder</Button>} />

      {formOpen && (
        <Card>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const amt = String(fd.get("amount") || "");
            const payload = {
              title: String(fd.get("title") || ""),
              due_date: String(fd.get("due_date") || today()),
              amount: amt ? Number(amt) : null,
              account_id: String(fd.get("account_id") || "") || null,
              done: fd.get("done") === "on",
              notes: String(fd.get("notes") || "") || null,
            };
            if (editing) mUpdate.mutate({ data: { ...payload, id: editing.id } });
            else mCreate.mutate({ data: payload });
          }}>
            <Field label="Title"><TextInput name="title" defaultValue={initial.title} required /></Field>
            <Field label="Due date"><TextInput type="date" name="due_date" defaultValue={initial.due_date} required /></Field>
            <Field label="Amount (optional)"><TextInput type="number" step="0.01" name="amount" defaultValue={initial.amount ?? ""} /></Field>
            <Field label="Account (optional)">
              <Select name="account_id" defaultValue={initial.account_id ?? ""}>
                <option value="">— none —</option>
                {accts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input type="checkbox" name="done" defaultChecked={!!initial.done} /> Done
            </label>
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Notes"><Textarea name="notes" defaultValue={initial.notes ?? ""} /></Field>
            </div>
            <div className="col-span-full flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Button>
              <Button type="submit" disabled={mCreate.isPending || mUpdate.isPending}>{editing ? "Save" : "Create"}</Button>
            </div>
          </form>
        </Card>
      )}

      {rems.length === 0 ? <EmptyState>No reminders yet.</EmptyState> : (
        <Table head={<><Th></Th><Th>Title</Th><Th>Due</Th><Th className="text-right">Amount</Th><Th></Th></>}>
          {rems.map((r) => (
            <tr key={r.id} className={r.done ? "opacity-60" : ""}>
              <Td><input type="checkbox" checked={r.done} onChange={() => toggleDone(r)} /></Td>
              <Td className={`font-medium ${r.done ? "line-through" : ""}`}>{r.title}</Td>
              <Td>{r.due_date}</Td>
              <Td className="text-right tabular-nums">{r.amount != null ? money(r.amount) : "—"}</Td>
              <Td className="text-right">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(r); setShowForm(false); }}>Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => confirm("Delete?") && mDelete.mutate({ data: { id: r.id } })}>×</Button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
