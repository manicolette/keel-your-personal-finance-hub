import { createFileRoute, useRouter } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useState } from "react";
import { PushSettingsCard } from "@/components/push-settings";
import { getSettings, updateSettings, type Settings } from "@/lib/keel.functions";
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
            start_month: String(fd.get("start_month") || settings.start_month),
          }});
        }}>
          <Field label="Base currency"><TextInput name="base_currency" defaultValue={settings.base_currency} /></Field>
          <Field label="Week starts on">
            <Select name="week_start" defaultValue={settings.week_start}>
              <option value="monday">Monday</option>
              <option value="sunday">Sunday</option>
            </Select>
          </Field>
          <Field label="Start month" hint="Keel tracks from this month on. Earlier months are hidden.">
            <TextInput type="month" name="start_month" defaultValue={settings.start_month} />
          </Field>
          <div className="col-span-full flex justify-end">
            <Button type="submit" disabled={mUpdate.isPending}>Save</Button>
          </div>
        </form>
      </Card>

      <RemindersCard settings={settings} onSave={(patch) => mUpdate.mutate({ data: { id: settings.id, base_currency: settings.base_currency, week_start: settings.week_start as "sunday" | "monday", ...patch } })} busy={mUpdate.isPending} />

      <PushSettingsCard />

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

type ReminderPatch = { remind_log: boolean; remind_time: string; remind_bills: boolean; remind_income: boolean };

function RemindersCard({ settings, onSave, busy }: { settings: Settings; onSave: (p: ReminderPatch) => void; busy: boolean }) {
  const [v, setV] = useState<ReminderPatch>({
    remind_log: settings.remind_log, remind_time: settings.remind_time, remind_bills: settings.remind_bills, remind_income: settings.remind_income,
  });
  const Toggle = ({ k, title, sub }: { k: "remind_log" | "remind_bills" | "remind_income"; title: string; sub: string }) => (
    <div className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </div>
      <button type="button" role="switch" aria-checked={v[k]} aria-label={title} onClick={() => setV((x) => ({ ...x, [k]: !x[k] }))}
        className={`flex h-8 w-[52px] shrink-0 rounded-full p-[3px] transition-colors ${v[k] ? "justify-end bg-primary" : "justify-start bg-[#d0c8bb]"}`}>
        <span className="h-[26px] w-[26px] rounded-full bg-white shadow-sm" />
      </button>
    </div>
  );
  return (
    <Card>
      <h2 className="text-lg">Reminders</h2>
      <p className="mb-1 text-xs text-muted-foreground">Shown at the top of Home when they apply, and sent to your phone if notifications are on below.</p>
      <div className="divide-y divide-muted">
        <Toggle k="remind_log" title="Daily logging reminder" sub="If nothing was logged today" />
        <Toggle k="remind_bills" title="Bills due soon" sub="The day before and the day a bill is due" />
        <Toggle k="remind_income" title="Income expected" sub="On payday, to confirm it arrived" />
        <label className="flex items-center gap-3 py-3">
          <span className="flex-1">
            <span className="block text-[15px] font-semibold">Reminder time</span>
            <span className="block text-xs text-muted-foreground">Your phone gets the day's reminder within this hour. Home shows the logging reminder from this time.</span>
          </span>
          <input type="time" value={v.remind_time} onChange={(e) => setV((x) => ({ ...x, remind_time: e.target.value || "20:30" }))}
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm font-semibold" />
        </label>
      </div>
      <div className="flex justify-end pt-2"><Button onClick={() => onSave(v)} disabled={busy}>Save reminders</Button></div>
    </Card>
  );
}
