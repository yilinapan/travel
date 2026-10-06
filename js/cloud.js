/* cloud.js — Google Sheets 雲端同步
 *
 * 這一支負責兩件事：
 *   1. 把工具內部的資料「攤平」成試算表的列，以及反過來把列組回資料（純函式，可測試）
 *   2. 跟 Apps Script 網址來回傳資料、處理衝突
 *
 * 設計重點：試算表裡一律用「人看得懂的名字」（成員名字、類型的中文、旅程名稱），
 * 不是程式內部的編號。這樣你打開試算表看得懂，Hermes 要填也容易。
 */
window.App = window.App || {};
App.Cloud = (function () {

  var S = App.Store, U = App.UI;
  var CFG_KEY = 'travel.cloud.v1';

  var cfg = { url: '', device: '', lastUpdatedAt: '', enabled: false };
  var state = { status: 'off', message: '', busy: false };
  var saveTimer = null;

  // ---------------------------------------------------------------
  // 設定
  // ---------------------------------------------------------------
  function loadConfig() {
    try {
      var raw = localStorage.getItem(CFG_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p === 'object') cfg = Object.assign(cfg, p);
      }
    } catch (e) { /* 壞掉就當作沒設定過 */ }
    if (!cfg.device) cfg.device = guessDeviceName();
    state.status = cfg.enabled && cfg.url ? 'idle' : 'off';
    return cfg;
  }

  function saveConfig() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* 忽略 */ }
  }

  function getConfig() { return cfg; }
  function getState() { return state; }
  function isOn() { return !!(cfg.enabled && cfg.url); }

  function setConfig(url, device) {
    cfg.url = (url || '').trim();
    cfg.device = (device || '').trim() || guessDeviceName();
    cfg.enabled = !!cfg.url;
    cfg.lastUpdatedAt = '';
    state.status = isOn() ? 'idle' : 'off';
    saveConfig();
  }

  function disable() {
    cfg.enabled = false;
    state.status = 'off';
    saveConfig();
  }

  function guessDeviceName() {
    var ua = navigator.userAgent || '';
    if (/iPhone|Android.*Mobile/i.test(ua)) return '手機';
    if (/iPad|Tablet/i.test(ua)) return '平板';
    return '電腦';
  }

  // ---------------------------------------------------------------
  // 資料 ⇄ 試算表的列
  // ---------------------------------------------------------------

  /** 類型在試算表裡用中文，這裡做雙向對照 */
  function typeLabel(key) {
    var list = S.ITEM_TYPES;
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i].label;
    return '其他';
  }
  function typeKey(label) {
    var list = S.ITEM_TYPES;
    var txt = String(label || '').trim();
    for (var i = 0; i < list.length; i++) {
      if (list[i].label === txt || list[i].key === txt) return list[i].key;
    }
    return 'other';
  }

  function nameOf(trip, id) {
    var m = (trip.members || []).filter(function (x) { return x.id === id; })[0];
    return m ? m.name : '';
  }

  function joinNames(trip, ids) {
    return (ids || []).map(function (id) { return nameOf(trip, id); })
      .filter(Boolean).join(',');
  }

  function splitList(text) {
    return String(text || '').split(/[,，、]/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  /**
   * 指定項目 ⇄ 一格文字
   * 格式：說明=金額=誰,誰 | 說明=金額=誰
   * 例：  生魚片=100=小明 | 甜點=60=小明,小華
   * 跟匯率欄（JPY=0.21）用同一套寫法，一筆支出仍然維持在同一列。
   */
  function extrasToText(trip, extras) {
    return (extras || []).map(function (ex) {
      return [ex.label || '指定項目', ex.amount, joinNames(trip, ex.memberIds)].join('=');
    }).join(' | ');
  }

  function extrasFromText(text, resolveMember, warnings, expenseName) {
    var out = [];
    String(text || '').split('|').forEach(function (chunk) {
      var s = chunk.trim();
      if (!s) return;
      var parts = s.split('=');
      if (parts.length < 3) {
        warnings.push('支出「' + expenseName + '」的指定項目「' + s + '」格式看不懂（應該是「說明=金額=誰」），已略過。');
        return;
      }
      var label = parts[0].trim();
      var amount = Number(parts[1]);
      var members = splitList(parts.slice(2).join('='))
        .map(function (n) { return resolveMember(n); })
        .filter(Boolean);
      if (!(amount > 0) || members.length === 0) {
        warnings.push('支出「' + expenseName + '」的指定項目「' + s + '」金額或對象不正確，已略過。');
        return;
      }
      out.push({ id: S.uid('ex'), label: label || '指定項目', amount: amount, memberIds: members });
    });
    return out;
  }

  /**
   * 試算表上的天數如果比「出發～回程」能涵蓋的還多，就把回程日往後延。
   * 寧可日期自動調整，也不要安靜地把使用者排好的行程刪掉。
   */
  function extendDatesToCoverDays(trip, warnings) {
    if (!trip.startDate || !trip.endDate || !trip.days.length) return;
    var start = S.parseDate(trip.startDate);
    var end = S.parseDate(trip.endDate);
    if (!start || !end) return;

    var covered = Math.round((end - start) / 86400000) + 1;
    if (trip.days.length <= covered) return;

    var newEnd = new Date(start.getTime());
    newEnd.setDate(newEnd.getDate() + trip.days.length - 1);
    var y = newEnd.getFullYear();
    var m = String(newEnd.getMonth() + 1).padStart(2, '0');
    var d = String(newEnd.getDate()).padStart(2, '0');
    var text = y + '-' + m + '-' + d;

    warnings.push('「' + trip.name + '」的行程排到第 ' + trip.days.length + ' 天，但回程日只到 ' +
      trip.endDate + '，已自動把回程日改成 ' + text + '。');
    trip.endDate = text;
  }

  function truthy(text) {
    var t = String(text || '').trim().toUpperCase();
    return t === 'TRUE' || t === 'V' || t === '是' || t === '1' || t === 'YES' || t === 'Y' || t === '✓';
  }

  /** 把全部旅程攤平成四張分頁的列 */
  function toRows(trips) {
    var rows = { trips: [], items: [], expenses: [], payments: [], checklist: [] };

    trips.forEach(function (t) {
      rows.trips.push([
        t.name,
        t.startDate || '',
        t.endDate || '',
        t.baseCurrency || 'TWD',
        (t.members || []).map(function (m) { return m.name; }).join(','),
        (t.currencies || []).map(function (c) { return c.code + '=' + c.rate; }).join(',')
      ]);

      (t.days || []).forEach(function (d, di) {
        (d.items || []).forEach(function (it, ii) {
          rows.items.push([
            t.name,
            String(di + 1),
            String(ii + 1),
            it.time || '',
            typeLabel(it.type),
            it.title || '',
            it.place || '',
            it.note || '',
            it.link || '',
            it.image || '',
            it.amount === '' || it.amount == null ? '' : String(it.amount),
            it.currency || '',
            joinNames(t, it.members)        // 空白代表全員一起
          ]);
        });
      });

      (t.expenses || []).forEach(function (e) {
        var allIds = (t.members || []).map(function (m) { return m.id; });
        var isAll = (e.shareIds || []).length === allIds.length &&
          allIds.every(function (id) { return (e.shareIds || []).indexOf(id) !== -1; });
        rows.expenses.push([
          t.name,
          e.date || '',
          e.title || '',
          e.note || '',
          String(e.amount == null ? '' : e.amount),
          e.currency || '',
          nameOf(t, e.payerId),
          isAll ? '' : joinNames(t, e.shareIds),   // 空白代表「全部的人」
          extrasToText(t, e.extras)
        ]);
      });

      (t.payments || []).forEach(function (p) {
        rows.payments.push([
          t.name,
          p.date || '',
          nameOf(t, p.fromId),
          nameOf(t, p.toId),
          String(p.amount == null ? '' : p.amount),
          p.currency || '',
          p.note || ''
        ]);
      });

      (t.checklist || []).forEach(function (g) {
        (g.items || []).forEach(function (it) {
          rows.checklist.push([
            t.name, g.name, g.emoji || '', it.text, it.done ? 'TRUE' : 'FALSE'
          ]);
        });
      });
    });

    return rows;
  }

  /**
   * 把四張分頁的列組回旅程資料。
   *
   * 幾個容錯設計（因為試算表可能被人或 Hermes 手動改過）：
   *   - 行程／支出／清單裡出現「旅程」分頁沒有的旅程名稱 → 自動補一趟新旅程
   *     （Hermes 常常只會新增行程列，不會去建旅程）
   *   - 出現名單上沒有的成員名字 → 自動加入成員，不會把那筆錢默默丟掉
   *   - 第幾天超出目前天數 → 自動把天數補足
   */
  function fromRows(rows) {
    rows = rows || {};
    var byName = {};
    var order = [];
    var warnings = [];

    function ensureTrip(name) {
      var key = String(name || '').trim();
      if (!key) return null;
      if (!byName[key]) {
        byName[key] = {
          id: S.uid('trip'), name: key, startDate: '', endDate: '',
          baseCurrency: 'TWD', currencies: [], members: [],
          days: [], expenses: [], payments: [], checklist: [],
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        };
        order.push(key);
      }
      return byName[key];
    }

    function ensureMember(trip, name) {
      var n = String(name || '').trim();
      if (!n) return null;
      var m = trip.members.filter(function (x) { return x.name === n; })[0];
      if (!m) {
        m = { id: S.uid('m'), name: n };
        trip.members.push(m);
        warnings.push('「' + trip.name + '」自動加入了成員「' + n + '」（試算表裡有用到，但成員名單上沒有）。');
      }
      return m;
    }

    function ensureDay(trip, n) {
      var want = Math.max(1, Number(n) || 1);
      while (trip.days.length < want) trip.days.push({ id: S.uid('d'), items: [] });
      return trip.days[want - 1];
    }

    // --- 旅程 ---
    (rows.trips || []).forEach(function (r) {
      var t = ensureTrip(r[0]);
      if (!t) return;
      t.startDate = String(r[1] || '').trim();
      t.endDate = String(r[2] || '').trim();
      t.baseCurrency = String(r[3] || 'TWD').trim() || 'TWD';
      splitList(r[4]).forEach(function (n) { ensureMember(t, n); });
      splitList(r[5]).forEach(function (pair) {
        var p = pair.split('=');
        var code = String(p[0] || '').trim().toUpperCase();
        var rate = Number(p[1]);
        if (code && rate > 0) t.currencies.push({ code: code, rate: rate });
        else if (code) warnings.push('「' + t.name + '」的匯率設定「' + pair + '」看不懂，已略過。');
      });
    });

    // --- 行程 ---
    var pending = [];
    (rows.items || []).forEach(function (r, idx) {
      var t = ensureTrip(r[0]);
      if (!t) return;
      pending.push({
        trip: t,
        day: Math.max(1, Number(r[1]) || 1),
        order: Number(r[2]) || (idx + 1) * 1000,   // 順序空白時保持試算表上的先後
        item: {
          id: S.uid('it'),
          time: String(r[3] || '').trim(),
          type: typeKey(r[4]),
          title: String(r[5] || '').trim(),
          place: String(r[6] || '').trim(),
          note: String(r[7] || '').trim(),
          link: String(r[8] || '').trim(),
          image: String(r[9] || '').trim(),
          amount: r[10] === '' || r[10] == null ? '' : Number(r[10]),
          currency: String(r[11] || '').trim(),
          memberNames: splitList(r[12])    // 稍後統一轉成成員編號
        }
      });
    });
    pending.sort(function (a, b) {
      return a.day - b.day || a.order - b.order;
    });
    pending.forEach(function (p) {
      // 參加者在試算表裡是名字，這裡轉成成員編號；空白代表全員一起
      var names = p.item.memberNames || [];
      delete p.item.memberNames;
      p.item.members = names.map(function (n) {
        var m = ensureMember(p.trip, n);
        return m && m.id;
      }).filter(Boolean);
      ensureDay(p.trip, p.day).items.push(p.item);
    });

    // --- 支出 ---
    (rows.expenses || []).forEach(function (r) {
      var t = ensureTrip(r[0]);
      if (!t) return;
      var title = String(r[2] || '').trim();
      var payer = ensureMember(t, r[6]);

      // 先處理指定項目，裡面可能帶出新的成員名字；
      // 這樣下面「分給誰留空白 = 全部的人」才會把那些人也算進去，結果不會因為列的順序而不同。
      var extras = extrasFromText(r[8], function (n) {
        var m = ensureMember(t, n);
        return m && m.id;
      }, warnings, title || '未命名');

      var names = splitList(r[7]);
      var shareIds = names.length
        ? names.map(function (n) { var m = ensureMember(t, n); return m && m.id; }).filter(Boolean)
        : t.members.map(function (m) { return m.id; });   // 空白 = 全部的人

      t.expenses.push({
        id: S.uid('e'),
        date: String(r[1] || '').trim(),
        title: title,
        note: String(r[3] || '').trim(),
        amount: Number(r[4]) || 0,
        currency: String(r[5] || '').trim() || t.baseCurrency,
        payerId: payer ? payer.id : '',
        shareIds: shareIds,
        extras: extras
      });
    });

    // --- 還款 ---
    (rows.payments || []).forEach(function (r) {
      var t = ensureTrip(r[0]);
      if (!t) return;
      var from = ensureMember(t, r[2]);
      var to = ensureMember(t, r[3]);
      if (!from || !to) {
        warnings.push('「' + t.name + '」有一筆還款沒寫清楚是誰還給誰，已略過。');
        return;
      }
      t.payments.push({
        id: S.uid('pay'),
        date: String(r[1] || '').trim(),
        fromId: from.id,
        toId: to.id,
        amount: Number(r[4]) || 0,
        currency: String(r[5] || '').trim() || t.baseCurrency,
        note: String(r[6] || '').trim()
      });
    });

    // --- 清單 ---
    (rows.checklist || []).forEach(function (r) {
      var t = ensureTrip(r[0]);
      if (!t) return;
      var gname = String(r[1] || '其他').trim();
      var g = t.checklist.filter(function (x) { return x.name === gname; })[0];
      if (!g) {
        g = { id: S.uid('g'), name: gname, emoji: String(r[2] || '').trim(), items: [] };
        t.checklist.push(g);
      }
      g.items.push({ id: S.uid('c'), text: String(r[3] || '').trim(), done: truthy(r[4]) });
    });

    var trips = order.map(function (k) { return byName[k]; });
    trips.forEach(function (t) {
      // 試算表上的行程可能排到比日期區間更後面的天數（例如改過行程但忘了改回程日）。
      // 這時要把回程日往後延，否則 migrateTrip 會依日期把多出來的天數砍掉，行程就不見了。
      extendDatesToCoverDays(t, warnings);
      S.migrateTrip(t);
    });
    return { trips: trips, warnings: warnings };
  }

  // ---------------------------------------------------------------
  // 跟 Apps Script 溝通
  // ---------------------------------------------------------------

  /**
   * 送資料給 Apps Script。
   * 刻意用 text/plain：這樣瀏覽器不會先送一個「預檢」請求，
   * 而 Apps Script 不會回應預檢請求，用 application/json 反而會失敗。
   */
  function post(body) {
    return fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    }).then(readJson);
  }

  function readJson(res) {
    if (!res.ok) throw new Error('伺服器回應 ' + res.status + '，請確認網址是否正確、部署時「誰可以存取」有沒有選「所有人」。');
    return res.text().then(function (text) {
      try {
        return JSON.parse(text);
      } catch (e) {
        if (/<html/i.test(text)) {
          throw new Error('收到的是網頁而不是資料。通常代表 Apps Script 的部署權限沒設成「所有人」，或網址貼錯了。');
        }
        throw new Error('看不懂伺服器的回應。');
      }
    });
  }

  /** 測試連線 */
  function ping() {
    return post({ action: 'ping', device: cfg.device });
  }

  /** 從雲端抓資料下來 */
  function pull() {
    if (!isOn()) return Promise.reject(new Error('還沒設定雲端同步'));
    setStatus('loading', '讀取中…');
    return fetch(cfg.url, { method: 'GET', redirect: 'follow' })
      .then(readJson)
      .then(function (res) {
        if (!res.ok) throw new Error(res.error || '讀取失敗');
        var parsed = fromRows(res.rows);
        cfg.lastUpdatedAt = res.updatedAt || '';
        saveConfig();
        setStatus('ok', '已同步');
        return { trips: parsed.trips, warnings: parsed.warnings, updatedAt: res.updatedAt, device: res.device };
      })
      .catch(function (err) {
        setStatus('error', err.message);
        throw err;
      });
  }

  /** 把本機資料整批推上雲端 */
  function push(trips) {
    if (!isOn()) return Promise.reject(new Error('還沒設定雲端同步'));
    setStatus('saving', '同步中…');
    return post({
      action: 'save',
      device: cfg.device,
      baseUpdatedAt: cfg.lastUpdatedAt,
      rows: toRows(trips)
    }).then(function (res) {
      if (res.conflict) {
        setStatus('conflict', '雲端有更新的版本');
        return { conflict: true, cloud: res.cloud, cloudDevice: res.cloudDevice, cloudUpdatedAt: res.cloudUpdatedAt };
      }
      if (!res.ok) throw new Error(res.error || '存檔失敗');
      cfg.lastUpdatedAt = res.updatedAt || '';
      saveConfig();
      setStatus('ok', '已同步');
      return { ok: true, updatedAt: res.updatedAt };
    }).catch(function (err) {
      setStatus('error', err.message);
      throw err;
    });
  }

  /** 強制覆蓋雲端（使用者在衝突視窗選「以這台為準」時用） */
  function forcePush(trips) {
    cfg.lastUpdatedAt = '';
    saveConfig();
    return push(trips);
  }

  /**
   * 改了東西之後呼叫。等幾秒沒有新的改動才真的送出，
   * 避免你每打一個字就連線一次。
   */
  function scheduleSave(delay) {
    if (!isOn()) return;
    if (saveTimer) clearTimeout(saveTimer);
    setStatus('pending', '尚未同步');
    saveTimer = setTimeout(function () {
      saveTimer = null;
      push(S.allTrips()).then(function (r) {
        if (r && r.conflict && typeof App.onCloudConflict === 'function') App.onCloudConflict(r);
        if (typeof App.onCloudStatus === 'function') App.onCloudStatus(state);
      }, function () { /* 狀態已經記在 state 裡了 */ });
    }, delay == null ? 2500 : delay);
  }

  function setStatus(status, message) {
    state.status = status;
    state.message = message || '';
    if (typeof App.onCloudStatus === 'function') App.onCloudStatus(state);
  }

  return {
    loadConfig: loadConfig, getConfig: getConfig, setConfig: setConfig,
    disable: disable, isOn: isOn, getState: getState,
    toRows: toRows, fromRows: fromRows,
    typeLabel: typeLabel, typeKey: typeKey,
    ping: ping, pull: pull, push: push, forcePush: forcePush,
    scheduleSave: scheduleSave
  };
})();
