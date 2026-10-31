/* Perped service worker: shows push alerts and opens the right screen when one is tapped. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: "Perped", body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(d.title || "Perped", {
    body: d.body || "",
    icon: "/api/share-bg/icon-180",
    badge: "/api/share-bg/icon-180",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { href: d.href || "/notifications" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) { await c.focus(); if ("navigate" in c) await c.navigate(href).catch(() => null); return; }
    }
    await self.clients.openWindow(href);
  })());
});
