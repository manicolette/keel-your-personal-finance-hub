// Server-only session config for the Keel shared-password gate.
export const sessionConfig = {
  password: process.env.SESSION_SECRET ?? "development-only-session-secret-please-change-in-vercel-min-32c",
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
