/* apps-script.tests.js — Apps Script 那一邊的分享與密碼檢查（只在終端機跑）
 *
 * Code.gs 是貼到 Google 那邊跑的，平常沒辦法直接測。
 * 這裡只測不碰試算表的純函式：旅伴用分享代號能拿到什麼、拿不到什麼。
 * 用法：registerAppsScriptTests(t, eq, gas)，gas 是載入 Code.gs 之後的環境
 */
function registerAppsScriptTests(t, eq, gas) {

  var KEY = 'AbCdEfGhIjKlMnOpQrStUv';

  function sheetRows() {
    return {
      trips: [
        ['九州之旅', '2026-03-01', '2026-03-03', 'TWD', 'Allie,小明', 'JPY=0.21', KEY],
        ['東京', '2026-05-01', '2026-05-02', 'TWD', 'Allie', '', '']
      ],
      items: [
        ['九州之旅', '1', '1', '09:00', '景點', '太宰府', '', '', '', '', '', '', ''],
        ['東京', '1', '1', '10:00', '景點', '淺草寺', '', '', '', '', '', '', '']
      ],
      expenses: [
        ['九州之旅', '2026-03-01', '午餐', '', '3000', 'JPY', 'Allie', '', ''],
        ['東京', '2026-05-01', '晚餐', '', '5000', 'JPY', 'Allie', '', '']
      ],
      payments: [
        ['九州之旅', '2026-03-02', '小明', 'Allie', '300', 'TWD', '']
      ],
      checklist: [
        ['九州之旅', '證件', '', '護照', 'FALSE', '']
      ]
    };
  }

  t('用分享代號只拿得到那一趟旅程', function () {
    var r = gas.shareRows_(sheetRows(), KEY);
    eq(r.trips.map(function (x) { return x[0]; }), ['九州之旅'], '旅程');
    eq(r.items.map(function (x) { return x[5]; }), ['太宰府'], '行程');
    eq(r.expenses.map(function (x) { return x[2]; }), ['午餐'], '支出');
    eq(r.payments.length, 1, '還款');
  });

  t('用分享代號拿不到打包清單，也拿不到代號本身', function () {
    var r = gas.shareRows_(sheetRows(), KEY);
    eq('checklist' in r, false, '不應有打包清單');
    eq(r.trips[0].length, 6, '旅程列只到「匯率」，不含分享代號');
    eq(gas.SHARED_SHEETS.indexOf('checklist'), -1, '讀取分享時根本不會去讀清單分頁');
  });

  t('代號不對、太短、或已停用都拿不到任何資料', function () {
    eq(gas.shareRows_(sheetRows(), 'ZZZZZZZZZZZZZZZZZZZZZZ'), null, '不存在的代號');
    eq(gas.shareRows_(sheetRows(), ''), null, '空白（沒分享的旅程第 7 欄是空的）');
    eq(gas.shareRows_(sheetRows(), 'short'), null, '太短');
    var rows = sheetRows();
    rows.trips[0][6] = '';          // 停用 = 清掉代號
    eq(gas.shareRows_(rows, KEY), null, '停用後');
  });

  t('同步密碼：沒設時放行，設了之後要完全相符', function () {
    eq(gas.checkKey_(undefined, ''), true, '沒設密碼（跟舊版一樣）');
    eq(gas.checkKey_('secret123', 'secret123'), true, '密碼正確');
    eq(gas.checkKey_('wrong', 'secret123'), false, '密碼錯誤');
    eq(gas.checkKey_(undefined, 'secret123'), false, '沒帶密碼');
    eq(gas.checkKey_('', 'secret123'), false, '空白密碼');
  });

  t('旅程分頁的標題多了「分享代號」，而且位置跟程式一致', function () {
    eq(gas.SHEETS.trips.headers[gas.SHARE_KEY_COL], '分享代號', '第 7 欄');
  });
}

if (typeof module !== 'undefined' && module.exports) module.exports = registerAppsScriptTests;
