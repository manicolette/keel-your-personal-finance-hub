import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { deleteFxRate, listFxRates, upsertFxRate } from "@/lib/keel.functions";
import { Button, Card, EmptyState, Field, PageHeader, Table, Td, TextInput, Th } from "@/components/keel-ui";

const fxQuery = queryOptions({ queryKey: ["fx"], queryFn: () => listFxRates() });
const today = () => new Date().toISOString().slice(0, 10);

export const Route = createFileRoute("/_gated/fx")({
  loader: ({ context }) => context.queryClient.ensureQueryData(fxQuery),
  component: FxPage,
  errorComponent: ({ error }) => <div role="alert" className="text-sm text-destructive">{error.message}</div>,
});

function FxPage() {
  const { data: rates } = useSuspenseQuery(fxQuery);
  const qc = useQueryClient();
  const upsert = useServerFn(upsertFxRate);
  const remove = useServerFn(deleteFxRate);
  const [showForm, setShowForm] = useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["fx"] });

  const mUpsert = useMutation({ mutationFn: upsert,
    onSuccess: () => { toast.success("Saved"); invalidate(); setShowForm(false); },
    onError: (e: Error) => toast.error(e.message) });
  const mDelete = useMutation({ mutationFn: remove,
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message) });

  return (
    <div className="space-y-5">
      <PageHeader title="FX Rates" subtitle="Manual currency conversion snapshots."
        actions={!showForm && <Button onClick={() => setShowForm(true)}>Add rate</Button>} />

      {showForm && (
        <Card>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            mUpsert.mutate({ data: {
              base: String(fd.get("base") || "").toUpperCase(),
              quote: String(fd.get("quote") || "").toUpperCase(),
              rate: Number(fd.get("rate") || 0),
              as_of: String(fd.get("as_of") || today()),
            }});
          }}>
            <Field label="Base"><TextInput name="base" placeholder="USD" required /></Field>
            <Field label="Quote"><TextInput name="quote" placeholder="EUR" required /></Field>
            <Field label="Rate"><TextInput type="number" step="0.00000001" name="rate" required /></Field>
            <Field label="As of"><TextInput type="date" name="as_of" defaultValue={today()} required /></Field>
            <div className="col-span-full flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={mUpsert.isPending}>Save</Button>
            </div>
          </form>
        </Card>
      )}

      {rates.length === 0 ? <EmptyState>No FX rates saved.</EmptyState> : (
        <Table head={<><Th>Pair</Th><Th className="text-right">Rate</Th><Th>As of</Th><Th></Th></>}>
          {rates.map((r) => (
            <tr key={r.id}>
              <Td className="font-medium">{r.base} → {r.quote}</Td>
              <Td className="text-right tabular-nums">{r.rate}</Td>
              <Td>{r.as_of}</Td>
              <Td className="text-right">
                <Button size="sm" variant="danger" onClick={() => confirm("Delete?") && mDelete.mutate({ data: { id: r.id } })}>Delete</Button>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
