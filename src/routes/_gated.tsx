import { createFileRoute, Link, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Home,
  CalendarDays,
  Plus,
  BarChart3,
  Menu,
  Wallet,
  Tags,
  Repeat,
  Target,
  TrendingUp,
  PieChart,
  Globe,
  Bell,
  ListChecks,
  Settings as SettingsIcon,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { checkUnlocked, lockSite } from "@/lib/gate.functions";
import { QuickAddProvider, useQuickAdd } from "@/components/quick-add";

export const Route = createFileRoute("/_gated")({
  beforeLoad: async () => {
    const { unlocked } = await checkUnlocked();
    if (!unlocked) throw redirect({ to: "/unlock" });
  },
  component: GatedLayout,
});

// Desktop sidebar. On phones the same pages live under More.
const sideNav = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/transactions", label: "Activity", icon: CalendarDays },
  { to: "/budget", label: "Budget", icon: PieChart },
  { to: "/monthly-expenses", label: "Bills", icon: ListChecks },
  { to: "/subscriptions", label: "Subscriptions", icon: Repeat },
  { to: "/income", label: "Income", icon: TrendingUp },
  { to: "/debts", label: "Debts", icon: BarChart3 },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/accounts", label: "Accounts", icon: Wallet },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/networth", label: "Net worth", icon: TrendingUp },
  { to: "/reminders", label: "Reminders", icon: Bell },
  { to: "/fx", label: "Currencies", icon: Globe },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

function GatedLayout() {
  return (
    <QuickAddProvider>
      <Shell />
    </QuickAddProvider>
  );
}

function Shell() {
  const router = useRouter();
  const lock = useServerFn(lockSite);
  const quickAdd = useQuickAdd();

  async function onLock() {
    try {
      await lock();
      await router.navigate({ to: "/unlock" });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-7xl">
        {/* Sidebar (desktop) */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card px-3 py-5 md:flex">
          <div className="mb-4 px-2 font-display text-[28px] font-semibold text-primary">keel</div>
          <button
            onClick={() => quickAdd.open()}
            className="mb-4 flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
          >
            <Plus size={18} strokeWidth={2.4} /> Log spending
          </button>
          <nav className="flex flex-col gap-0.5 overflow-y-auto">
            {sideNav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeProps={{ className: "bg-accent text-accent-foreground font-semibold" }}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-foreground hover:bg-muted"
              >
                <item.icon size={17} />
                {item.label}
              </Link>
            ))}
          </nav>
          <button
            onClick={onLock}
            className="mt-auto flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            <Lock size={16} /> Lock Keel
          </button>
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-28 pt-5 md:px-8 md:py-6">
          <Outlet />
        </main>
      </div>

      {/* Bottom nav (phone) */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <div className="mx-auto grid h-[68px] max-w-md grid-cols-5 items-center">
          <TabLink to="/home" label="Home" icon={Home} />
          <TabLink to="/transactions" label="Activity" icon={CalendarDays} />
          <div className="flex justify-center">
            <button
              onClick={() => quickAdd.open()}
              aria-label="Log spending"
              className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md"
            >
              <Plus size={24} strokeWidth={2.4} />
            </button>
          </div>
          <TabLink to="/debts" label="Debts" icon={BarChart3} />
          <TabLink to="/more" label="More" icon={Menu} />
        </div>
      </nav>
    </div>
  );
}

function TabLink({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Home }) {
  return (
    <Link
      to={to}
      activeProps={{ className: "text-primary" }}
      inactiveProps={{ className: "text-muted-foreground" }}
      className="flex flex-col items-center gap-1 text-[11px] font-semibold"
    >
      <Icon size={22} />
      {label}
    </Link>
  );
}
