/* itinerary.js — 「行程」分頁：每天一條時間軸，用上下箭頭調整順序 */
window.App = window.App || {};
App.Itinerary = (function () {

  var S = App.Store, U = App.UI;
  var activeDay = 0;
  var filterMember = '';   // 空字串 = 看全部的人
  /* 編輯模式：平常每一天只有一顆「編輯」圖示，按下去才展開每一筆的
     上移／下移／修改／加到分帳／刪除。換一天、切篩選、按完成都會收回來。 */
  var editMode = false;

  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  /** 這個行程點是全員一起，還是只有某幾個人？ */
  function partyOf(trip, it) {
    var all = trip.members.map(function (m) { return m.id; });
    var picked = (it.members || []).filter(function (id) { return all.indexOf(id) !== -1; });
    return {
      ids: picked,
      isAll: picked.length === 0 || picked.length === all.length,
      names: picked.map(function (id) {
        var m = trip.members.filter(function (x) { return x.id === id; })[0];
        return m ? m.name : '';
      }).filter(Boolean)
    };
  }

  /**
   * 這趟旅程到底有沒有「分頭行動」的行程點？
   * 沒有的話就不要顯示「只看某人」的下拉 —— 它在手機上很佔位置，
   * 而多數旅程根本是全員一起走，那個下拉永遠用不到。
   */
  function hasGrouping(trip) {
    if (trip.members.length < 2) return false;
    return trip.days.some(function (d) {
      return d.items.some(function (it) { return (it.members || []).length > 0; });
    });
  }

  function render(view, trip, readOnly) {
    if (!trip) {
      view.innerHTML = U.empty('還沒有選擇旅程。請先到「我的旅程」建立或開啟一趟旅程。');
      return;
    }
    S.syncDays(trip);
    if (activeDay >= trip.days.length) activeDay = 0;
    // 被篩選的成員已經不在名單上了就自動取消篩選
    if (filterMember && !trip.members.some(function (m) { return m.id === filterMember; })) filterMember = '';

    var day = trip.days[activeDay];
    // 這天沒有行程、正在篩選某個人、或唯讀時，編輯模式沒有意義，直接收起來
    if (day.items.length === 0 || filterMember || readOnly) editMode = false;

    // 永遠用「原本的位置」當索引，這樣篩選中按上下箭頭也不會移錯
    var rows = day.items.map(function (it, i) { return { item: it, index: i }; });
    var shown = filterMember
      ? rows.filter(function (r) {
          var p = partyOf(trip, r.item);
          return p.isAll || p.ids.indexOf(filterMember) !== -1;
        })
      : rows;

    var emptyText = day.items.length === 0
      ? (readOnly ? '這天還沒有安排行程。' : '這天還沒有行程。按右上角的 ＋ 新增第一個行程點。')
      : '這一天沒有這個人的行程。';

    view.innerHTML =
      '<section class="block">' +
        dayTabs(trip) +
        dayHeader(trip, activeDay, readOnly, shown.length, day.items.length) +
        (shown.length === 0
          ? U.empty(emptyText)
          : '<ol class="timeline">' + shown.map(function (r) {
              return itemRow(trip, r.item, r.index, day.items.length, readOnly);
            }).join('') + '</ol>') +
      '</section>';

    view.onclick = function (e) { onClick(e, trip, readOnly); };
    view.onchange = function (e) {
      if (e.target && e.target.id === 'memberFilter') {
        filterMember = e.target.value;
        editMode = false;      // 篩選中不能調順序，編輯工具一併收起來
        App.render();
      }
    };
  }

  function dayTabs(trip) {
    // 只放天數編號；日期已經在上方的頁首那一行了，這裡不用重複
    return '<div class="day-tabs">' + trip.days.map(function (d, i) {
      var n = i + 1;
      return '<button class="day-tab' + (i === activeDay ? ' on' : '') + '" data-act="day" data-i="' + i + '"' +
        ' title="' + U.esc(S.dayDate(trip, i) || ('第 ' + n + ' 天')) + '">' +
        (n < 10 ? '0' + n : n) + '</button>';
    }).join('') + '</div>';
  }

  function dayHeader(trip, i, readOnly, shownCount, totalCount) {
    var ds = S.dayDate(trip, i);
    var text = 'Day ' + (i + 1);
    if (ds) {
      var d = S.parseDate(ds);
      text += ' · ' + ds + '（週' + WEEK[d.getDay()] + '）';
    }
    var countText = filterMember
      ? shownCount + ' / ' + totalCount + ' 個'
      : totalCount + ' 個';

    // 只有真的有「分頭行動」的行程時才顯示篩選，平常不佔手機頂部的位置
    var filterHtml = hasGrouping(trip)
      ? '<select id="memberFilter" class="member-filter" title="只看某個人的行程">' +
          '<option value="">全部的人</option>' +
          trip.members.map(function (m) {
            return '<option value="' + U.esc(m.id) + '"' + (m.id === filterMember ? ' selected' : '') + '>' +
              '只看 ' + U.esc(m.name) + '</option>';
          }).join('') +
        '</select>'
      : '';

    /* 一般狀態只有兩顆圖示：編輯（✎）和新增（＋）。
       每一筆的上移、下移、修改、加到分帳、刪除要按下編輯才會出現。
       這天沒有行程的話連「編輯」都不顯示 —— 沒有東西可以編。 */
    var canEdit = !readOnly && !filterMember && totalCount > 0;
    var tools = '';
    if (canEdit && editMode && totalCount > 1) {
      tools += btn('sort-time', 'sortTime', '依時間重新排序');
    }
    if (canEdit) {
      tools += '<button class="icon-btn' + (editMode ? ' on' : '') + '" data-act="toggle-edit"' +
        ' title="' + (editMode ? '完成，收起編輯工具' : '編輯：調順序、修改、刪除') + '"' +
        ' aria-label="' + (editMode ? '完成編輯' : '編輯這一天的行程') + '"' +
        ' aria-pressed="' + (editMode ? 'true' : 'false') + '">' +
        U.icon(editMode ? 'check' : 'edit') + '</button>';
    }
    if (!readOnly) {
      tools += btn('add-item', 'plus', '新增行程點');
    }

    return '<div class="day-head' + (editMode ? ' is-editing' : '') + '">' +
      '<h3>' + U.esc(text) + '</h3>' +
      '<div class="day-head-side">' +
        filterHtml +
        '<span class="day-count">' + countText + '</span>' +
        tools +
      '</div>' +
      (filterMember ? '<div class="filter-note">篩選中只能瀏覽。要編輯或調整順序請先切回「全部的人」。</div>' : '') +
    '</div>';
  }

  /**
   * 圖示鈕。全站的圖示鈕都長一樣：沒有底色、18px、點擊範圍 44×44。
   * label 同時當 title（滑鼠停留、手機長按會顯示）和 aria-label（螢幕報讀）——
   * 畫面上不出現任何文字，但永遠問得出這顆是做什麼的。
   */
  function btn(act, iconName, label, extraAttr, extraClass) {
    return '<button class="icon-btn' + (extraClass ? ' ' + extraClass : '') + '"' +
      ' data-act="' + act + '"' + (extraAttr || '') +
      ' title="' + U.esc(label) + '" aria-label="' + U.esc(label) + '">' +
      U.icon(iconName) + '</button>';
  }

  function itemRow(trip, it, i, total, readOnly) {
    var type = typeOf(it.type);
    var linked = it.expenseId && trip.expenses.some(function (e) { return e.id === it.expenseId; });
    var cost = '';
    if (it.amount) {
      cost = '<span class="tl-cost">' + U.money(App.Settle.toCents(it.amount), it.currency || trip.baseCurrency) + '</span>' +
        (linked ? '<span class="tag tag-ok">已加入分帳</span>' : '');
    }

    var party = partyOf(trip, it);
    var partyTag = party.isAll ? ''
      : '<span class="tl-party">' + U.icon('people', 13) + U.esc(party.names.join('、')) + '</span>';

    var img = '';
    if (it.image) {
      // 預覽統一 16:9，點一下才在新分頁看完整的原圖（不為了看圖引入任何套件）
      var src = U.esc(imageUrl(it.image));
      img = '<div class="tl-image">' +
        '<a href="' + src + '" target="_blank" rel="noopener noreferrer" title="點開看完整圖片">' +
          '<img src="' + src + '" alt="' + U.esc(it.title) + ' 示意圖" loading="lazy"' +
          ' onerror="var b=this.closest(&quot;.tl-image&quot;);b.textContent=&quot;圖片載入失敗，請檢查網址&quot;;b.className=&quot;img-bad&quot;">' +
        '</a></div>';
    }

    /* 編輯工具平常整排都不存在，按下「編輯」才長出來。
       順序固定：上移、下移、修改、加到分帳、刪除；刪除永遠在最右邊，而且多留一點間距。 */
    var id = ' data-id="' + U.esc(it.id) + '"';
    var actions = (readOnly || !editMode || filterMember) ? '' :
      '<div class="tl-actions">' +
        btn('up', 'up', '往上移', id + (i === 0 ? ' disabled' : '')) +
        btn('down', 'down', '往下移', id + (i === total - 1 ? ' disabled' : '')) +
        btn('edit', 'edit', '修改這個行程點', id) +
        (it.amount && !linked ? btn('to-expense', 'receipt', '把這筆金額加到分帳', id) : '') +
        btn('del', 'trash', '刪除這個行程點', id, 'is-del') +
      '</div>';

    return '<li class="tl-item' + (party.isAll ? '' : ' tl-split') + '" data-id="' + U.esc(it.id) + '">' +
      '<div class="tl-when">' +
        '<div class="tl-time">' + U.esc(it.time || '—') + '</div>' +
        '<div class="tl-kind type-' + U.esc(type.key) + '">' + U.esc(type.label) + '</div>' +
      '</div>' +
      '<span class="tl-rail" aria-hidden="true"></span>' +
      '<div class="tl-body">' +
        '<div class="tl-title">' + U.esc(it.title) + partyTag + '</div>' +
        (it.place ? '<div class="tl-place">' + U.esc(it.place) + '</div>' : '') +
        img +
        (it.note ? '<div class="tl-note">' + U.esc(it.note) + '</div>' : '') +
        (it.link ? '<div class="tl-link"><a href="' + U.esc(safeUrl(it.link)) + '" target="_blank" rel="noopener noreferrer">開啟連結 ↗</a></div>' : '') +
        (cost ? '<div class="tl-costline">' + cost + '</div>' : '') +
      '</div>' +
      actions +
    '</li>';
  }

  function typeOf(key) {
    var list = S.ITEM_TYPES;
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return list[list.length - 1];
  }

  /** 只允許 http/https 連結，避免貼到奇怪的東西 */
  function safeUrl(u) {
    var s = String(u).trim();
    if (/^https?:\/\//i.test(s)) return s;
    return 'https://' + s.replace(/^\/+/, '');
  }

  /**
   * 圖片欄位同時接受兩種寫法：
   *   - 完整網址：https://example.com/photo.jpg
   *   - 專案裡的短路徑：images/kiyomizu.jpg（放在 repo 的 images/ 資料夾）
   * 短路徑的好處是分享連結不會變長，而且圖片跟著專案走、不會失效。
   */
  function imageUrl(v) {
    var s = String(v || '').trim();
    if (!s) return '';
    if (/^(https?:)?\/\//i.test(s) || /^data:image\//i.test(s)) return s;
    return s.replace(/^\/+/, '');   // 相對路徑，照原樣交給瀏覽器
  }

  // ---------------------------------------------------------------
  function onClick(e, trip, readOnly) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.getAttribute('data-act');

    if (act === 'day') {
      activeDay = Number(btn.getAttribute('data-i'));
      editMode = false;        // 換一天就把編輯工具收起來
      return App.render();
    }
    if (readOnly) return;

    // 編輯 ↔ 完成：切換這一天要不要顯示每一筆的編輯工具
    if (act === 'toggle-edit') {
      editMode = !editMode;
      return App.render();
    }

    var day = trip.days[activeDay];
    var id = btn.getAttribute('data-id');
    var idx = day.items.findIndex(function (x) { return x.id === id; });

    if (act === 'add-item') return editItem(trip, day, null);
    if (act === 'edit') return editItem(trip, day, day.items[idx]);
    if (act === 'up' && idx > 0) {
      swap(day.items, idx, idx - 1); S.touch(trip); return App.render();
    }
    if (act === 'down' && idx < day.items.length - 1) {
      swap(day.items, idx, idx + 1); S.touch(trip); return App.render();
    }
    if (act === 'del') {
      var it = day.items[idx];
      if (!it) return;
      // 用網站自己的確認視窗，不用瀏覽器原生那個灰白對話框
      return U.confirmDanger(
        '刪除行程點',
        '要刪掉「' + it.title + '」嗎？時間、地點、備註、圖片會一起消失，而且無法復原。'
          + (it.expenseId ? '已經帶到分帳的那筆支出不會跟著刪，要的話請到「分帳」頁自己刪。' : '')
      ).then(function (yes) {
        if (!yes) return;
        day.items.splice(idx, 1);
        S.touch(trip);
        App.render();
      });
    }
    if (act === 'sort-time') {
      return U.confirmAsk(
        '依時間重新排序',
        '要把這一天的行程按時間重新排過嗎？沒填時間的會排到最後面。',
        '重新排序'
      ).then(function (yes) {
        if (!yes) return;
        day.items.sort(function (a, b) {
          var ta = a.time || '99:99', tb = b.time || '99:99';
          return ta < tb ? -1 : ta > tb ? 1 : 0;
        });
        S.touch(trip);
        App.render();
      });
    }
    if (act === 'to-expense') return toExpense(trip, day.items[idx]);
  }

  function swap(arr, i, j) {
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }

  function editItem(trip, day, item) {
    var isNew = !item;
    var currencies = [{ value: trip.baseCurrency, label: trip.baseCurrency + '（基準）' }]
      .concat(trip.currencies.map(function (c) { return { value: c.code, label: c.code }; }));

    U.modal({
      title: isNew ? '新增行程點' : '編輯行程點',
      submitText: isNew ? '新增' : '儲存',
      fields: [
        { name: 'title', label: '做什麼', required: true, value: item ? item.title : '', placeholder: '例如：清水寺' },
        { name: 'time', label: '幾點', type: 'time', value: item ? item.time : '' },
        {
          name: 'type', label: '類型', type: 'select', value: item ? item.type : 'spot',
          options: S.ITEM_TYPES.map(function (t) { return { value: t.key, label: t.emoji + ' ' + t.label }; })
        },
        { name: 'place', label: '地點', value: item ? item.place : '', placeholder: '例如：京都市東山區' },
        {
          name: 'members', label: '誰參加', type: 'checks',
          value: item ? (item.members || []) : [],
          options: trip.members.map(function (m) { return { value: m.id, label: m.name }; }),
          hint: '全部的人一起就不用勾（留空等於全員）。下午分頭行動時，才勾那幾個人。'
        },
        { name: 'link', label: '連結', value: item ? item.link : '', placeholder: '貼 Google Maps 網址、訂房頁面都可以' },
        {
          name: 'image', label: '示意圖', value: item ? item.image : '',
          placeholder: 'images/kiyomizu.jpg 或 https://…',
          hint: '可以貼圖片網址，也可以用放在專案 images/ 資料夾裡的檔名（短路徑比較不佔分享連結的長度）'
        },
        { name: 'note', label: '備註', type: 'textarea', value: item ? item.note : '', placeholder: '訂位代號、營業時間、記得帶現金…' },
        { name: 'amount', label: '花費金額', type: 'number', value: item ? item.amount : '', hint: '填了之後可以一鍵加到分帳。不花錢就留空。' },
        { name: 'currency', label: '幣別', type: 'select', value: item ? (item.currency || trip.baseCurrency) : trip.baseCurrency, options: currencies }
      ]
    }).then(function (v) {
      if (!v) return;
      // 全部都勾等於沒有分組，存成空陣列讓資料單純一點
      var picked = v.members || [];
      if (picked.length === trip.members.length) picked = [];

      var data = {
        title: v.title, time: v.time, type: v.type, place: v.place,
        members: picked,
        link: v.link, image: v.image, note: v.note,
        amount: v.amount ? Number(v.amount) : '',
        currency: v.currency
      };
      if (isNew) {
        data.id = S.uid('it');
        day.items.push(data);
      } else {
        Object.keys(data).forEach(function (k) { item[k] = data[k]; });
        // 已經連到分帳的話，金額跟著更新，避免兩邊對不上
        if (item.expenseId) {
          var exp = trip.expenses.filter(function (e) { return e.id === item.expenseId; })[0];
          if (exp) {
            exp.title = item.title;
            exp.amount = item.amount;
            exp.currency = item.currency;
          }
        }
      }
      S.touch(trip);
      App.render();
    });
  }

  function toExpense(trip, item) {
    if (!item) return;
    if (trip.members.length === 0) {
      return U.toast('請先到「我的旅程」加入成員，才能分帳', 'bad');
    }
    var all = trip.members.map(function (m) { return m.id; });
    // 這個行程點如果是分頭行動，分帳就預設只分給有去的那幾個人
    var party = partyOf(trip, item);
    var defaultShare = party.isAll ? all : party.ids;

    U.modal({
      title: '把「' + item.title + '」加到分帳',
      submitText: '加入',
      fields: [
        { name: 'amount', label: '金額', type: 'number', required: true, value: item.amount },
        {
          name: 'currency', label: '幣別', type: 'select', value: item.currency || trip.baseCurrency,
          options: [{ value: trip.baseCurrency, label: trip.baseCurrency }]
            .concat(trip.currencies.map(function (c) { return { value: c.code, label: c.code }; }))
        },
        {
          name: 'payerId', label: '誰付的', type: 'select', required: true,
          options: trip.members.map(function (m) { return { value: m.id, label: m.name }; })
        },
        {
          name: 'shareIds', label: '這筆分給誰', type: 'checks', required: true, value: defaultShare,
          options: trip.members.map(function (m) { return { value: m.id, label: m.name }; }),
          hint: party.isAll ? '勾選的人之間平均分攤'
            : '已自動帶入這個行程點的參加者（' + party.names.join('、') + '），需要的話可以再調整。'
        }
      ]
    }).then(function (v) {
      if (!v) return;
      var exp = {
        id: S.uid('e'),
        title: item.title,
        amount: Number(v.amount),
        currency: v.currency,
        payerId: v.payerId,
        shareIds: v.shareIds,
        date: S.dayDate(trip, activeDay),
        fromItemId: item.id
      };
      trip.expenses.push(exp);
      item.expenseId = exp.id;
      item.amount = exp.amount;
      item.currency = exp.currency;
      S.touch(trip);
      U.toast('已加到分帳');
      App.render();
    });
  }

  function goToDay(i) { activeDay = i; editMode = false; }

  return { render: render, goToDay: goToDay };
})();
