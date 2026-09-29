import { createFileRoute } from "@tanstack/react-router";
import { db } from "@/lib/db.server";
import { runDailyPush } from "@/lib/keel.functions";

// Same job as /api/push-hour/NN, handy to call by hand. If CRON_SECRET is set, Vercel sends it and it is required.
// Without it the call is harmless: the job only sends during the chosen hour, once a day, and
// the notification carries no content (the phone fetches it with its own session).
export const Route = createFileRoute("/api/push-cron")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401 });
        }
        const result = await runDailyPush(await db());
        return Response.json(result);
      },
    },
  },
});
