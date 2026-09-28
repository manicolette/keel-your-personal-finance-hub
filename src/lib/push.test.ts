// Run with: npx tsx src/lib/push.test.ts
import assert from "node:assert/strict";
import { generateKeyPairSync, createPublicKey, verify } from "node:crypto";
import { vapidJwt, todayIn } from "./push.server";

// Make a key pair the same shape the Settings page generates (raw public point + private scalar).
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = privateKey.export({ format: "jwk" }) as { x: string; y: string; d: string };
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]).toString("base64url");

const jwt = vapidJwt("https://web.push.apple.com", raw, jwk.d, "https://example.com", 1_790_000_000_000);
const [h, b, s] = jwt.split(".");
assert.deepEqual(JSON.parse(Buffer.from(h, "base64url").toString()), { typ: "JWT", alg: "ES256" });
const body = JSON.parse(Buffer.from(b, "base64url").toString());
assert.equal(body.aud, "https://web.push.apple.com");
assert.equal(body.sub, "https://example.com");
assert.equal(body.exp, 1_790_000_000 + 12 * 3600);
const pub = createPublicKey({ key: { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y }, format: "jwk" });
assert.ok(verify("sha256", Buffer.from(`${h}.${b}`), { key: pub, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")), "signature verifies");
assert.equal(Buffer.from(s, "base64url").length, 64, "raw 64-byte ES256 signature");
assert.throws(() => vapidJwt("https://x.com", "abc", jwk.d, "https://e.com"));

assert.equal(todayIn("America/New_York", new Date("2026-10-01T02:30:00Z")), "2026-09-30", "evening in Florida is still the day before in UTC terms");
assert.equal(todayIn("Africa/Accra", new Date("2026-10-01T02:30:00Z")), "2026-10-01");
console.log("all push tests passed");
