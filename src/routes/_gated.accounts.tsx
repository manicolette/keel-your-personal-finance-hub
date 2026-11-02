import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  createAccount,
  deleteAccount,
  getResetStatus,
  listAccounts,
  resetAccountsForMonth,
  updateAccount,
  type Account,
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
  TextInput,
  Th,
  money,
} from "@/components/keel-ui";

const accountsQuery = queryOptions({
  queryKey: ["accounts"],
  queryFn: () => listAccounts(),
});
const resetStatusQuery = queryOptions({
  queryKey: ["reset-status"],
  queryFn: () => getResetStatus(),
});

export const Route = createFileRoute("/_gated/accounts")({
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(accountsQuery),
    context.queryClient.ensureQueryData(resetStatusQuery),
  ]),
  component: AccountsPage,
  errorComponent: ({ error }) => <div role="alert" className="text-sm text-destructive">{error.message}</div>,
});

const KINDS = ["bank", "cash", "credit", "investment", "other"] as const;

const monthLabel = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
const monthShort = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });

function AccountsPage() {
  const { data: accounts } = useSuspenseQuery(accountsQuery);
  const { data: resetStatus } = useSuspenseQuery(resetStatusQuery);
  const qc = useQueryClient();
  const create = useServerFn(createAccount);
  const update = useServerFn(updateAccount);
  const remove = useServerFn(deleteAccount);
  const [editing, setEditing] = useState<Account | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["reset-status"] });
    qc.invalidateQueries({ queryKey: ["home"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["networth-live"] });
  };

  const mCreate = useMutation({
    mutationFn: create,
    onSuccess: () => { toast.success("Account created"); invalidate(); setShowForm(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mUpdate = useMutation({
    mutationFn: update,
    onSuccess: () => { toast.success("Account updated"); invalidate(); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mDelete = useMutation({
    mutationFn: remove,
    onSuccess: () => { toast.success("Account deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const resetFn = useServerFn(resetAccountsForMonth);
  const mReset = useMutation({
    mutationFn: resetFn,
    onSuccess: () => { toast.success("Balances reset for the new month"); invalidate(); setShowReset(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const resettable = accounts.filter((a) => !a.archived);

  const initial: Partial<Account> = editing ?? {
    name: "", kind: "bank", currency: "USD", opening_balance: 0, archived: false, sort_order: 0,
  };
  const formOpen = showForm || !!editing;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Accounts"
        subtitle="Bank, credit, cash & investment accounts."
        actions={
          !formOpen && !showReset && (
            <div className="flex gap-2">
              {resettable.length > 0 && (
                <Button variant="outline" onClick={() => { setShowReset(true); setShowForm(false); setEditing(null); }}>Reset balances</Button>
              )}
              <Button onClick={() => { setShowForm(true); setEditing(null); }}>Add account</Button>
            </div>
          )
        }
      />

      {resetStatus.due && !showReset && !formOpen && resettable.length > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">New month: reset your balances</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Enter what each account actually holds so {resetStatus.last_reset_month ? `${monthShort(resetStatus.last_reset_month)}'s` : "last month's"} total doesn't carry over, even if some spending went unlogged.
              </p>
            </div>
            <Button onClick={() => { setShowReset(true); setShowForm(false); setEditing(null); }}>Review balances</Button>
          </div>
        </Card>
      )}

      {showReset && (
        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const balances = resettable.map((a) => ({
                account_id: a.id,
                balance: Number(fd.get(`bal_${a.id}`) || 0),
              }));
              mReset.mutate({ data: { month: resetStatus.month, balances } });
            }}
          >
            <div className="mb-3">
              <div className="text-sm font-semibold">Reset balances for {monthLabel(resetStatus.month)}</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Check each account and type its real balance now. From here on, only transactions dated after {monthLabel(resetStatus.month)} starts count toward the balance. Your past transactions are kept as history.
              </p>
            </div>
            <div className="space-y-2">
              {resettable.map((a) => (
                <div key={a.id} className="grid grid-cols-[1fr_auto] items-center gap-3">
                  <div>
                    <div className="text-sm font-medium">{a.name}</div>
                    <div className="text-xs text-muted-foreground">
                      App shows {money(a.current_balance, a.currency)}
                      {a.anchor_date ? ` · reset ${monthShort(a.anchor_date.slice(0, 7))}` : ""}
                    </div>
                  </div>
                  <TextInput
                    type="number"
                    step="0.01"
                    name={`bal_${a.id}`}
                    defaultValue={String(a.current_balance)}
                    className="w-36 text-right tabular-nums"
                    aria-label={`${a.name} actual balance`}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <Button variant="ghost" type="button" onClick={() => setShowReset(false)}>Cancel</Button>
              <Button type="submit" disabled={mReset.isPending}>Save balances</Button>
            </div>
          </form>
        </Card>
      )}

      {formOpen && (
        <Card>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const payload = {
                name: String(fd.get("name") || ""),
                kind: String(fd.get("kind") || "bank") as Account["kind"],
                currency: String(fd.get("currency") || "USD"),
                opening_balance: Number(fd.get("opening_balance") || 0),
                archived: fd.get("archived") === "on",
                sort_order: Number(fd.get("sort_order") || 0),
              };
              if (editing) mUpdate.mutate({ data: { ...payload, id: editing.id } });
              else mCreate.mutate({ data: payload });
            }}
          >
            <Field label="Name"><TextInput name="name" defaultValue={initial.name} required /></Field>
            <Field label="Kind">
              <Select name="kind" defaultValue={initial.kind}>
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
            </Field>
            <Field label="Currency"><TextInput name="currency" defaultValue={initial.currency} /></Field>
            <Field label="Opening balance"><TextInput type="number" step="0.01" name="opening_balance" defaultValue={String(initial.opening_balance ?? 0)} /></Field>
            <Field label="Sort order"><TextInput type="number" name="sort_order" defaultValue={String(initial.sort_order ?? 0)} /></Field>
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input type="checkbox" name="archived" defaultChecked={!!initial.archived} /> Archived
            </label>
            <div className="col-span-full flex justify-end gap-2 pt-1">
              <Button variant="ghost" type="button" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Button>
              <Button type="submit" disabled={mCreate.isPending || mUpdate.isPending}>
                {editing ? "Save" : "Create"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {accounts.length === 0 ? (
        <EmptyState>No accounts yet — add your first one above.</EmptyState>
      ) : (
        <Table head={<>
          <Th>Name</Th><Th>Kind</Th><Th>Currency</Th>
          <Th className="text-right">Opening</Th><Th className="text-right">Current</Th><Th></Th>
        </>}>
          {accounts.map((a) => (
            <tr key={a.id} className={a.archived ? "opacity-60" : ""}>
              <Td className="font-medium">{a.name}</Td>
              <Td className="capitalize">{a.kind}</Td>
              <Td>{a.currency}</Td>
              <Td className="text-right tabular-nums text-muted-foreground">{money(a.opening_balance, a.currency)}</Td>
              <Td className="text-right tabular-nums font-semibold">
                {money(a.current_balance, a.currency)}
                {a.anchor_date && <div className="text-[10px] font-normal text-muted-foreground">since {monthShort(a.anchor_date.slice(0, 7))}</div>}
              </Td>
              <Td className="text-right">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(a); setShowForm(false); }}>Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => {
                    if (confirm(`Delete ${a.name}? This also deletes its transactions.`)) mDelete.mutate({ data: { id: a.id } });
                  }}>Delete</Button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
