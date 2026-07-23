import { createFileRoute } from "@tanstack/react-router";
import { put } from "@vercel/blob";
import { checkUnlocked } from "@/lib/gate.functions";

export const Route = createFileRoute("/api/upload-receipt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth gate: require unlocked session.
        try {
          const { unlocked } = await checkUnlocked();
          if (!unlocked) return new Response("Unauthorized", { status: 401 });
        } catch {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = process.env.BLOB_READ_WRITE_TOKEN;
        if (!token) {
          return new Response("Receipt uploads are not configured. Add BLOB_READ_WRITE_TOKEN in Vercel.", { status: 501 });
        }
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) return new Response("Missing file", { status: 400 });
        if (file.size > 10 * 1024 * 1024) return new Response("File too large (max 10MB)", { status: 413 });
        const ts = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const blob = await put(`receipts/${ts}-${safeName}`, file, { access: "public", token });
        return Response.json({ url: blob.url });
      },
    },
  },
});
