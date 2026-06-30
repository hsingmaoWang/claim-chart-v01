# Heatmap 功能評估報告
## 在專利分類心智圖面板增加 Correlation Heatmap 切換圖表

---

## 一、功能概述

在現有的 `appState === 'tree'` 心智圖面板中，新增一個 **「心智圖 / Heatmap」切換按鈕**。
Heatmap 使用 **Plotly.js** 渲染，預設：
- **橫軸（X）**：技術1階 + 技術2階（兩層串接標籤，如 `光子積體 > 電路設計`）
- **縱軸（Y）**：功效節點
- **數值**：相異專利件數（依 `專利公開公告號` 去重）
- **色彩**：coolwarm（藍→白→紅）
- **Annotation**：每格顯示數字

使用者可透過左側拖拉介面互換橫軸 / 縱軸的維度（技術1階、技術2階、功效節點、應用領域）。

---

## 二、現有架構分析

### 前端

| 檔案 | 角色 |
|------|------|
| [MindMapTab.jsx](file:///e:/Antigravity_Project/Patent%20Analyzer-v03.0/frontend/src/components/MindMapTab.jsx) | 主控制器，管理所有 `appState`，`treeData` 持有全部專利資料 |
| [MindMapTree.jsx](file:///e:/Antigravity_Project/Patent%20Analyzer-v03.0/frontend/src/components/MindMapTree.jsx) | 心智圖渲染，含 @dnd-kit 拖拉排序（`levelHierarchy`） |

### 關鍵資料結構（`treeData.patents` 陣列中每筆資料）

```json
{
  "專利公開公告號": "US12345678",
  "技術1階": ["光子積體電路"],
  "技術2階": ["電路設計"],
  "技術3階": ["模擬驗證"],
  "應用領域": ["資料中心"],
  "功效節點": ["降低功耗"],
  "AI技術簡述": "...",
  "技術特徵手段": "...",
  "解決的技術問題或技術效益": "..."
}
```

> 每個維度欄位均為 **陣列**，一筆專利可對應多個維度值（Many-to-many）。

### 現有拖拉機制（@dnd-kit）

`levelHierarchy`（state 存於 `MindMapTab`）已支援拖拉改變心智圖層級順序，目前包含 5 個項目：

```
應用領域 / 技術1階 / 技術2階 / 技術3階 / 功效節點
```

Heatmap 的 X/Y 軸選擇可**共用此機制**，只需另行定義「heatmap 軸設定」的拖拉清單。

---

## 三、技術實作方案

### 3.1 Plotly.js 引入方式

目前 `package.json` **未安裝** Plotly，需新增相依：

```
plotly.js-dist-min  ≈ 3.5 MB (CDN 或 npm)
react-plotly.js     輕薄封裝層
```

**推薦方案：npm 安裝 `react-plotly.js` + `plotly.js-dist-min`**

```bash
npm install react-plotly.js plotly.js-dist-min
```

- `plotly.js-dist-min` 是 tree-shakeable 的精簡版，bundle 比完整版小約 40%。
- `react-plotly.js` 提供 `<Plot>` React 元件，可直接接受 `data` / `layout` props，無需手動管理 DOM。

> ⚠️ 若考慮 bundle 體積，可改用 **CDN 動態載入**方式（`<script>` lazy load），避免增加主 bundle 大小。

### 3.2 Heatmap 矩陣計算邏輯（純 JavaScript）

```js
// 假設 xDims = ['技術1階', '技術2階']，yDim = '功效節點'
function buildHeatmapMatrix(patents, xDims, yDim) {
  // Step 1: 產生所有 X 標籤（多層串接）
  const xLabels = new Set();
  patents.forEach(p => {
    const combos = cartesian(xDims.map(d => toArray(p[d])));
    combos.forEach(combo => xLabels.add(combo.join(' > ')));
  });

  // Step 2: 產生所有 Y 標籤
  const yLabels = new Set();
  patents.forEach(p => toArray(p[yDim]).forEach(v => yLabels.add(v)));

  // Step 3: 建立計數矩陣（去重專利）
  const xArr = [...xLabels];
  const yArr = [...yLabels];
  const matrix = yArr.map(() => xArr.map(() => new Set()));

  patents.forEach(p => {
    const pid = p['專利公開公告號'];
    const xs = cartesian(xDims.map(d => toArray(p[d]))).map(c => c.join(' > '));
    const ys = toArray(p[yDim]);
    xs.forEach(x => {
      ys.forEach(y => {
        const xi = xArr.indexOf(x);
        const yi = yArr.indexOf(y);
        if (xi >= 0 && yi >= 0) matrix[yi][xi].add(pid);
      });
    });
  });

  return {
    x: xArr,
    y: yArr,
    z: matrix.map(row => row.map(s => s.size))
  };
}
```

> Many-to-many 情況：一筆專利若對應到多個 X 值 & 多個 Y 值，則對每個 (X, Y) 格子各計一次（以相異專利件數為基礎）。這符合「相關性熱圖」語意。

### 3.3 Plotly coolwarm 色彩配置

Plotly 內建 `RdBu`（紅藍）近似 coolwarm，或可自定義：

```js
const coolwarmScale = [
  [0.0,  '#3b4cc0'],  // 深藍
  [0.25, '#7faef0'],
  [0.5,  '#f7f7f7'],  // 白
  [0.75, '#f4a582'],
  [1.0,  '#b2182b'],  // 深紅
];
```

### 3.4 Annotation 配置

```js
const annotations = [];
z.forEach((row, yi) => {
  row.forEach((val, xi) => {
    annotations.push({
      x: x[xi], y: y[yi],
      text: val > 0 ? String(val) : '',
      showarrow: false,
      font: { size: 11, color: val > maxVal * 0.5 ? '#fff' : '#111' }
    });
  });
});
```

### 3.5 X/Y 軸切換的拖拉介面

**方案 A（推薦）：Heatmap 專屬雙欄拖拉清單**

在 `MindMapTree`（或新的 `HeatmapView` 元件）左側面板建立兩個獨立的 `@dnd-kit` 清單：
- **X 軸維度池**（可放多個，串接顯示）
- **Y 軸維度池**（通常放一個）

使用者從「可用維度」池拖入 X 或 Y 區域。

```
┌─────────────────────────────────┐
│  可用維度（拖曳到X或Y）           │
│  [應用領域] [技術3階]             │
├───────────┬─────────────────────┤
│  X 軸維度  │  Y 軸維度           │
│ [技術1階]  │ [功效節點]          │
│ [技術2階]  │                    │
└───────────┴─────────────────────┘
```

**方案 B（簡易版）：下拉選單 + Checkbox**

用 `<select>` 讓使用者選擇 Y 軸維度，用 Checkbox 組合 X 軸維度。實作簡單但互動感較差。

---

## 四、受影響元件清單

| 元件/檔案 | 修改性質 | 說明 |
|-----------|----------|------|
| [MindMapTab.jsx](file:///e:/Antigravity_Project/Patent%20Analyzer-v03.0/frontend/src/components/MindMapTab.jsx) | **修改** | 新增 `viewMode` state（`'tree'` / `'heatmap'`）；在工具列新增切換按鈕 |
| [MindMapTree.jsx](file:///e:/Antigravity_Project/Patent%20Analyzer-v03.0/frontend/src/components/MindMapTree.jsx) | **修改** | 條件渲染：`viewMode === 'heatmap'` 時渲染 `HeatmapView` |
| `HeatmapView.jsx` | **新建** | 獨立元件：Plotly 圖表 + 左側 X/Y 軸拖拉配置介面 |
| `package.json` | **修改** | 新增 `react-plotly.js`、`plotly.js-dist-min` |

---

## 五、風險與注意事項

### 5.1 Bundle 體積

`plotly.js-dist-min` 約 **3.5 MB（gzip 後 ~1.1 MB）**，對現有的 Vite 專案是顯著的體積增加。

**緩解策略**：
- 使用 Vite 的 `lazy()` + `Suspense` 動態載入 `HeatmapView`，只有使用者切換到 Heatmap 頁時才載入 Plotly。
- 或改用 CDN `<script>` 動態注入（`window.Plotly`），完全不影響主 bundle。

### 5.2 Many-to-many 計數語意

一件專利可能同時屬於多個技術2階與多個功效節點，導致同一件專利在矩陣中多格出現。這是**正確且預期的行為**（反映技術涵蓋廣度），但需在圖表說明中標注「每格數字為相異專利件數，同一專利可計入多格」。

### 5.3 X 軸標籤長度

若 X 軸為技術1階+技術2階串接（如 `光子積體電路 > 先進封裝整合技術`），標籤可能超過 15 字。可採：
- Plotly `tickangle: -45` 斜排
- 或截斷至 12 字 + tooltip 顯示完整名稱

### 5.4 矩陣稀疏性

若技術2階共有 25 個節點、功效節點 6 個，矩陣為 25×6 = 150 格，其中大量可能為 0。需考慮是否在計算時**過濾掉全為 0 的列/欄**，減少視覺噪音。

### 5.5 @dnd-kit 雙清單切換

需要新增一個「X 軸 / Y 軸 / 未使用」三分區的 DnD 邏輯。現有 `levelHierarchy` 是一個有序陣列，無法直接複用。建議在 `HeatmapView` 元件內部管理獨立的 state。

---

## 六、開發工作量估算

| 工作項目 | 預估時間 |
|----------|----------|
| 安裝 Plotly 並驗證整合 | 0.5h |
| 矩陣計算函數（含 many-to-many）| 1h |
| HeatmapView 元件（Plotly 渲染 + coolwarm + annotation）| 1.5h |
| X/Y 軸拖拉介面（@dnd-kit 雙清單）| 1.5h |
| MindMapTab 視圖切換按鈕整合 | 0.5h |
| 測試與樣式調整 | 1h |
| **合計** | **約 6h** |

---

## 七、結論與建議

**可行性：高**。現有資料結構（`treeData.patents`）完整包含所有維度欄位，計算矩陣無需後端配合；@dnd-kit 已安裝且熟悉，擴充軸切換介面技術風險低。

**主要決策點**：

1. **Plotly 引入方式**：推薦 npm + Vite lazy import（體積影響可控）。
2. **X/Y 軸介面**：推薦方案 A（雙欄拖拉），互動感好且與現有心智圖拖拉操作體驗一致。
3. **稀疏矩陣處理**：預設過濾全零列/欄，以 toggle 提供「顯示全部」選項。

若確認啟動，建議從新建 `HeatmapView.jsx` 開始，採**元件完全獨立**設計，不影響現有 `MindMapTree.jsx` 邏輯。
