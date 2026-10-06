# 交接說明（給 AI 助理）

這份給接手這個專案的 AI（Codex、Claude、Hermes 等）。先讀完再動手。
使用者**不寫程式**，請用白話中文跟她溝通，並在動手前先說明你要做什麼。

- **線上網址：** https://yilinapan.github.io/travel/
- **Repo：** https://github.com/yilinapan/travel
- **使用者：** Allie（yilinapan）
- **使用說明：** [guide.html](guide.html)（改了功能記得同步更新那一頁）

---

## 1. 這是什麼

一個旅遊規劃網頁：行程安排、分帳結算、打包清單。
純 HTML + CSS + JavaScript，**沒有框架、沒有套件、沒有建置流程**。
檔案推上 GitHub 就是網站本身。

這個選擇是刻意的：使用者不寫程式，任何需要 `npm install` 或編譯的東西，
哪天壞掉她就沒辦法自己處理。**不要為了方便而引入建置工具或框架。**

---

## 2. 動手前必讀的三條規則

### ① 改完 `js/` 或 `css/` 一定要把版本號加 1

`index.html` 裡每個檔案連結後面有 `?v=N`：

```html
<link rel="stylesheet" href="css/style.css?v=11">
<script src="js/app.js?v=11"></script>
```

**忘了加會出事。** 使用者的瀏覽器會沿用舊檔，造成新舊程式混在一起。
實際發生過：新功能的按鈕沒出現，誤以為程式壞了，查了很久才發現是快取。

### ② 事件處理一律用 `e.target.closest('[data-act]')`

按鈕裡放了 SVG 圖示，點擊時 `e.target` 是圖示而不是按鈕本身。

```js
// ❌ 錯：圖示按鈕會抓不到
var act = e.target.getAttribute('data-act');

// ✅ 對
var btn = e.target.closest('[data-act]');
var act = btn && btn.getAttribute('data-act');
```

這個錯誤犯過兩次（按鈕沒反應、視窗的 ✕ 關不掉），
現在有自動檢查擋著，但新寫的程式還是要照這個寫法。

### ③ 表單驗證要寫在 `validate`，不是 `.then()` 裡

```js
U.modal({
  fields: [...],
  validate: function (v) {            // ✅ 視窗關閉「之前」檢查
    if (!(Number(v.amount) > 0)) return '金額要大於 0';
    return null;
  }
}).then(function (v) {
  if (!v) return;
  // 這裡才存檔
});
```

寫在 `.then()` 裡的話，視窗已經關了，使用者剛填的內容會被默默丟掉。

---

## 3. 檔案結構

```
travel/
├── index.html            網頁主體（版本號在這裡）
├── guide.html            使用說明（獨立一頁，有自己的樣式，不吃 css/style.css）
├── css/style.css         全部樣式。配色在最上面的 :root
├── js/
│   ├── settle.js         分帳計算（純函式，不碰畫面 → 好測試）
│   ├── store.js          localStorage 讀寫、旅程 CRUD、備份匯出匯入
│   ├── cloud.js          Google Sheets 同步：資料⇄表格列的轉換、衝突偵測
│   ├── share.js          唯讀分享連結（資料壓縮進網址的 # 片段）
│   ├── ui.js             共用元件：表單視窗、提示泡泡、浮動訊息、SVG 圖示
│   ├── trips.js          「旅程」分頁
│   ├── itinerary.js      「行程」分頁
│   ├── expenses.js       「分帳」分頁
│   ├── checklist.js      「打包」分頁
│   ├── settings.js       設定面板（雲端同步、備份還原）
│   └── app.js            分頁切換、頁首、分享、唯讀模式、雲端啟動流程
├── apps-script/Code.gs   貼到 Google Apps Script 的橋接程式
├── images/               行程示意圖
├── tests/                測試（見第 6 節）
└── docs/
    ├── design.md              設計決策與取捨
    ├── setup-google-sheets.md 雲端同步設定步驟（給使用者看的）
    └── hermes-guide.md        試算表欄位說明（給 AI 或手動編輯用）
```

畫面採「**資料變了就整頁重畫**」：改完資料呼叫 `App.render()`。
對這個規模來說比局部更新單純，也不會出現畫面與資料對不上的 bug。

---

## 4. 資料結構

一趟旅程就是一個完整物件。這是整個專案的核心，改之前先看懂。

```js
{
  id, name, startDate, endDate,          // 'YYYY-MM-DD'
  baseCurrency: 'TWD',
  currencies: [{ code: 'JPY', rate: 0.21 }],   // rate = 1 外幣 等於多少基準幣別
  members:    [{ id, name }],

  days: [                                 // 長度 = 旅行天數，依日期自動產生
    { id, items: [
        { id, time, type, title, place, note, link, image,
          amount, currency,
          members: [],                    // 參加者。空陣列 = 全員一起
          expenseId }                     // 若已帶到分帳
    ]}
  ],

  expenses: [
    { id, title, note, amount, currency, date, payerId,
      shareIds: [],                       // 均分「剩餘金額」的人
      extras: [                           // 指定項目：某幾個人專屬的金額
        { id, label, amount, memberIds: [] }
      ],
      fromItemId }                        // 若來自行程點
  ],

  payments: [                             // 旅途中先還掉的錢
    { id, date, fromId, toId, amount, currency, note }
  ],

  checklist: [
    { id, name, emoji, items: [
        { id, text, done, members: [] }    // members 空陣列 = 每個人都要帶
    ]}
  ]
}
```

### 分帳怎麼算（`settle.js`）

1. 金額一律轉成**基準幣別的整數「分」**再算（`0.1 + 0.2 !== 0.3`，算錢不能有浮點誤差）
2. 每筆支出：先把 `extras` 指定給特定成員，**剩下的**才由 `shareIds` 均分
3. `payments`（還款）從淨額扣掉：還錢的人欠得少，收錢的人應收也變少
4. 除不盡時餘數一分一分發給前面的人，**分攤總和必須完全等於原金額**
5. 最後用貪心法算出最少筆數的轉帳

**不變條件：所有人的淨額加起來必須等於 0。** 有測試守著，改動時不要破壞。

---

## 5. 設計系統

### 配色（日本傳統色・秋天賞楓）

全部定義在 `css/style.css` 最上面的 `:root`，改色只要改那一段。

| 色 | 值 | 用途 |
|---|---|---|
| 砥粉 | `#D4BE9A` | 底色與分隔線由它調淡而來 |
| 狐色 | `#C68E3F` | 金額（白底上用調深的 `#A8761F`） |
| 琥珀 | `#C96B1E` | 次要提示 |
| 落栗 | `#9E3119` | **主強調**：時間、分頁底線、目前標記 |
| 赤銅 | `#76210F` | 刪除等破壞性操作 |
| 深咖啡 | `#3B2317` | `--deep`：提示泡泡、浮動訊息、遮罩 |

**規則：**
- **不要用純黑。** 全檔沒有 `#000` / `rgba(0,0,0,…)`，陰影走 `--shadow-rgb`
- 「已完成」刻意保留一個低彩度的綠 `--ok`。這組色全是暖色，
  若完成狀態也用暖色就會跟金額、強調色分不出來
- 深色模式是「暮楓」，在同一個 `:root` 區塊下方，一併維護

### 版面（參考 mockup「秋 1 · 和紙」）

- 靠**排版與留白**撐層次，不靠裝飾
- **預設不用卡片**（`.block` 是透明的）；只有需要被一眼看到的才加 `.is-card`
  （目前是「結算結果」和「打包清單」）
- 主標 19px 深色，小標 14px，**兩者要分得出來**
- 分隔線用細灰線 `--line`；只有「目前這一天」用楓紅
- 數字用 `font-variant-numeric: tabular-nums`，上下才對得齊

### 按鈕的規則

| 情境 | 樣式 |
|------|------|
| **新增**（加到這個區塊） | 區塊標題列右側一顆圓形「＋」`.icon-add`，不寫字 |
| 單筆資料的編輯／刪除／移動 | 一般圖示鈕 `.icon-btn`，平常淡化，滑過才明顯 |
| 需要說明的動作（記錄還款、加到分帳、依時間排序） | 有文字的 `.btn`，光看圖示猜不到的就要寫字 |
| 設定面板裡的操作 | 一律有文字，這裡清楚比精簡重要 |

每個只有圖示的按鈕都要有 `title` 和 `aria-label`。

### 圖示

**介面上不要用 emoji。** emoji 自帶顏色，會跟主色搶注意力。
用 `U.icon('name')`，它回傳吃 `currentColor` 的 SVG，會跟著所在位置的文字顏色走。

可用的：`edit trash plus close up down share gear sync people download upload cloud check`
要新增就加到 `js/ui.js` 的 `ICONS`。

使用者自己填的 emoji（打包清單的分類圖示）保留，但 CSS 會轉成灰階。

---

## 6. 測試

```bash
node tests/run.js        # 終端機，82 項
```

或雙擊 `tests/test.html`（瀏覽器版，不含結構檢查）。

| 檔案 | 測什麼 |
|------|--------|
| `settle.tests.js` | 分帳計算：均分、指定項目、還款、匯率、餘數、各種異常 |
| `cloud.tests.js` | 資料⇄試算表的雙向轉換、容錯 |
| `structure.tests.js` | **程式結構**：函式有沒有被誤刪、按鈕有沒有對應處理、有沒有誤用 `e.target` |

結構檢查是因為實際出過事：整理程式時誤刪六個函式，畫面照常顯示、
也不跳錯，只有按下去才失效，撐了三個版本才被發現。單元測試抓不到這種事。

**改完一定要跑測試。** 改到 `settle.js` 要先補測試再改。

---

## 7. 部署

```bash
git add -A && git commit -m "說明" && git push
```

GitHub Pages 會自動重建。**確認是不是「你這次」的版本已經上線**：

```bash
HEAD=$(git rev-parse HEAD)
gh api repos/yilinapan/travel/pages/builds/latest --jq '.status + " " + .commit'
# status 要是 built，而且 commit 要等於 $HEAD
```

只看 `status` 會讀到「上一次」的結果而誤判完成 —— 這個坑我踩過。

---

## 8. 容易出錯的地方

1. **成員被刪，但舊支出還指著他** — `settle.js` 會過濾掉並發出警告，不要讓它靜靜算錯
2. **幣別改代碼** — `trips.js` 會一併更新用到該幣別的支出，否則那些支出查不到匯率
3. **行程點 ⇄ 支出的雙向連結** — 改金額要兩邊同步；刪支出要清掉行程點的 `expenseId`
4. **天數變少** — `store.syncDays()` 會砍掉多出來的天，並把「有內容」的那幾天回傳給呼叫端提示使用者
5. **從試算表讀回來的天數比日期區間多** — `cloud.js` 會把回程日往後延，不可以默默刪掉行程
6. **試算表會亂轉格式** — `09:00` 會被存成 1899-12-30 的某個時刻。
   `Code.gs` 讀回時依年份判斷輸出 `HH:mm`，寫入時把範圍設成純文字
7. **localStorage 可能失敗** — 無痕視窗、空間滿了。`store.save()` 會提示使用者去備份
8. **改了 `Code.gs` 要重新部署** — Apps Script 改完必須「部署 → 管理部署作業 → 新版本」，
   否則不會生效。網址不會變

---

## 9. 刻意不做的事（不要「順手加上」）

| 不做 | 原因 |
|------|------|
| 框架、建置工具 | 使用者不寫程式，壞了她修不了 |
| 嵌入地圖 | 要 Google 金鑰、會產生費用。改成貼連結 |
| 自動抓匯率 | 依賴外部服務，對方改規則就壞。改成自己填 |
| 直接上傳照片 | 圖片會同時撐爆瀏覽器儲存、試算表欄位和分享連結。改成貼網址或放 `images/` |
| 拖曳排序 | 手機容易誤觸。用上移／下移箭頭 |
| 分組的平行時間軸 | 手機寬度放不下。改用「標參加者 + 篩選」 |

---

## 10. 還沒做的

- **多人共同編輯** — 雲端那層其實已經夠用（把同一串 Apps Script 網址給同行的人就行）。
  要改三件事：① 寫入從「整批覆蓋」改成「只傳動到的那一筆」
  ② 每台裝置要選「我是誰」 ③ 分享連結從唯讀快照改成邀請協作
- **圖片上傳到 Google Drive** — 優先度低，使用者說只放少量示意圖

---

## 11. 跟使用者溝通

- **永遠用繁體中文**，假設她完全不懂程式
- **動手前先說明計畫**，等她確認
- 有風險的操作（刪除、改設定、對外發送）一定先問
- 指 Excel/試算表位置時用 **B5 儲存格** 這種座標，不要用程式的索引編號
- 不確定她的意圖時先問清楚，不要猜了就做
