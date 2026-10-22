---
trigger: always_on
glob:
description: 專案通用規則，定義專利資料處理與遵循規範
---

# 專案通用規則 (General Rules)

1. **專利清單資料處理準則 (Patent List Processing)**：
   - 當處理、清洗、匯入、去重或統計使用者上傳的專利清單資料時，必須嚴格遵循 [`patent-list-processing`](file:///e:/Antigravity_Project/Patent%20Analyzer-v03.2/.agents/skills/patent-list-processing/SKILL.md) skill：
     - **公開公告合併**：同 `Application Number` 僅保留 `Publication Date` 最新的一件，計為 1 件。
     - **專利家族計數**：以公開公告合併後的結果為基礎，同 `INPADOC Family ID` 為同家族，計為 1 "案"，家族內 N 件專利計為 N "件"。
     - **專利家族合併**：同家族依國別優先順序 `US > WO > EP > TW > CN > JP > KR` 僅選擇一件代表專利。

2. **禁止使用 PHP (No PHP)**：
   - 本專案技術棧為 **Python（後端）+ React/JavaScript（前端）**。
   - 任何後續開發、新功能、腳本或工具，**嚴禁引入 PHP**（包含 `.php` 檔案、PHP 框架或 PHP 相依套件）。
   - 若需後端功能，一律使用 Python；若需前端功能，一律使用 JavaScript/JSX。


