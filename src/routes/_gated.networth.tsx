import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { createNetWorth, deleteNetWorth, listNetWorth } from "@/lib/keel.functions";
import { Button, Card, EmptyState, Field, PageHeader, Table, Td, TextInput, Textarea, Th, money } from "@/components/keel-ui";

const nwQuery = queryOptions({ queryKey: ["networth"], queryFn: () => listNetWorth() });
const today = () => new Date().toISOString().slice(0, 10);

export const Route = createFileRoute("/_gated/networth")({
  loader: ({ context }) => context.queryClient.ensureQueryData(nwQuery),
  component: NetWorthPage,
  errorComponent: ({ error }) => <div role="alert" className="text-sm text-destructive">{error.message}</div>,
});

function NetWorthPage() {
  const { data: snaps } = useSuspenseQuery(nwQuery);
  const qc = useQueryClient();
  const create = useServerFn(createNetWorth);
  const remove = useServerFn(deleteNetWorth);
  const [showForm, setShowForm] = useState(false);
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["networth"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };

  const mCreate = useMutation({ mutationFn: create,
    onSuccess: () => { toast.success("Snapshot saved"); invalidate(); setShowForm(false); },
    onError: (e: Error) => toast.error(e.message) });
  const mDelete = useMutation({ mutationFn: remove,
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message) });

  return (
    <div className="space-y-5">
      <PageHeader title="Net Worth" subtitle="Point-in-time snapshots."
        actions={!showForm && <Button onClick={() => setShowForm(true)}>Add snapshot</Button>} />

      {showForm && (
        <Card>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            mCreate.mutate({ data: {
              on_date: String(fd.get("on_date") || today()),
              assets_total: Number(fd.get("assets_total") || 0),
              debts_total: Number(fd.get("debts_total") || 0),
              notes: String(fd.get("notes") || "") || null,
            }});
          }}>
            <Field label="Date"><TextInput type="date" name="on_date" defaultValue={today()} required /></Field>
            <Field label="Assets total"><TextInput type="number" step="0.01" name="assets_total" defaultValue="0" /></Field>
            <Field label="Debts total"><TextInput type="number" step="0.01" name="debts_total" defaultValue="0" /></Field>
            <div className="sm:col-span-2 lg:col-span-4">
              <Field label="Notes"><Textarea name="notes" /></Field>
            </div>
            <div className="col-span-full flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={mCreate.isPending}>Save</Button>
            </div>
          </form>
        </Card>
      )}

      {snaps.length === 0 ? <EmptyState>No snapshots yet.</EmptyState> : (
        <Table head={<>
          <Th>Date</Th><Th className="text-right">Assets</Th>
          <Th className="text-right">Debts</Th><Th className="text-right">Net Worth</Th><Th></Th>
        </>}>
          {snaps.map((s) => (
            <tr key={s.id}>
              <Td>{s.on_date}</Td>
              <Td className="text-right tabular-nums">{money(s.assets_total)}</Td>
              <Td className="text-right tabular-nums">{money(s.debts_total)}</Td>
              <Td className="text-right tabular-nums font-medium">{money(s.net_worth)}</Td>
              <Td className="text-right">
                <Button size="sm" variant="danger" onClick={() => confirm("Delete snapshot?") && mDelete.mutate({ data: { id: s.id } })}>Delete</Button>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
