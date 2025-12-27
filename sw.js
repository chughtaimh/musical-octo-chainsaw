const CACHE_NAME = "drinks-tracker-v2";
const ASSETS = [
    "./",
    "./index.html",
    "./css/style.css",
    "./js/app.js",
    "./js/constants.js",
    "./js/firebase-config.js",
    "./js/logic.js",
    "./js/state.js",
    "./js/ui.js",
    "./js/utils.js",
    "https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;700;800&display=swap",
    "https://cdn.jsdelivr.net/npm/chart.js",
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js",
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener("fetch", (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
