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
   - **圖表專利件數去重與母體計算規則 (Chart Patent Deduplication Rules)**：
     - 後續無論維護既有圖表或建立任何新的圖表（如專利趨勢圖、IPC分類圖、國別分析圖、進階分析圖或未來新增之任何分析圖表），統計專利件數均須嚴格遵循以下規則：
       1. **母體去重條件分流**：
          - 若統計維度（包含 X軸、Y軸或篩選）**與「技術1階」、「技術2階」、「技術3階」、「功效節點」、「應用領域」任一項相關**：母體**不進行** Publication Number 去重（完整保留心智圖分類的多重特徵標註）。
          - 若統計維度**與上述 5 個心智圖維度均無關**（例如純年份、IPC、申請人、國別等）：母體**必須進行** Publication Number 去重（經公開公告合併 ＋ 同 Publication Number 去重保留最新公開日，計為 1 件）。
       2. **群組交集內部去重**：在任何欄位群組交集內部（例如 X/Y 交叉儲存格 Cell、IPC 分類節點等），同群組內若有相同的 Publication Number / 專利公開公告號，**一律嚴格去重只計 1 件**。
       3. **公開公告號通配識別與共用工具**：欄位名稱認定必須擴大支援中英文與大小寫通配（`Publication Number`, `publication number`, `專利公開公告號`, `公開號`, `公告號`, `專利號`, `pub no`, `pub_no` 等），統一透過 `frontend/src/utils/patentUtils.js` 處理。

2. **禁止使用 PHP (No PHP)**：
   - 本專案技術棧為 **Python（後端）+ React/JavaScript（前端）**。
   - 任何後續開發、新功能、腳本或工具，**嚴禁引入 PHP**（包含 `.php` 檔案、PHP 框架或 PHP 相依套件）。
   - 若需後端功能，一律使用 Python；若需前端功能，一律使用 JavaScript/JSX。


