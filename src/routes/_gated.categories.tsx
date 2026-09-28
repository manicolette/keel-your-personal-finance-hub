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
import { Button, CATEGORY_ICONS, Card, CategoryIcon, EmptyState, Field, PageHeader, Select, Table, Td, TextInput, Th, money } from "@/components/keel-ui";

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

  const initial: Partial<Category> = editing ?? { name: "", kind: "expense", color: "#0d9488", archived: false, sort_order: 0, monthly_limit: null, icon: null };
  const formOpen = showForm || !!editing;
  const [formKind, setFormKind] = useState<Category["kind"]>(initial.kind ?? "expense");
  const [formIcon, setFormIcon] = useState<string | null>(initial.icon ?? null);
  const [formColor, setFormColor] = useState<string>(initial.color ?? "#0d9488");
  const openForm = (c: Category | null) => {
    setEditing(c);
    setShowForm(!c);
    setFormKind(c?.kind ?? "expense");
    setFormIcon(c?.icon ?? null);
    setFormColor(c?.color ?? "#0d9488");
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Categories" subtitle="Group income and expenses."
        actions={!formOpen && <Button onClick={() => openForm(null)}>Add category</Button>} />

      {formOpen && (
        <Card>
          <form key={editing?.id ?? "new"} className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const payload = {
              name: String(fd.get("name") || ""),
              kind: String(fd.get("kind") || "expense") as Category["kind"],
              color: String(fd.get("color") || "#0d9488"),
              archived: fd.get("archived") === "on",
              sort_order: Number(fd.get("sort_order") || 0),
              monthly_limit: formKind === "expense" && String(fd.get("monthly_limit") ?? "").trim() !== ""
                ? Number(fd.get("monthly_limit"))
                : null,
              icon: formIcon,
            };
            if (editing) mUpdate.mutate({ data: { ...payload, id: editing.id } });
            else mCreate.mutate({ data: payload });
          }}>
            <Field label="Name"><TextInput name="name" defaultValue={initial.name} required /></Field>
            <Field label="Kind">
              <Select name="kind" value={formKind} onChange={(e) => setFormKind(e.target.value as Category["kind"])}>
                <option value="expense">expense</option>
                <option value="income">income</option>
              </Select>
            </Field>
            <Field label="Color"><TextInput type="color" name="color" value={formColor} onChange={(e) => setFormColor(e.target.value)} /></Field>
            {formKind === "expense" && (
              <Field label="Monthly spending limit (optional)" hint="For everyday spending like groceries or gas. Each month starts fresh from this amount. Leave blank for bill-only categories.">
                <TextInput type="number" step="0.01" min="0" name="monthly_limit" placeholder="No limit"
                  defaultValue={initial.monthly_limit == null ? "" : String(initial.monthly_limit)} />
              </Field>
            )}
            <fieldset className="col-span-full">
              <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Icon</legend>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setFormIcon(null)} aria-pressed={formIcon === null}
                  className={`flex h-11 items-center rounded-lg border px-3 text-xs ${formIcon === null ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
                  None
                </button>
                {Object.keys(CATEGORY_ICONS).map((name) => (
                  <button key={name} type="button" onClick={() => setFormIcon(name)} aria-pressed={formIcon === name} aria-label={name.replace(/-/g, " ")}
                    className={`flex h-11 w-11 items-center justify-center rounded-lg border ${formIcon === name ? "border-primary ring-2 ring-primary/30" : "border-border"}`}>
                    <CategoryIcon icon={name} color={formColor} size={30} />
                  </button>
                ))}
              </div>
            </fieldset>
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
        <Table head={<><Th></Th><Th>Name</Th><Th>Kind</Th><Th className="text-right">Monthly limit</Th><Th></Th></>}>
          {cats.map((c) => (
            <tr key={c.id} className={c.archived ? "opacity-60" : ""}>
              <Td><CategoryIcon icon={c.icon} color={c.color} size={28} /></Td>
              <Td className="font-medium">{c.name}</Td>
              <Td className="capitalize">{c.kind}</Td>
              <Td className="text-right tabular-nums">{c.monthly_limit == null ? <span className="text-muted-foreground">None</span> : money(c.monthly_limit)}</Td>
              <Td className="text-right">
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" onClick={() => openForm(c)}>Edit</Button>
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
