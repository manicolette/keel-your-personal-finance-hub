import { createFileRoute, useRouter } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getSettings, updateSettings } from "@/lib/keel.functions";
import { lockSite } from "@/lib/gate.functions";
import { Button, Card, Field, PageHeader, Select, TextInput } from "@/components/keel-ui";

const settingsQuery = queryOptions({ queryKey: ["settings"], queryFn: () => getSettings() });

export const Route = createFileRoute("/_gated/settings")({
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsQuery),
  component: SettingsPage,
  errorComponent: ({ error }) => <div role="alert" className="text-sm text-destructive">{error.message}</div>,
});

function SettingsPage() {
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const qc = useQueryClient();
  const router = useRouter();
  const update = useServerFn(updateSettings);
  const lock = useServerFn(lockSite);

  const mUpdate = useMutation({ mutationFn: update,
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e: Error) => toast.error(e.message) });

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" />

      <Card>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          mUpdate.mutate({ data: {
            id: settings.id,
            base_currency: String(fd.get("base_currency") || "USD"),
            week_start: String(fd.get("week_start") || "monday") as "sunday" | "monday",
          }});
        }}>
          <Field label="Base currency"><TextInput name="base_currency" defaultValue={settings.base_currency} /></Field>
          <Field label="Week starts on">
            <Select name="week_start" defaultValue={settings.week_start}>
              <option value="monday">Monday</option>
              <option value="sunday">Sunday</option>
            </Select>
          </Field>
          <div className="col-span-full flex justify-end">
            <Button type="submit" disabled={mUpdate.isPending}>Save</Button>
          </div>
        </form>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Session</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Lock the app and require the password again on next visit.
        </p>
        <Button variant="outline" onClick={async () => {
          try { await lock(); await router.navigate({ to: "/unlock" }); }
          catch (e) { toast.error((e as Error).message); }
        }}>Lock now</Button>
      </Card>
    </div>
  );
}
