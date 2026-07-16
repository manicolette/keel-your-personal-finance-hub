import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getDashboard } from "@/lib/keel.functions";
import { Card, PageHeader, money } from "@/components/keel-ui";

const dashboardQuery = queryOptions({
  queryKey: ["dashboard"],
  queryFn: () => getDashboard(),
});

export const Route = createFileRoute("/_gated/dashboard")({
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQuery),
  component: DashboardPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="text-sm text-destructive">{error.message}</div>
  ),
});

function DashboardPage() {
  const { data } = useSuspenseQuery(dashboardQuery);
  const nw = data.latestNetWorth;

  return (
    <div className="space-y-5">
      <PageHeader title="Dashboard" subtitle="At-a-glance financial snapshot" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Net Worth</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {nw ? money(nw.net_worth) : "—"}
          </div>
          {nw && <div className="mt-1 text-xs text-muted-foreground">as of {nw.on_date}</div>}
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Income (MTD)</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-[color:var(--positive)]">
            {money(data.incomeMTD)}
          </div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Expenses (MTD)</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-[color:var(--negative)]">
            {money(data.expenseMTD)}
          </div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Total Debt</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {money(data.debtsTotal)}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Upcoming subscriptions</h2>
          {data.upcomingSubscriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active subscriptions.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.upcomingSubscriptions.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.next_charge_date}</div>
                  </div>
                  <div className="tabular-nums">{money(s.amount, s.currency)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Upcoming reminders</h2>
          {data.upcomingReminders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing due.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.upcomingReminders.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-muted-foreground">{r.due_date}</div>
                  </div>
                  <div className="tabular-nums">{r.amount != null ? money(r.amount) : "—"}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
