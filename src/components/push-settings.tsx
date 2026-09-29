import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getPushStatus, removePushSubscription, savePushSubscription, sendTestPush } from "@/lib/keel.functions";
import { Button, Card } from "@/components/keel-ui";

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

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg">Phone notifications</h2>
        <p className="text-xs text-muted-foreground">One reminder a day, during the hour of your reminder time above, only when there's something to say: nothing logged today, bills due today or tomorrow, or pay expected today. Uses the reminder switches above.</p>
      </div>

      {status.isLoading && <p className="text-sm text-muted-foreground">Checking…</p>}

      {s && !s.keys_ready && <p className="text-sm text-muted-foreground">Notifications aren't available right now. Try again in a moment.</p>}

      {s?.keys_ready && (
        <>
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
