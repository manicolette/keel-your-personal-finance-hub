import { createFileRoute } from "@tanstack/react-router";
import { isUnlocked } from "@/lib/session.server";
import { db } from "@/lib/db.server";
import { pushDigest } from "@/lib/keel.functions";

// Called by the service worker when a push arrives, to get the text to show.
// If the phone's Keel session has expired, it still gets a generic reminder (no data).
export const Route = createFileRoute("/api/push-digest")({
  server: {
    handlers: {
      GET: async () => {
        const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
        try {
          if (!(await isUnlocked())) {
            return new Response(JSON.stringify({ title: "Keel", body: "You have a reminder. Open Keel to see it.", url: "/home" }), { headers });
          }
          const dg = await pushDigest(await db());
          return new Response(JSON.stringify({ title: dg.title, body: dg.body, url: dg.url }), { headers });
        } catch {
          return new Response(JSON.stringify({ title: "Keel", body: "Open Keel to see today's reminder.", url: "/home" }), { headers });
        }
      },
    },
  },
});
