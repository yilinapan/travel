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
  'parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent btoa atob ' +
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
}

if (typeof module !== 'undefined' && module.exports) module.exports = registerStructureTests;
