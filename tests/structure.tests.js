/* structure.tests.js — 程式結構檢查（只在終端機跑，需要讀原始碼）
 *
 * 為什麼需要這個：
 * 曾經在整理程式時誤刪了六個函式，畫面照常顯示、也不會跳錯，
 * 但「旅程」頁所有按鈕按下去都沒反應，而且好幾個版本之後才被發現。
 * 這類錯誤單元測試抓不到（那些函式沒有被測試直接呼叫），
 * 所以改用靜態檢查：每個被呼叫的函式，都必須真的存在。
 */

// 這些是瀏覽器或 JavaScript 本身就有的，不需要在檔案裡定義
var KNOWN = (
  'if for while switch catch function return typeof instanceof new delete void in of do else try throw case ' +
  'Number String Boolean Array Object Math JSON Date RegExp Error Promise Set Map Symbol ' +
  'parseInt parseFloat isNaN isFinite encodeURI decodeURI encodeURIComponent decodeURIComponent btoa atob ' +
  'setTimeout clearTimeout setInterval clearInterval requestAnimationFrame ' +
  'alert confirm prompt fetch require module exports ' +
  'Blob File FileReader URL TextEncoder TextDecoder Response Request ' +
  'CompressionStream DecompressionStream Uint8Array ArrayBuffer ' +
  'console document window localStorage sessionStorage navigator location history'
).split(' ');

function registerStructureTests(t, eq, files) {

  /** 找出這個檔案自己定義了哪些名字 */
  function definedNames(src) {
    var names = {};
    var re;
    // function foo(...)
    re = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    var m;
    while ((m = re.exec(src))) names[m[1]] = true;
    // var foo = function / var foo = (...) =>
    re = /(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:function|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g;
    while ((m = re.exec(src))) names[m[1]] = true;
    // 參數名也算（可能是傳進來的 callback）
    re = /function\s*[A-Za-z_$\w]*\s*\(([^)]*)\)/g;
    while ((m = re.exec(src))) {
      m[1].split(',').forEach(function (p) {
        p = p.trim();
        if (/^[A-Za-z_$][\w$]*$/.test(p)) names[p] = true;
      });
    }
    return names;
  }

  /** 找出這個檔案呼叫了哪些「單獨的名字（）」—— 排除 obj.method() */
  function calledNames(src) {
    // 先把字串和註解挖掉，避免把裡面的文字當成程式
    var code = src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
      .replace(/'(?:\\.|[^'\\])*'/g, "''")
      .replace(/"(?:\\.|[^"\\])*"/g, '""');

    var out = {};
    var re = /([.\w$]?)\s*\b([A-Za-z_$][\w$]*)\s*\(/g;
    var m;
    while ((m = re.exec(code))) {
      if (m[1] === '.') continue;          // obj.method() 不算
      out[m[2]] = true;
    }
    return out;
  }

  files.forEach(function (f) {
    t('「' + f.name + '」裡呼叫的每個函式都真的存在', function () {
      var defined = definedNames(f.src);
      var called = calledNames(f.src);
      var missing = Object.keys(called).filter(function (n) {
        return !defined[n] && KNOWN.indexOf(n) === -1;
      });
      eq(missing, [], '找不到定義的函式');
    });
  });

  /* 按鈕裡放了 SVG 圖示之後，點到的會是圖示而不是按鈕本身，
   * 直接讀 e.target.getAttribute('data-act') 就會抓不到，按鈕等於失效。
   * 這個錯誤發生過兩次（旅程頁的 ✕ 關不掉），所以用檢查擋住。 */
  t('沒有直接讀 e.target 的 data-act（要往上找到按鈕）', function () {
    var bad = [];
    files.forEach(function (f) {
      if (/e\.target\.getAttribute\s*\(\s*['"]data-act/.test(f.src)) {
        bad.push(f.name + ' 直接讀 e.target 的 data-act，應改用 e.target.closest(\'[data-act]\')');
      }
    });
    eq(bad, [], '寫法有問題的檔案');
  });

  t('每個 data-act 都有對應的處理', function () {
    var problems = [];
    files.forEach(function (f) {
      // 畫面上出現的 data-act="xxx"
      var acts = {};
      var re = /data-act="([a-z-]+)"/g, m;
      while ((m = re.exec(f.src))) acts[m[1]] = true;
      // 程式裡有拿來比對的字串。
      // 不限定變數叫 act —— 有些地方用 btnAct、有些用 a，只要有比對到就算有處理。
      var handled = {};
      re = /=== '([a-z-]+)'/g;
      while ((m = re.exec(f.src))) handled[m[1]] = true;

      Object.keys(acts).forEach(function (a) {
        // 這幾個是共用元件自己處理的，不在各頁面裡
        if (['ok', 'cancel', 'danger', 'close', 'x'].indexOf(a) !== -1) return;
        if (!handled[a]) problems.push(f.name + ' 的「' + a + '」按鈕沒有對應的處理');
      });
    });
    eq(problems, [], '按鈕與處理不對應');
  });

  /** 取出某一支檔案的原始碼 */
  function srcOf(name) {
    var f = files.filter(function (x) { return x.name === name; })[0];
    return f ? f.src : '';
  }

  /* 四個分頁上的按鈕一律是圖示鈕，沒有白底、沒有中文字。
   * .icon-add（白色圓形＋）和 .btn-add 是舊的做法，不可以再出現。 */
  t('分頁上沒有殘留的白底「＋」按鈕', function () {
    var bad = [];
    ['js/trips.js', 'js/itinerary.js', 'js/expenses.js', 'js/checklist.js'].forEach(function (n) {
      if (srcOf(n).indexOf('icon-add') !== -1) bad.push(n + ' 還在用 .icon-add');
    });
    eq(bad, [], '白底圓形按鈕');
  });

  /* 每一顆圖示鈕都要有 title 跟 aria-label：畫面上沒有文字，
   * 滑鼠停留、手機長按、螢幕報讀就是唯一問得出名字的管道。 */
  t('每一顆圖示鈕都問得出名字', function () {
    var bad = [];
    files.forEach(function (f) {
      var re = /<button class="icon-btn[^"]*"([^>]*)>/g, m;
      while ((m = re.exec(f.src))) {
        var attrs = m[1];
        // 透過 btn() 產生的那些已經包好了，這裡只檢查手寫的
        if (attrs.indexOf("' + ") !== -1 && attrs.indexOf('title=') === -1) continue;
        if (attrs.indexOf('title=') === -1 || attrs.indexOf('aria-label=') === -1) {
          bad.push(f.name + ' 有一顆圖示鈕沒有 title 或 aria-label');
        }
      }
    });
    eq(bad, [], '圖示鈕的名字');
  });

  /* 行程頁改成「平常只有一顆編輯，按下去才展開每一筆的工具」。
   * 如果哪天有人把上移／下移／修改／刪除搬回一般狀態，這裡會擋下來。 */
  t('行程頁的編輯工具掛在編輯模式底下', function () {
    var src = srcOf('js/itinerary.js');
    var problems = [];
    if (src.indexOf('data-act="toggle-edit"') === -1) problems.push('少了編輯↔完成的切換鈕');
    if (src.indexOf("=== 'toggle-edit'") === -1) problems.push('編輯↔完成沒有對應的處理');

    var from = src.indexOf('var actions =');
    var to = src.indexOf('tl-actions');
    if (from === -1 || to === -1 || to < from) {
      problems.push('找不到每一筆的編輯工具');
    } else if (src.slice(from, to).indexOf('editMode') === -1) {
      problems.push('每一筆的編輯工具沒有依 editMode 決定要不要顯示');
    }
    eq(problems, [], '行程頁編輯模式');
  });

  /* 換一天、切成「只看某人」、或這天根本沒有行程時，編輯模式都要收回來，
   * 否則會出現「看不到編輯鈕、卻還留著刪除鈕」的狀態。 */
  t('換天或切篩選時會收起行程頁的編輯模式', function () {
    var src = srcOf('js/itinerary.js');
    var times = src.split('editMode = false').length - 1;
    eq(times >= 3, true, 'editMode = false 的次數（實際 ' + times + ' 次）');
  });

  /* 四個分頁上的刪除要用網站自己的確認視窗，
   * 不要用瀏覽器原生的 confirm()（在手機上跟整個介面搭不起來）。 */
  t('分頁上的刪除都用網站自己的確認視窗', function () {
    var bad = [];
    ['js/trips.js', 'js/itinerary.js', 'js/expenses.js', 'js/checklist.js'].forEach(function (n) {
      if (srcOf(n).indexOf('U.ask(') !== -1) bad.push(n + ' 還在用瀏覽器原生的 confirm');
    });
    eq(bad, [], '確認視窗');
  });

  t('每一個刪除都會先問過', function () {
    var pairs = [
      ['js/itinerary.js', "act === 'del'"],
      ['js/expenses.js', "act === 'del'"],
      ['js/expenses.js', "act === 'pay-del'"],
      ['js/checklist.js', "act === 'del-group'"],
      ['js/checklist.js', "act === 'del-item'"],
      ['js/trips.js', "act === 'del-trip'"]
    ];
    var bad = [];
    pairs.forEach(function (pair) {
      var src = srcOf(pair[0]);
      var i = src.indexOf(pair[1]);
      if (i === -1) { bad.push(pair[0] + ' 找不到 ' + pair[1]); return; }
      if (src.slice(i, i + 420).indexOf('confirmDanger') === -1) {
        bad.push(pair[0] + ' 的 ' + pair[1] + ' 刪除前沒有確認');
      }
    });
    eq(bad, [], '刪除前的確認');
  });

  t('「已結清紀錄」的說明點得開', function () {
    var src = srcOf('js/expenses.js');
    var problems = [];
    if (src.indexOf('結算時會自動扣除，不會刪除原本的支出紀錄') === -1) problems.push('說明文字不見了');
    if (src.indexOf('U.hint(') === -1) problems.push('少了可以點的問號圈');
    eq(problems, [], '已結清紀錄的說明');
  });
}

if (typeof module !== 'undefined' && module.exports) module.exports = registerStructureTests;
