// Web Push without a library. Pushes are sent with no payload (so nothing needs encrypting);
// when one arrives, the service worker asks /api/push/digest what to show. Only the VAPID
// JWT is signed here, with Node's built-in crypto.
import { createPrivateKey, sign } from "node:crypto";

const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export function vapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || null;
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || null;
  const subject = process.env.VAPID_SUBJECT?.trim() || "https://keel-your-personal-finance-hub.vercel.app";
  return { publicKey, privateKey, subject, ready: !!publicKey && !!privateKey };
}

/** ES256 JWT for the push service at `audience` (its origin). */
export function vapidJwt(audience: string, publicKey: string, privateKey: string, subject: string, now = Date.now()): string {
  const pub = fromB64url(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("VAPID_PUBLIC_KEY is not a valid P-256 public key");
  const key = createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: privateKey, x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33, 65)) },
    format: "jwk",
  });
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64url(Buffer.from(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const sig = sign("sha256", Buffer.from(`${header}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `${header}.${body}.${b64url(sig)}`;
}

export type PushResult = { ok: true } | { ok: false; gone: boolean; status: number; error: string };

/** Sends an empty push to one subscription endpoint. `gone` means the phone unsubscribed. */
export async function sendPush(endpoint: string): Promise<PushResult> {
  const cfg = vapidConfig();
  if (!cfg.ready) return { ok: false, gone: false, status: 0, error: "Notification keys are not set in Vercel yet" };
  const jwt = vapidJwt(new URL(endpoint).origin, cfg.publicKey!, cfg.privateKey!, cfg.subject);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { TTL: "43200", Urgency: "normal", "Content-Length": "0", Authorization: `vapid t=${jwt}, k=${cfg.publicKey}` },
    });
    if (res.ok) return { ok: true };
    const text = (await res.text().catch(() => "")).slice(0, 200);
    return { ok: false, gone: res.status === 404 || res.status === 410, status: res.status, error: text || res.statusText };
  } catch (e) {
    return { ok: false, gone: false, status: 0, error: (e as Error).message };
  }
}

/** Today's date (YYYY-MM-DD) in the given IANA time zone. */
export function todayIn(timeZone: string | null | undefined, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
