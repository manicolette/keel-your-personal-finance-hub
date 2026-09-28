import { createFileRoute, useRouter, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { checkUnlocked, unlockSite } from "@/lib/gate.functions";

export const Route = createFileRoute("/unlock")({
  beforeLoad: async () => {
    const { unlocked } = await checkUnlocked();
    if (unlocked) throw redirect({ to: "/home" });
  },
  component: UnlockPage,
});

function UnlockPage() {
  const router = useRouter();
  const unlock = useServerFn(unlockSite);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await unlock({ data: { password } });
      if (res.ok) {
        await router.navigate({ to: "/home" });
      } else {
        toast.error("Incorrect password");
      }
    } catch (err) {
      toast.error((err as Error).message || "Unable to unlock");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#1d2a33] px-8 pb-12 pt-24 text-white">
      <div className="font-display text-[48px] font-semibold text-[#9fd8d3]">keel</div>
      <p className="mt-2 text-[15px] text-[#c9d1d6]">Enter your password to continue</p>
      <form onSubmit={onSubmit} className="mt-10 flex w-full max-w-xs flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="sr-only">Password</span>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Password"
            className="h-14 rounded-2xl border border-[#4a5a66] bg-[#2a3a45] px-4 text-center text-lg tracking-widest text-white outline-none placeholder:tracking-normal placeholder:text-[#8a9aa6] focus:border-[#9fd8d3]"
          />
        </label>
        <button type="submit" disabled={submitting}
          className="h-14 rounded-2xl bg-[#9fd8d3] text-base font-bold text-[#1d2a33] disabled:opacity-60">
          {submitting ? "Unlocking…" : "Unlock"}
        </button>
      </form>
      <div className="flex-1" />
      <p className="text-center text-[13px] text-[#c9d1d6]">Your browser or password manager can fill this in for you.</p>
    </div>
  );
}
