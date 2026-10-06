/* trips.js — 「我的旅程」分頁：旅程清單、旅程設定（成員／幣別匯率）、備份還原 */
window.App = window.App || {};
App.Trips = (function () {

  var S = App.Store, U = App.UI;

  function render(view) {
    var trips = S.allTrips();
    var cur = S.currentTrip();

    view.innerHTML =
      storageNotice() +
      '<section class="block">' +
        '<div class="block-head">' +
          '<h2>我的旅程</h2>' +
          '<button class="btn btn-primary" data-act="new-trip">+ 新增旅程</button>' +
        '</div>' +
        (trips.length === 0
          ? U.empty('還沒有任何旅程。按上面的「新增旅程」開始規劃第一趟。')
          : '<div class="trip-list">' + trips.map(function (t) { return tripCard(t, cur); }).join('') + '</div>') +
      '</section>' +
      (cur ? settingsBlock(cur) : '') +
      cloudBlock() +
      backupBlock();

    view.onclick = function (e) { onClick(e, view); };
  }

  function storageNotice() {
    return '<div class="notice">' +
      '<strong>資料存在這台裝置的瀏覽器裡。</strong>' +
      '換一台裝置、或清除瀏覽器資料，這裡的內容就會不見。' +
      '請定期用下面的「下載備份檔」存一份。' +
      '</div>';
  }

  function tripCard(t, cur) {
    var days = S.dayCount(t);
    var spots = t.days.reduce(function (s, d) { return s + d.items.length; }, 0);
    var r = App.Settle.compute(t);
    var range = t.startDate && t.endDate ? t.startDate + ' ~ ' + t.endDate : '尚未設定日期';
    var done = 0, total = 0;
    t.checklist.forEach(function (g) {
      g.items.forEach(function (i) { total++; if (i.done) done++; });
    });

    return '<article class="trip-card' + (cur && cur.id === t.id ? ' is-current' : '') + '" data-trip="' + U.esc(t.id) + '">' +
      '<div class="trip-card-main" data-act="open-trip" data-trip="' + U.esc(t.id) + '">' +
        '<h3>' + U.esc(t.name) + (cur && cur.id === t.id ? '<span class="pill">目前</span>' : '') + '</h3>' +
        '<div class="trip-meta">' + U.esc(range) + ' · 共 ' + days + ' 天</div>' +
        '<div class="trip-stats">' +
          '<span>🗺 ' + spots + ' 個行程點</span>' +
          '<span>👥 ' + t.members.length + ' 人</span>' +
          '<span>💰 ' + U.money(r.totalCents, t.baseCurrency) + '</span>' +
          '<span>🎒 ' + done + '/' + total + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="trip-card-side">' +
        '<button class="icon-btn" data-act="edit-trip" data-trip="' + U.esc(t.id) + '" title="編輯名稱與日期">✏️</button>' +
        '<button class="icon-btn" data-act="del-trip" data-trip="' + U.esc(t.id) + '" title="刪除旅程">🗑</button>' +
      '</div>' +
    '</article>';
  }

  function settingsBlock(t) {
    return '<section class="block">' +
      '<div class="block-head"><h2>「' + U.esc(t.name) + '」的設定</h2></div>' +

      '<h4 class="sub">同行成員<span class="sub-hint">分帳會用到</span></h4>' +
      (t.members.length === 0
        ? U.empty('還沒有成員。至少加兩個人才能分帳。')
        : '<div class="chip-row">' + t.members.map(function (m) {
            return '<span class="chip">' + U.esc(m.name) +
              '<button class="chip-x" data-act="del-member" data-id="' + U.esc(m.id) + '" title="移除">✕</button></span>';
          }).join('') + '</div>') +
      '<button class="btn btn-ghost" data-act="add-member">+ 加入成員</button>' +

      '<h4 class="sub">幣別與匯率<span class="sub-hint">基準幣別：' + U.esc(t.baseCurrency) + '</span></h4>' +
      '<p class="muted">匯率請自己填（例如 1 日幣 = 0.21 台幣就填 0.21）。刻意不自動抓網路匯率，這樣不會因為外部服務改變而壞掉。</p>' +
      (t.currencies.length === 0
        ? U.empty('目前只用 ' + t.baseCurrency + '。要記外幣支出的話，先在這裡加一個幣別。')
        : '<table class="table"><thead><tr><th>幣別</th><th>1 單位 = 多少 ' + U.esc(t.baseCurrency) + '</th><th></th></tr></thead><tbody>' +
          t.currencies.map(function (c) {
            return '<tr><td><strong>' + U.esc(c.code) + '</strong></td><td>' + U.esc(c.rate) + '</td>' +
              '<td class="right"><button class="icon-btn" data-act="edit-cur" data-code="' + U.esc(c.code) + '">✏️</button>' +
              '<button class="icon-btn" data-act="del-cur" data-code="' + U.esc(c.code) + '">🗑</button></td></tr>';
          }).join('') + '</tbody></table>') +
      '<button class="btn btn-ghost" data-act="add-cur">+ 加入幣別</button>' +

      '<h4 class="sub">基準幣別</h4>' +
      '<button class="btn btn-ghost" data-act="edit-base">改成別的幣別（目前 ' + U.esc(t.baseCurrency) + '）</button>' +
    '</section>';
  }

  function cloudBlock() {
    var C = App.Cloud;
    var cfg = C.getConfig();
    var on = C.isOn();

    return '<section class="block">' +
      '<div class="block-head"><h2>雲端同步<span class="count">' + (on ? '已開啟' : '未開啟') + '</span></h2></div>' +
      (on
        ? '<p class="muted">這台裝置會自動跟你的 Google 試算表同步，手機和電腦看到的是同一份資料。' +
            '這台裝置顯示的名稱是「' + U.esc(cfg.device) + '」。</p>' +
          '<div class="btn-row">' +
            '<button class="btn btn-primary" data-act="cloud-pull">⬇ 從雲端重新讀取</button>' +
            '<button class="btn btn-ghost" data-act="cloud-push">⬆ 立即上傳</button>' +
            '<button class="btn btn-ghost" data-act="cloud-edit">修改設定</button>' +
            '<button class="btn btn-ghost" data-act="cloud-off">關閉同步</button>' +
          '</div>' +
          '<div class="notice">⚠️ 這個做法沒有帳號登入，安全性靠「那串網址很難猜」。' +
            '行程、花費、打包清單放進去沒問題，<strong>但不要填護照號碼、信用卡號、訂房密碼</strong>。</div>'
        : '<p class="muted">開啟之後，手機和電腦就能接續編輯同一份資料。資料會存在你自己的 Google 試算表裡，你隨時打開就看得到。</p>' +
          '<div class="btn-row">' +
            '<button class="btn btn-primary" data-act="cloud-edit">設定雲端同步</button>' +
            '<button class="btn btn-ghost" data-act="cloud-help">怎麼設定？</button>' +
          '</div>') +
    '</section>';
  }

  function backupBlock() {
    return '<section class="block">' +
      '<div class="block-head"><h2>備份與還原</h2></div>' +
      '<p class="muted">備份檔是一個 .json 檔，可以存到雲端硬碟、或傳給同行的人讓他們匯入。</p>' +
      '<div class="btn-row">' +
        '<button class="btn btn-primary" data-act="export">⬇ 下載備份檔</button>' +
        '<button class="btn btn-ghost" data-act="import">⬆ 從備份檔還原</button>' +
      '</div>' +
    '</section>';
  }

  // ---------------------------------------------------------------
  function onClick(e, view) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    var t = S.currentTrip();

    if (act === 'new-trip') return editTrip(null);
    if (act === 'edit-trip') return editTrip(S.getTrip(btn.getAttribute('data-trip')));
    if (act === 'open-trip') {
      S.setCurrentTrip(btn.getAttribute('data-trip'));
      return App.go('itinerary');
    }
    if (act === 'del-trip') {
      var target = S.getTrip(btn.getAttribute('data-trip'));
      if (!target) return;
      if (U.ask('確定要刪除「' + target.name + '」嗎？\n行程、分帳、打包清單都會一起消失，而且無法復原。')) {
        S.deleteTrip(target.id);
        U.toast('已刪除');
        App.render();
      }
      return;
    }
    if (act === 'add-member') return addMember(t);
    if (act === 'del-member') return delMember(t, btn.getAttribute('data-id'));
    if (act === 'add-cur') return editCurrency(t, null);
    if (act === 'edit-cur') return editCurrency(t, btn.getAttribute('data-code'));
    if (act === 'del-cur') return delCurrency(t, btn.getAttribute('data-code'));
    if (act === 'edit-base') return editBase(t);
    if (act === 'export') return doExport();
    if (act === 'import') return doImport();
    if (act === 'cloud-edit') return editCloud();
    if (act === 'cloud-off') return offCloud();
    if (act === 'cloud-pull') return pullCloud();
    if (act === 'cloud-push') return pushCloud();
    if (act === 'cloud-help') return helpCloud();
  }

  // ---- 雲端同步 ----
  function editCloud() {
    var cfg = App.Cloud.getConfig();
    U.modal({
      title: '雲端同步設定',
      submitText: '測試連線並儲存',
      fields: [
        {
          name: 'url', label: 'Apps Script 網頁應用程式網址', required: true, value: cfg.url,
          placeholder: 'https://script.google.com/macros/s/.../exec',
          hint: '還沒有這串網址的話，先按上一頁的「怎麼設定？」照步驟做一次。'
        },
        {
          name: 'device', label: '這台裝置叫什麼', value: cfg.device, placeholder: '例如：公司電腦、我的手機',
          hint: '兩邊資料不一樣時，會用這個名稱告訴你是哪一台改的。'
        }
      ]
    }).then(function (v) {
      if (!v) return;
      if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(v.url.trim())) {
        if (!U.ask('這串網址看起來不像 Apps Script 的網頁應用程式網址。\n正常應該長得像 https://script.google.com/macros/s/.../exec\n\n還是要繼續嗎？')) return;
      }
      App.Cloud.setConfig(v.url, v.device);
      U.toast('測試連線中…');
      App.Cloud.ping().then(function (res) {
        if (!res.ok) throw new Error(res.error || '試算表沒有正常回應');
        U.toast('連線成功！');
        App.render();
        // 設定完立刻做一次同步，讓兩邊對齊
        if (typeof App.syncAfterSetup === 'function') App.syncAfterSetup();
      }, function (err) {
        App.Cloud.disable();
        U.modal({
          title: '連線失敗',
          submitText: '知道了',
          fields: [{
            name: '_n', type: 'note', label: '',
            hint: err.message + '\n\n常見原因：\n' +
              '1. 部署時「誰可以存取」沒有選「所有人」\n' +
              '2. 複製到的是編輯器網址，不是「網頁應用程式」網址（結尾要是 /exec）\n' +
              '3. 改過 Apps Script 程式後沒有重新部署新版本'
          }]
        });
        App.render();
      });
    });
  }

  function offCloud() {
    if (!U.ask('要關閉雲端同步嗎？\n資料會留在這台裝置和試算表裡，只是不再自動同步。')) return;
    App.Cloud.disable();
    U.toast('已關閉雲端同步');
    App.render();
  }

  function pullCloud() {
    if (!U.ask('要用雲端的版本覆蓋這台裝置嗎？\n這台裝置上還沒上傳的改動會不見。\n\n不確定的話，建議先下載一份備份檔。')) return;
    App.Cloud.pull().then(function (res) {
      S.replaceAll(res.trips, S.currentTrip() ? S.currentTrip().name : '');
      res.warnings.slice(0, 3).forEach(function (w) { U.toast(w, 'bad'); });
      U.toast('已讀取 ' + res.trips.length + ' 趟旅程');
      App.render();
    }, function (err) {
      U.toast('讀取失敗：' + err.message, 'bad');
    });
  }

  function pushCloud() {
    App.Cloud.push(S.allTrips()).then(function (r) {
      if (r && r.conflict) {
        if (typeof App.onCloudConflict === 'function') App.onCloudConflict(r);
        return;
      }
      U.toast('已上傳到雲端');
      App.render();
    }, function (err) {
      U.toast('上傳失敗：' + err.message, 'bad');
    });
  }

  function helpCloud() {
    U.modal({
      title: '怎麼設定雲端同步',
      submitText: '知道了',
      fields: [{
        name: '_n', type: 'note', label: '',
        hint: '完整的圖文步驟在專案的 docs/setup-google-sheets.md，大約 10 分鐘、只要做一次。\n\n' +
          '簡要流程：\n' +
          '1. 建一個新的 Google 試算表\n' +
          '2. 選單「擴充功能 → Apps Script」\n' +
          '3. 把專案裡 apps-script/Code.gs 的內容整個貼進去，存檔\n' +
          '4. 按「部署 → 新增部署作業 → 網頁應用程式」\n' +
          '5. 「執行身分」選自己，「誰可以存取」選「所有人」\n' +
          '6. 複製那串以 /exec 結尾的網址，回來貼進設定\n\n' +
          '中間 Google 會跳出「這個應用程式未經驗證」的警告，那是你自己寫的程式，按「進階 → 繼續前往」即可。'
      }]
    });
  }

  function editTrip(trip) {
    var isNew = !trip;
    U.modal({
      title: isNew ? '新增旅程' : '編輯旅程',
      submitText: isNew ? '建立' : '儲存',
      fields: [
        { name: 'name', label: '旅程名稱', required: true, value: trip ? trip.name : '', placeholder: '例如：2026 日本關西 5 天' },
        { name: 'startDate', label: '出發日期', type: 'date', value: trip ? trip.startDate : '' },
        { name: 'endDate', label: '回程日期', type: 'date', value: trip ? trip.endDate : '', hint: '天數會依這兩個日期自動產生' }
      ],
      validate: function (v) {
        if (v.startDate && v.endDate && v.endDate < v.startDate) return '回程日期不能早於出發日期';
        return null;
      }
    }).then(function (v) {
      if (!v) return;
      if (isNew) {
        S.createTrip(v.name, v.startDate, v.endDate);
        U.toast('旅程已建立');
        App.go('itinerary');
        return;
      }
      trip.name = v.name;
      trip.startDate = v.startDate;
      trip.endDate = v.endDate;
      var dropped = S.syncDays(trip);
      S.touch(trip);
      if (dropped.length) {
        U.toast('天數變少了，有 ' + dropped.length + ' 天的行程被移除', 'bad');
      }
      App.render();
    });
  }

  function addMember(t) {
    if (!t) return;
    U.modal({
      title: '加入成員',
      submitText: '加入',
      fields: [{ name: 'name', label: '名字', required: true, placeholder: '例如：小明' }],
      validate: function (v) {
        if (t.members.some(function (m) { return m.name === v.name; })) return '已經有同名的成員了';
        return null;
      }
    }).then(function (v) {
      if (!v) return;
      t.members.push({ id: S.uid('m'), name: v.name });
      S.touch(t);
      App.render();
    });
  }

  function delMember(t, id) {
    if (!t) return;
    var m = t.members.filter(function (x) { return x.id === id; })[0];
    if (!m) return;
    var used = t.expenses.filter(function (e) {
      return e.payerId === id || (e.shareIds || []).indexOf(id) !== -1;
    }).length;
    var msg = '確定要移除「' + m.name + '」嗎？';
    if (used) msg += '\n\n注意：有 ' + used + ' 筆支出跟這個人有關，移除後那些支出會從結算中被排除。';
    if (!U.ask(msg)) return;
    t.members = t.members.filter(function (x) { return x.id !== id; });
    S.touch(t);
    App.render();
  }

  function editCurrency(t, code) {
    if (!t) return;
    var cur = code ? t.currencies.filter(function (c) { return c.code === code; })[0] : null;
    U.modal({
      title: cur ? '編輯幣別' : '加入幣別',
      submitText: '儲存',
      fields: [
        { name: 'code', label: '幣別代碼', required: true, value: cur ? cur.code : '', placeholder: '例如：JPY、USD、KRW' },
        { name: 'rate', label: '1 單位等於多少 ' + t.baseCurrency, type: 'number', required: true, value: cur ? cur.rate : '', hint: '例如 1 日幣 ≈ 0.21 台幣，就填 0.21' }
      ],
      validate: function (v) {
        var newCode = v.code.toUpperCase();
        if (!(Number(v.rate) > 0)) return '匯率要大於 0';
        if (newCode === t.baseCurrency) return '這就是基準幣別，不用另外設定';
        if (newCode !== code && t.currencies.some(function (c) { return c.code === newCode; })) {
          return '這個幣別已經設定過了';
        }
        return null;
      }
    }).then(function (v) {
      if (!v) return;
      var newCode = v.code.toUpperCase();
      var rate = Number(v.rate);
      if (cur) {
        // 幣別代碼改了的話，既有支出要跟著改，否則那些支出會查不到匯率
        if (newCode !== cur.code) {
          t.expenses.forEach(function (e) { if (e.currency === cur.code) e.currency = newCode; });
        }
        cur.code = newCode;
        cur.rate = rate;
      } else {
        t.currencies.push({ code: newCode, rate: rate });
      }
      S.touch(t);
      App.render();
    });
  }

  function delCurrency(t, code) {
    if (!t) return;
    var used = t.expenses.filter(function (e) { return e.currency === code; }).length;
    var msg = '確定要移除幣別 ' + code + ' 嗎？';
    if (used) msg += '\n\n注意：有 ' + used + ' 筆支出是用這個幣別記的，移除後那些支出會算不出正確金額。';
    if (!U.ask(msg)) return;
    t.currencies = t.currencies.filter(function (c) { return c.code !== code; });
    S.touch(t);
    App.render();
  }

  function editBase(t) {
    if (!t) return;
    U.modal({
      title: '改變基準幣別',
      submitText: '儲存',
      fields: [{
        name: 'code', label: '基準幣別代碼', required: true, value: t.baseCurrency,
        hint: '這是結算結果顯示的幣別。改了之後，原本用舊基準幣別記的支出要自己重新確認匯率。'
      }]
    }).then(function (v) {
      if (!v) return;
      var code = v.code.toUpperCase();
      if (code === t.baseCurrency) return;
      t.baseCurrency = code;
      t.currencies = t.currencies.filter(function (c) { return c.code !== code; });
      S.touch(t);
      U.toast('基準幣別已改為 ' + code);
      App.render();
    });
  }

  function doExport() {
    var stamp = new Date().toISOString().slice(0, 10);
    U.downloadText('旅遊規劃備份-' + stamp + '.json', S.exportAll());
    U.toast('備份檔已下載');
  }

  function doImport() {
    U.pickTextFile().then(function (text) {
      if (!text) return;
      var mode = S.allTrips().length === 0 ? 'replace' : null;
      if (mode === null) {
        mode = U.ask('要「保留」目前的旅程，把備份檔的內容加進來嗎？\n\n按「確定」＝ 保留現有的，額外加入\n按「取消」＝ 清掉現有的，整個換成備份檔')
          ? 'merge' : 'replace';
        if (mode === 'replace' && !U.ask('再確認一次：目前所有旅程都會被刪除，換成備份檔的內容。確定嗎？')) return;
      }
      try {
        var n = S.importAll(text, mode);
        U.toast('已匯入 ' + n + ' 趟旅程');
        App.render();
      } catch (err) {
        U.toast('匯入失敗：' + err.message, 'bad');
      }
    });
  }

  return { render: render };
})();
