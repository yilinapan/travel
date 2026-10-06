/* expenses.js — 「分帳」分頁：記一筆支出 + 結算結果 */
window.App = window.App || {};
App.Expenses = (function () {

  var S = App.Store, U = App.UI;

  function render(view, trip, readOnly) {
    if (!trip) {
      view.innerHTML = U.empty('還沒有選擇旅程。請先到「我的旅程」建立或開啟一趟旅程。');
      return;
    }
    if (trip.members.length === 0) {
      view.innerHTML = '<section class="block">' +
        '<div class="block-head"><h2>分帳</h2></div>' +
        U.empty('分帳需要先有成員。' + (readOnly ? '' : '請到「我的旅程」把同行的人加進來。')) +
        '</section>';
      view.onclick = null;
      return;
    }

    var r = App.Settle.compute(trip);

    view.innerHTML =
      settleBlock(trip, r) +
      '<section class="block">' +
        '<div class="block-head">' +
          '<h2>所有支出<span class="count">' + trip.expenses.length + '</span></h2>' +
          (readOnly ? '' : '<button class="btn btn-primary" data-act="add">+ 記一筆</button>') +
        '</div>' +
        (trip.expenses.length === 0
          ? U.empty(readOnly ? '還沒有任何支出。' : '還沒有支出。按「記一筆」開始，或在「行程」頁填了金額後一鍵加進來。')
          : expenseTable(trip, readOnly)) +
      '</section>';

    view.onclick = function (e) { onClick(e, trip, readOnly); };
  }

  function settleBlock(trip, r) {
    var cur = trip.baseCurrency;
    var warn = r.warnings.length
      ? '<div class="notice notice-warn"><strong>請注意：</strong><ul>' +
        r.warnings.map(function (w) { return '<li>' + U.esc(w) + '</li>'; }).join('') + '</ul></div>'
      : '';

    var transfers = r.transfers.length
      ? '<ul class="transfers">' + r.transfers.map(function (t) {
          return '<li><strong>' + U.esc(nameOf(trip, t.fromId)) + '</strong>' +
            ' <span class="arrow">→</span> ' +
            '<strong>' + U.esc(nameOf(trip, t.toId)) + '</strong>' +
            '<span class="amt">' + U.money(t.cents, cur) + '</span></li>';
        }).join('') + '</ul>' +
        '<p class="muted">共 ' + r.transfers.length + ' 筆轉帳就能全部結清。</p>'
      : '<div class="all-clear">✅ 目前沒有人欠人，不用轉帳。</div>';

    return '<section class="block block-settle">' +
      '<div class="block-head"><h2>結算結果</h2><span class="total">總支出 ' + U.money(r.totalCents, cur) + '</span></div>' +
      warn +
      transfers +
      '<h4 class="sub">每個人的明細</h4>' +
      '<table class="table"><thead><tr><th>成員</th><th class="right">付了</th><th class="right">該分攤</th><th class="right">結果</th></tr></thead><tbody>' +
      r.perMember.map(function (m) {
        var tag = m.netCents > 0 ? '<span class="net net-plus">應收 ' + U.money(m.netCents, '') + '</span>'
          : m.netCents < 0 ? '<span class="net net-minus">應付 ' + U.money(-m.netCents, '') + '</span>'
          : '<span class="net">持平</span>';
        return '<tr><td>' + U.esc(m.name) + '</td>' +
          '<td class="right">' + U.money(m.paidCents, '') + '</td>' +
          '<td class="right">' + U.money(m.shareCents, '') + '</td>' +
          '<td class="right">' + tag + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="muted">金額以 ' + U.esc(cur) + ' 計。</p>' +
    '</section>';
  }

  function expenseTable(trip, readOnly) {
    var rows = trip.expenses.slice().reverse().map(function (e) {
      var sharers = (e.shareIds || []).map(function (id) { return nameOf(trip, id); }).filter(Boolean);
      var sharerText = sharers.length === trip.members.length ? '全部' : sharers.join('、');
      return '<tr>' +
        '<td><div class="exp-title">' + U.esc(e.title || '未命名') +
          (e.fromItemId ? ' <span class="tag">來自行程</span>' : '') + '</div>' +
          '<div class="exp-sub">' + U.esc(e.date || '') + '</div></td>' +
        '<td class="right nowrap">' + U.money(App.Settle.toCents(e.amount), e.currency) + '</td>' +
        '<td>' + U.esc(nameOf(trip, e.payerId) || '（已刪除）') + '</td>' +
        '<td class="small">' + U.esc(sharerText) + '</td>' +
        (readOnly ? '' : '<td class="right nowrap">' +
          '<button class="icon-btn" data-act="edit" data-id="' + U.esc(e.id) + '">✏️</button>' +
          '<button class="icon-btn" data-act="del" data-id="' + U.esc(e.id) + '">🗑</button></td>') +
      '</tr>';
    }).join('');

    return '<table class="table"><thead><tr>' +
      '<th>項目</th><th class="right">金額</th><th>誰付的</th><th>分給誰</th>' +
      (readOnly ? '' : '<th></th>') +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function nameOf(trip, id) {
    var m = trip.members.filter(function (x) { return x.id === id; })[0];
    return m ? m.name : '';
  }

  // ---------------------------------------------------------------
  function onClick(e, trip, readOnly) {
    if (readOnly) return;
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    var id = btn.getAttribute('data-id');

    if (act === 'add') return editExpense(trip, null);
    if (act === 'edit') return editExpense(trip, trip.expenses.filter(function (x) { return x.id === id; })[0]);
    if (act === 'del') {
      var exp = trip.expenses.filter(function (x) { return x.id === id; })[0];
      if (!exp) return;
      if (!U.ask('確定要刪除「' + (exp.title || '未命名') + '」這筆支出嗎？')) return;
      trip.expenses = trip.expenses.filter(function (x) { return x.id !== id; });
      // 行程頁那邊的連結也要解掉，否則會顯示「已加入分帳」但其實已經刪了
      trip.days.forEach(function (d) {
        d.items.forEach(function (it) { if (it.expenseId === id) delete it.expenseId; });
      });
      S.touch(trip);
      App.render();
    }
  }

  function editExpense(trip, exp) {
    var isNew = !exp;
    var all = trip.members.map(function (m) { return m.id; });
    var currencies = [{ value: trip.baseCurrency, label: trip.baseCurrency + '（基準）' }]
      .concat(trip.currencies.map(function (c) { return { value: c.code, label: c.code }; }));

    U.modal({
      title: isNew ? '記一筆支出' : '編輯支出',
      submitText: isNew ? '新增' : '儲存',
      fields: [
        { name: 'title', label: '項目', required: true, value: exp ? exp.title : '', placeholder: '例如：第一天晚餐' },
        { name: 'amount', label: '金額', type: 'number', required: true, value: exp ? exp.amount : '' },
        { name: 'currency', label: '幣別', type: 'select', value: exp ? exp.currency : trip.baseCurrency, options: currencies },
        {
          name: 'payerId', label: '誰付的', type: 'select', required: true, value: exp ? exp.payerId : all[0],
          options: trip.members.map(function (m) { return { value: m.id, label: m.name }; })
        },
        {
          name: 'shareIds', label: '這筆分給誰', type: 'checks', required: true,
          value: exp ? (exp.shareIds || []) : all,
          options: trip.members.map(function (m) { return { value: m.id, label: m.name }; }),
          hint: '勾選的人之間平均分攤。這餐誰沒吃，就把誰取消勾選。'
        },
        { name: 'date', label: '日期', type: 'date', value: exp ? exp.date : (trip.startDate || '') }
      ]
    }).then(function (v) {
      if (!v) return;
      var amount = Number(v.amount);
      if (!(amount > 0)) return U.toast('金額要大於 0', 'bad');

      if (isNew) {
        trip.expenses.push({
          id: S.uid('e'), title: v.title, amount: amount, currency: v.currency,
          payerId: v.payerId, shareIds: v.shareIds, date: v.date
        });
      } else {
        exp.title = v.title;
        exp.amount = amount;
        exp.currency = v.currency;
        exp.payerId = v.payerId;
        exp.shareIds = v.shareIds;
        exp.date = v.date;
        // 從行程帶過來的支出，金額改了要同步回行程點
        if (exp.fromItemId) {
          trip.days.forEach(function (d) {
            d.items.forEach(function (it) {
              if (it.id === exp.fromItemId) { it.amount = amount; it.currency = v.currency; }
            });
          });
        }
      }
      S.touch(trip);
      App.render();
    });
  }

  return { render: render };
})();
