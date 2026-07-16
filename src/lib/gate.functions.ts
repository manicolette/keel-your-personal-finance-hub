import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getGateSession, isUnlocked, passwordMatches } from "./session.server";

export const checkUnlocked = createServerFn({ method: "GET" }).handler(async () => {
  return { unlocked: await isUnlocked() };
});

export const unlockSite = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ password: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data }) => {
    const expected = process.env.SITE_PASSWORD;
    if (!expected) {
      throw new Error(
        "SITE_PASSWORD is not set on the server. Add it in Vercel env vars.",
      );
    }
    if (!passwordMatches(data.password, expected)) {
      return { ok: false as const };
    }
    const session = await getGateSession();
    await session.update({ unlocked: true });
    return { ok: true as const };
  });

export const lockSite = createServerFn({ method: "POST" }).handler(async () => {
  const session = await getGateSession();
  await session.clear();
  return { ok: true as const };
});
