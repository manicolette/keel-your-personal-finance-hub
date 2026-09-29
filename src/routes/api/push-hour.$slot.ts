import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/lib/db.server";
import { runDailyPush } from "@/lib/keel.functions";

// Vercel Cron calls /api/push-hour/00 through /api/push-hour/23, one per hour (see vercel.json).
// The job itself decides whether this is the reminder hour. Vercel sends "Authorization: Bearer <CRON_SECRET>".
export const Route = createFileRoute("/api/push-hour/$slot")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401 });
        }
        return Response.json(await runDailyPush(await db()));
      },
    },
  },
});
