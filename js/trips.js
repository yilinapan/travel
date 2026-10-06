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
      ]
    }).then(function (v) {
      if (!v) return;
      if (v.startDate && v.endDate && v.endDate < v.startDate) {
        return U.toast('回程日期不能早於出發日期', 'bad');
      }
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
      fields: [{ name: 'name', label: '名字', required: true, placeholder: '例如：小明' }]
    }).then(function (v) {
      if (!v) return;
      if (t.members.some(function (m) { return m.name === v.name; })) {
        return U.toast('已經有同名的成員了', 'bad');
      }
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
      ]
    }).then(function (v) {
      if (!v) return;
      var newCode = v.code.toUpperCase();
      var rate = Number(v.rate);
      if (!(rate > 0)) return U.toast('匯率要大於 0', 'bad');
      if (newCode === t.baseCurrency) return U.toast('這就是基準幣別，不用另外設定', 'bad');
      if (newCode !== code && t.currencies.some(function (c) { return c.code === newCode; })) {
        return U.toast('這個幣別已經設定過了', 'bad');
      }
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
