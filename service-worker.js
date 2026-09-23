const CACHE_NAME = "cta-static-v41";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/storage.js",
  "./js/store.js",
  "./js/plan.js",
  "./js/bonus.js",
  "./js/ui/bonus.js",
  "./js/ui/tomorrow.js",
  "./js/weekplan.js",
  "./js/layout.js",
  "./js/random.js",
  "./js/version.js",
  "./js/goals.js",
  "./js/actions.js",
  "./js/inputs.js",
  "./js/sync.js",
  "./js/ui/syncui.js",
  "./js/stats.js",
  "./js/dates.js",
  "./js/presets.js",
  "./js/holidays.js",
  "./js/ui.js",
  "./js/ui/shared.js",
  "./js/ui/weekgrid.js",
  "./js/ui/week.js",
  "./js/ui/today.js",
  "./js/ui/exam.js",
  "./js/ui/progress.js",
  "./js/ui/history.js",
  "./js/ui/settings.js",
  "./js/ui/plantree.js",
  "./js/ui/settle.js",
  "./data/holidays.json",
  "./manifest.json",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// GitHub Pages가 파일마다 10분 HTTP 캐시를 붙이므로, 새 버전을 설치할 때는 브라우저 캐시를 건너뛰고 서버에서 받는다
// (짧은 간격으로 배포하면 새 버전 이름으로 옛 파일이 저장되던 문제 방지)
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

// 공휴일 목록은 정기 작업이 갱신하므로 네트워크를 먼저 시도하고, 실패하면 캐시를 쓴다.
function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      return response;
    })
    .catch(() => caches.match(request));
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // GitHub API 응답은 절대 캐시하지 않는다(동기화가 옛 데이터를 보게 되므로)
  if (new URL(event.request.url).hostname === "api.github.com") return;
  if (new URL(event.request.url).pathname.endsWith("/data/holidays.json")) {
    event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached);
    })
  );
});
