// Incrementar esta versão invalida bundles antigos após cada mudança de contrato
// entre o navegador e as server functions do Worker.
const CACHE = "almoxarifado-shell-v3";
const APP_SHELL = ["/", "/manifest.webmanifest", "/app-icon.svg", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      corpo: event.data ? event.data.text() : "Há uma nova atualização no Almoxarifado.",
    };
  }

  const titulo = typeof payload.titulo === "string" ? payload.titulo : "Almoxarifado";
  const corpo = typeof payload.corpo === "string" ? payload.corpo : "Há uma nova atualização.";
  const url = typeof payload.url === "string" ? payload.url : "/";
  const tag = typeof payload.tag === "string" ? payload.tag : "almoxarifado-atualizacao";

  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: corpo,
      icon: "/android-chrome-192x192.png",
      badge: "/favicon-32x32.png",
      tag,
      data: { url },
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino =
    event.notification.data && typeof event.notification.data.url === "string"
      ? event.notification.data.url
      : "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientes) => {
      const cliente = clientes.find((item) => "focus" in item);
      if (cliente && "focus" in cliente) {
        void cliente.focus();
        if ("navigate" in cliente) void cliente.navigate(destino);
        return;
      }
      return self.clients.openWindow(destino);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request, { ignoreSearch: true });
          return cached ?? (await caches.match("/"));
        }),
    );
    return;
  }

  const recursoExecutavel =
    requestUrl.pathname.startsWith("/assets/") ||
    event.request.destination === "script" ||
    event.request.destination === "style" ||
    event.request.destination === "manifest";

  if (recursoExecutavel) {
    // Online: sempre busca o bundle atual. Offline: reaproveita o último bundle
    // conhecido para preservar o funcionamento local-first.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});
