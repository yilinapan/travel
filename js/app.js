/* app.js — 整個網頁的起點：分頁切換、分享、唯讀模式 */
window.App = window.App || {};
(function () {

  var S = App.Store, U = App.UI;

  var TABS = [
    { key: 'trips', label: '旅程' },
    { key: 'itinerary', label: '行程' },
    { key: 'expenses', label: '分帳' },
    { key: 'checklist', label: '打包' }
  ];

  var current = 'trips';
  var sharedTrip = null;      // 從分享連結讀到的旅程（唯讀）
  var readOnly = false;

  function activeTrip() {
    return readOnly ? sharedTrip : S.currentTrip();
  }

  function go(tab) {
    current = tab;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function render() {
    renderHeader();
    renderTabs();
    var view = document.getElementById('view');
    var trip = activeTrip();

    if (current === 'trips') App.Trips.render(view);
    else if (current === 'itinerary') App.Itinerary.render(view, trip, readOnly);
    else if (current === 'expenses') App.Expenses.render(view, trip, readOnly);
    else if (current === 'checklist') App.Checklist.render(view, trip, readOnly);
  }

  function renderHeader() {
    var trip = activeTrip();
    var acts = document.getElementById('headerActions');

    document.getElementById('headerEyebrow').textContent = trip ? 'Trip' : '旅遊規劃';
    document.getElementById('headerTitle').textContent = trip ? trip.name : '旅遊規劃';
    document.getElementById('headerMeta').innerHTML = trip ? metaHtml(trip) : '';

    if (readOnly) {
      // 唯讀模式只有一個動作，而且是主要動作，直接顯示不用收起來
      acts.innerHTML = '<button class="tool-solo" data-act="adopt">' +
        U.icon('download', 17) + '存一份到我的裝置</button>';
    } else {
      // 這三個是偶爾才用的，平常收成右下角一顆小鈕，不佔畫面
      var items =
        (trip ? '<button class="tool-item" data-act="share">' + U.icon('share', 16) + '分享</button>' : '') +
        (App.Cloud.isOn() ? '<button class="tool-item" data-act="sync">' + U.icon('sync', 16) + '同步</button>' : '') +
        '<button class="tool-item" data-act="settings">' + U.icon('gear', 16) + '設定</button>';
      acts.innerHTML =
        '<div class="tool-menu" id="toolMenu" hidden>' + items + '</div>' +
        '<button class="tool-btn" data-act="more" aria-label="更多工具" aria-expanded="false">' +
          '<span class="tool-dots">⋯</span></button>';
    }
    renderSyncStatus();
    renderFootNote();
  }

  /* ---- 右下角的工具小鈕 ---- */
  function toolMenu() { return document.getElementById('toolMenu'); }

  function toggleTools() {
    var m = toolMenu();
    if (!m) return;
    var open = m.hidden;
    m.hidden = !open;
    var btn = document.querySelector('.tool-btn');
    if (btn) btn.setAttribute('aria-expanded', String(open));
  }

  function closeTools() {
    var m = toolMenu();
    if (m) m.hidden = true;
    var btn = document.querySelector('.tool-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  // 點畫面其他地方、或按 Esc，就把它收起來
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('#headerActions')) closeTools();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeTools(); });

  /** 頁首那一行摘要：日期、天數、人數、總支出 */
  function metaHtml(trip) {
    var r = App.Settle.compute(trip);
    var parts = [];
    if (trip.startDate && trip.endDate) {
      parts.push(U.esc(trip.startDate.replace(/-/g, '.') + ' — ' + trip.endDate.slice(5).replace('-', '.')));
    }
    parts.push('<b>' + S.dayCount(trip) + '</b> 天');
    if (trip.members.length) parts.push('<b>' + trip.members.length + '</b> 人');
    if (r.totalCents) parts.push('<b>' + U.money(r.totalCents, '') + '</b> ' + U.esc(trip.baseCurrency));
    return parts.map(function (p) { return '<span>' + p + '</span>'; }).join('');
  }

  /** 頁尾：一句話帶過，細節收在說明圓圈裡 */
  function renderFootNote() {
    var box = document.getElementById('footNote');
    if (!box) return;
    if (App.Cloud.isOn()) {
      box.innerHTML = '資料同步在你的 Google 試算表' +
        U.hint('這台裝置會自動跟你的 Google 試算表同步，手機和電腦看到同一份資料。' +
               '沒有網路時仍可離線使用，連上後會再同步回去。' +
               '想多一層保險的話，可以到設定裡下載備份檔。');
    } else {
      box.innerHTML = '資料只存在這台裝置' +
        U.hint('資料存在你這台裝置的瀏覽器裡，不會上傳到任何伺服器。' +
               '換一台裝置、或清除瀏覽器資料，內容就會不見。' +
               '請到下方的「設定」開啟雲端同步，或定期下載備份檔。');
    }
  }

  var SYNC_TEXT = {
    off: '', idle: '雲端同步已開啟', loading: '讀取中…', saving: '同步中…',
    pending: '尚未同步', ok: '已同步 ✓', error: '同步失敗', conflict: '雲端有更新的版本'
  };

  function renderSyncStatus() {
    var box = document.getElementById('syncStatus');
    if (!box) return;
    var st = App.Cloud.getState();
    if (readOnly || !App.Cloud.isOn()) { box.hidden = true; return; }
    box.hidden = false;
    box.className = 'sync-status sync-' + st.status;
    box.textContent = SYNC_TEXT[st.status] || '';
    box.title = st.message || '';
  }

  function renderTabs() {
    var nav = document.getElementById('tabs');
    var tabs = readOnly ? TABS.filter(function (t) { return t.key !== 'trips'; }) : TABS;
    nav.innerHTML = tabs.map(function (t) {
      return '<button class="tab' + (t.key === current ? ' on' : '') + '" data-tab="' + t.key + '">' +
        t.label + '</button>';
    }).join('');
  }

  // ---------------------------------------------------------------
  function share() {
    var trip = S.currentTrip();
    if (!trip) return;
    App.Share.makeUrl(trip).then(function (url) {
      var warn = url.length > 8000
        ? '<div class="notice notice-warn">這趟行程的內容比較多，連結非常長。部分通訊軟體可能會截斷它。真的太長的話，建議改用「備份檔」傳給同行的人。</div>'
        : '';
      var box = U.el(
        '<div class="modal-back">' +
          '<div class="modal">' +
            '<div class="modal-head"><h3>分享這趟行程</h3><button class="icon-btn" data-act="x">✕</button></div>' +
            '<div class="modal-body">' +
              '<p class="muted">把下面這串網址傳給同行的人，他們點開就能看到<strong>行程</strong>和<strong>自己的分帳金額</strong>（不能修改）。</p>' +
              warn +
              '<textarea class="share-url" readonly rows="4"></textarea>' +
              '<div class="notice">' +
                '<strong>這是當下的快照。</strong>之後你改了行程，要再產生一次新的連結傳給大家。<br>' +
                '網址 # 後面的內容不會傳到任何伺服器，連 GitHub 都看不到你的行程內容。' +
              '</div>' +
            '</div>' +
            '<div class="modal-foot"><span class="spacer"></span>' +
              '<button class="btn btn-ghost" data-act="x">關閉</button>' +
              '<button class="btn btn-primary" data-act="copy">複製連結</button>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
      box.querySelector('.share-url').value = url;
      box.addEventListener('click', function (e) {
        var a = e.target.getAttribute && e.target.getAttribute('data-act');
        if (e.target === box || a === 'x') box.remove();
        if (a === 'copy') {
          U.copyText(url).then(function () {
            U.toast('連結已複製');
          }, function () {
            U.toast('複製失敗，請手動選取上面的文字', 'bad');
          });
        }
      });
      document.body.appendChild(box);
      box.querySelector('.share-url').select();
    }, function (err) {
      U.toast('產生連結失敗：' + err.message, 'bad');
    });
  }

  function adopt() {
    if (!sharedTrip) return;
    if (!U.ask('要把「' + sharedTrip.name + '」複製一份到這台裝置嗎？\n複製後就能自己編輯，不會影響分享你的人。')) return;
    S.adoptTrip(sharedTrip);
    location.hash = '';
    location.reload();
  }

  // ---------------------------------------------------------------
  /** 雲端狀態變了就更新畫面上的小字 */
  App.onCloudStatus = function () {
    renderSyncStatus();
    if (App.Settings) App.Settings.refresh();
  };

  /**
   * 自動同步時發現雲端有更新的版本。
   * 絕對不自己決定留哪一份 —— 問清楚，而且先幫使用者備份。
   */
  App.onCloudConflict = function (info) {
    U.modal({
      title: '兩邊的資料不一樣',
      submitText: '用雲端的版本（放棄這台的改動）',
      danger: '用這台的版本（覆蓋雲端）',
      fields: [{
        name: '_note', label: '', type: 'note',
        hint: '雲端上的資料是「' + (info.cloudDevice || '另一台裝置') + '」在你之後改的。' +
          '兩邊都有改動，必須選一邊。建議先關掉這個視窗，到「我的旅程」下載一份備份檔再決定。'
      }]
    }).then(function (r) {
      if (!r) return;
      if (r.__danger) {
        App.Cloud.forcePush(S.allTrips()).then(function () {
          U.toast('已用這台的版本覆蓋雲端');
          render();
        }, function (e) { U.toast('覆蓋失敗：' + e.message, 'bad'); });
        return;
      }
      applyCloudTrips(info.cloud && info.cloud.rows);
    });
  };

  /** 把雲端抓到的資料套用到本機 */
  function applyCloudTrips(rows) {
    if (!rows) return;
    var parsed = App.Cloud.fromRows(rows);
    var keep = S.currentTrip() ? S.currentTrip().name : '';
    S.replaceAll(parsed.trips, keep);
    parsed.warnings.slice(0, 3).forEach(function (w) { U.toast(w, 'bad'); });
    U.toast('已套用雲端的版本');
    render();
  }

  function syncNow() {
    if (!App.Cloud.isOn()) return;
    App.Cloud.push(S.allTrips()).then(function (r) {
      if (r && r.conflict) return App.onCloudConflict(r);
      U.toast('已同步到雲端');
    }, function (e) {
      U.toast('同步失敗：' + e.message, 'bad');
    });
  }

  function boot() {
    S.load();
    App.Cloud.loadConfig();

    document.getElementById('tabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]');
      if (b) go(b.getAttribute('data-tab'));
    });
    document.getElementById('headerActions').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'share') share();
      if (act === 'adopt') adopt();
      if (act === 'more') return toggleTools();
      closeTools();
      if (act === 'sync') syncNow();
      if (act === 'settings') App.Settings.open();
    });

    App.Share.readFromUrl().then(function (trip) {
      if (trip) {
        sharedTrip = trip;
        readOnly = true;
        current = 'itinerary';
        document.getElementById('readonlyBar').hidden = false;
        document.getElementById('readonlyName').textContent = trip.name;
        render();
        return;
      }
      if (S.currentTrip()) current = 'itinerary';
      render();
      // 開啟網頁時先把雲端最新的資料抓下來
      if (App.Cloud.isOn()) pullOnStart();
    }, function (err) {
      U.toast('這個分享連結讀不出來：' + err.message, 'bad');
      render();
    });
  }

  /**
   * 啟動時從雲端讀取。
   * 如果這台裝置上有「還沒傳上去」的改動，不會直接蓋掉 —— 會先問。
   */
  function pullOnStart() {
    // 這台裝置有資料、但從來沒跟雲端同步過 —— 代表是接上雲端之前就存在的資料
    var neverSynced = !App.Cloud.getConfig().lastUpdatedAt;
    var localBefore = S.allTrips().slice();

    App.Cloud.pull().then(function (res) {
      var cloudCount = res.trips.length;

      if (localBefore.length > 0 && cloudCount === 0) {
        if (U.ask('雲端上還沒有任何資料，要把這台裝置的 ' + localBefore.length + ' 趟旅程上傳嗎？')) {
          syncNow();
        }
        return;
      }
      if (cloudCount === 0) return;

      // 兩邊都有資料、而且這台還沒同步過 → 不可以直接覆蓋，要問
      if (neverSynced && localBefore.length > 0) {
        return askFirstMerge(localBefore, res);
      }

      S.replaceAll(res.trips, S.currentTrip() ? S.currentTrip().name : '');
      res.warnings.slice(0, 3).forEach(function (w) { U.toast(w, 'bad'); });
      render();
    }, function (err) {
      U.toast('讀取雲端資料失敗：' + err.message + '（仍可離線使用）', 'bad');
    });
  }

  /** 第一次連上雲端，但兩邊都已經有資料時，讓使用者決定怎麼處理 */
  function askFirstMerge(localTrips, res) {
    U.modal({
      title: '這台裝置和雲端都有資料',
      submitText: '兩邊都保留（建議）',
      danger: '只留雲端的',
      fields: [{
        name: '_note', type: 'note', label: '',
        hint: '這台裝置上有 ' + localTrips.length + ' 趟旅程，雲端上有 ' + res.trips.length + ' 趟。\n' +
          '「兩邊都保留」會把這台的旅程加到雲端去；名稱重複的會自動加上「(這台)」以免混淆。\n' +
          '「只留雲端的」會刪掉這台裝置上的旅程，無法復原。'
      }]
    }).then(function (r) {
      if (!r) {
        U.toast('先不處理。在你做出選擇之前，不會自動同步。', 'bad');
        return;
      }
      if (r.__danger) {
        if (!U.ask('確定要刪掉這台裝置上的 ' + localTrips.length + ' 趟旅程嗎？無法復原。')) return;
        S.replaceAll(res.trips, '');
        U.toast('已改用雲端的版本');
        render();
        return;
      }
      // 合併：雲端的在前，本機的接在後面，名稱衝突就加註記
      var cloudNames = res.trips.map(function (t) { return t.name; });
      localTrips.forEach(function (t) {
        if (cloudNames.indexOf(t.name) !== -1) t.name = t.name + '（這台）';
        cloudNames.push(t.name);
      });
      S.replaceAll(res.trips.concat(localTrips), '');
      syncNow();
    });
  }

  App.render = render;
  App.go = go;
  App.isReadOnly = function () { return readOnly; };
  // 剛設定完雲端時呼叫：跟啟動時一樣的流程（兩邊都有資料會先問過再處理）
  App.syncAfterSetup = pullOnStart;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
