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
  moveConstant,
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
  const move = useServerFn(moveConstant);
  const [moving, setMoving] = useState<string | null>(null);
  const catKind = (id: string | null) => (id ? cats.find((c) => c.id === id)?.kind ?? null : null);
  const destination = (c: ConstantItem) =>
    catKind(c.category_id) === "income" ? "Income" : c.frequency === "monthly" ? "Bills" : "Subscriptions";
  const movedLabel = (t: string) =>
    t.startsWith("recurring_income") ? "Income" : t.startsWith("monthly_expenses") ? "Bills" : "Subscriptions";

  // Moves one constant; on a same-name match asks before just marking it moved. Returns false if
  // the user stopped, so "Move all" can stop too.
  const moveOne = async (c: ConstantItem): Promise<boolean> => {
    setMoving(c.id);
    try {
      const res = await move({ data: { id: c.id, mode: "move" } });
      if (res.status === "duplicate") {
        const ok = confirm(
          `"${res.existing_name}" is already in ${res.target_label}. Mark "${c.name}" as moved without making a copy?`,
        );
        if (!ok) return false;
        await move({ data: { id: c.id, mode: "mark_only" } });
      }
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setMoving(null);
      invalidate();
      qc.invalidateQueries({ queryKey: ["monthly_expenses"] });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["budget"] });
    }
  };
  const moveAll = async () => {
    let count = 0;
    for (const c of items.filter((i) => !i.moved_to)) {
      if (!(await moveOne(c))) break;
      count++;
    }
    if (count > 0) toast.success(`Moved ${count} item${count === 1 ? "" : "s"}`);
  };
  const remaining = items.filter((i) => !i.moved_to).length;

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
      <PageHeader title="Constants" subtitle="Being retired. Move each item to Bills, Subscriptions or Income so it counts in your budget."
        actions={remaining > 0 && <Button onClick={moveAll} disabled={moving !== null}>Move all ({remaining})</Button>} />
      <Card className="text-sm text-muted-foreground">
        Monthly expenses go to Bills with the same paying account. Weekly, quarterly and yearly expenses go to
        Subscriptions, which the budget counts at their monthly amount. Anything in an income category goes to Income.
        Moved items stay listed here, switched off, so nothing is lost.
      </Card>

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
        <Table head={<><Th>Name</Th><Th>Freq</Th><Th>Next</Th><Th className="text-right">Amount</Th><Th>Goes to</Th><Th></Th></>}>
          {items.map((s) => (
            <tr key={s.id} className={s.active && !s.moved_to ? "" : "opacity-60"}>
              <Td className="font-medium">{s.name}</Td>
              <Td className="capitalize">{s.frequency}</Td>
              <Td>{s.next_date}</Td>
              <Td className="text-right tabular-nums">{money(s.amount, s.currency)}</Td>
              <Td>{s.moved_to ? <span className="text-xs font-medium">Moved to {movedLabel(s.moved_to)}</span> : destination(s)}</Td>
              <Td className="text-right">
                <div className="flex justify-end gap-1">
                  {!s.moved_to && (
                    <Button size="sm" onClick={async () => { if (await moveOne(s)) toast.success(`Moved to ${destination(s)}`); }} disabled={moving !== null}>
                      {moving === s.id ? "Moving…" : "Move"}
                    </Button>
                  )}
                  {!s.moved_to && <Button size="sm" variant="outline" onClick={() => { setEditing(s); setShowForm(false); }}>Edit</Button>}
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
