// 版本改了就會換掉舊快取；主程式每次都先試網路，離線時才用快取
var CACHE = 'pantry-v1.5';
var SHELL = ['./', 'index.html', 'manifest.json', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(SHELL); }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('fetch', function(e){
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // 字型：有快取就用，同時背景更新
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com'){
    e.respondWith(caches.open(CACHE).then(function(c){
      return c.match(req).then(function(hit){
        var net = fetch(req).then(function(res){ c.put(req, res.clone()); return res; }).catch(function(){ return hit; });
        return hit || net;
      });
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(req).then(function(res){
    if (res.ok){ var copy = res.clone(); caches.open(CACHE).then(function(c){ c.put(req, copy); }); }
    return res;
  }).catch(function(){
    return caches.match(req).then(function(hit){ return hit || caches.match('index.html'); });
  }));
});
