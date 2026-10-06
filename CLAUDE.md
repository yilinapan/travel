# CLAUDE.md

交接說明在 **[AGENTS.md](AGENTS.md)** —— 動手前請先讀完那一份。

重點摘要：

- 純 HTML/CSS/JS，**沒有框架、沒有建置流程**。不要引入。
- 改完 `js/` 或 `css/` **一定要把 `index.html` 裡的 `?v=N` 加 1**，否則使用者會拿到舊檔。
- 事件處理一律 `e.target.closest('[data-act]')`，不可直接讀 `e.target`。
- 表單驗證寫在 `U.modal` 的 `validate`，不是 `.then()` 裡。
- 改完跑 `node tests/run.js`（93 項）。
- 使用者不寫程式，請用繁體中文、動手前先說明計畫。
