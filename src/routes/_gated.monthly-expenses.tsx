import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  createMonthlyExpense,
  deleteMonthlyExpense,
  listAccounts,
  listCategories,
  listConstants,
  listMonthlyExpenses,
  updateMonthlyExpense,
  type MonthlyExpense,
} from "@/lib/keel.functions";
import {
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  Select,
  Table,
  Td,
  Textarea,
  TextInput,
  Th,
  money,
  currentMonth,
  OverrideConfirm,
} from "@/components/keel-ui";

const meQuery = queryOptions({ queryKey: ["monthly_expenses"], queryFn: () => listMonthlyExpenses() });
const catQuery = queryOptions({ queryKey: ["categories"], queryFn: () => listCategories() });
const acctQuery = queryOptions({ queryKey: ["accounts"], queryFn: () => listAccounts() });
const constQuery = queryOptions({ queryKey: ["constants"], queryFn: () => listConstants() });

export const Route = createFileRoute("/_gated/monthly-expenses")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(meQuery),
      context.queryClient.ensureQueryData(catQuery),
      context.queryClient.ensureQueryData(acctQuery),
      context.queryClient.ensureQueryData(constQuery),
    ]);
  },
  component: MonthlyExpensesPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="text-sm text-destructive">{error.message}</div>
  ),
});

function MonthlyExpensesPage() {
  const { data: items } = useSuspenseQuery(meQuery);
  const { data: cats } = useSuspenseQuery(catQuery);
  const expenseCats = cats.filter((c) => c.kind === "expense" && !c.archived);
  const { data: accounts } = useSuspenseQuery(acctQuery);
  const payingAccounts = accounts.filter((a) => !a.archived && a.kind !== "credit");
  const { data: constants } = useSuspenseQuery(constQuery);
  const constantsLeft = constants.filter((c) => !c.moved_to).length;
  const acctName = (id: string | null) => (id ? accounts.find((a) => a.id === id)?.name ?? "Unknown account" : null);
  const qc = useQueryClient();
  const create = useServerFn(createMonthlyExpense);
  const update = useServerFn(updateMonthlyExpense);
  const remove = useServerFn(deleteMonthlyExpense);
  const [editing, setEditing] = useState<MonthlyExpense | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [pending, setPending] = useState<{ payload: any; count: number; months: string[] } | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["monthly_expenses"] });
    qc.invalidateQueries({ queryKey: ["budget"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const mCreate = useMutation({
    mutationFn: create,
    onSuccess: () => { toast.success("Added"); invalidate(); setShowForm(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mUpdate = useMutation({
    mutationFn: update,
    onError: (e: Error) => toast.error(e.message || "Couldn't save — nothing was changed."),
  });
  const submitUpdate = async (payload: any, override_policy?: "overwrite" | "keep") => {
    try {
      const res = await mUpdate.mutateAsync({ data: { ...payload, from_month: currentMonth(), override_policy } });
      if (res.needs_confirm) {
        setPending({ payload, count: res.overridden_count, months: res.overridden_months });
        return;
      }
      setPending(null);
      toast.success("Saved — applied to this month and future months");
      await invalidate();
      setEditing(null);
    } catch { /* toast shown in onError; form stays open with your values */ }
  };
  const mDelete = useMutation({
    mutationFn: remove,
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const catName = (id: string | null) => (id ? cats.find((c) => c.id === id)?.name ?? "—" : "— none —");
  const openCreate = () => { setShowForm(true); setEditing(null); };
  const openEdit = (m: MonthlyExpense) => { setEditing(m); setShowForm(false); };
  const closeForm = () => { setShowForm(false); setEditing(null); };
  const formOpen = showForm || !!editing;

  const initial: Partial<MonthlyExpense> = editing ?? {
    name: "", category_id: expenseCats[0]?.id ?? null, account_id: null, default_amount: 0,
    currency: "USD", active: true, start_month: null, end_month: null, notes: "", sort_order: 0,
  };

  const totalMonthly = items.filter((i) => i.active).reduce((s, i) => s + i.default_amount, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Monthly Expenses"
        subtitle="Define recurring expenses once — they show up on every month's Budget automatically."
        actions={!formOpen && <Button onClick={openCreate}>Add expense</Button>}
      />
      {constantsLeft > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <div className="font-medium">{constantsLeft} item{constantsLeft === 1 ? "" : "s"} still in Constants</div>
            <div className="text-muted-foreground">Constants are being folded into Bills, Subscriptions and Income so everything counts in your budget.</div>
          </div>
          <Link to="/constants" className="inline-flex h-10 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted">Review and move</Link>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Active items</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{items.filter((i) => i.active).length}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Monthly total (default)</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{money(totalMonthly)}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Paused / inactive</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{items.filter((i) => !i.active).length}</div>
        </Card>
      </div>

      {pending && (
        <OverrideConfirm
          count={pending.count}
          months={pending.months}
          busy={mUpdate.isPending}
          onOverwrite={() => submitUpdate(pending.payload, "overwrite")}
          onKeep={() => submitUpdate(pending.payload, "keep")}
          onCancel={() => setPending(null)}
        />
      )}

      {formOpen && (
        <Card>
          <form key={editing?.id ?? "new"}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const payload = {
                name: String(fd.get("name") || "").trim(),
                category_id: (String(fd.get("category_id") || "") || null),
                account_id: (String(fd.get("account_id") || "") || null),
                default_amount: Number(fd.get("default_amount") || 0),
                currency: String(fd.get("currency") || "USD"),
                active: fd.get("active") === "on",
                start_month: (String(fd.get("start_month") || "") || null),
                end_month: (String(fd.get("end_month") || "") || null),
                notes: String(fd.get("notes") || "") || null,
                sort_order: Number(fd.get("sort_order") || 0),
              };
              if (editing) submitUpdate({ ...payload, id: editing.id });
              else mCreate.mutate({ data: payload });
            }}
          >
            <Field label="Name"><TextInput name="name" defaultValue={initial.name} required /></Field>
            <Field label="Category">
              <Select name="category_id" defaultValue={initial.category_id ?? ""}>
                <option value="">— none —</option>
                {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Paid from" hint="The bank account this bill normally comes out of">
              <Select name="account_id" defaultValue={initial.account_id ?? ""}>
                <option value="">Not set</option>
                {payingAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            <Field label="Default amount">
              <TextInput type="number" step="0.01" name="default_amount" defaultValue={String(initial.default_amount ?? 0)} required />
            </Field>
            <Field label="Currency"><TextInput name="currency" defaultValue={initial.currency ?? "USD"} /></Field>
            <Field label="Start month (optional)" hint="First month this appears">
              <TextInput type="month" name="start_month" defaultValue={initial.start_month?.slice(0, 7) ?? ""} />
            </Field>
            <Field label="End month (optional)" hint="Last month this appears">
              <TextInput type="month" name="end_month" defaultValue={initial.end_month?.slice(0, 7) ?? ""} />
            </Field>
            <Field label="Sort order"><TextInput type="number" name="sort_order" defaultValue={String(initial.sort_order ?? 0)} /></Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={initial.active ?? true} /> Active
            </label>
            <div className="sm:col-span-2 lg:col-span-3">
              <Field label="Notes"><Textarea name="notes" defaultValue={initial.notes ?? ""} /></Field>
            </div>
            <div className="col-span-full flex justify-end gap-2 pt-1">
              <Button variant="ghost" type="button" onClick={closeForm}>Cancel</Button>
              <Button type="submit" disabled={mCreate.isPending || mUpdate.isPending}>{editing ? "Save" : "Create"}</Button>
            </div>
          </form>
        </Card>
      )}

      {items.length === 0 ? (
        <EmptyState>
          No recurring expenses yet. Add your Rent, Internet, Insurance, etc. once here and
          they'll show up under their category on every month's Budget page automatically.
        </EmptyState>
      ) : (
        <Table head={<>
          <Th>Name</Th><Th>Category</Th><Th>Paid from</Th><Th className="text-right">Default</Th>
          <Th>Window</Th><Th>Status</Th><Th></Th>
        </>}>
          {items.map((m) => (
            <tr key={m.id}>
              <Td className="font-medium">{m.name}</Td>
              <Td>{catName(m.category_id)}</Td>
              <Td>{acctName(m.account_id) ?? <span className="text-muted-foreground">Not set</span>}</Td>
              <Td className="text-right tabular-nums">{money(m.default_amount, m.currency)}</Td>
              <Td className="text-xs text-muted-foreground">
                {m.start_month?.slice(0, 7) ?? "—"} → {m.end_month?.slice(0, 7) ?? "∞"}
              </Td>
              <Td>
                {m.active
                  ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">Active</span>
                  : <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Inactive</span>}
              </Td>
              <Td className="text-right">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" onClick={() => openEdit(m)}>Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => confirm(`Delete "${m.name}"? Past months keep their history.`) && mDelete.mutate({ data: { id: m.id } })}>×</Button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
