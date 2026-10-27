/* share.js — 產生 / 讀取唯讀分享連結
 *
 * 有兩種連結：
 *
 * 1. 自動更新的連結（#live=…，有開雲端同步、而且設了同步密碼才會用）
 *    連結裡只有 Apps Script 的代號和這趟旅程的「分享代號」。
 *    旅伴打開時才去試算表讀最新的資料，所以你改了行程不用重傳，連結也很短。
 *    試算表那邊只會回傳這一趟的行程、支出、還款，打包清單一律不給。
 *
 * 2. 快照連結（#view=…，沒開雲端時用）
 *    把一趟旅程的資料壓縮後，整串塞進網址 # 後面。
 *    依照網路標準，# 後面的內容「不會」被送到伺服器，
 *    所以行程內容不會經過 GitHub 或任何第三方。
 *    代價：連結是「當下的快照」，之後改了行程要重新產生一次。
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

  /**
   * 分享時去掉用不到的欄位，讓連結短一點。
   * 打包清單是自己的事，不分享出去（對方只看得到行程和分帳）。
   * 還款紀錄一定要帶，不然對方看到的結算金額會沒扣掉已經還的錢。
   */
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
      payments: trip.payments
    };
  }

  /** 產生完整的分享網址 */
  function makeUrl(trip) {
    return encode(trip).then(function (code) {
      var base = location.origin + location.pathname;
      return base + '#view=' + code;
    });
  }

  // ---- 自動更新的連結 ----

  var SCRIPT_URL = /^https:\/\/script\.google\.com\/macros\/s\/([\w-]+)\/exec$/;

  /** 產生一組新的分享代號（22 個字，猜不到） */
  function newShareKey() {
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return bytesToB64url(bytes);
  }

  /**
   * 組出自動更新的連結。
   * 一般的 Apps Script 網址只放中間那段代號，連結比較短；
   * 網址長得不一樣（例如公司帳號的）就整串編碼進去，前面加 ~ 區分。
   */
  function makeLiveUrl(scriptUrl, shareKey) {
    var m = String(scriptUrl || '').trim().match(SCRIPT_URL);
    var code = m ? m[1] : '~' + bytesToB64url(new TextEncoder().encode(String(scriptUrl).trim()));
    return location.origin + location.pathname + '#live=' + code + '.' + shareKey;
  }

  /** 拆解 #live=… ；格式不對就回傳 null */
  function parseLive(hash) {
    var m = String(hash || '').match(/^#live=(~?[\w-]+)\.([\w-]{16,})$/);
    if (!m) return null;
    var url;
    if (m[1].charAt(0) === '~') {
      try { url = new TextDecoder().decode(b64urlToBytes(m[1].slice(1))); } catch (e) { return null; }
      if (!/^https:\/\/script\.google\.com\//.test(url)) return null;   // 只連 Google 的 Apps Script
    } else {
      url = 'https://script.google.com/macros/s/' + m[1] + '/exec';
    }
    return { scriptUrl: url, shareKey: m[2] };
  }

  /**
   * 從目前網址讀出分享的旅程；不是分享連結就回傳 null。
   * 是的話回傳 { trip, live, updatedAt }（updatedAt 只有自動更新的連結才有）。
   */
  function readFromUrl() {
    var h = location.hash || '';
    if (/^#live=/.test(h)) {
      var live = parseLive(h);
      if (!live) return Promise.reject(new Error('網址不完整，請重新複製一次連結。'));
      return App.Cloud.fetchShared(live.scriptUrl, live.shareKey).then(function (r) {
        App.Store.migrateTrip(r.trip);
        return { trip: r.trip, live: true, updatedAt: r.updatedAt };
      });
    }
    var m = h.match(/^#view=(.+)$/);
    if (!m) return Promise.resolve(null);
    return decode(m[1]).then(function (trip) {
      App.Store.migrateTrip(trip);
      return { trip: trip, live: false, updatedAt: '' };
    });
  }

  function isLiveLink() { return /^#live=/.test(location.hash || ''); }

  return {
    encode: encode, decode: decode, makeUrl: makeUrl, readFromUrl: readFromUrl, stripForShare: stripForShare,
    newShareKey: newShareKey, makeLiveUrl: makeLiveUrl, parseLive: parseLive, isLiveLink: isLiveLink
  };
})();
