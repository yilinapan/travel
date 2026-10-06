/* share.js — 產生 / 讀取唯讀分享連結
 *
 * 做法：把一趟旅程的資料壓縮後，整串塞進網址 # 後面。
 * 依照網路標準，# 後面的內容「不會」被送到伺服器，
 * 所以行程內容不會經過 GitHub 或任何第三方，隱私比雲端更好。
 * 代價：連結是「當下的快照」，之後改了行程要重新產生一次。
 */
window.App = window.App || {};
App.Share = (function () {

  // ---- base64url（網址安全的編碼）----
  function bytesToB64url(bytes) {
    var bin = '';
    var CHUNK = 0x8000;
    for (var i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64urlToBytes(str) {
    var s = str.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function hasCompression() {
    return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
  }

  /** 把旅程壓成一串字（開頭 g = 有壓縮，p = 沒壓縮） */
  function encode(trip) {
    var json = JSON.stringify(stripForShare(trip));
    var bytes = new TextEncoder().encode(json);
    if (!hasCompression()) {
      return Promise.resolve('p' + bytesToB64url(bytes));
    }
    var cs = new CompressionStream('gzip');
    var writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    return new Response(cs.readable).arrayBuffer().then(function (buf) {
      return 'g' + bytesToB64url(new Uint8Array(buf));
    });
  }

  /** 把一串字還原成旅程物件 */
  function decode(str) {
    var tag = str.charAt(0);
    var bytes = b64urlToBytes(str.slice(1));
    if (tag === 'p') {
      return Promise.resolve(JSON.parse(new TextDecoder().decode(bytes)));
    }
    if (tag !== 'g') return Promise.reject(new Error('連結格式不認得'));
    if (!hasCompression()) return Promise.reject(new Error('你的瀏覽器版本太舊，無法讀取這個連結。請改用新版 Chrome、Edge 或 Safari。'));
    var ds = new DecompressionStream('gzip');
    var writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    return new Response(ds.readable).arrayBuffer().then(function (buf) {
      return JSON.parse(new TextDecoder().decode(new Uint8Array(buf)));
    });
  }

  /** 分享時去掉用不到的欄位，讓連結短一點 */
  function stripForShare(trip) {
    return {
      name: trip.name,
      startDate: trip.startDate,
      endDate: trip.endDate,
      baseCurrency: trip.baseCurrency,
      currencies: trip.currencies,
      members: trip.members,
      days: trip.days,
      expenses: trip.expenses,
      checklist: trip.checklist
    };
  }

  /** 產生完整的分享網址 */
  function makeUrl(trip) {
    return encode(trip).then(function (code) {
      var base = location.origin + location.pathname;
      return base + '#view=' + code;
    });
  }

  /** 從目前網址讀出分享的旅程；不是分享連結就回傳 null */
  function readFromUrl() {
    var h = location.hash || '';
    var m = h.match(/^#view=(.+)$/);
    if (!m) return Promise.resolve(null);
    return decode(m[1]).then(function (trip) {
      App.Store.migrateTrip(trip);
      return trip;
    });
  }

  return { encode: encode, decode: decode, makeUrl: makeUrl, readFromUrl: readFromUrl };
})();
