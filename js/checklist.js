/* checklist.js — 「打包清單」分頁：分類、勾選、進度條 */
window.App = window.App || {};
App.Checklist = (function () {

  var S = App.Store, U = App.UI;
  var filterMember = '';   // 空字串 = 看全部

  /**
   * 圖示鈕。全站的圖示鈕都長一樣：沒有底色、18px、點擊範圍 44×44。
   */
  function btn(act, iconName, label, extraAttr, extraClass) {
    return '<button class="icon-btn' + (extraClass ? ' ' + extraClass : '') + '"' +
      ' data-act="' + act + '"' + (extraAttr || '') +
      ' title="' + U.esc(label) + '" aria-label="' + U.esc(label) + '">' +
      U.icon(iconName) + '</button>';
  }

  /** 有沒有「只有某幾個人要帶」的項目？沒有就不要顯示篩選下拉 */
  function hasOwners(trip) {
    if (trip.members.length < 2) return false;
    return trip.checklist.some(function (g) {
      return g.items.some(function (i) { return (i.members || []).length > 0; });
    });
  }

  /** 這一項是大家都要帶，還是只有某幾個人？ */
  function ownersOf(trip, item) {
    var all = trip.members.map(function (m) { return m.id; });
    var picked = (item.members || []).filter(function (id) { return all.indexOf(id) !== -1; });
    return {
      ids: picked,
      isAll: picked.length === 0 || picked.length === all.length,
      names: picked.map(function (id) {
        var m = trip.members.filter(function (x) { return x.id === id; })[0];
        return m ? m.name : '';
      }).filter(Boolean)
    };
  }

  /** 篩選中時，只算該成員要帶的項目 */
  function shown(trip, item) {
    if (!filterMember) return true;
    var o = ownersOf(trip, item);
    return o.isAll || o.ids.indexOf(filterMember) !== -1;
  }

  function render(view, trip, readOnly) {
    if (!trip) {
      view.innerHTML = U.empty('還沒有選擇旅程。請先到「我的旅程」建立或開啟一趟旅程。');
      return;
    }

    if (filterMember && !trip.members.some(function (m) { return m.id === filterMember; })) filterMember = '';

    var done = 0, total = 0;
    trip.checklist.forEach(function (g) {
      g.items.forEach(function (i) {
        if (!shown(trip, i)) return;
        total++; if (i.done) done++;
      });
    });
    var pct = total ? Math.round(done / total * 100) : 0;

    var filterHtml = hasOwners(trip)
      ? '<select id="packFilter" class="member-filter" title="只看某個人要帶的東西">' +
          '<option value="">全部的人</option>' +
          trip.members.map(function (m) {
            return '<option value="' + U.esc(m.id) + '"' + (m.id === filterMember ? ' selected' : '') + '>' +
              '只看 ' + U.esc(m.name) + '</option>';
          }).join('') +
        '</select>'
      : '';

    view.innerHTML =
      '<section class="block">' +
        '<div class="block-head">' +
          '<h2>打包清單</h2>' +
          '<div class="head-tools">' +
            filterHtml +
            (readOnly ? '' :
              btn('uncheck-all', 'reset', '把所有項目的勾勾都取消') +
              btn('add-group', 'plus', '新增分類')) +
          '</div>' +
        '</div>' +
        '<div class="progress-wrap">' +
          '<div class="progress"><div class="progress-bar" style="width:' + pct + '%"></div></div>' +
          '<div class="progress-text">已完成 <strong>' + done + '</strong> / ' + total + '（' + pct + '%）</div>' +
        '</div>' +
        (trip.checklist.length === 0
          ? U.empty('清單是空的。' + (readOnly ? '' : '按右上角的 ＋ 自己新增分類，或直接載入內建的預設清單。'),
              readOnly ? '' : '<button class="btn btn-primary" data-act="load-default">載入預設清單</button>')
          : trip.checklist.map(function (g) { return groupBlock(trip, g, readOnly); }).join('')) +
      '</section>';

    view.onclick = function (e) { onClick(e, trip, readOnly); };
    view.onchange = function (e) {
      if (e.target && e.target.id === 'packFilter') {
        filterMember = e.target.value;
        App.render();
      }
    };
  }

  function groupBlock(trip, g, readOnly) {
    var items = g.items.filter(function (i) { return shown(trip, i); });
    if (filterMember && items.length === 0) return '';   // 這個分類沒有他要帶的東西
    var done = items.filter(function (i) { return i.done; }).length;
    return '<div class="cl-group">' +
      '<div class="cl-group-head">' +
        '<h3>' + (g.emoji ? '<span class="cl-emoji">' + U.esc(g.emoji) + '</span>' : '') + U.esc(g.name) +
          '<span class="count">' + done + '/' + items.length + '</span></h3>' +
        (readOnly ? '' : '<div class="cl-group-act">' +
          btn('edit-group', 'edit', '分類改名', ' data-g="' + U.esc(g.id) + '"') +
          btn('del-group', 'trash', '刪除這個分類', ' data-g="' + U.esc(g.id) + '"', 'is-del') +
          btn('add-item', 'plus', '新增項目到「' + g.name + '」', ' data-g="' + U.esc(g.id) + '"') +
        '</div>') +
      '</div>' +
      (items.length === 0
        ? '<p class="muted pad">這個分類還沒有項目。</p>'
        : '<ul class="cl-items">' + items.map(function (it) {
            var o = ownersOf(trip, it);
            return '<li class="cl-item' + (it.done ? ' done' : '') + (o.isAll ? '' : ' cl-own') + '">' +
              '<label class="cl-check">' +
                '<input type="checkbox"' + (it.done ? ' checked' : '') + (readOnly ? ' disabled' : '') +
                  ' data-act="toggle" data-g="' + U.esc(g.id) + '" data-id="' + U.esc(it.id) + '">' +
                '<span>' + U.esc(it.text) +
                  (o.isAll ? '' : '<span class="cl-who">' + U.icon('people', 12) + U.esc(o.names.join('、')) + '</span>') +
                '</span>' +
              '</label>' +
              (readOnly ? '' :
                btn('who', 'people', '設定誰要帶這一項', ' data-g="' + U.esc(g.id) + '" data-id="' + U.esc(it.id) + '"') +
                btn('del-item', 'trash', '刪除「' + it.text + '」', ' data-g="' + U.esc(g.id) + '" data-id="' + U.esc(it.id) + '"', 'is-del')) +
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
      return U.confirmDanger(
        '刪除分類',
        '要刪掉分類「' + g.name + '」嗎？裡面的 ' + g.items.length + ' 個項目會一起消失，而且無法復原。'
      ).then(function (yes) {
        if (!yes) return;
        trip.checklist = trip.checklist.filter(function (x) { return x.id !== g.id; });
        S.touch(trip);
        App.render();
      });
    }
    if (act === 'add-item') return addItem(trip, g);
    if (act === 'who') {
      var target = g && g.items.filter(function (x) { return x.id === id; })[0];
      return editOwners(trip, target);
    }
    if (act === 'del-item') {
      if (!g) return;
      var target = g.items.filter(function (x) { return x.id === id; })[0];
      if (!target) return;
      // 以前這裡沒有確認，跟其他地方不一致，而且旁邊就是另一個垃圾桶
      return U.confirmDanger(
        '刪除項目',
        '要把「' + target.text + '」從打包清單裡刪掉嗎？'
      ).then(function (yes) {
        if (!yes) return;
        g.items = g.items.filter(function (x) { return x.id !== id; });
        S.touch(trip);
        App.render();
      });
    }
    if (act === 'uncheck-all') {
      return U.confirmAsk(
        '全部取消勾選',
        '要把所有項目的勾勾都取消嗎？項目本身不會被刪除，只是全部變回「還沒帶」。',
        '全部取消'
      ).then(function (yes) {
        if (!yes) return;
        trip.checklist.forEach(function (gr) { gr.items.forEach(function (i) { i.done = false; }); });
        S.touch(trip);
        App.render();
      });
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

  /** 設定這一項由誰負責帶 */
  function editOwners(trip, item) {
    if (!item) return;
    if (trip.members.length === 0) {
      return U.toast('請先到「旅程」加入成員', 'bad');
    }
    U.modal({
      title: '「' + item.text + '」誰要帶？',
      submitText: '儲存',
      fields: [{
        name: 'members', label: '誰要帶', type: 'checks',
        value: item.members || [],
        options: trip.members.map(function (m) { return { value: m.id, label: m.name }; }),
        hint: '不勾就是每個人都要帶自己的（例如衣服、充電線）。只有某幾個人要帶的才勾，例如共用的轉接頭、某人的藥。'
      }]
    }).then(function (v) {
      if (!v) return;
      var picked = v.members || [];
      if (picked.length === trip.members.length) picked = [];   // 全勾等於沒分
      item.members = picked;
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
