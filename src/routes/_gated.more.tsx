import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bell, ChevronRight, Globe, Landmark, ListChecks, Lock, PieChart, Repeat, Settings as SettingsIcon, Tags, Target, TrendingUp,
  ArrowLeftRight, LineChart,
} from "lucide-react";
import { getLiveNetWorth } from "@/lib/keel.functions";
import { lockSite } from "@/lib/gate.functions";
import { money } from "@/components/keel-ui";

const nwQuery = queryOptions({ queryKey: ["networth-live"], queryFn: () => getLiveNetWorth() });

export const Route = createFileRoute("/_gated/more")({ component: MorePage });

type Row = { to: string; label: string; sub: string; icon: typeof Bell; tint: string; fg: string };
const money_: Row[] = [
  { to: "/budget", label: "Plan the month", sub: "Bills, limits and one-offs for each month", icon: PieChart, tint: "#d9f0ee", fg: "#1f6f6b" },
  { to: "/income", label: "Income", sub: "Expected vs received each month", icon: TrendingUp, tint: "#dcefe3", fg: "#2d6a45" },
  { to: "/transactions", label: "Transactions and transfers", sub: "Everything logged, and moving money", icon: ArrowLeftRight, tint: "#e3e8ee", fg: "#34495e" },
  { to: "/goals", label: "Goals", sub: "Linked to real accounts", icon: Target, tint: "#d9f0ee", fg: "#1f6f6b" },
  { to: "/reminders", label: "Reminders", sub: "One-off things to pay or do", icon: Bell, tint: "#e6e1f7", fg: "#4e3f99" },
  { to: "/networth", label: "Net worth history", sub: "Snapshots over time", icon: LineChart, tint: "#fff0c9", fg: "#8a6412" },
];
const setup: Row[] = [
  { to: "/accounts", label: "Accounts", sub: "Banks, cash, and opening balances", icon: Landmark, tint: "#e3e8ee", fg: "#34495e" },
  { to: "/monthly-expenses", label: "Bills", sub: "Amounts, due days, paying account", icon: ListChecks, tint: "#fbe1d5", fg: "#a2412a" },
  { to: "/subscriptions", label: "Subscriptions", sub: "Recurring charges, listed by name", icon: Repeat, tint: "#e6e1f7", fg: "#4e3f99" },
  { to: "/categories", label: "Categories", sub: "Icons, colors and spending limits", icon: Tags, tint: "#f4ddf0", fg: "#8a3479" },
  { to: "/fx", label: "Currencies", sub: "Exchange rates", icon: Globe, tint: "#fff0c9", fg: "#8a6412" },
  { to: "/settings", label: "Settings", sub: "Start month, currency", icon: SettingsIcon, tint: "#ede7dd", fg: "#5e5a54" },
];

function MorePage() {
  const nw = useQuery(nwQuery);
  const router = useRouter();
  const lock = useServerFn(lockSite);
  const onLock = async () => {
    try { await lock(); await router.navigate({ to: "/unlock" }); } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <h1 className="text-[28px]">More</h1>

      <section className="flex flex-col gap-2.5 rounded-[22px] bg-foreground p-[18px] text-background">
        <div className="flex items-baseline justify-between text-[13px] text-[#c9d1d6]">
          <span className="font-semibold">Net worth</span>
          <span className="text-xs">bank accounts minus debts{nw.data ? `, in ${nw.data.base_currency}` : ""}</span>
        </div>
        <div className="font-display text-[34px] font-semibold tabular-nums">{nw.data ? money(nw.data.net_worth, nw.data.base_currency) : "…"}</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-[#2a3a45] p-2.5"><div className="text-xs text-[#c9d1d6]">Assets</div><div className="font-bold tabular-nums">{nw.data ? money(nw.data.assets_total) : "…"}</div></div>
          <div className="rounded-xl bg-[#2a3a45] p-2.5"><div className="text-xs text-[#c9d1d6]">Debts</div><div className="font-bold tabular-nums">{nw.data ? money(nw.data.debts_total) : "…"}</div></div>
        </div>
      </section>

      <Group title="Money" rows={money_} />
      <Group title="Set up" rows={setup} />

      <button onClick={onLock} className="flex h-[52px] items-center justify-center gap-2 rounded-2xl border border-border bg-card text-[15px] font-bold text-[color:var(--negative)]">
        <Lock size={18} /> Lock Keel
      </button>
    </div>
  );
}

function Group({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-sans text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="overflow-hidden rounded-[20px] border border-border bg-card">
        {rows.map((r) => (
          <Link key={r.to} to={r.to} className="flex h-14 items-center gap-3 border-b border-muted px-3.5 last:border-0 hover:bg-muted/50">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px]" style={{ background: r.tint, color: r.fg }}>
              <r.icon size={18} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-semibold">{r.label}</span>
              <span className="truncate text-xs text-muted-foreground">{r.sub}</span>
            </span>
            <ChevronRight size={16} className="text-[#8a847b]" />
          </Link>
        ))}
      </div>
    </section>
  );
}
