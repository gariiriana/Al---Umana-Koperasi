/* Al-Umanaa — push handler, diimpor ke service worker Workbox (vite.config.ts → workbox.importScripts).
 *
 * Worker `al-umana-push` mengirim pesan FCM "data only", jadi service worker ini
 * yang menampilkan notifikasinya — juga saat aplikasi/HP sedang tidak dibuka.
 */
/* eslint-disable no-restricted-globals */

const DEFAULT_TITLE = "Al-Umanaa";
const ICON = "/icons/icon-192x192.png";
const BADGE = "/icons/badge-96x96.png";

function readPayload(event) {
  if (!event.data) return {};
  try {
    const json = event.data.json();
    // FCM membungkus field `data` pesan di dalam properti `data`.
    return json && typeof json === "object" ? (json.data || json.notification || json) : {};
  } catch {
    return { body: event.data.text() };
  }
}

self.addEventListener("push", (event) => {
  const data = readPayload(event);
  const title = data.title || DEFAULT_TITLE;
  const options = {
    body: data.body || "",
    icon: ICON,
    badge: BADGE,
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    timestamp: Number(data.sentAt) || Date.now(),
    vibrate: [120, 60, 120],
    data: { url: data.url || "/", id: data.id || "" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      if ("navigate" in existing && existing.url !== target) {
        try { await existing.navigate(target); } catch { /* halaman belum dikendalikan SW */ }
      }
      return;
    }
    await self.clients.openWindow(target);
  })());
});
