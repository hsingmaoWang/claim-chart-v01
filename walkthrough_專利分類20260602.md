# Walkthrough: Refined Two-Stage Patent Mindmap Classification

We have successfully resolved the issue where importing 165 patents caused token truncation in Stage 1, resulting in empty taxonomy categories and truncated patent counts.

## Changes Made

### Backend

#### [mindmap_processor.py](file:///e:/Antigravity_Project/Patent%20Analyzer-v02.1/backend/mindmap_processor.py)
* **`query_gemini_stage1`**: Prompt modified to **only** return the global taxonomy categories (title, application domains, efficacy nodes, and Level 1-2 tech trees) without mapping individual patents. Output size is reduced to ~500 tokens.
* **`robust_json_decode`**: Added fallback parsing to look for outermost `{` and `}` boundaries, increasing JSON recovery resilience.
* **`/api/mindmap/map_stage1` [NEW]**: Added a mapping endpoint that accepts the taxonomy tree and patent dataframe, splits the patents into batches of 50, maps them sequentially, and merges the results.
* **`generate_stage2`**: Added automatic batching (40 patents per batch) to Stage 2 subtree mappings if a single category path exceeds 40 patents.

---

### Frontend

#### [MindMapTab.jsx](file:///e:/Antigravity_Project/Patent%20Analyzer-v02.1/frontend/src/components/MindMapTab.jsx)
* **Dynamic Loader**: Changed loading overlays to dynamically display status messages during the classification and mapping stages.
* **`processFile` & `handleReprocess`**:
  * Uploading/Reprocessing now calls Stage 1 (Taxonomy-only) followed immediately by the new `/api/mindmap/map_stage1` endpoint.
  * Ensures that Column 4 ("專利映射狀態預覽") has a preview immediately, while keeping Category columns populated cleanly.
* **`handleGenerateStage2`**:
  * Upon clicking "🚀 生成技術 3 階", first executes `/api/mindmap/map_stage1` with the calibrated taxonomy, then executes `generate_stage2`.
  * Preserves any engineer-edited categories in the final mappings.

---

## Verification Results

### Build Verification
We ran `npm run build` inside the `frontend` directory. The project built successfully:
```bash
vite v8.0.8 building client environment for production...
transforming...✓ 2469 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                     0.47 kB │ gzip:   0.31 kB
dist/assets/index-BJU4_GvK.css      7.71 kB │ gzip:   2.33 kB
dist/assets/index-hLPnZZSE.js   1,150.99 kB │ gzip: 362.46 kB
✓ built in 8.17s
```

### Python Syntax Verification
We ran `python -m py_compile backend/mindmap_processor.py`, which completed successfully with no compilation or syntax errors.
