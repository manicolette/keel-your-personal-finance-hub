import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { askKeel, type AskAnswer } from "@/lib/keel.functions";
import { money } from "@/components/keel-ui";

export const Route = createFileRoute("/_gated/ask")({ component: AskPage });

const pad = (n: number) => String(n).padStart(2, "0");
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const SUGGESTIONS = ["How much is safe to spend?", "What's due this week?", "How much did I spend on groceries this month?", "Compare to last month", "When will I be debt free?"];

type Msg = { role: "you"; text: string } | { role: "keel"; answer: AskAnswer };

function AskPage() {
  const ask = useServerFn(askKeel);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setText("");
    setMsgs((m) => [...m, { role: "you", text: question }]);
    setBusy(true);
    try {
      const answer = await ask({ data: { question, today: localToday() } });
      setMsgs((m) => [...m, { role: "keel", answer }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "keel", answer: { text: `Something went wrong: ${(e as Error).message}` } }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-[28px]">Ask Keel</h1>
        <p className="text-[13px] text-muted-foreground">Answers come from your own numbers in Keel.</p>
      </div>

      <div className="flex flex-1 flex-col gap-3" aria-live="polite">
        {msgs.length === 0 && (
          <div className="rounded-[20px] border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
            Ask about your spending, bills, income or debt. Try one of the questions below.
          </div>
        )}
        {msgs.map((m, i) => m.role === "you" ? (
          <div key={i} className="max-w-[85%] self-end rounded-[18px] rounded-br-md bg-foreground px-3.5 py-2.5 text-[15px] text-background">{m.text}</div>
        ) : (
          <div key={i} className="flex max-w-[92%] flex-col gap-2.5 self-start rounded-[18px] rounded-bl-md border border-border bg-card px-3.5 py-3">
            <p className="text-[15px] leading-relaxed">{m.answer.text}</p>
            {m.answer.rows && m.answer.rows.length > 0 && (
              <ul className="divide-y divide-muted rounded-xl bg-background">
                {m.answer.rows.map((r, j) => (
                  <li key={j} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                    <span className="flex min-w-0 flex-1 flex-col"><span className="truncate font-semibold">{r.label}</span>{r.sub && <span className="text-xs text-muted-foreground">{r.sub}</span>}</span>
                    {r.amount != null && <span className="font-bold tabular-nums">{money(r.amount)}</span>}
                  </li>
                ))}
              </ul>
            )}
            {m.answer.link && (
              <Link to={m.answer.link.to} search={m.answer.link.search as never} className="text-[13px] font-bold text-primary">{m.answer.link.label}</Link>
            )}
          </div>
        ))}
        {busy && <div className="self-start rounded-[18px] border border-border bg-card px-3.5 py-2.5 text-sm text-muted-foreground">Looking…</div>}
        <div ref={endRef} className="scroll-mb-40" />
      </div>

      <div className="sticky bottom-24 flex flex-col gap-2 bg-background pt-2 md:bottom-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {SUGGESTIONS.map((sug) => (
            <button key={sug} type="button" onClick={() => send(sug)} className="h-9 shrink-0 rounded-full border border-border bg-card px-3 text-[13px] font-semibold">{sug}</button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Ask a question</span>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about your money…" enterKeyHint="send"
              className="h-[52px] w-full rounded-full border border-border bg-card px-5 text-base outline-none focus:border-primary" />
          </label>
          <button type="submit" aria-label="Send" disabled={busy || !text.trim()}
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
            <ArrowRight size={20} />
          </button>
        </form>
      </div>
    </div>
  );
}
