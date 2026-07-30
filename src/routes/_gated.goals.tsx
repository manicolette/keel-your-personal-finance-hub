import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  createGoal,
  deleteGoal,
  listAccounts,
  listGoalContributions,
  listGoals,
  listTransactions,
  setTransactionGoal,
  updateGoal,
  type Goal,
} from "@/lib/keel.functions";
import { Button, Card, EmptyState, Field, PageHeader, Select, TextInput, Textarea, money } from "@/components/keel-ui";

const goalsQuery = queryOptions({ queryKey: ["goals"], queryFn: () => listGoals() });
const contribQuery = queryOptions({ queryKey: ["goal-contributions"], queryFn: () => listGoalContributions() });
const accountsQuery = queryOptions({ queryKey: ["accounts"], queryFn: () => listAccounts() });
const txQuery = queryOptions({ queryKey: ["transactions"], queryFn: () => listTransactions() });

export const Route = createFileRoute("/_gated/goals")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(goalsQuery),
      context.queryClient.ensureQueryData(contribQuery),
      context.queryClient.ensureQueryData(accountsQuery),
      context.queryClient.ensureQueryData(txQuery),
    ]);
  },
  component: GoalsPage,
  errorComponent: ({ error }) => <div role="alert" className="text-sm text-destructive">{error.message}</div>,
});

function GoalsPage() {
  const { data: goals } = useSuspenseQuery(goalsQuery);
  const { data: contributions } = useSuspenseQuery(contribQuery);
  const { data: accounts } = useSuspenseQuery(accountsQuery);
  const { data: transactions } = useSuspenseQuery(txQuery);
  const qc = useQueryClient();
  const create = useServerFn(createGoal);
  const update = useServerFn(updateGoal);
  const remove = useServerFn(deleteGoal);
  const tag = useServerFn(setTransactionGoal);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [showForm, setShowForm] = useState(false);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["goals"] });
    qc.invalidateQueries({ queryKey: ["goal-contributions"] });
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
  const mTag = useMutation({ mutationFn: tag,
    onSuccess: () => { toast.success("Goal link updated"); invalidate(); },
    onError: (e: Error) => toast.error(e.message) });

  const initial: Partial<Goal> = editing ?? { name: "", target_amount: 0, saved_amount: 0, target_date: null, notes: "", account_id: null };
  const formOpen = showForm || !!editing;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Goals"
        subtitle="Progress is real money: a starting baseline plus every transaction tagged to the goal."
        actions={!formOpen && <Button onClick={() => { setShowForm(true); setEditing(null); }}>Add goal</Button>} />

      {formOpen && (
        <Card>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const payload = {
              name: String(fd.get("name") || ""),
              target_amount: Number(fd.get("target_amount") || 0),
              saved_amount: Number(fd.get("saved_amount") || 0),
              target_date: String(fd.get("target_date") || "") || null,
              notes: String(fd.get("notes") || "") || null,
              account_id: String(fd.get("account_id") || "") || null,
            };
            if (editing) mUpdate.mutate({ data: { ...payload, id: editing.id } });
            else mCreate.mutate({ data: payload });
          }}>
            <Field label="Name"><TextInput name="name" defaultValue={initial.name} required /></Field>
            <Field label="Target amount"><TextInput type="number" step="0.01" name="target_amount" defaultValue={String(initial.target_amount ?? 0)} /></Field>
            <Field label="Starting baseline"><TextInput type="number" step="0.01" name="saved_amount" defaultValue={String(initial.saved_amount ?? 0)} /></Field>
            <Field label="Held in account">
              <Select name="account_id" defaultValue={initial.account_id ?? ""}>
                <option value="">— none —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            <Field label="Target date"><TextInput type="date" name="target_date" defaultValue={initial.target_date ?? ""} /></Field>
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

      {goals.length === 0 ? <EmptyState>No goals yet.</EmptyState> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {goals.map((g) => {
            const progress = g.progress_amount;
            const pct = g.target_amount > 0 ? Math.min(100, Math.round((progress / g.target_amount) * 100)) : 0;
            const rows = contributions.filter((c) => c.goal_id === g.id);
            const acct = accounts.find((a) => a.id === g.account_id);
            return (
              <Card key={g.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{g.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {g.target_date && <>by {g.target_date}</>}
                      {acct && <>{g.target_date ? " · " : ""}in {acct.name} ({money(acct.current_balance, acct.currency)})</>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => { setEditing(g); setShowForm(false); }}>Edit</Button>
                    <Button size="sm" variant="danger" onClick={() => confirm(`Delete ${g.name}?`) && mDelete.mutate({ data: { id: g.id } })}>×</Button>
                  </div>
                </div>
                <div className="mt-3 flex items-baseline justify-between text-sm">
                  <span className="tabular-nums">{money(progress)} / {money(g.target_amount)}</span>
                  <span className="text-muted-foreground">{pct}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                  baseline {money(g.saved_amount)} + tagged {money(g.contributed_amount)}
                </div>

                <div className="mt-3 border-t border-border pt-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tagged transactions</div>
                  {rows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nothing tagged yet.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {rows.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                          <div className="min-w-0">
                            <div className="truncate">{c.notes || c.kind}</div>
                            <div className="text-xs text-muted-foreground">{c.on_date}{c.account_name ? ` · ${c.account_name}` : ""}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="tabular-nums">{c.kind === "expense" ? "-" : ""}{money(c.amount, c.currency)}</span>
                            <Button size="sm" variant="ghost" disabled={mTag.isPending}
                              onClick={() => mTag.mutate({ data: { transaction_id: c.id, goal_id: null } })}>Untag</Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <TagPicker
                    transactions={transactions.filter((t) => t.goal_id !== g.id)}
                    accounts={accounts}
                    disabled={mTag.isPending}
                    onTag={(txId) => mTag.mutate({ data: { transaction_id: txId, goal_id: g.id } })}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TagPicker({
  transactions, accounts, disabled, onTag,
}: {
  transactions: { id: string; on_date: string; kind: string; amount: number; currency: string; notes: string | null; account_id: string }[];
  accounts: { id: string; name: string }[];
  disabled: boolean;
  onTag: (id: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="mt-3 flex items-center gap-2">
      <Select value={value} onChange={(e) => setValue(e.target.value)} className="flex-1">
        <option value="">Tag a transaction…</option>
        {transactions.slice(0, 200).map((t) => (
          <option key={t.id} value={t.id}>
            {t.on_date} · {money(t.amount, t.currency)} · {accounts.find((a) => a.id === t.account_id)?.name ?? "—"}
            {t.notes ? ` · ${t.notes}` : ""}
          </option>
        ))}
      </Select>
      <Button size="sm" variant="outline" disabled={!value || disabled}
        onClick={() => { onTag(value); setValue(""); }}>Tag</Button>
    </div>
  );
}
