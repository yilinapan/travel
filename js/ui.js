/* ui.js — 共用的小工具：建立元素、跳出表單視窗、顯示提示
 * 目的是讓其他模組只專心處理自己的資料，不用各寫一份表單程式。
 */
window.App = window.App || {};
App.UI = (function () {

  /** 把文字裡的 < > & " 轉成安全字元，避免使用者輸入的內容破壞畫面 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** 用一段 HTML 文字建立元素 */
  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  /** 金額顯示：1234.5 → 1,234.5 */
  function num(n) {
    var v = Number(n) || 0;
    var s = (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  /** 分 → 帶幣別的金額文字 */
  function money(cents, currency) {
    return num(cents / 100) + (currency ? ' ' + currency : '');
  }

  function toast(msg, kind) {
    var box = document.getElementById('toastBox');
    if (!box) {
      box = el('<div id="toastBox" class="toast-box"></div>');
      document.body.appendChild(box);
    }
    var t = el('<div class="toast ' + (kind === 'bad' ? 'toast-bad' : '') + '">' + esc(msg) + '</div>');
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, 2400);
    setTimeout(function () { t.remove(); }, 2900);
  }

  /**
   * 跳出一個表單視窗。
   * fields: [{ name, label, type, value, options, placeholder, required, hint }]
   *   type 支援 text / number / date / time / textarea / select / checks / url
   *   select 與 checks 用 options: [{value,label}]
   * 回傳 Promise：按「確定」給值物件，按取消或關閉給 null。
   */
  function modal(opts) {
    return new Promise(function (resolve) {
      var fields = opts.fields || [];
      var body = fields.map(function (f) { return fieldHtml(f); }).join('');
      var wrap = el(
        '<div class="modal-back">' +
          '<div class="modal" role="dialog" aria-modal="true">' +
            '<div class="modal-head">' +
              '<h3>' + esc(opts.title || '') + '</h3>' +
              '<button class="icon-btn" data-act="cancel" aria-label="關閉">' + icon('close') + '</button>' +
            '</div>' +
            '<form class="modal-body">' + body + '</form>' +
            '<div class="modal-foot">' +
              (opts.danger ? '<button type="button" class="btn btn-danger-ghost" data-act="danger">' + esc(opts.danger) + '</button>' : '') +
              '<span class="spacer"></span>' +
              '<button type="button" class="btn btn-ghost" data-act="cancel">取消</button>' +
              '<button type="button" class="btn btn-primary" data-act="ok">' + esc(opts.submitText || '確定') + '</button>' +
            '</div>' +
          '</div>' +
        '</div>'
      );

      function close(result) {
        document.removeEventListener('keydown', onKey);
        wrap.remove();
        resolve(result);
      }
      function collect() {
        var out = {};
        var missing = null;
        fields.forEach(function (f) {
          if (f.type === 'note') return;
          if (f.type === 'extras') {
            out[f.name] = collectExtras(wrap, f.name);
            return;
          }
          if (f.type === 'checks') {
            out[f.name] = Array.prototype.slice
              .call(wrap.querySelectorAll('[data-check="' + f.name + '"]:checked'))
              .map(function (c) { return c.value; });
            if (f.required && out[f.name].length === 0 && !missing) missing = f.label;
            return;
          }
          var input = wrap.querySelector('[name="' + f.name + '"]');
          var v = input ? input.value.trim() : '';
          if (f.required && !v && !missing) missing = f.label;
          out[f.name] = v;
        });
        if (missing) { toast('「' + missing + '」還沒填', 'bad'); return null; }
        return out;
      }
      function onKey(e) {
        if (e.key === 'Escape') close(null);
      }

      wrap.addEventListener('click', function (e) {
        if (e.target === wrap) return close(null);
        var btn = e.target.closest ? e.target.closest('[data-act]') : null;
        var btnAct = btn && btn.getAttribute('data-act');

        // 指定項目：新增一列 / 刪除一列
        if (btnAct === 'add-extra') {
          var fname = btn.getAttribute('data-for');
          var f = fields.filter(function (x) { return x.name === fname; })[0];
          var box = wrap.querySelector('[data-extras="' + fname + '"]');
          box.insertAdjacentHTML('beforeend', extraRowHtml(f.options || [], null));
          var rows = box.querySelectorAll('.extra-row');
          rows[rows.length - 1].querySelector('.extra-label').focus();
          return;
        }
        if (btnAct === 'del-extra') {
          var row = btn.closest('.extra-row');
          if (row) row.remove();
          return;
        }

        // 一律用 btnAct（往上找到按鈕本身）。
        // 不可以直接讀 e.target —— 按鈕裡若放了 SVG 圖示，點到的會是圖示，抓不到 data-act。
        if (btnAct === 'cancel') close(null);
        if (btnAct === 'danger') close({ __danger: true });
        if (btnAct === 'ok') submit();
      });
      wrap.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault();
        submit();
      });

      /**
       * 按下確定時走這裡。
       * opts.validate 回傳錯誤訊息字串時，視窗會「留在原地」，
       * 使用者填的內容不會不見 —— 這點很重要，不然改到一半的資料會白填。
       */
      function submit() {
        var v = collect();
        if (!v) return;
        if (typeof opts.validate === 'function') {
          var err = opts.validate(v);
          if (err) { toast(err, 'bad'); return; }
        }
        close(v);
      }
      document.addEventListener('keydown', onKey);
      document.body.appendChild(wrap);
      var first = wrap.querySelector('input,select,textarea');
      if (first) first.focus();
    });
  }

  /**
   * 「指定項目」欄位：一筆支出裡，某幾個人專屬的金額。
   * 例如午餐 1000 元，其中生魚片 100 只有小明吃 —— 這 100 先扣給小明，
   * 剩下的 900 才由「分給誰」勾選的人均分。
   */
  function extrasFieldHtml(f) {
    var rows = (f.value || []).map(function (ex) { return extraRowHtml(f.options || [], ex); }).join('');
    return '<div class="field">' +
      '<label>' + esc(f.label) + '</label>' +
      '<div class="extras" data-extras="' + esc(f.name) + '">' + rows + '</div>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="add-extra" data-for="' + esc(f.name) + '">+ 新增指定項目</button>' +
      (f.hint ? '<div class="hint">' + esc(f.hint) + '</div>' : '') +
    '</div>';
  }

  function extraRowHtml(options, ex) {
    var picked = (ex && ex.memberIds) || [];
    return '<div class="extra-row">' +
      '<div class="extra-top">' +
        '<input class="extra-label" placeholder="說明，例如：生魚片" value="' + esc(ex ? ex.label : '') + '">' +
        '<input class="extra-amount" type="number" step="any" inputmode="decimal" placeholder="金額" value="' + esc(ex ? ex.amount : '') + '">' +
        '<button type="button" class="icon-btn" data-act="del-extra" title="移除這一項">' + icon('close', 15) + '</button>' +
      '</div>' +
      '<div class="extra-members">' + options.map(function (o) {
        var on = picked.indexOf(o.value) !== -1;
        return '<label class="check check-sm"><input type="checkbox" value="' + esc(o.value) + '"' + (on ? ' checked' : '') + '><span>' + esc(o.label) + '</span></label>';
      }).join('') + '</div>' +
    '</div>';
  }

  function collectExtras(wrap, name) {
    var box = wrap.querySelector('[data-extras="' + name + '"]');
    if (!box) return [];
    return Array.prototype.slice.call(box.querySelectorAll('.extra-row')).map(function (row) {
      return {
        label: row.querySelector('.extra-label').value.trim(),
        amount: Number(row.querySelector('.extra-amount').value),
        memberIds: Array.prototype.slice.call(row.querySelectorAll('.extra-members input:checked'))
          .map(function (c) { return c.value; })
      };
    }).filter(function (ex) {
      // 金額沒填或沒選人的那一列直接忽略，不要擋住使用者存檔
      return ex.amount > 0 && ex.memberIds.length > 0;
    });
  }

  function fieldHtml(f) {
    if (f.type === 'extras') return extrasFieldHtml(f);
    // 純說明文字，沒有輸入框（確認視窗用）
    if (f.type === 'note') {
      return '<div class="field field-note">' +
        (f.label ? '<label>' + esc(f.label) + '</label>' : '') +
        (f.hint ? '<div class="note-text">' + esc(f.hint) + '</div>' : '') +
      '</div>';
    }
    var id = 'f_' + f.name;
    var label = '<label for="' + id + '">' + esc(f.label) + (f.required ? ' <span class="req">*</span>' : '') + '</label>';
    var hint = f.hint ? '<div class="hint">' + esc(f.hint) + '</div>' : '';
    var input;

    if (f.type === 'textarea') {
      input = '<textarea id="' + id + '" name="' + f.name + '" rows="3" placeholder="' + esc(f.placeholder || '') + '">' + esc(f.value || '') + '</textarea>';
    } else if (f.type === 'select') {
      input = '<select id="' + id + '" name="' + f.name + '">' +
        (f.options || []).map(function (o) {
          return '<option value="' + esc(o.value) + '"' + (String(o.value) === String(f.value) ? ' selected' : '') + '>' + esc(o.label) + '</option>';
        }).join('') + '</select>';
    } else if (f.type === 'checks') {
      var picked = f.value || [];
      input = '<div class="checks">' + (f.options || []).map(function (o) {
        var on = picked.indexOf(o.value) !== -1;
        return '<label class="check"><input type="checkbox" data-check="' + f.name + '" value="' + esc(o.value) + '"' + (on ? ' checked' : '') + '><span>' + esc(o.label) + '</span></label>';
      }).join('') + '</div>';
    } else {
      var type = f.type || 'text';
      var extra = type === 'number' ? ' step="any" inputmode="decimal"' : '';
      input = '<input id="' + id + '" name="' + f.name + '" type="' + type + '"' + extra +
        ' value="' + esc(f.value == null ? '' : f.value) + '" placeholder="' + esc(f.placeholder || '') + '">';
    }
    return '<div class="field">' + label + input + hint + '</div>';
  }

  /** 確認視窗（危險操作用） */
  function confirmDanger(title, message, okText) {
    return modal({
      title: title,
      fields: [{ name: '_msg', type: 'note', label: '' }],
      submitText: okText || '確定刪除'
    }).then(function (r) { return !!r; });
  }

  /** 簡單的是/否詢問，用瀏覽器原生視窗，最不會出錯 */
  function ask(message) {
    return window.confirm(message);
  }

  /** 把文字複製到剪貼簿，舊瀏覽器有備援做法 */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy') ? resolve() : reject(new Error('複製失敗'));
      } catch (e) { reject(e); }
      ta.remove();
    });
  }

  /** 讓瀏覽器下載一個文字檔 */
  function downloadText(filename, text) {
    var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /** 請使用者挑一個檔案，回傳檔案內容文字 */
  function pickTextFile() {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = function () {
        var file = input.files && input.files[0];
        if (!file) return resolve(null);
        var fr = new FileReader();
        fr.onload = function () { resolve(String(fr.result)); };
        fr.onerror = function () { resolve(null); };
        fr.readAsText(file, 'utf-8');
      };
      input.click();
    });
  }

  /* ---------------------------------------------------------------
   * 單色線條圖示
   * 用 SVG 而不是 emoji：emoji 自己帶顏色，會跟配色打架；
   * 這些圖示吃 currentColor，放在哪就跟著那裡的文字顏色走。
   * --------------------------------------------------------------- */
  var ICONS = {
    edit:    '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z"/>',
    trash:   '<path d="M4 7h16M10 7V5h4v2M6 7l1 13h10l1-13"/>',
    plus:    '<path d="M12 5v14M5 12h14"/>',
    close:   '<path d="M18 6 6 18M6 6l12 12"/>',
    up:      '<path d="M6 14l6-6 6 6"/>',
    down:    '<path d="M6 10l6 6 6-6"/>',
    share:   '<path d="M9.5 13.5a4 4 0 0 0 6 .5l2.5-2.5a4 4 0 0 0-5.7-5.7L11 7"/><path d="M14.5 10.5a4 4 0 0 0-6-.5L6 12.5a4 4 0 0 0 5.7 5.7L13 17"/>',
    gear:    '<circle cx="12" cy="12" r="3"/><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10-1.4 1.4"/>',
    sync:    '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>',
    people:  '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 6.5a3 3 0 0 1 0 5.8M17 20a6 6 0 0 0-2-4.4"/>',
    download:'<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14"/>',
    upload:  '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19h14"/>',
    cloud:   '<path d="M7 18a4 4 0 0 1 .6-8 5.5 5.5 0 0 1 10.5 1.6A3.5 3.5 0 0 1 17.5 18z"/>',
    check:   '<path d="M5 12.5 10 17 19 7"/>',
    reset:   '<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v5h5"/>'
  };

  /** 回傳一個吃 currentColor 的小圖示 */
  function icon(name, size) {
    var d = ICONS[name];
    if (!d) return '';
    var n = size || 17;
    return '<svg class="ic" width="' + n + '" height="' + n + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true" focusable="false">' + d + '</svg>';
  }

  /**
   * 說明圓圈：把長句收起來，點一下（電腦滑過去）才顯示。
   * 手機沒有 hover，所以一定要支援點擊，不能只靠 CSS。
   */
  function hint(text, label) {
    return '<button type="button" class="hint-dot" data-hint="' + esc(text) + '"' +
      ' aria-label="' + esc(label || '說明') + '">?</button>';
  }

  var bubble = null;

  function hideHint() {
    if (bubble) { bubble.remove(); bubble = null; }
  }

  function showHint(dot) {
    hideHint();
    var text = dot.getAttribute('data-hint');
    if (!text) return;
    bubble = el('<div class="hint-bubble" role="tooltip">' + esc(text) + '</div>');
    document.body.appendChild(bubble);

    // 先放到按鈕下方，超出畫面就往回收，手機上才不會被切掉
    var r = dot.getBoundingClientRect();
    var w = Math.min(290, window.innerWidth - 24);
    bubble.style.width = w + 'px';
    var left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12);
    bubble.style.left = left + 'px';

    var top = r.bottom + window.scrollY + 8;
    bubble.style.top = top + 'px';
    // 下方放不下就改放上面
    if (r.bottom + bubble.offsetHeight + 16 > window.innerHeight) {
      bubble.style.top = (r.top + window.scrollY - bubble.offsetHeight - 8) + 'px';
    }
  }

  // 整頁共用一組事件，各模組重畫畫面也不用重新綁定
  document.addEventListener('click', function (e) {
    var dot = e.target.closest && e.target.closest('.hint-dot');
    if (dot) {
      e.preventDefault();
      e.stopPropagation();
      if (bubble && bubble.dataset.for === dot.getAttribute('data-hint')) return hideHint();
      showHint(dot);
      if (bubble) bubble.dataset.for = dot.getAttribute('data-hint');
      return;
    }
    hideHint();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideHint(); });
  window.addEventListener('scroll', hideHint, { passive: true });

  // 電腦上滑過去就顯示，不用點
  if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
    document.addEventListener('mouseover', function (e) {
      var dot = e.target.closest && e.target.closest('.hint-dot');
      if (dot) showHint(dot);
    });
    document.addEventListener('mouseout', function (e) {
      var dot = e.target.closest && e.target.closest('.hint-dot');
      if (dot && !e.relatedTarget?.closest?.('.hint-bubble')) hideHint();
    });
  }

  function empty(message, actionHtml) {
    return '<div class="empty">' + esc(message) + (actionHtml ? '<div class="empty-act">' + actionHtml + '</div>' : '') + '</div>';
  }

  return {
    esc: esc, el: el, num: num, money: money, toast: toast, modal: modal,
    confirmDanger: confirmDanger, ask: ask, copyText: copyText,
    downloadText: downloadText, pickTextFile: pickTextFile, empty: empty,
    hint: hint, hideHint: hideHint, icon: icon
  };
})();
