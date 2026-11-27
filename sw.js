"use strict";
// 画面・コードを変えて公開するときは版番号も増やす（app.js の APP_VERSION、index.html の ?v= と合わせる）。
// v2：ジャンルの追加と検索に対応。v3：ジャンルを空から始める形に変更。
// v4：index.html から ?v= 付きで読み込み、古い app.js / styles.css の使い回しを防ぐ。
// v5：ジャンルの削除に対応。v6：ジャンルの名前変更に対応。
// v7（2026-11-27）：スマホで二本指の拡大縮小を止める。
const CACHE="yokujitsu-shell-v7";
const APP=["./","./index.html","./styles.css","./app.js","./manifest.webmanifest","./icon-192.png","./icon-512.png"];
self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    // ブラウザが覚えている古いファイルを使わず、必ずサーバーから取り直して保存する。
    await cache.addAll(APP.map(url=>new Request(url,{cache:"reload"})));
    // 古い版が開いたままでも待たずに交代する。開いている画面は、次の再読み込みで新しい版になる。
    await self.skipWaiting();
  })());
});
self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(n=>n.startsWith("yokujitsu-shell-")&&n!==CACHE).map(n=>caches.delete(n)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch",event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=="GET"||url.origin!==self.location.origin)return;
  event.respondWith((async()=>{
    // この版のコピーだけを使う（ほかの版のコピーが残っていても混ぜない）。
    const cache=await caches.open(CACHE);
    // index.html は styles.css?v=7 のように版番号付きで読み込む。?より後ろは無視して探す。
    const cached=await cache.match(request,{ignoreSearch:true});if(cached)return cached;
    try{return await fetch(request)}
    catch(error){
      if(request.mode==="navigate")return await cache.match("./index.html");
      return Response.error();
    }
  })());
});
