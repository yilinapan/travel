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
      settleBlock(trip, r, readOnly) +
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

  function settleBlock(trip, r, readOnlyNow) {
    var cur = trip.baseCurrency;
    var hasPayments = (trip.payments || []).length > 0;
    var warn = r.warnings.length
      ? '<div class="notice notice-warn"><strong>請注意：</strong><ul>' +
        r.warnings.map(function (w) { return '<li>' + U.esc(w) + '</li>'; }).join('') + '</ul></div>'
      : '';

    var transfers = r.transfers.length
      ? '<ul class="transfers">' + r.transfers.map(function (t) {
          return '<li><strong>' + U.esc(nameOf(trip, t.fromId)) + '</strong>' +
            ' <span class="arrow">→</span> ' +
            '<strong>' + U.esc(nameOf(trip, t.toId)) + '</strong>' +
            '<span class="amt">' + U.money(t.cents, cur) + '</span>' +
            (readOnlyNow ? '' :
              '<button class="btn btn-ghost btn-sm settle-btn" data-act="settle"' +
              ' data-from="' + U.esc(t.fromId) + '" data-to="' + U.esc(t.toId) + '"' +
              ' data-cents="' + t.cents + '">已結清</button>') +
            '</li>';
        }).join('') + '</ul>' +
        '<p class="muted">共 ' + r.transfers.length + ' 筆轉帳就能全部結清。'
        + (r.settledCents ? '（已經結清了 ' + U.money(r.settledCents, cur) + '）' : '') + '</p>'
      : (r.settledCents
          ? '<div class="all-clear">✅ 全部結清了，不用再轉帳。共已結清 ' + U.money(r.settledCents, cur) + '。</div>'
          : '<div class="all-clear">✅ 目前沒有人欠人，不用轉帳。</div>');

    return '<section class="block block-settle">' +
      '<div class="block-head"><h2>結算結果</h2><span class="total">總支出 ' + U.money(r.totalCents, cur) + '</span></div>' +
      warn +
      transfers +
      '<h4 class="sub">每個人的明細</h4>' +
      '<table class="table"><thead><tr><th>成員</th><th class="right">付了</th><th class="right">該分攤</th>' +
      (hasPayments ? '<th class="right">已還</th><th class="right">已收</th>' : '') +
      '<th class="right">結果</th></tr></thead><tbody>' +
      r.perMember.map(function (m) {
        var tag = m.netCents > 0 ? '<span class="net net-plus">應收 ' + U.money(m.netCents, '') + '</span>'
          : m.netCents < 0 ? '<span class="net net-minus">應付 ' + U.money(-m.netCents, '') + '</span>'
          : '<span class="net net-zero">已結清</span>';
        return '<tr><td>' + U.esc(m.name) + '</td>' +
          '<td class="right">' + U.money(m.paidCents, '') + '</td>' +
          '<td class="right">' + U.money(m.shareCents, '') + '</td>' +
          (hasPayments
            ? '<td class="right muted-cell">' + (m.repaidOutCents ? U.money(m.repaidOutCents, '') : '—') + '</td>' +
              '<td class="right muted-cell">' + (m.repaidInCents ? U.money(m.repaidInCents, '') : '—') + '</td>'
            : '') +
          '<td class="right">' + tag + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="muted">金額以 ' + U.esc(cur) + ' 計。</p>' +
      paymentsBlock(trip, readOnlyNow) +
    '</section>';
  }

  /** 已結清記錄：旅途中先還掉的錢 */
  function paymentsBlock(trip, readOnlyNow) {
    var list = trip.payments || [];
    return '<h4 class="sub">已結清記錄<span class="sub-hint">' + list.length + ' 筆</span></h4>' +
      (list.length === 0
        ? '<p class="muted">還沒有人先還過錢。有人先結清的話，按上面轉帳列旁邊的「已結清」就會記在這裡。</p>'
        : '<table class="table"><tbody>' + list.slice().reverse().map(function (p) {
            return '<tr>' +
              '<td class="small">' + U.esc(p.date || '') + '</td>' +
              '<td>' + U.esc(nameOf(trip, p.fromId) || '（已刪除）') +
                ' <span class="arrow">→</span> ' + U.esc(nameOf(trip, p.toId) || '（已刪除）') +
                (p.note ? '<div class="exp-note">' + U.esc(p.note) + '</div>' : '') + '</td>' +
              '<td class="right nowrap">' + U.money(App.Settle.toCents(p.amount), p.currency) + '</td>' +
              (readOnlyNow ? '' : '<td class="right nowrap">' +
                '<button class="icon-btn" data-act="pay-edit" data-id="' + U.esc(p.id) + '">✏️</button>' +
                '<button class="icon-btn" data-act="pay-del" data-id="' + U.esc(p.id) + '">🗑</button></td>') +
            '</tr>';
          }).join('') + '</tbody></table>') +
      (readOnlyNow ? '' : '<button class="btn btn-ghost btn-sm" data-act="pay-add">+ 記一筆還款</button>');
  }

  function expenseTable(trip, readOnly) {
    var rows = trip.expenses.slice().reverse().map(function (e) {
      var sharers = (e.shareIds || []).map(function (id) { return nameOf(trip, id); }).filter(Boolean);
      var sharerText = sharers.length === 0 ? '—'
        : sharers.length === trip.members.length ? '全部' : sharers.join('、');

      var extras = (e.extras || []).map(function (ex) {
        var who = (ex.memberIds || []).map(function (id) { return nameOf(trip, id); }).filter(Boolean).join('、');
        return '<div class="exp-extra">↳ ' + U.esc(ex.label) + ' ' +
          U.money(App.Settle.toCents(ex.amount), e.currency) + ' → ' + U.esc(who) + '</div>';
      }).join('');

      return '<tr>' +
        '<td><div class="exp-title">' + U.esc(e.title || '未命名') +
          (e.fromItemId ? ' <span class="tag">來自行程</span>' : '') + '</div>' +
          (e.note ? '<div class="exp-note">' + U.esc(e.note) + '</div>' : '') +
          extras +
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

    if (act === 'settle') {
      // 從結算那一列按下來的，金額先幫使用者填好
      return editPayment(trip, null, {
        fromId: btn.getAttribute('data-from'),
        toId: btn.getAttribute('data-to'),
        amount: Number(btn.getAttribute('data-cents')) / 100
      });
    }
    if (act === 'pay-add') return editPayment(trip, null, null);
    if (act === 'pay-edit') return editPayment(trip, (trip.payments || []).filter(function (x) { return x.id === id; })[0], null);
    if (act === 'pay-del') {
      var pay = (trip.payments || []).filter(function (x) { return x.id === id; })[0];
      if (!pay) return;
      if (!U.ask('確定要刪除這筆還款記錄嗎？\n刪除後這筆錢會重新算回未結清。')) return;
      trip.payments = trip.payments.filter(function (x) { return x.id !== id; });
      S.touch(trip);
      return App.render();
    }
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

  /**
   * 記一筆還款。
   * preset 是從結算那一列帶過來的（誰欠誰、欠多少），讓使用者按一下就好。
   */
  function editPayment(trip, pay, preset) {
    var isNew = !pay;
    var base = pay || preset || {};
    var who = trip.members.map(function (m) { return { value: m.id, label: m.name }; });
    var currencies = [{ value: trip.baseCurrency, label: trip.baseCurrency + '（基準）' }]
      .concat(trip.currencies.map(function (c) { return { value: c.code, label: c.code }; }));

    U.modal({
      title: isNew ? '記一筆還款' : '編輯還款記錄',
      submitText: isNew ? '記下來' : '儲存',
      fields: [
        {
          name: 'fromId', label: '誰還的', type: 'select', required: true,
          value: base.fromId || (who[0] && who[0].value), options: who
        },
        {
          name: 'toId', label: '還給誰', type: 'select', required: true,
          value: base.toId || (who[1] && who[1].value), options: who
        },
        {
          name: 'amount', label: '金額', type: 'number', required: true, value: base.amount == null ? '' : base.amount,
          hint: preset ? '已經幫你填上目前還欠的金額。只還一部分的話改小一點就好。' : '只還一部分也可以，剩下的會繼續算在未結清裡。'
        },
        {
          name: 'currency', label: '幣別', type: 'select',
          value: base.currency || trip.baseCurrency, options: currencies,
          hint: '現場用現金還的話，選當地幣別就好，系統會依匯率換算。'
        },
        { name: 'date', label: '日期', type: 'date', value: base.date || todayOrStart(trip) },
        { name: 'note', label: '備註', value: base.note || '', placeholder: '例如：Day1 三筆的份，現金給的' }
      ],
      validate: function (v) {
        if (!(Number(v.amount) > 0)) return '金額要大於 0';
        if (v.fromId === v.toId) return '還錢的人和收錢的人不能是同一個';
        return null;
      }
    }).then(function (v) {
      if (!v) return;
      if (!trip.payments) trip.payments = [];
      if (isNew) {
        trip.payments.push({
          id: S.uid('pay'), fromId: v.fromId, toId: v.toId,
          amount: Number(v.amount), currency: v.currency, date: v.date, note: v.note
        });
        U.toast('已記下這筆還款');
      } else {
        pay.fromId = v.fromId; pay.toId = v.toId;
        pay.amount = Number(v.amount); pay.currency = v.currency;
        pay.date = v.date; pay.note = v.note;
      }
      S.touch(trip);
      App.render();
    });
  }

  /** 還款日期預設填今天；今天不在旅程期間內就填出發日 */
  function todayOrStart(trip) {
    var d = new Date();
    var today = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
    if (trip.startDate && trip.endDate && (today < trip.startDate || today > trip.endDate)) {
      return trip.startDate;
    }
    return today;
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
        { name: 'amount', label: '總金額', type: 'number', required: true, value: exp ? exp.amount : '' },
        { name: 'currency', label: '幣別', type: 'select', value: exp ? exp.currency : trip.baseCurrency, options: currencies },
        {
          name: 'payerId', label: '誰付的', type: 'select', required: true, value: exp ? exp.payerId : all[0],
          options: trip.members.map(function (m) { return { value: m.id, label: m.name }; })
        },
        {
          name: 'extras', label: '指定項目（某幾個人專屬的金額）', type: 'extras',
          value: exp ? (exp.extras || []) : [],
          options: trip.members.map(function (m) { return { value: m.id, label: m.name }; }),
          hint: '例如午餐 1000 元，其中生魚片 100 只有小明吃 —— 就加一條「生魚片 / 100 / 小明」。這 100 會先扣給小明，剩下的 900 才由下面勾選的人均分。沒有這種狀況就留空。'
        },
        {
          name: 'shareIds', label: '剩下的分給誰', type: 'checks',
          value: exp ? (exp.shareIds || []) : all,
          options: trip.members.map(function (m) { return { value: m.id, label: m.name }; }),
          hint: '扣掉指定項目後，剩下的金額在勾選的人之間平均分攤。這餐誰沒吃，就把誰取消勾選。'
        },
        { name: 'note', label: '備註', type: 'textarea', value: exp ? exp.note : '', placeholder: '例如：小明生日，大家請客' },
        { name: 'date', label: '日期', type: 'date', value: exp ? exp.date : (trip.startDate || '') }
      ],
      // 在視窗關閉「之前」檢查，有問題就留在原地，使用者填的內容不會不見
      validate: function (v) {
        var amount = Number(v.amount);
        if (!(amount > 0)) return '金額要大於 0';

        var extrasTotal = (v.extras || []).reduce(function (s, ex) { return s + Number(ex.amount); }, 0);
        if (extrasTotal > amount + 1e-9) {
          return '指定項目加起來是 ' + U.num(extrasTotal) + '，超過總金額 ' + U.num(amount) + ' 了';
        }
        if (amount - extrasTotal > 1e-9 && (v.shareIds || []).length === 0) {
          return '扣掉指定項目後還剩 ' + U.num(amount - extrasTotal) + '，請勾選要分攤的人';
        }
        return null;
      }
    }).then(function (v) {
      if (!v) return;
      var amount = Number(v.amount);

      if (isNew) {
        trip.expenses.push({
          id: S.uid('e'), title: v.title, note: v.note, amount: amount, currency: v.currency,
          payerId: v.payerId, shareIds: v.shareIds, extras: v.extras, date: v.date
        });
      } else {
        exp.title = v.title;
        exp.note = v.note;
        exp.amount = amount;
        exp.currency = v.currency;
        exp.payerId = v.payerId;
        exp.shareIds = v.shareIds;
        exp.extras = v.extras;
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
