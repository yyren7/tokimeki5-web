/* 星辉高中物语 —— 缓存优先 service worker（web-skin 覆盖层，发布脚本注入版本号）
 *
 * 与 Ren'Py 默认策略的区别：默认 addToCache=false，除非玩家手动安装 PWA，
 * 否则每次访问都全量重下 ~50MB。这里改为 install 时预缓存全部核心文件、
 * fetch 时缓存优先，二次打开即点即玩且可离线。
 * 版本号来自构建时间戳：每次发布生成新缓存并清掉旧版。
 */

var cacheVersion = '1784913143';
var cacheName = 'tokimeki5-' + cacheVersion;

var CORE = [
    './',
    'index.html',
    'renpy-pre.js',
    'renpy.js',
    'renpy.wasm',
    'renpy.data',
    'game.data',
    'web-presplash.jpg',
];

self.addEventListener('install', function (e) {
    e.waitUntil((async function () {
        try {
            var cache = await caches.open(cacheName);
            await cache.addAll(CORE);
            console.log('Pre-cached core files for', cacheName);
        } catch (err) {
            // 预缓存失败不阻塞安装（回退为网络加载，下次访问重试）
            console.log('Pre-cache failed:', err);
        }
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', function (e) {
    e.waitUntil((async function () {
        var names = await caches.keys();
        await Promise.all(names.map(function (n) {
            if (n !== cacheName) {
                console.log('Deleting old cache:', n);
                return caches.delete(n);
            }
        }));
        await self.clients.claim();
    })());
});

async function fetchCacheFirst(request) {
    var cache = await caches.open(cacheName);

    // Ren'Py 引擎的 ?cached 协议：读取 ?uncached 请求写入的缓存副本
    if (request.url.endsWith('?cached')) {
        var alt = new Request(request.url.replace('?cached', '?uncached'), request);
        var rv = await cache.match(alt);
        if (rv == null) {
            rv = new Response('Not found in cache.', { status: 404, statusText: 'Not found in cache.' });
        }
        return rv;
    }

    var cached = await cache.match(request, { ignoreSearch: false });
    if (cached) {
        return cached;
    }

    var response = await fetch(request);
    if (response.status == 200 && request.method == 'GET' &&
        new URL(request.url).origin == self.location.origin) {
        await cache.put(request, response.clone());
    }
    return response;
}

self.addEventListener('fetch', function (e) {
    e.respondWith(fetchCacheFirst(e.request));
});

self.addEventListener('message', function (e) {
    if (e.data && e.data[0] == 'clearCache') {
        caches.delete(cacheName);
        console.log('Cache cleared in service worker.');
    }
    // 'loadCache'（引擎的 PWA 安装钩子）无需处理：本 worker 始终缓存
});
