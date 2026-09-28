import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/lib/db.server";
import { runDailyPush } from "@/lib/keel.functions";

// Run once a day by Vercel Cron (see vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
export const Route = createFileRoute("/api/push-cron")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401 });
        }
        const result = await runDailyPush(await db());
        return Response.json(result);
      },
    },
  },
});
