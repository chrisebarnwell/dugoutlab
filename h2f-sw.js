/* DugoutLab: offline copy of the Home-to-First Timer, and nothing else.
   Network first for these few files, so the site never serves a stale page when the phone has signal.
   Every other request passes straight through untouched. Saves are queued by js/team.js, not here. */
var CACHE = 'dl-h2f-v1';
var FILES = ['/h2f', '/h2f.html', '/css/main.css', '/css/team.css', '/js/team.js', '/js/site.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(FILES.map(function (f) { return c.add(f).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('dl-h2f-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin || FILES.indexOf(url.pathname) < 0) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.status === 200 && !res.redirected) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(url.pathname, copy); }); }
    return res;
  }).catch(function () {
    return caches.open(CACHE).then(function (c) {
      return c.match(url.pathname).then(function (m) {
        if (m) return m;
        var alt = url.pathname === '/h2f' ? '/h2f.html' : url.pathname === '/h2f.html' ? '/h2f' : null;
        return alt ? c.match(alt) : undefined;
      });
    }).then(function (m) { return m || Response.error(); });
  }));
});
