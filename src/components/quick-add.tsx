import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { X } from "lucide-react";
import { createTransaction, listAccounts, listCategories, listTransactions } from "@/lib/keel.functions";
import { parseQuickEntry, type QuickDraft } from "@/lib/quick-parse";
import { CategoryIcon, money } from "@/components/keel-ui";

type QuickAddApi = { open: (text?: string) => void };
const Ctx = createContext<QuickAddApi>({ open: () => {} });
export const useQuickAdd = () => useContext(Ctx);

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Wraps the app and renders the "Log it" sheet when opened from the nav or Home. */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [openText, setOpenText] = useState<string | null>(null);
  const api = useMemo<QuickAddApi>(() => ({ open: (text = "") => setOpenText(text) }), []);
  return (
    <Ctx.Provider value={api}>
      {children}
      {openText !== null && <QuickAddSheet initialText={openText} onClose={() => setOpenText(null)} />}
    </Ctx.Provider>
  );
}

function QuickAddSheet({ initialText, onClose }: { initialText: string; onClose: () => void }) {
  const qc = useQueryClient();
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => listCategories() });
  const accts = useQuery({ queryKey: ["accounts"], queryFn: () => listAccounts() });
  const txs = useQuery({ queryKey: ["transactions"], queryFn: () => listTransactions() });
  const save = useServerFn(createTransaction);

  const [text, setText] = useState(initialText);
  const [override, setOverride] = useState<Partial<QuickDraft>>({});
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const categories = (cats.data ?? []).filter((c) => !c.archived);
  const accounts = (accts.data ?? []).filter((a) => !a.archived && a.kind !== "credit");
  const history = (txs.data ?? []).slice(0, 200).map((t) => ({ notes: t.notes, category_id: t.category_id, account_id: t.account_id }));

  const parsed = parseQuickEntry(text, new Date(), { categories, accounts, history });
  // Anything the person picked by hand wins over what was parsed.
  const draft: QuickDraft = { ...parsed, ...override };
  const account = accounts.find((a) => a.id === draft.account_id) ?? accounts[0];
  const category = categories.find((c) => c.id === draft.category_id) ?? null;
  const kindCats = categories.filter((c) => c.kind === draft.kind);
  const canSave = !!draft.amount && draft.amount > 0 && !!account && !saving;

  const recent = Array.from(
    new Map(
      (txs.data ?? [])
        .filter((t) => t.kind === "expense" && t.notes)
        .map((t) => [t.notes!.toLowerCase(), `${t.notes} ${t.amount}`] as const),
    ).values(),
  ).slice(0, 4);

  const submit = async () => {
    if (!canSave || !account) return;
    setSaving(true);
    try {
      await save({
        data: {
          on_date: draft.date,
          account_id: account.id,
          category_id: draft.category_id,
          kind: draft.kind,
          amount: draft.amount!,
          currency: account.currency,
          notes: draft.description || null,
        },
      });
      toast.success(`Logged ${money(draft.amount!, account.currency)}${draft.description ? ` for ${draft.description}` : ""}`);
      for (const k of ["transactions", "accounts", "home", "budget", "dashboard", "networth-live", "income_month", "month_instances"]) {
        qc.invalidateQueries({ queryKey: [k] });
      }
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1d2a33]/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-add-title"
        className="w-full max-w-md rounded-t-[28px] bg-background px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-xl sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#d0c8bb] sm:hidden" />
        <div className="mb-3 flex items-center justify-between">
          <h2 id="quick-add-title" className="text-2xl">Log it</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-muted-foreground">Type what you spent, like a text</span>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => { setText(e.target.value); setOverride({}); }}
              placeholder="lunch 12 chipotle yesterday"
              enterKeyHint="done"
              className="h-14 rounded-2xl border-2 border-primary bg-card px-4 text-[17px] outline-none"
            />
          </label>

          <div className="flex flex-col gap-3 rounded-[20px] border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Keel read it as</div>
            <div className="flex items-center gap-3">
              <CategoryIcon icon={category?.icon} color={category?.color ?? "#8a847b"} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{draft.description || (draft.kind === "income" ? "Income" : "Expense")}</div>
                <div className="text-[13px] text-muted-foreground">{category?.name ?? "No category"}{draft.kind === "income" ? " · money in" : ""}</div>
              </div>
              <div className="font-display text-[26px] font-semibold tabular-nums">
                {draft.amount ? money(draft.amount, account?.currency) : "$0.00"}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2 flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
                Category
                <select value={draft.category_id ?? ""} onChange={(e) => setOverride((o) => ({ ...o, category_id: e.target.value || null }))}
                  className="h-10 rounded-xl border border-border bg-background px-2 text-[13px] font-semibold text-foreground">
                  <option value="">None</option>
                  {kindCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
                Date
                <input type="date" value={draft.date} onChange={(e) => setOverride((o) => ({ ...o, date: e.target.value }))}
                  className="h-10 rounded-xl border border-border bg-background px-2 text-[13px] font-semibold text-foreground" />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
                Account
                <select value={account?.id ?? ""} onChange={(e) => setOverride((o) => ({ ...o, account_id: e.target.value }))}
                  className="h-10 rounded-xl border border-border bg-background px-2 text-[13px] font-semibold text-foreground">
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            </div>
            <div className="flex gap-2 text-[13px]">
              <button type="button" onClick={() => setOverride((o) => ({ ...o, kind: "expense", category_id: null }))}
                aria-pressed={draft.kind === "expense"}
                className={`h-9 rounded-full px-3 font-semibold ${draft.kind === "expense" ? "bg-foreground text-background" : "border border-border"}`}>Spent</button>
              <button type="button" onClick={() => setOverride((o) => ({ ...o, kind: "income", category_id: null }))}
                aria-pressed={draft.kind === "income"}
                className={`h-9 rounded-full px-3 font-semibold ${draft.kind === "income" ? "bg-foreground text-background" : "border border-border"}`}>Money in</button>
            </div>
          </div>

          {recent.length > 0 && !text && (
            <div className="flex flex-col gap-2">
              <div className="text-[13px] font-semibold text-muted-foreground">Recent</div>
              <div className="flex flex-wrap gap-2">
                {recent.map((r) => (
                  <button key={r} type="button" onClick={() => setText(r)} className="h-10 rounded-full border border-border bg-card px-3.5 text-sm">{r}</button>
                ))}
              </div>
            </div>
          )}

          <button type="submit" disabled={!canSave}
            className="h-14 rounded-[18px] bg-primary text-base font-bold text-primary-foreground disabled:opacity-40">
            {saving ? "Saving…" : draft.kind === "income" ? "Save money in" : "Save expense"}
          </button>
        </form>
      </div>
    </div>
  );
}
