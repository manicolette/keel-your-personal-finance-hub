import { useSession } from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";

// Server-only session config for the Keel shared-password gate.
export const sessionConfig = {
  password:
    process.env.SESSION_SECRET ??
    "development-only-session-secret-please-change-in-vercel-min-32c",
  name: "keel-session",
  maxAge: 60 * 60 * 24 * 30, // 30 days
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
  },
};

export type GateSession = { unlocked?: boolean };

export function passwordMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function getGateSession() {
  return useSession<GateSession>(sessionConfig);
}

export async function isUnlocked(): Promise<boolean> {
  const s = await getGateSession();
  return !!s.data.unlocked;
}

/**
 * Server-only gate. Throws a redirect to /unlock when the session isn't unlocked.
 * Call at the top of every data server fn so protected data can never leak.
 */
export async function requireUnlocked() {
  if (!(await isUnlocked())) {
    throw redirect({ to: "/unlock" });
  }
}
