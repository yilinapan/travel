/* checklist.js — 「打包清單」分頁：分類、勾選、進度條 */
window.App = window.App || {};
App.Checklist = (function () {

  var S = App.Store, U = App.UI;

  function render(view, trip, readOnly) {
    if (!trip) {
      view.innerHTML = U.empty('還沒有選擇旅程。請先到「我的旅程」建立或開啟一趟旅程。');
      return;
    }

    var done = 0, total = 0;
    trip.checklist.forEach(function (g) {
      g.items.forEach(function (i) { total++; if (i.done) done++; });
    });
    var pct = total ? Math.round(done / total * 100) : 0;

    view.innerHTML =
      '<section class="block">' +
        '<div class="block-head">' +
          '<h2>打包清單</h2>' +
          (readOnly ? '' : '<div class="btn-row">' +
            '<button class="btn btn-ghost btn-sm" data-act="uncheck-all">全部取消勾選</button>' +
            '<button class="btn btn-primary" data-act="add-group">+ 新增分類</button>' +
          '</div>') +
        '</div>' +
        '<div class="progress-wrap">' +
          '<div class="progress"><div class="progress-bar" style="width:' + pct + '%"></div></div>' +
          '<div class="progress-text">已完成 <strong>' + done + '</strong> / ' + total + '（' + pct + '%）</div>' +
        '</div>' +
        (trip.checklist.length === 0
          ? U.empty('清單是空的。' + (readOnly ? '' : '按「新增分類」開始，或按下面的按鈕載入預設清單。'),
              readOnly ? '' : '<button class="btn btn-ghost" data-act="load-default">載入預設清單</button>')
          : trip.checklist.map(function (g) { return groupBlock(g, readOnly); }).join('')) +
      '</section>';

    view.onclick = function (e) { onClick(e, trip, readOnly); };
  }

  function groupBlock(g, readOnly) {
    var done = g.items.filter(function (i) { return i.done; }).length;
    return '<div class="cl-group">' +
      '<div class="cl-group-head">' +
        '<h3>' + (g.emoji ? g.emoji + ' ' : '') + U.esc(g.name) +
          '<span class="count">' + done + '/' + g.items.length + '</span></h3>' +
        (readOnly ? '' : '<div class="cl-group-act">' +
          '<button class="icon-btn" data-act="add-item" data-g="' + U.esc(g.id) + '" title="新增項目">＋</button>' +
          '<button class="icon-btn" data-act="edit-group" data-g="' + U.esc(g.id) + '" title="改名">✏️</button>' +
          '<button class="icon-btn" data-act="del-group" data-g="' + U.esc(g.id) + '" title="刪除分類">🗑</button>' +
        '</div>') +
      '</div>' +
      (g.items.length === 0
        ? '<p class="muted pad">這個分類還沒有項目。</p>'
        : '<ul class="cl-items">' + g.items.map(function (it) {
            return '<li class="cl-item' + (it.done ? ' done' : '') + '">' +
              '<label class="cl-check">' +
                '<input type="checkbox"' + (it.done ? ' checked' : '') + (readOnly ? ' disabled' : '') +
                  ' data-act="toggle" data-g="' + U.esc(g.id) + '" data-id="' + U.esc(it.id) + '">' +
                '<span>' + U.esc(it.text) + '</span>' +
              '</label>' +
              (readOnly ? '' : '<button class="icon-btn" data-act="del-item" data-g="' + U.esc(g.id) + '" data-id="' + U.esc(it.id) + '" title="刪除">✕</button>') +
            '</li>';
          }).join('') + '</ul>') +
    '</div>';
  }

  // ---------------------------------------------------------------
  function onClick(e, trip, readOnly) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    if (readOnly) return;

    var g = groupOf(trip, btn.getAttribute('data-g'));
    var id = btn.getAttribute('data-id');

    if (act === 'toggle') {
      var it = g && g.items.filter(function (x) { return x.id === id; })[0];
      if (!it) return;
      it.done = btn.checked;
      S.touch(trip);
      return App.render();
    }
    if (act === 'add-group') return editGroup(trip, null);
    if (act === 'edit-group') return editGroup(trip, g);
    if (act === 'del-group') {
      if (!g) return;
      if (!U.ask('確定要刪除分類「' + g.name + '」嗎？裡面的 ' + g.items.length + ' 個項目也會一起消失。')) return;
      trip.checklist = trip.checklist.filter(function (x) { return x.id !== g.id; });
      S.touch(trip);
      return App.render();
    }
    if (act === 'add-item') return addItem(trip, g);
    if (act === 'del-item') {
      if (!g) return;
      g.items = g.items.filter(function (x) { return x.id !== id; });
      S.touch(trip);
      return App.render();
    }
    if (act === 'uncheck-all') {
      if (!U.ask('要把所有項目的勾勾都取消嗎？（項目不會被刪除）')) return;
      trip.checklist.forEach(function (gr) { gr.items.forEach(function (i) { i.done = false; }); });
      S.touch(trip);
      return App.render();
    }
    if (act === 'load-default') {
      trip.checklist = S.DEFAULT_CHECKLIST.map(function (d) {
        return {
          id: S.uid('g'), name: d.name, emoji: d.emoji,
          items: d.items.map(function (txt) { return { id: S.uid('c'), text: txt, done: false }; })
        };
      });
      S.touch(trip);
      U.toast('預設清單已載入');
      return App.render();
    }
  }

  function groupOf(trip, id) {
    return trip.checklist.filter(function (g) { return g.id === id; })[0] || null;
  }

  function editGroup(trip, g) {
    var isNew = !g;
    U.modal({
      title: isNew ? '新增分類' : '編輯分類',
      submitText: '儲存',
      fields: [
        { name: 'name', label: '分類名稱', required: true, value: g ? g.name : '', placeholder: '例如：小孩的東西' },
        { name: 'emoji', label: '圖示', value: g ? g.emoji : '', placeholder: '貼一個 emoji，可留空' }
      ]
    }).then(function (v) {
      if (!v) return;
      if (isNew) {
        trip.checklist.push({ id: S.uid('g'), name: v.name, emoji: v.emoji, items: [] });
      } else {
        g.name = v.name;
        g.emoji = v.emoji;
      }
      S.touch(trip);
      App.render();
    });
  }

  function addItem(trip, g) {
    if (!g) return;
    U.modal({
      title: '新增項目到「' + g.name + '」',
      submitText: '新增',
      fields: [{
        name: 'text', label: '項目', required: true, placeholder: '例如：轉接頭',
        hint: '一次要加好幾項的話，用逗號或換行分開就會自動拆成多筆。'
      }]
    }).then(function (v) {
      if (!v) return;
      var parts = v.text.split(/[,，\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
      parts.forEach(function (txt) {
        g.items.push({ id: S.uid('c'), text: txt, done: false });
      });
      S.touch(trip);
      U.toast('已新增 ' + parts.length + ' 項');
      App.render();
    });
  }

  return { render: render };
})();
