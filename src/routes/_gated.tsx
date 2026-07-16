import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutDashboard,
  Wallet,
  Tags,
  ArrowLeftRight,
  Repeat,
  PinIcon,
  CreditCard,
  Target,
  TrendingUp,
  PieChart,
  Globe,
  Bell,
  Settings as SettingsIcon,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { checkUnlocked, lockSite } from "@/lib/gate.functions";

export const Route = createFileRoute("/_gated")({
  beforeLoad: async () => {
    const { unlocked } = await checkUnlocked();
    if (!unlocked) throw redirect({ to: "/unlock" });
  },
  component: GatedLayout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/accounts", label: "Accounts", icon: Wallet },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/budget", label: "Budget", icon: PieChart },
  { to: "/subscriptions", label: "Subscriptions", icon: Repeat },
  { to: "/constants", label: "Constants", icon: PinIcon },
  { to: "/debts", label: "Debts", icon: CreditCard },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/networth", label: "Net Worth", icon: TrendingUp },
  { to: "/fx", label: "FX Rates", icon: Globe },
  { to: "/reminders", label: "Reminders", icon: Bell },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

const bottomNav = nav.slice(0, 5);

function GatedLayout() {
  const router = useRouter();
  const lock = useServerFn(lockSite);

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
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 border-r border-border bg-card px-3 py-5 md:block">
          <div className="mb-5 flex items-center gap-2 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
              K
            </div>
            <span className="text-lg font-semibold tracking-tight">Keel</span>
          </div>
          <nav className="flex flex-col gap-0.5">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeProps={{ className: "bg-accent text-accent-foreground font-medium" }}
                className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-foreground hover:bg-muted"
              >
                <item.icon size={16} />
                {item.label}
              </Link>
            ))}
          </nav>
          <button
            onClick={onLock}
            className="mt-6 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            <Lock size={16} /> Lock
          </button>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1 px-4 pb-24 pt-4 md:px-8 md:py-6">
          {/* Mobile header */}
          <div className="mb-4 flex items-center justify-between md:hidden">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
                K
              </div>
              <span className="text-lg font-semibold tracking-tight">Keel</span>
            </div>
            <button
              onClick={onLock}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted"
              aria-label="Lock"
            >
              <Lock size={18} />
            </button>
          </div>
          <Outlet />
        </main>
      </div>

      {/* Bottom nav (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {bottomNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeProps={{ className: "text-primary" }}
              className="flex flex-col items-center gap-0.5 px-2 py-2 text-[11px] text-muted-foreground"
            >
              <item.icon size={20} />
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
