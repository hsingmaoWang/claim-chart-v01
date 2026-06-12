# Refined Two-Stage Patent Mindmap Classification Implementation Plan

This plan describes the refactoring of the patent mindmap classification workflow to handle larger patent lists (e.g., 150+ patents) without hitting LLM output token limits, while maintaining human-in-the-loop calibration.

## Feasibility Analysis
**Yes, this plan is highly feasible.** It separates the heavy token-generating steps (mapping patents to categories) from the schema definition steps. By batching patent mapping calls to 50 patents per request, we guarantee that no single LLM response exceeds the 8,192 token limit. 

## Refined Workflow Architecture

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant LLM

    %% Stage 1 Phase 1
    User->>Frontend: Upload Excel (165 Patents)
    Frontend->>Backend: POST /api/mindmap/upload
    Backend->>LLM: Gen Taxonomy Tree (No mapping)
    LLM-->>Backend: Global Schema (Title, App Areas, Efficacy, Levels 1-2)
    Backend-->>Frontend: Return Global Schema (Clean & Complete JSON)
    
    %% Human Calibration
    Note over Frontend: Engineer reviews & edits Taxonomy Tree
    
    %% Stage 1 Phase 2
    User->>Frontend: Click "Confirm & Map 1-2 Levels"
    Frontend->>Backend: POST /api/mindmap/map_stage1 (Schema + 165 Patents)
    Note over Backend: Split 165 patents into batches of 50
    loop For each batch (e.g., Batch 1-3: 50 patents, Batch 4: 15 patents)
        Backend->>LLM: Map 50 patents to Schema
        LLM-->>Backend: Mapping Array (50 items)
    end
    Note over Backend: Merge mappings into stage1_patents
    Backend-->>Frontend: Return Stage 1 Mapped Patents (165 items)
    
    %% Stage 2
    User->>Frontend: Click "Generate Tech Level 3"
    Frontend->>Backend: POST /api/mindmap/generate_stage2 (Calibrated Schema + Mapped Patents)
    Note over Backend: Group patents by (T1, T2) paths
    loop For each unique (T1, T2) path
        Backend->>LLM: Generate Level 3 & Map subgroup patents
        LLM-->>Backend: Level 3 taxonomy + Mapping
    end
    Note over Backend: Merge Level 3 results into final structure
    Backend-->>Frontend: Return Final 3-Level Mindmap Data
```

---

## Proposed Changes

### Backend Component

#### [MODIFY] [mindmap_processor.py](file:///e:/Antigravity_Project/Patent%20Analyzer-v02.1/backend/mindmap_processor.py)
* **`query_gemini_stage1`**: Modify the prompt to **only** output the taxonomy structure (`summary_title`, `應用領域`, `功效節點`, `技術樹`) without the `patents` mapping list.
* **[NEW] `/api/mindmap/map_stage1` API endpoint**:
  * Receives the calibrated taxonomy tree and all patent texts.
  * Splits patents into batches of maximum 50.
  * Calls Gemini for each batch to map patents to the pre-defined categories.
  * Merges all mapped patents into a single list and returns it.
* **`generate_stage2`**: Enhance to use the newly batched schema and handle any edge cases where a sub-tree has too many patents (e.g., batching if a single `(T1, T2)` has >40 patents).

---

### Frontend Component

#### [MODIFY] [MindMapTab.jsx](file:///e:/Antigravity_Project/Patent%20Analyzer-v02.1/frontend/src/components/MindMapTab.jsx)
* **`processFile` / `handleUpload`**:
  * Update to handle the mapping-free schema response.
  * Set UI state to `review_stage1` showing the empty calibrated columns.
* **Introduce a new intermediate step (e.g. `mapping_stage1`)**:
  * Add a step between taxonomy editing and Stage 2.
  * When the user clicks the action button, first call `/api/mindmap/map_stage1` to get all patents mapped.
  * Display the mapped patents list in Column 4.
  * Then unlock the "🚀 生成技術 3 階" button to run Stage 2.

---

## Verification Plan

### Automated/Integration Verification
* Upload `test.xlsx` containing 165 patents.
* Verify `/api/mindmap/upload` successfully returns the empty taxonomy object without truncation warnings.
* Perform edits on the frontend UI and submit.
* Verify `/api/mindmap/map_stage1` completes successfully (calling LLM in 4 batches of `[50, 50, 50, 15]`) and returns exactly 165 mapped patents.
* Verify `/api/mindmap/generate_stage2` runs successfully and correctly appends Level 3 mappings.
