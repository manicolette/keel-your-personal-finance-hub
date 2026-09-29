import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getPushStatus, removePushSubscription, savePushSubscription, sendTestPush } from "@/lib/keel.functions";
import { Button, Card } from "@/components/keel-ui";

const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/SamsungBrowser/.test(ua)) return "Samsung phone (Samsung Internet)";
  if (/Android/.test(ua)) return /SM-|Samsung/i.test(ua) ? "Samsung phone" : "Android phone";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows computer";
  return "This device";
}

type Support = "ok" | "not-installed-ios" | "unsupported";

export function PushSettingsCard() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["push-status"], queryFn: () => getPushStatus() });
  const save = useServerFn(savePushSubscription);
  const remove = useServerFn(removePushSubscription);
  const test = useServerFn(sendTestPush);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [support, setSupport] = useState<Support>("ok");
  const [busy, setBusy] = useState(false);
  const [keys, setKeys] = useState<{ pub: string; priv: string; secret: string } | null>(null);

  useEffect(() => {
    const ios = /iPhone|iPad/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setSupport(ios && !standalone ? "not-installed-ios" : "unsupported");
      return;
    }
    navigator.serviceWorker.getRegistration().then((reg) => reg?.pushManager.getSubscription()).then((sub) => setEndpoint(sub?.endpoint ?? null)).catch(() => {});
  }, []);

  const refresh = () => qc.invalidateQueries({ queryKey: ["push-status"] });
  const s = status.data;
  const thisDeviceOn = !!endpoint && !!s?.devices.some((d) => d.endpoint === endpoint);

  const turnOn = async () => {
    if (!s?.public_key) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast.error("Notifications are blocked. Allow them for Keel in your phone's settings, then try again."); return; }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64url(s.public_key) });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await save({ data: { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, device: deviceName(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
      setEndpoint(json.endpoint);
      toast.success("Notifications are on for this phone");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async (ep: string, isThis: boolean) => {
    setBusy(true);
    try {
      if (isThis) {
        const reg = await navigator.serviceWorker.getRegistration();
        await (await reg?.pushManager.getSubscription())?.unsubscribe();
        setEndpoint(null);
      }
      await remove({ data: { endpoint: ep } });
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    if (!endpoint) return;
    setBusy(true);
    try {
      await test({ data: { endpoint } });
      toast.success("Test sent. It should arrive in a few seconds.");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Keys are made here, in the browser, so the private key never passes through Keel's server or a chat.
  const makeKeys = async () => {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const pub = b64url(await crypto.subtle.exportKey("raw", pair.publicKey));
    const priv = (await crypto.subtle.exportKey("jwk", pair.privateKey)).d as string;
    const secret = b64url(crypto.getRandomValues(new Uint8Array(32)).buffer);
    setKeys({ pub, priv, secret });
  };
  const copy = (v: string, label: string) => navigator.clipboard.writeText(v).then(() => toast.success(`${label} copied`), () => toast.error("Couldn't copy; select and copy it by hand"));

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg">Phone notifications</h2>
        <p className="text-xs text-muted-foreground">One reminder a day, during the hour of your reminder time above, only when there's something to say: nothing logged today, bills due today or tomorrow, or pay expected today. Uses the reminder switches above.</p>
      </div>

      {status.isLoading && <p className="text-sm text-muted-foreground">Checking…</p>}

      {s && !s.keys_ready && (
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border bg-background p-3.5 text-sm">
          <p className="font-semibold">One-time setup: add three keys in Vercel</p>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13px]">
            <li>Tap "Create keys" below. They're made on this device and shown only here.</li>
            <li>In Vercel, open the Keel project, then Settings, then Environment Variables. Add each one below with its name and value, for all environments.</li>
            <li>Redeploy Keel in Vercel (Deployments, then Redeploy on the latest one), then come back here.</li>
          </ol>
          {!keys ? <Button onClick={makeKeys}>Create keys</Button> : (
            <div className="flex flex-col gap-2">
              {([["VAPID_PUBLIC_KEY", keys.pub], ["VAPID_PRIVATE_KEY", keys.priv], ["CRON_SECRET", keys.secret]] as const).map(([name, val]) => (
                <div key={name} className="flex flex-col gap-1 rounded-xl bg-card p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-xs font-bold">{name}</code>
                    <Button size="sm" variant="outline" onClick={() => copy(val, name)}>Copy value</Button>
                  </div>
                  <code className="break-all text-[11px] text-muted-foreground">{val}</code>
                </div>
              ))}
              <p className="text-[12px] text-muted-foreground">Keep the private key and cron secret only in Vercel. If you close this page before saving them, just create new ones.</p>
            </div>
          )}
        </div>
      )}

      {s?.keys_ready && (
        <>
          {!s.cron_ready && <p className="rounded-xl bg-[#fff0c9] px-3 py-2 text-[13px] text-[#6e500e]">CRON_SECRET isn't set in Vercel, so the daily reminder won't run yet. Test notifications still work.</p>}
          {support === "not-installed-ios" && <p className="text-sm">Open Keel from its Home Screen icon to turn on notifications on this iPhone.</p>}
          {support === "unsupported" && <p className="text-sm">This browser can't receive notifications. Use the installed Keel app on your phone.</p>}
          {support === "ok" && (
            <div className="flex flex-wrap gap-2">
              {thisDeviceOn ? (
                <>
                  <Button onClick={sendTest} disabled={busy}>Send a test</Button>
                  <Button variant="outline" onClick={() => turnOff(endpoint!, true)} disabled={busy}>Turn off on this phone</Button>
                </>
              ) : (
                <Button onClick={turnOn} disabled={busy}>Turn on notifications on this phone</Button>
              )}
            </div>
          )}
          {s.devices.length > 0 && (
            <ul className="divide-y divide-muted rounded-xl border border-border">
              {s.devices.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{d.device ?? "Device"}{d.endpoint === endpoint ? " (this one)" : ""}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {d.last_error ? `Last try failed: ${d.last_error}` : d.last_sent_at ? `Last reminder ${new Date(d.last_sent_at).toLocaleString()}` : "No reminders sent yet"}
                    </div>
                  </div>
                  {d.endpoint !== endpoint && <Button size="sm" variant="ghost" onClick={() => turnOff(d.endpoint, false)} disabled={busy}>Remove</Button>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
