import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
  type Category,
} from "@/lib/keel.functions";
import { Button, Card, EmptyState, Field, PageHeader, Select, Table, Td, TextInput, Th } from "@/components/keel-ui";

const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: () => listCategories(),
});

export const Route = createFileRoute("/_gated/categories")({
  loader: ({ context }) => context.queryClient.ensureQueryData(categoriesQuery),
  component: CategoriesPage,
  errorComponent: ({ error }) => <div role="alert" className="text-sm text-destructive">{error.message}</div>,
});

function CategoriesPage() {
  const { data: cats } = useSuspenseQuery(categoriesQuery);
  const qc = useQueryClient();
  const create = useServerFn(createCategory);
  const update = useServerFn(updateCategory);
  const remove = useServerFn(deleteCategory);
  const [editing, setEditing] = useState<Category | null>(null);
  const [showForm, setShowForm] = useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["categories"] });

  const mCreate = useMutation({
    mutationFn: create,
    onSuccess: () => { toast.success("Category created"); invalidate(); setShowForm(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mUpdate = useMutation({
    mutationFn: update,
    onSuccess: () => { toast.success("Saved"); invalidate(); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mDelete = useMutation({
    mutationFn: remove,
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const initial: Partial<Category> = editing ?? { name: "", kind: "expense", color: "#0d9488", archived: false, sort_order: 0 };
  const formOpen = showForm || !!editing;

  return (
    <div className="space-y-5">
      <PageHeader title="Categories" subtitle="Group income and expenses."
        actions={!formOpen && <Button onClick={() => { setShowForm(true); setEditing(null); }}>Add category</Button>} />

      {formOpen && (
        <Card>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const payload = {
              name: String(fd.get("name") || ""),
              kind: String(fd.get("kind") || "expense") as Category["kind"],
              color: String(fd.get("color") || "#0d9488"),
              archived: fd.get("archived") === "on",
              sort_order: Number(fd.get("sort_order") || 0),
            };
            if (editing) mUpdate.mutate({ data: { ...payload, id: editing.id } });
            else mCreate.mutate({ data: payload });
          }}>
            <Field label="Name"><TextInput name="name" defaultValue={initial.name} required /></Field>
            <Field label="Kind">
              <Select name="kind" defaultValue={initial.kind}>
                <option value="expense">expense</option>
                <option value="income">income</option>
              </Select>
            </Field>
            <Field label="Color"><TextInput type="color" name="color" defaultValue={initial.color} /></Field>
            <Field label="Sort order"><TextInput type="number" name="sort_order" defaultValue={String(initial.sort_order ?? 0)} /></Field>
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input type="checkbox" name="archived" defaultChecked={!!initial.archived} /> Archived
            </label>
            <div className="col-span-full flex justify-end gap-2 pt-1">
              <Button variant="ghost" type="button" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</Button>
              <Button type="submit" disabled={mCreate.isPending || mUpdate.isPending}>{editing ? "Save" : "Create"}</Button>
            </div>
          </form>
        </Card>
      )}

      {cats.length === 0 ? <EmptyState>No categories yet.</EmptyState> : (
        <Table head={<><Th></Th><Th>Name</Th><Th>Kind</Th><Th></Th></>}>
          {cats.map((c) => (
            <tr key={c.id} className={c.archived ? "opacity-60" : ""}>
              <Td><span className="inline-block h-4 w-4 rounded-full" style={{ background: c.color }} /></Td>
              <Td className="font-medium">{c.name}</Td>
              <Td className="capitalize">{c.kind}</Td>
              <Td className="text-right">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(c); setShowForm(false); }}>Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => confirm(`Delete ${c.name}?`) && mDelete.mutate({ data: { id: c.id } })}>Delete</Button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
