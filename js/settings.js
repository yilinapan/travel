/* settings.js — 設定面板：雲端同步、備份與還原
 * 這些是「偶爾才會動」的功能，收在這裡，讓主要畫面保持乾淨。
 */
window.App = window.App || {};
App.Settings = (function () {

  var S = App.Store, U = App.UI;
  var panel = null;

  function open() {
    close();
    panel = U.el(
      '<div class="modal-back">' +
        '<div class="modal modal-wide">' +
          '<div class="modal-head"><h3>設定</h3><button class="icon-btn" data-act="close" title="關閉" aria-label="關閉">' + U.icon('close') + '</button></div>' +
          '<div class="modal-body" id="settingsBody"></div>' +
          '<div class="modal-foot"><span class="spacer"></span><button class="btn btn-ghost" data-act="close">關閉</button></div>' +
        '</div>' +
      '</div>'
    );
    panel.addEventListener('click', function (e) {
      if (e.target === panel) return close();
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'close') return close();
      handle(act);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(panel);
    paint();
  }

  function onKey(e) { if (e.key === 'Escape') close(); }

  function close() {
    document.removeEventListener('keydown', onKey);
    if (panel) { panel.remove(); panel = null; }
  }

  /** 設定面板開著的時候，內容有變就重畫 */
  function refresh() { if (panel) paint(); }

  function paint() {
    panel.querySelector('#settingsBody').innerHTML =
      cloudSection() + backupSection() + helpSection();
  }

  function helpSection() {
    return '<section class="set-sec">' +
      '<h4 class="set-title">使用說明</h4>' +
      '<p class="muted">四個分頁怎麼用、分帳的進階功能、怎麼分享給同行的人。</p>' +
      '<div class="btn-row">' +
        '<a class="btn btn-ghost" href="guide.html">打開使用說明</a>' +
      '</div>' +
    '</section>';
  }

  // ---------------------------------------------------------------
  function cloudSection() {
    var C = App.Cloud;
    var cfg = C.getConfig();
    var on = C.isOn();

    return '<section class="set-sec">' +
      '<h4 class="set-title">雲端同步<span class="pill-sm' + (on ? ' on' : '') + '">' + (on ? '已開啟' : '未開啟') + '</span></h4>' +
      (on
        ? '<p class="muted">這台裝置會自動跟你的 Google 試算表同步，手機和電腦看到的是同一份資料。這台顯示的名稱是「' + U.esc(cfg.device) + '」。</p>' +
          '<div class="btn-row">' +
            '<button class="btn btn-primary" data-act="cloud-pull">' + U.icon('download', 15) + ' 從雲端重新讀取</button>' +
            '<button class="btn btn-ghost" data-act="cloud-push">' + U.icon('upload', 15) + ' 立即上傳</button>' +
            '<button class="btn btn-ghost" data-act="cloud-edit">修改設定</button>' +
            '<button class="btn btn-ghost" data-act="cloud-off">關閉同步</button>' +
          '</div>' +
          '<div class="notice notice-warn">沒有帳號登入，安全性靠「那串網址很難猜」。' +
            '行程、花費、打包清單放進去沒問題，<strong>但不要填護照號碼、信用卡號、訂房密碼</strong>。</div>'
        : '<p class="muted">開啟之後，手機和電腦就能接續編輯同一份資料。資料存在你自己的 Google 試算表裡，你隨時打開就看得到。設定一次約 10 分鐘。</p>' +
          '<div class="btn-row">' +
            '<button class="btn btn-primary" data-act="cloud-edit">設定雲端同步</button>' +
            '<button class="btn btn-ghost" data-act="cloud-help">怎麼設定？</button>' +
          '</div>') +
    '</section>';
  }

  function backupSection() {
    return '<section class="set-sec">' +
      '<h4 class="set-title">備份與還原</h4>' +
      '<p class="muted">備份檔是一個 .json 檔，可以存到雲端硬碟，也可以傳給同行的人讓他們匯入。' +
        '沒開雲端同步的話，<strong>請定期備份</strong> —— 清除瀏覽器資料就會把旅程一起清掉。</p>' +
      '<div class="btn-row">' +
        '<button class="btn btn-primary" data-act="export">' + U.icon('download', 15) + ' 下載備份檔</button>' +
        '<button class="btn btn-ghost" data-act="import">' + U.icon('upload', 15) + ' 從備份檔還原</button>' +
      '</div>' +
    '</section>';
  }

  // ---------------------------------------------------------------
  function handle(act) {
    if (act === 'export') return doExport();
    if (act === 'import') return doImport();
    if (act === 'cloud-edit') return editCloud();
    if (act === 'cloud-off') return offCloud();
    if (act === 'cloud-pull') return pullCloud();
    if (act === 'cloud-push') return pushCloud();
    if (act === 'cloud-help') return helpCloud();
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
        refresh();
      } catch (err) {
        U.toast('匯入失敗：' + err.message, 'bad');
      }
    });
  }

  // ---- 雲端 ----
  function editCloud() {
    var cfg = App.Cloud.getConfig();
    U.modal({
      title: '雲端同步設定',
      submitText: '測試連線並儲存',
      fields: [
        {
          name: 'url', label: 'Apps Script 網頁應用程式網址', required: true, value: cfg.url,
          placeholder: 'https://script.google.com/macros/s/.../exec',
          hint: '還沒有這串網址的話，先按「怎麼設定？」照步驟做一次。'
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
        refresh();
        if (typeof App.syncAfterSetup === 'function') App.syncAfterSetup();
      }, function (err) {
        App.Cloud.disable();
        App.render();
        refresh();
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
      });
    });
  }

  function offCloud() {
    if (!U.ask('要關閉雲端同步嗎？\n資料會留在這台裝置和試算表裡，只是不再自動同步。')) return;
    App.Cloud.disable();
    U.toast('已關閉雲端同步');
    App.render();
    refresh();
  }

  function pullCloud() {
    if (!U.ask('要用雲端的版本覆蓋這台裝置嗎？\n這台裝置上還沒上傳的改動會不見。\n\n不確定的話，建議先下載一份備份檔。')) return;
    App.Cloud.pull().then(function (res) {
      S.replaceAll(res.trips, S.currentTrip() ? S.currentTrip().name : '');
      res.warnings.slice(0, 3).forEach(function (w) { U.toast(w, 'bad'); });
      U.toast('已讀取 ' + res.trips.length + ' 趟旅程');
      App.render();
      refresh();
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
        hint: '完整圖文步驟在專案的 docs/setup-google-sheets.md，約 10 分鐘、只要做一次。\n\n' +
          '簡要流程：\n' +
          '1. 建一個新的 Google 試算表\n' +
          '2. 選單「擴充功能 → Apps Script」\n' +
          '3. 把專案裡 apps-script/Code.gs 的內容整個貼進去，存檔\n' +
          '4. 按「部署 → 新增部署作業 → 網頁應用程式」\n' +
          '5. 「執行身分」選自己，「誰可以存取」選「所有人」\n' +
          '6. 複製那串以 /exec 結尾的網址，回來貼進設定\n\n' +
          '中間 Google 會跳出「這個應用程式未經驗證」的警告 —— 那是你自己寫的程式，按「進階 → 繼續前往」即可。'
      }]
    });
  }

  return { open: open, close: close, refresh: refresh };
})();
