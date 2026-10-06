/* app.js — 整個網頁的起點：分頁切換、分享、唯讀模式 */
window.App = window.App || {};
(function () {

  var S = App.Store, U = App.UI;

  var TABS = [
    { key: 'trips', label: '我的旅程', emoji: '🧳' },
    { key: 'itinerary', label: '行程', emoji: '🗺' },
    { key: 'expenses', label: '分帳', emoji: '💰' },
    { key: 'checklist', label: '打包清單', emoji: '🎒' }
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
    var sub = document.getElementById('headerSub');
    var acts = document.getElementById('headerActions');

    sub.textContent = trip
      ? trip.name + (trip.startDate ? '　' + trip.startDate + ' ~ ' + trip.endDate : '')
      : '還沒有選擇旅程';

    if (readOnly) {
      acts.innerHTML = '<button class="btn btn-primary btn-sm" data-act="adopt">存一份到我的裝置</button>';
    } else {
      acts.innerHTML = trip
        ? '<button class="btn btn-ghost btn-sm" data-act="share">🔗 分享</button>'
        : '';
    }
  }

  function renderTabs() {
    var nav = document.getElementById('tabs');
    var tabs = readOnly ? TABS.filter(function (t) { return t.key !== 'trips'; }) : TABS;
    nav.innerHTML = tabs.map(function (t) {
      return '<button class="tab' + (t.key === current ? ' on' : '') + '" data-tab="' + t.key + '">' +
        '<span class="tab-emoji">' + t.emoji + '</span>' + t.label + '</button>';
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
  function boot() {
    S.load();

    document.getElementById('tabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]');
      if (b) go(b.getAttribute('data-tab'));
    });
    document.getElementById('headerActions').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.getAttribute('data-act') === 'share') share();
      if (b.getAttribute('data-act') === 'adopt') adopt();
    });

    App.Share.readFromUrl().then(function (trip) {
      if (trip) {
        sharedTrip = trip;
        readOnly = true;
        current = 'itinerary';
        document.getElementById('readonlyBar').hidden = false;
        document.getElementById('readonlyName').textContent = trip.name;
      } else if (S.currentTrip()) {
        current = 'itinerary';
      }
      render();
    }, function (err) {
      U.toast('這個分享連結讀不出來：' + err.message, 'bad');
      render();
    });
  }

  App.render = render;
  App.go = go;
  App.isReadOnly = function () { return readOnly; };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
