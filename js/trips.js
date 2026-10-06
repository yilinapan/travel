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
      (cur ? settingsBlock(cur) : '');

    view.onclick = function (e) { onClick(e, view); };
  }

  function storageNotice() {
    // 已經開了雲端同步就不用再提醒了
    if (App.Cloud.isOn()) return '';
    return '<div class="notice">' +
      '<strong>資料存在這台裝置。</strong>換裝置或清除瀏覽器資料就會不見。' +
      U.hint('資料存在你這台裝置的瀏覽器裡，不會上傳到任何伺服器。' +
             '換一台裝置、或清除瀏覽器資料，這裡的內容就會不見。' +
             '到畫面下方的「設定」可以開啟雲端同步，讓手機和電腦看到同一份資料；' +
             '或是定期下載備份檔存到雲端硬碟。') +
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
      '<p class="muted">匯率請自己填' +
      U.hint('例如 1 日幣 ≈ 0.21 台幣，就填 0.21。' +
             '這裡刻意不自動抓網路匯率 —— 自動抓要依賴外部服務，哪天對方改規則或關掉，' +
             '這個工具就會跟著壞。自己填雖然多一個動作，但穩定可靠。') + '</p>' +
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
  }

  return { render: render };
})();
