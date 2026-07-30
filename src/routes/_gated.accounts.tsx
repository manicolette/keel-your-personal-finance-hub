import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  createAccount,
  deleteAccount,
  listAccounts,
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

export const Route = createFileRoute("/_gated/accounts")({
  loader: ({ context }) => context.queryClient.ensureQueryData(accountsQuery),
  component: AccountsPage,
  errorComponent: ({ error }) => <div role="alert" className="text-sm text-destructive">{error.message}</div>,
});

const KINDS = ["bank", "cash", "credit", "investment", "other"] as const;

function AccountsPage() {
  const { data: accounts } = useSuspenseQuery(accountsQuery);
  const qc = useQueryClient();
  const create = useServerFn(createAccount);
  const update = useServerFn(updateAccount);
  const remove = useServerFn(deleteAccount);
  const [editing, setEditing] = useState<Account | null>(null);
  const [showForm, setShowForm] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["accounts"] });

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
          !formOpen && <Button onClick={() => { setShowForm(true); setEditing(null); }}>Add account</Button>
        }
      />

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
              <Td className="text-right tabular-nums font-semibold">{money(a.current_balance, a.currency)}</Td>
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
