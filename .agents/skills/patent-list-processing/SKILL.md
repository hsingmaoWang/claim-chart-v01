---
name: patent-list-processing
description: >-
  處理、清洗、去重與統計上傳專利清單資料的專案核心規範與作業流程。
  定義了三大核心規則：(1) 公開公告合併（依申請號保留最新公開日）、(2) 專利家族計數（依 INPADOC Family ID 統計 1案 N件）、(3) 專利家族合併（依 US, WO, EP, TW, CN, JP, KR 國別優先序保留代表專利）。
  在使用者或系統提及專利清單處理、專利公開公告合併、專利家族去重或統計「案/件」數時，必須嚴格依照本 skill 執行。
---

# 專利清單處理與家族合併規範 (Patent List Processing & Family Consolidation)

本指南定義本專案處理使用者上傳專利清單（Excel, CSV 或 JSON 等格式）時的資料清洗、去重、計數與家族合併之標準規則。
任何涉及專利資料統計、心智圖節點數量計算、專利列表呈現或匯出等功能，均須遵循本流程。

---

## 處理流程總覽 (Pipeline Overview)

專利清單標準處理流水線分為三個連續階段：

```
[原始專利清單 (Raw Patents)]
            │
            ▼
┌────────────────────────────────────────────────────────┐
│ 步驟 1: 公開公告合併 (Publication/Grant Merge)        │
│ 依相同 Application Number，僅取最新 Publication Date   │
│ 每組去重後計數為 1 件                                   │
└────────────────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────┐
│ 步驟 2: 專利家族計數 (Patent Family Counting)          │
│ 以步驟 1 結果為準，相同 INPADOC Family ID 歸為同家族    │
│ 計數規則：1 個 Family ID 計為 1 "案"，內部專利計為 N "件"│
└────────────────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────┐
│ 步驟 3: 專利家族合併 (Patent Family Consolidation)     │
│ 同一家族依國別優先順序僅挑選 1 件代表專利               │
│ 優先權：US > WO > EP > TW > CN > JP > KR               │
└────────────────────────────────────────────────────────┘
            │
            ▼
[代表專利清單 (Representative Patents, 1 案 1 件)]
```

---

## 核心規則詳解

### 規則 1：公開公告合併 (Publication / Grant Consolidation)

* **適用條件**：
  當超過 1 個具有不同 `Publication Number`（公開/公告號）的專利條目，具有相同的 `Application Number`（申請號）時。
* **處理方式**：
  僅保留該些專利中 `Publication Date`（公開公告日）**為最新（最晚）** 的一件專利，其餘同申請號之舊版公開公告專利予以排除。
* **計數規則**：
  合併後計數**僅為 1 件**。
* **細部例外與邊界處理**：
  1. **申請號為空 (Missing Application Number)**：若專利資料無申請號或為空字串，則**不參與**合併，各自視為獨立專利保留。
  2. **公開日相同 (Tie-Breaking)**：若同申請號且公開日完全相同，優先保留專利公告本（例如專利號結尾帶有 B1/B2/B 等核准代碼者），若仍無法區分則保留清單中先出現者。

---

### 規則 2：專利家族計數規則 (Patent Family Counting: 案 vs 件)

* **適用基礎**：
  **必須以已完成「規則 1：公開公告合併」之後的專利清單作為輸入基礎**。
* **判定條件**：
  當超過 1 個具有不同 `Publication Number` 的專利，具有相同的 `INPADOC Family ID` 時，判定為屬於同一個「專利家族」。
* **計數定義與術語**：
  - **案 (Case / Family Count)**：每個相異的 `INPADOC Family ID` 計為 **1 案**。
  - **件 (Patent Piece Count)**：該專利家族所屬之獨立公開公告專利總數量若為 $N$，則計為 **$N$ 件**。
* **範例說明**：
  - 若 Family ID `12345678` 旗下經步驟 1 合併後共有 3 件專利（例如 US、EP、TW 各一件），則統計為：**1 案 3 件**。
  - 若整批專利經步驟 1 後共 100 件，分別歸屬於 60 個不同 Family ID，則全域統計為：**60 案 100 件**。
* **無家族號處理**：
  - 若專利無 `INPADOC Family ID`，則該專利自成一案（視為獨立單件家族），計為 **1 案 1 件**。

---

### 規則 3：專利家族合併規則 (Patent Family Consolidation)

* **適用條件**：
  針對同一個專利家族（相同 `INPADOC Family ID`）下的多個專利（經過規則 1 合併後的結果），當系統需要進行「家族合併」或「抽取代表專利」時。
* **處理方式**：
  依據專利的 `Publication Country Code`（公開國別代碼）優先順序，**僅選擇一件專利**作為該家族的代表。
* **優先順序**：
  $$\mathbf{US} \succ \mathbf{WO} \succ \mathbf{EP} \succ \mathbf{TW} \succ \mathbf{CN} \succ \mathbf{JP} \succ \mathbf{KR}$$
  1. **US**（美國）
  2. **WO**（WIPO / PCT 國際申請）
  3. **EP**（歐洲專利局）
  4. **TW**（台灣）
  5. **CN**（中國）
  6. **JP**（日本）
  7. **KR**（韓國）
* **代表專利選取細部原則 (Tie-breaking & Fallback)**：
  1. **同一優先國別存在多件**：若家族中同屬最高優先順位國別有超過 1 件（例如有 2 件 US 專利），則選擇 `Publication Date` 最新的一件。
  2. **不在優先名單中的國別**：若該家族內所有專利的國別均不在優先名單（例如 DE、GB、CA），則依清單順序或取公開日最新的一件。
  3. **合併後計數**：專利家族合併後，每個家族僅產出 1 件代表專利，整體資料集轉為「1 案 1 件」。

---

## 欄位識別與標準化對照表 (Column Mapping)

處理原始檔案時，請透過正規化比對以下欄位名稱（不分大小寫及空格）：

| 標準邏輯欄位 | 說明 | 常見 Excel / CSV 欄位名稱別名 | 抽取與解析備註 |
| :--- | :--- | :--- | :--- |
| `publication_number` | 公開/公告號 | `Publication Number`, `專利號`, `專利公開公告號`, `公開號`, `公告號`, `Pub No` | 字串，去除前後空白 |
| `application_number` | 申請號 | `Application Number`, `申請號`, `App No`, `Appl. No.` | 字串，用以執行規則 1 |
| `publication_date` | 公開/公告日 | `Publication Date`, `公開日`, `公告日`, `公開公告日`, `Pub Date` | 轉為 ISO 日期字串 `YYYY-MM-DD` 進行排序比較 |
| `family_id` | INPADOC家族號 | `INPADOC Family ID`, `Family ID`, `專利家族號`, `家族編號`, `INPADOC` | 字串或數值，用以執行規則 2 與 3 |
| `country_code` | 公開國別代碼 | `Publication Country Code`, `Country Code`, `國別`, `國家`, `Country` | 若原始資料無此欄位，**可從 `publication_number` 前兩碼字母自動擷取** (如 `US10123456B2` -> `US`) |

---

## 程式工具與使用方法

本 skill 提供內建共用處理模組：
`scripts/patent_processor.py`

### 引入範例 (Python)

```python
from scripts.patent_processor import process_patent_list

# 輸入資料：可以是 dict list 或 pandas DataFrame
raw_patents = [
    {
        "Publication Number": "US2021001A1",
        "Application Number": "US16/123456",
        "Publication Date": "2021-01-15",
        "INPADOC Family ID": "99901",
        "Title": "Device A"
    },
    {
        "Publication Number": "US1100000B2",
        "Application Number": "US16/123456",  # 相同申請號，最新公告
        "Publication Date": "2022-06-20",
        "INPADOC Family ID": "99901",
        "Title": "Device A"
    },
    {
        "Publication Number": "TW202199999A",
        "Application Number": "TW109123456",
        "Publication Date": "2021-05-10",
        "INPADOC Family ID": "99901",       # 相同家族，但優先順序 US > TW
        "Title": "裝置 A"
    }
]

# 執行全流程處理
result = process_patent_list(raw_patents)

# 檢視成果
print(result["stats"])
# 輸出：{"raw_count": 3, "after_pub_merge_count": 2, "family_cases": 1, "family_pieces": 2, "consolidated_count": 1}

# 取得合併後的專利清單
merged_patents = result["consolidated_patents"]
# 僅保留 US1100000B2 (最新公開且國別 US 優先於 TW)
```

---

## 檢驗核對清單 (Verification Checklist)

當代理人或後端程式進行專利清單處理時，務必檢查：
- [ ] 步驟 1 是否確實只依據 `Application Number` 合併？（不可誤將不同申請號的同家族專利在此步驟刪除）
- [ ] 步驟 1 是否保留最新 `Publication Date`？
- [ ] 步驟 2 家族計數是否區分清楚「案」與「件」？（1 案 N 件）
- [ ] 步驟 3 國別優先序是否嚴格遵循 `US > WO > EP > TW > CN > JP > KR`？
- [ ] 遇到缺漏欄位（如缺失 Application Number 或 Family ID）時，是否採用保全機制不誤刪資料？
