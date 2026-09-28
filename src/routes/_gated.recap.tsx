import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getRecap } from "@/lib/keel.functions";
import { Card, CategoryIcon, EmptyState, money } from "@/components/keel-ui";

const pad = (n: number) => String(n).padStart(2, "0");
const currentMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const shiftMonth = (m: string, delta: number) => {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mm - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};
const monthLong = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
const monthShort = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString("en-US", { month: "short" });
const k = (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`);

const recapQuery = (month: string) => queryOptions({ queryKey: ["recap", month] as const, queryFn: () => getRecap({ data: { month } }) });

export const Route = createFileRoute("/_gated/recap")({
  validateSearch: zodValidator(z.object({ month: fallback(z.string(), "").default("") })),
  loaderDeps: ({ search }) => ({ month: search.month || currentMonth() }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(recapQuery(deps.month)),
  component: RecapPage,
  errorComponent: ({ error }) => <div role="alert" className="text-sm text-destructive">{error.message}</div>,
});

function RecapPage() {
  const { month: m } = Route.useSearch();
  const { data: r } = useSuspenseQuery(recapQuery(m || currentMonth()));
  const month = r.month;
  const maxCat = Math.max(1, ...r.categories.map((c) => Math.max(c.spent, c.limit ?? 0)));
  const maxMonth = Math.max(1, ...r.months.map((x) => x.out));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex items-center gap-2">
        {month > r.start_month ? (
          <Link to="/recap" search={{ month: shiftMonth(month, -1) }} aria-label="Previous month" className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card"><ChevronLeft size={18} /></Link>
        ) : <span className="h-11 w-11" />}
        <h1 className="flex-1 text-center text-[26px]">{monthLong(month)} recap</h1>
        <Link to="/recap" search={{ month: shiftMonth(month, 1) }} aria-label="Next month" className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card"><ChevronRight size={18} /></Link>
      </div>

      <Card className="grid grid-cols-2 gap-3 p-[18px]">
        <div><div className="text-xs text-muted-foreground">Came in</div><div className="font-display text-[26px] font-semibold tabular-nums">{money(r.came_in)}</div></div>
        <div><div className="text-xs text-muted-foreground">Went out</div><div className="font-display text-[26px] font-semibold tabular-nums">{money(r.went_out)}</div></div>
        <div><div className="text-xs text-muted-foreground">To goals and debt</div><div className="text-[17px] font-bold tabular-nums text-[color:var(--positive)]">{money(r.to_goals + r.to_debt)}</div></div>
        <div><div className="text-xs text-muted-foreground">{r.left_over >= 0 ? "Left over" : "Short"}</div><div className={`text-[17px] font-bold tabular-nums ${r.left_over < 0 ? "text-[color:var(--negative)]" : ""}`}>{money(Math.abs(r.left_over))}</div></div>
        <p className="col-span-2 border-t border-muted pt-2.5 text-[13px] text-muted-foreground">
          Each month starts fresh. {r.left_over > 0 ? <>The {money(r.left_over)} stays in your accounts; you can <Link to="/goals" className="font-semibold text-primary">put it toward a goal</Link>.</> : "Nothing carries into next month's limits."}
        </p>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="font-sans text-[17px] font-bold">Everyday spending by category</h2>
        <p className="-mt-1 text-[13px] text-muted-foreground">{money(r.everyday_total)} total · bills not included</p>
        {r.categories.length === 0 ? <EmptyState>No everyday spending logged in {monthLong(month)}.</EmptyState> : (
          <Card className="flex flex-col gap-3.5">
            {r.categories.map((c) => {
              const over = c.limit != null && c.spent > c.limit;
              return (
                <div key={c.id ?? "none"} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-[13px]">
                    <CategoryIcon icon={c.icon} color={c.color} size={24} />
                    <span className="flex-1 truncate font-semibold">{c.name}</span>
                    <span className={`font-bold tabular-nums ${over ? "text-[color:var(--negative)]" : ""}`}>
                      {money(c.spent)} {c.limit != null && <span className="font-medium text-muted-foreground">{over ? "over" : "of"} {money(c.limit)}</span>}
                    </span>
                  </div>
                  <div className="relative h-3 rounded-r bg-muted" role="img" aria-label={`${c.name}: ${money(c.spent)} spent${c.limit != null ? ` of ${money(c.limit)} limit` : ""}`}>
                    <div className="h-3 rounded-r" style={{ width: `${(c.spent / maxCat) * 100}%`, background: over ? "var(--negative)" : "var(--primary)" }} />
                    {c.limit != null && <div className="absolute top-[-2px] h-4 w-0.5 bg-foreground" style={{ left: `calc(${(c.limit / maxCat) * 100}% - 1px)` }} title={`Limit ${money(c.limit)}`} />}
                  </div>
                </div>
              );
            })}
            {r.categories.some((c) => c.limit != null) && <p className="text-[11px] text-muted-foreground">The dark tick marks each category's limit.</p>}
          </Card>
        )}
      </section>

      {r.months.length > 1 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-sans text-[17px] font-bold">Everything that went out, by month</h2>
          <Card className="flex flex-col gap-2">
            <div className="flex h-40 items-end gap-2.5 border-b border-[#d0c8bb]">
              {r.months.map((x) => (
                <div key={x.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${monthLong(x.month)}: ${money(x.out)}`}>
                  <span className={`text-[11px] tabular-nums ${x.month === month ? "font-bold" : "text-muted-foreground"}`}>{k(x.out)}</span>
                  <div className="w-full rounded-t" style={{ height: `${Math.max(2, (x.out / maxMonth) * 120)}px`, background: x.month === month ? "var(--primary)" : "#a9d3cf" }} />
                </div>
              ))}
            </div>
            <div className="flex gap-2.5 text-center text-xs text-muted-foreground">
              {r.months.map((x) => <span key={x.month} className={`flex-1 ${x.month === month ? "font-bold text-foreground" : ""}`}>{monthShort(x.month)}</span>)}
            </div>
          </Card>
        </section>
      )}

      {r.notes.length > 0 && (
        <section className="flex flex-col gap-2 pb-4">
          <h2 className="font-sans text-[17px] font-bold">What stood out</h2>
          <ul className="divide-y divide-muted overflow-hidden rounded-[20px] border border-border bg-card">
            {r.notes.map((n, i) => <li key={i} className="px-3.5 py-3 text-sm leading-relaxed">{n}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
