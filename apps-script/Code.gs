/**
 * 旅遊規劃工具 — Google Sheets 同步橋接
 * =====================================================================
 * 這支程式要貼到 Google Apps Script 裡（設定步驟見 docs/setup-google-sheets.md）。
 *
 * 它做的事很單純：把網頁傳來的資料寫進試算表、把試算表的資料回傳給網頁。
 * 所有「資料要怎麼整理」的邏輯都在網頁那邊（js/cloud.js），
 * 這裡只負責讀寫格子，所以不太會出錯，也幾乎不用再改。
 */

// 四張分頁的名稱與欄位標題。改這裡就會改試算表的樣子。
var SHEETS = {
  trips: {
    name: '旅程',
    headers: ['名稱', '出發', '回程', '基準幣別', '成員', '匯率']
  },
  items: {
    name: '行程',
    // 「參加者」留空白代表全員一起；分頭行動時填名字，逗號分隔
    headers: ['旅程', '第幾天', '順序', '時間', '類型', '做什麼', '地點', '備註', '連結', '圖片', '金額', '幣別', '參加者']
  },
  expenses: {
    name: '支出',
    // 「指定項目」格式：說明=金額=誰,誰 | 說明=金額=誰
    //   例：生魚片=100=小明 | 甜點=60=小明,小華
    //   留空白代表整筆都由「分給誰」的人均分
    headers: ['旅程', '日期', '項目', '備註', '金額', '幣別', '誰付的', '分給誰', '指定項目']
  },
  payments: {
    name: '還款',
    // 旅途中先還掉的錢。跟「支出」分開記：
    // 支出是「誰幫大家墊錢」，還款是「誰還錢給誰」。
    headers: ['旅程', '日期', '誰還的', '還給誰', '金額', '幣別', '備註']
  },
  checklist: {
    name: '清單',
    headers: ['旅程', '分類', '圖示', '項目', '完成']
  }
};

var META_SHEET = '_設定';

// =====================================================================
// 對外的兩個入口
// =====================================================================

/** 網頁讀取資料時會打到這裡 */
function doGet(e) {
  try {
    return jsonOut(load_());
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

/** 網頁存檔、或 Hermes 新增資料時會打到這裡 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOut({ ok: false, error: '沒有收到任何資料' });
    }
    var req = JSON.parse(e.postData.contents);

    if (req.action === 'save') return jsonOut(save_(req));
    if (req.action === 'append') return jsonOut(append_(req));
    if (req.action === 'ping') return jsonOut({ ok: true, message: '連線正常', updatedAt: readMeta_().updatedAt });

    return jsonOut({ ok: false, error: '不認得的動作：' + req.action });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

// =====================================================================
// 讀取
// =====================================================================

function load_() {
  var meta = readMeta_();
  var rows = {};
  Object.keys(SHEETS).forEach(function (key) {
    rows[key] = readSheet_(SHEETS[key]);
  });
  return { ok: true, updatedAt: meta.updatedAt, device: meta.device, rows: rows };
}

/** 讀出一張分頁的所有資料列（不含標題列），一律轉成文字 */
function readSheet_(spec) {
  var sheet = getSheet_(spec);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, spec.headers.length).getValues();
  return values
    .map(function (row) {
      return row.map(function (cell) { return cellToText_(cell); });
    })
    .filter(function (row) {
      // 整列都空白就跳過（使用者手動刪內容會留下空列）
      return row.some(function (c) { return c !== ''; });
    });
}

/**
 * 試算表的格子可能被自動判定成日期或數字，統一轉回文字，
 * 否則「2026-03-01」會變成一串時間戳，網頁那邊就對不上了。
 */
function cellToText_(cell) {
  if (cell === null || cell === undefined || cell === '') return '';
  if (cell instanceof Date) {
    return Utilities.formatDate(cell, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  if (cell === true) return 'TRUE';
  if (cell === false) return 'FALSE';
  return String(cell).trim();
}

// =====================================================================
// 寫入（整批覆蓋）
// =====================================================================

/**
 * 網頁存檔。採「整批覆蓋」：把四張分頁清空後重寫。
 * 資料量不大（幾百列），這樣做最單純，也不會出現半新半舊的狀態。
 *
 * 衝突保護：網頁會附上它當初載入時看到的時間戳（baseUpdatedAt）。
 * 如果試算表上的時間戳已經比那個新，代表別台裝置改過了，
 * 這裡會拒絕寫入並把雲端現況回傳，交給使用者決定。
 */
function save_(req) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return { ok: false, error: '另一個存檔正在進行，請稍後再試一次。' };
  }
  try {
    var meta = readMeta_();
    if (req.baseUpdatedAt !== undefined && meta.updatedAt && req.baseUpdatedAt !== meta.updatedAt) {
      return {
        ok: false,
        conflict: true,
        error: '雲端上的資料比你手上的新。',
        cloudUpdatedAt: meta.updatedAt,
        cloudDevice: meta.device,
        cloud: load_()
      };
    }

    var rows = req.rows || {};
    Object.keys(SHEETS).forEach(function (key) {
      writeSheet_(SHEETS[key], rows[key] || []);
    });

    var stamp = new Date().toISOString();
    writeMeta_(stamp, req.device || '未知裝置');
    return { ok: true, updatedAt: stamp };
  } finally {
    lock.releaseLock();
  }
}

/** 把一張分頁清空後重寫 */
function writeSheet_(spec, rows) {
  var sheet = getSheet_(spec);
  var cols = spec.headers.length;

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, cols).clearContent();
  }
  if (!rows.length) return;

  // 補齊欄數，避免某一列比較短導致寫入失敗
  var padded = rows.map(function (row) {
    var out = row.slice(0, cols);
    while (out.length < cols) out.push('');
    return out.map(function (c) { return c === null || c === undefined ? '' : String(c); });
  });

  sheet.getRange(2, 1, padded.length, cols).setValues(padded);
}

// =====================================================================
// 追加（給 Hermes 或其他 agent 用）
// =====================================================================

/**
 * 在某一張分頁的最後面補上幾列，不會動到其他資料。
 * 這是給 Hermes 這類助理用的簡單入口 —— 它不需要懂整份資料結構，
 * 只要知道要加的那幾列長什麼樣就好。
 *
 * 範例：{ action:'append', sheet:'行程', rows:[['關西5天','1','','09:00','景點','清水寺','京都','','','','400','JPY']] }
 */
function append_(req) {
  var spec = null;
  Object.keys(SHEETS).forEach(function (key) {
    if (SHEETS[key].name === req.sheet || key === req.sheet) spec = SHEETS[key];
  });
  if (!spec) return { ok: false, error: '找不到分頁：' + req.sheet + '（可用的有：旅程、行程、支出、清單）' };

  var rows = req.rows || [];
  if (!rows.length) return { ok: false, error: '沒有要新增的資料列' };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: '系統忙碌中，請稍後再試。' };
  try {
    var sheet = getSheet_(spec);
    var cols = spec.headers.length;
    var padded = rows.map(function (row) {
      var out = row.slice(0, cols);
      while (out.length < cols) out.push('');
      return out.map(function (c) { return c === null || c === undefined ? '' : String(c); });
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, padded.length, cols).setValues(padded);

    var stamp = new Date().toISOString();
    writeMeta_(stamp, req.device || 'Hermes');
    return { ok: true, added: padded.length, sheet: spec.name, updatedAt: stamp };
  } finally {
    lock.releaseLock();
  }
}

// =====================================================================
// 分頁與時間戳
// =====================================================================

/** 拿到分頁；不存在就建一張並寫好標題列 */
function getSheet_(spec) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(spec.name);
  if (!sheet) {
    sheet = ss.insertSheet(spec.name);
  }
  // 標題列沒寫或被改掉就補回來
  var firstRow = sheet.getRange(1, 1, 1, spec.headers.length).getValues()[0];
  var needHeader = firstRow.some(function (c, i) { return String(c).trim() !== spec.headers[i]; });
  if (needHeader) {
    sheet.getRange(1, 1, 1, spec.headers.length).setValues([spec.headers]);
    sheet.getRange(1, 1, 1, spec.headers.length).setFontWeight('bold').setBackground('#e3f1ec');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readMeta_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(META_SHEET);
  if (!sheet) return { updatedAt: '', device: '' };
  return {
    updatedAt: cellToText_(sheet.getRange('B1').getValue()),
    device: cellToText_(sheet.getRange('B2').getValue())
  };
}

function writeMeta_(stamp, device) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(META_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(META_SHEET);
    sheet.getRange('A1').setValue('最後更新時間');
    sheet.getRange('A2').setValue('最後更新的裝置');
    sheet.getRange('A3').setValue('說明');
    sheet.getRange('B3').setValue('這張分頁是工具自己用的，請不要手動修改。');
    sheet.getRange('A1:A3').setFontWeight('bold');
    sheet.setColumnWidth(1, 140);
    sheet.setColumnWidth(2, 320);
  }
  // 用純文字儲存，避免被試算表自動轉成日期格式
  sheet.getRange('B1').setNumberFormat('@').setValue(stamp);
  sheet.getRange('B2').setNumberFormat('@').setValue(device);
}

// =====================================================================
// 工具
// =====================================================================

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 可以在 Apps Script 編輯器裡手動執行這一個，
 * 用來先把四張分頁和標題列建好、順便檢查權限有沒有給對。
 */
function 初始化試算表() {
  Object.keys(SHEETS).forEach(function (key) { getSheet_(SHEETS[key]); });
  writeMeta_(new Date().toISOString(), '初始化');
  SpreadsheetApp.getActiveSpreadsheet().toast('四張分頁已建立完成', '旅遊規劃工具', 5);
}
