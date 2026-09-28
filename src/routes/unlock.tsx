import { createFileRoute, useRouter, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { checkUnlocked, unlockSite } from "@/lib/gate.functions";
import { Button, Card, Field, TextInput } from "@/components/keel-ui";

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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground text-lg font-semibold">
            K
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Keel</h1>
          <p className="mt-1 text-sm text-muted-foreground">Enter your password to continue.</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Password">
            <TextInput
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Unlocking…" : "Unlock"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
