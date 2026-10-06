/* store.js — 資料存取層
 * 所有資料都存在瀏覽器的 localStorage，不會傳到任何伺服器。
 * 資料結構刻意設計成「一趟旅程 = 一個完整物件」，日後要搬上雲端同步時
 * 可以直接把一個 trip 當成一筆雲端資料，不用重寫其他程式。
 */
window.App = window.App || {};
App.Store = (function () {

  var KEY = 'travel.v1';

  // ---- 預設的打包清單範本（參考 Funliday 的五大分類）----
  var DEFAULT_CHECKLIST = [
    { name: '重要證件', emoji: '🪪', items: ['護照（效期 6 個月以上）', '簽證 / 電子簽', '身分證', '機票訂位代號', '住宿訂房確認信', '旅遊保險文件', '國際駕照', '護照影本（分開放）'] },
    { name: '衣物類', emoji: '👕', items: ['上衣', '褲子 / 裙子', '外套', '內衣褲', '襪子', '睡衣', '鞋子', '拖鞋', '帽子 / 太陽眼鏡', '雨具'] },
    { name: '3C 物品', emoji: '📱', items: ['手機', '充電線', '行動電源（須隨身，不可託運）', '萬國轉接頭', '相機 + 記憶卡', '耳機', '網路卡 / WiFi 機'] },
    { name: '日常盥洗用品', emoji: '🪥', items: ['牙刷牙膏', '洗面乳', '沐浴乳 / 洗髮精', '保養品', '防曬乳', '隱形眼鏡 + 藥水', '梳子', '刮鬍刀'] },
    { name: '其他物品', emoji: '🎒', items: ['現金 / 外幣', '信用卡', '常備藥品', '口罩', '衛生用品', '環保袋', '摺疊傘', '小背包'] }
  ];

  var ITEM_TYPES = [
    { key: 'spot', label: '景點', emoji: '🏛' },
    { key: 'food', label: '吃飯', emoji: '🍜' },
    { key: 'stay', label: '住宿', emoji: '🏨' },
    { key: 'move', label: '交通', emoji: '🚄' },
    { key: 'fly', label: '航班', emoji: '✈️' },
    { key: 'other', label: '其他', emoji: '📌' }
  ];

  var state = { trips: [], currentTripId: null };

  // 從雲端把資料拉下來的時候會暫時關掉自動上傳，
  // 否則「剛下載完」會立刻被當成「有改動」又傳回去。
  var syncSuspended = false;

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---- 讀寫 localStorage（任何失敗都不可以讓整個網頁掛掉）----
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.trips)) state = parsed;
      }
    } catch (e) {
      console.warn('讀取本機資料失敗，從空白開始', e);
    }
    state.trips.forEach(migrateTrip);
    return state;
  }

  function save(opts) {
    var ok = true;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      alert('儲存失敗。可能是瀏覽器空間已滿，或你正在使用無痕視窗。\n建議先用「備份」把資料匯出成檔案。');
      ok = false;
    }
    // 存到本機之後，如果有開雲端同步就排程上傳（會等幾秒，不會每改一下就連線）
    if (ok && !syncSuspended && !(opts && opts.localOnly) &&
        App.Cloud && App.Cloud.isOn && App.Cloud.isOn()) {
      App.Cloud.scheduleSave();
    }
    return ok;
  }

  /** 執行一段「不要往雲端回傳」的操作（例如剛從雲端下載完資料） */
  function withoutSync(fn) {
    syncSuspended = true;
    try { return fn(); } finally { syncSuspended = false; }
  }

  /** 直接換掉全部旅程（從雲端拉下來時用） */
  function replaceAll(trips, keepCurrentName) {
    withoutSync(function () {
      trips.forEach(migrateTrip);
      state.trips = trips;
      var keep = keepCurrentName
        ? trips.filter(function (t) { return t.name === keepCurrentName; })[0]
        : null;
      state.currentTripId = keep ? keep.id : (trips.length ? trips[0].id : null);
      save({ localOnly: true });
    });
  }

  /**
   * 時間欄應該是 HH:MM。
   * 試算表曾經把「09:00」存成 1899-12-30 當天的時刻，讀回來就變成日期字串。
   * 這裡把那種壞值清掉 —— 原本的時間已經救不回來，但至少不要在時間欄顯示一個日期。
   */
  function cleanTime(v) {
    var s = String(v || '').trim();
    if (!s) return '';
    if (/^\d{1,2}:\d{2}$/.test(s)) return s;          // 正常的 09:00
    var m = s.match(/[T ](\d{1,2}:\d{2})/);            // 1899-12-30T09:00 這種還救得回來
    if (m) return m[1];
    return '';                                         // 其餘一律清掉
  }

  /** 舊資料補上後來新增的欄位，避免更新後打不開 */
  function migrateTrip(trip) {
    if (!trip.currencies) trip.currencies = [];
    if (!trip.members) trip.members = [];
    if (!trip.expenses) trip.expenses = [];
    if (!trip.payments) trip.payments = [];
    if (!trip.checklist) trip.checklist = [];
    if (!trip.days) trip.days = [];
    if (!trip.baseCurrency) trip.baseCurrency = 'TWD';
    syncDays(trip);
    trip.days.forEach(function (d) {
      (d.items || []).forEach(function (it) { it.time = cleanTime(it.time); });
    });
    return trip;
  }

  // ---- 日期工具 ----
  function parseDate(s) {
    if (!s) return null;
    var p = s.split('-');
    if (p.length !== 3) return null;
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return isNaN(d.getTime()) ? null : d;
  }
  function formatDate(d) {
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + dd;
  }
  function addDays(d, n) {
    var x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    return x;
  }
  /** 這趟旅行共幾天；日期沒填完整時至少給 1 天 */
  function dayCount(trip) {
    var a = parseDate(trip.startDate), b = parseDate(trip.endDate);
    if (!a || !b) return Math.max(1, trip.days.length);
    var n = Math.round((b - a) / 86400000) + 1;
    return n > 0 ? Math.min(n, 60) : 1;
  }
  /** 第 i 天（從 0 算）的日期字串，沒設定起始日就回傳空字串 */
  function dayDate(trip, i) {
    var a = parseDate(trip.startDate);
    return a ? formatDate(addDays(a, i)) : '';
  }

  /**
   * 讓 days 陣列的長度符合日期區間。
   * 天數變少時，被砍掉那幾天「有內容」的行程不會直接消失，
   * 會回傳給呼叫端決定怎麼處理。
   */
  function syncDays(trip) {
    var want = dayCount(trip);
    var dropped = [];
    while (trip.days.length < want) trip.days.push({ id: uid('d'), items: [] });
    while (trip.days.length > want) {
      var d = trip.days.pop();
      if (d.items && d.items.length) dropped.push(d);
    }
    return dropped;
  }

  // ---- 旅程 CRUD ----
  function allTrips() { return state.trips; }

  function getTrip(id) {
    for (var i = 0; i < state.trips.length; i++) if (state.trips[i].id === id) return state.trips[i];
    return null;
  }

  function currentTrip() { return getTrip(state.currentTripId); }

  function setCurrentTrip(id) { state.currentTripId = id; save(); }

  function createTrip(name, startDate, endDate) {
    var trip = {
      id: uid('trip'),
      name: name || '未命名旅程',
      startDate: startDate || '',
      endDate: endDate || '',
      baseCurrency: 'TWD',
      currencies: [],
      members: [],
      days: [],
      expenses: [],
      checklist: DEFAULT_CHECKLIST.map(function (g) {
        return {
          id: uid('g'),
          name: g.name,
          emoji: g.emoji,
          items: g.items.map(function (txt) { return { id: uid('c'), text: txt, done: false, members: [] }; })
        };
      }),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    migrateTrip(trip);
    state.trips.unshift(trip);
    state.currentTripId = trip.id;
    save();
    return trip;
  }

  function deleteTrip(id) {
    state.trips = state.trips.filter(function (t) { return t.id !== id; });
    if (state.currentTripId === id) state.currentTripId = state.trips.length ? state.trips[0].id : null;
    save();
  }

  /** 加入一趟從分享連結或備份檔來的旅程（一律給新的 id，不覆蓋原有資料） */
  function adoptTrip(trip) {
    var copy = JSON.parse(JSON.stringify(trip));
    copy.id = uid('trip');
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = new Date().toISOString();
    migrateTrip(copy);
    state.trips.unshift(copy);
    state.currentTripId = copy.id;
    save();
    return copy;
  }

  function touch(trip) {
    if (trip) trip.updatedAt = new Date().toISOString();
    save();
  }

  // ---- 備份 / 還原 ----
  function exportAll() {
    return JSON.stringify({ app: 'travel', version: 1, exportedAt: new Date().toISOString(), trips: state.trips }, null, 2);
  }

  /** 匯入備份檔。mode 'merge' 會附加在現有資料後面；'replace' 會整個換掉 */
  function importAll(text, mode) {
    var data = JSON.parse(text);
    var incoming = Array.isArray(data) ? data : data.trips;
    if (!Array.isArray(incoming)) throw new Error('這個檔案看起來不是本工具匯出的備份。');
    incoming.forEach(migrateTrip);
    if (mode === 'replace') {
      state.trips = incoming;
    } else {
      incoming.forEach(function (t) { t.id = uid('trip'); state.trips.unshift(t); });
    }
    state.currentTripId = state.trips.length ? state.trips[0].id : null;
    save();
    return incoming.length;
  }

  return {
    state: function () { return state; },
    DEFAULT_CHECKLIST: DEFAULT_CHECKLIST,
    ITEM_TYPES: ITEM_TYPES,
    uid: uid,
    load: load,
    save: save,
    allTrips: allTrips,
    getTrip: getTrip,
    currentTrip: currentTrip,
    setCurrentTrip: setCurrentTrip,
    createTrip: createTrip,
    deleteTrip: deleteTrip,
    adoptTrip: adoptTrip,
    touch: touch,
    migrateTrip: migrateTrip,
    cleanTime: cleanTime,
    syncDays: syncDays,
    dayCount: dayCount,
    dayDate: dayDate,
    parseDate: parseDate,
    exportAll: exportAll,
    importAll: importAll,
    withoutSync: withoutSync,
    replaceAll: replaceAll
  };
})();
