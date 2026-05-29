import os
import json
import logging
import uuid
import pandas as pd
import re
from collections import Counter
from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
import tempfile

# --- Path Fix ---
import sys
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)
if parent_dir not in sys.path:
    sys.path.append(parent_dir)

import analyzer
import extractor
get_genai_client = analyzer.get_genai_client
extract_pdf_content = extractor.extract_pdf_content

logger = logging.getLogger(__name__)
router = APIRouter()

class MindMapConfig(BaseModel):
    app_area_count: str = "3~5"
    tech1_count: str = "3~5"
    tech2_count: str = "3~7"
    tech3_count: str = "3~7"
    efficacy_count: str = "3~6"
    file_id: str = ""

def extract_patents_from_excel(file_path):
    df = pd.read_excel(file_path)
    return df.fillna("")

def df_to_ai_content(df):
    relevant_keywords = ["號", "名稱", "領域", "技術", "功效"]
    relevant_cols = [c for c in df.columns if any(k in str(c) for k in relevant_keywords)]
    ai_patents = []
    for _, row in df.iterrows():
        p_data = {str(c): str(row[c]) for c in relevant_cols if row[c] != ""}
        ai_patents.append(p_data)
    return json.dumps(ai_patents, ensure_ascii=False)

def robust_json_decode(text):
    """自癒 JSON 解析器"""
    text = text.strip()
    text = re.sub(r'^```json\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    # 清除控制字元（這是 Unterminated string 的主要元兇）
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        logger.warning("Standard JSON parse failed, initiating regex recovery...")
        objs = re.findall(r'\{(?:[^{}]|\{[^{}]*\})*\}', text)
        patents = []
        for obj_str in objs:
            try:
                clean_obj = re.sub(r',\s*}', '}', obj_str)
                p_item = json.loads(clean_obj)
                if "專利公開公告號" in p_item:
                    patents.append(p_item)
            except:
                continue
        if patents:
            return {"patents": patents}
        raise ValueError("Could not recover valid JSON.")

def refine_categories_with_ai(parent_name, subcategories, max_count, provider, client=None):
    """
    使用 AI 進行超限分類的「層級廣度自癒壓縮（AI-driven generalization）」。
    """
    subcats_str = ", ".join([f'"{s}"' for s in subcategories])
    prompt = f"""你是專利分類專家。在專利技術層級分類中，父類別「{parent_name}」下目前有以下 {len(subcategories)} 個子類別：
[{subcats_str}]

因為限制，子類別數量最多只能有 {max_count} 個。
請依據這些子類別的名稱與語意特徵，重新進行概念向上歸納（Generalization / 分類廣度調整），將它們歸併為最多 {max_count} 個標籤命名更寬廣、更具代表性的新子類別。

請輸出一個嚴格格式的 JSON 對照表，將原來的子類別對應到歸納後的新子類別，例如：
{{
  "原類別A": "新歸納寬類別1",
  "原類別B": "新歸納寬類別1",
  "原類別C": "新歸納寬類別2"
}}
注意：對照表中的值（新類別）數量不能超過 {max_count} 個。
ONLY output raw JSON. Do not include markdown blocks like ```json in the final response.
"""
    try:
        if provider == "openrouter":
            payload = {
                "model": "google/gemini-2.5-flash",
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
                "temperature": 0.1
            }
            resp_data = analyzer.send_openrouter_request(payload, timeout=60.0)
            response_text = resp_data["choices"][0]["message"]["content"]
        else:
            if client is None:
                client = get_genai_client()
            resp = client.models.generate_content(
                model="gemini-2.5-flash", contents=prompt,
                config={"temperature": 0.1, "response_mime_type": "application/json"}
            )
            response_text = resp.text

        mapping = json.loads(response_text)
        if isinstance(mapping, dict):
            return mapping
        return {}
    except Exception as e:
        logger.error(f"AI category refinement failed: {e}. Falling back to standard mapping.")
        return {}

def enforce_category_limits_hierarchical(patents: list, config: MindMapConfig, provider, client=None) -> list:
    """
    層階式限額強制器：
    1. 應用領域：限制在 app_area_count 內。
    2. 技術1階：限制在 tech1_count 內。
    3. 技術2階：對於每個技術1階，限制其擁有的技術2階子節點在 tech2_count 內。
    4. 技術3階：對於每個 (技術1階, 技術2階) 父節點對，限制其技術3階在 tech3_count 內。
    5. 功效節點：限制在 efficacy_count 內。
    
    使用 AI-driven semantic generalization 作為主要手段，若失敗則以機械合併作 fallback。
    """
    def safe_int(val, default):
        try:
            val_str = str(val).strip()
            if '~' in val_str:
                return int(val_str.split('~')[-1].strip())
            return int(val_str)
        except:
            return default

    lim_app = safe_int(config.app_area_count, 7)
    lim_t1 = safe_int(config.tech1_count, 5)
    lim_t2 = safe_int(config.tech2_count, 7)
    lim_t3 = safe_int(config.tech3_count, 5)
    lim_eff = safe_int(config.efficacy_count, 5)

    def apply_fallback_merge(items_set, frequencies_counter, limit, current_mapping):
        mapped_vals = set(current_mapping.values())
        if not current_mapping or len(mapped_vals) > limit:
            sorted_items = sorted(list(items_set), key=lambda x: frequencies_counter.get(x, 0), reverse=True)
            keep = set(sorted_items[:limit])
            fallback = sorted_items[0] if sorted_items else "其他"
            for v in items_set:
                if v not in keep and v not in current_mapping:
                    current_mapping[v] = fallback
        return current_mapping

    # Ensure all patents have basic list fields
    for p in patents:
        if "應用領域" not in p or not p["應用領域"]: p["應用領域"] = ["其他"]
        if "功效節點" not in p or not p["功效節點"]: p["功效節點"] = ["其他"]
        if "技術路徑" not in p:
            t1 = p.get("技術1階", ["其他"])
            t2 = p.get("技術2階", ["其他"])
            t3 = p.get("技術3階", ["其他"])
            t1_str = t1[0] if isinstance(t1, list) and t1 else str(t1)
            t2_str = t2[0] if isinstance(t2, list) and t2 else str(t2)
            t3_str = t3[0] if isinstance(t3, list) and t3 else str(t3)
            p["技術路徑"] = [[t1_str, t2_str, t3_str]]

    # 1. 應用領域 (Global limit)
    app_freq = Counter()
    for p in patents:
        for val in p.get("應用領域", []):
            app_freq[val] += 1
    if len(app_freq) > lim_app:
        mapping = refine_categories_with_ai("應用領域", list(app_freq.keys()), lim_app, provider, client)
        mapping = apply_fallback_merge(list(app_freq.keys()), app_freq, lim_app, mapping)
        for p in patents:
            p["應用領域"] = list(set([mapping.get(v, v) for v in p.get("應用領域", [])]))

    # 2. 功效節點 (Global limit)
    eff_freq = Counter()
    for p in patents:
        for val in p.get("功效節點", []):
            eff_freq[val] += 1
    if len(eff_freq) > lim_eff:
        mapping = refine_categories_with_ai("功效節點", list(eff_freq.keys()), lim_eff, provider, client)
        mapping = apply_fallback_merge(list(eff_freq.keys()), eff_freq, lim_eff, mapping)
        for p in patents:
            p["功效節點"] = list(set([mapping.get(v, v) for v in p.get("功效節點", [])]))

    # 3. 技術1階 (Global limit for level 1)
    t1_freq = Counter()
    for p in patents:
        for path in p.get("技術路徑", []):
            if len(path) > 0:
                t1_freq[path[0]] += 1
    if len(t1_freq) > lim_t1:
        mapping = refine_categories_with_ai("技術1階", list(t1_freq.keys()), lim_t1, provider, client)
        mapping = apply_fallback_merge(list(t1_freq.keys()), t1_freq, lim_t1, mapping)
        for p in patents:
            new_paths = []
            for path in p.get("技術路徑", []):
                if len(path) > 0:
                    path[0] = mapping.get(path[0], path[0])
                new_paths.append(path)
               # 5. 技術3階 (Per Technical 2 node)
    t2_to_t3 = {}
    t3_freq_per_t2 = {}
    for p in patents:
        for path in p.get("技術路徑", []):
            if len(path) > 2:
                t1, t2, t3 = path[0], path[1], path[2]
                t2_to_t3.setdefault((t1, t2), set()).add(t3)
                t3_freq_per_t2.setdefault((t1, t2), Counter())[t3] += 1

def query_gemini_stage1(text_content: str, config: MindMapConfig, df=None):
    import dotenv
    dotenv.load_dotenv(override=True)
    provider = os.environ.get("API_PROVIDER", "gemini").lower().strip().replace('"', '').replace("'", "")
    client = get_genai_client() if provider != "openrouter" else None

    pub_col_name = next((c for c in df.columns if "號" in str(c)), None) if df is not None else None
    
    col_app = next((c for c in df.columns if "應用領域" in str(c)), "")
    col_eff = next((c for c in df.columns if "功效節點" in str(c)), "")
    col_brief = next((c for c in df.columns if "AI技術簡述" in str(c)), "")
    col_means = next((c for c in df.columns if "技術特徵手段" in str(c)), "")
    col_effect = next((c for c in df.columns if "解決的技術問題或技術效益" in str(c)), "")

    patents_list = ""
    if df is not None:
        for _, row in df.iterrows():
            p_no = str(row.get(pub_col_name, "N/A")).strip()
            bits = []
            if col_app and str(row[col_app]).strip(): bits.append(f"領域:{str(row[col_app]).strip()}")
            if col_eff and str(row[col_eff]).strip(): bits.append(f"功效:{str(row[col_eff]).strip()}")
            
            tech_elements = []
            if col_brief and str(row[col_brief]).strip(): tech_elements.append(f"簡述:{str(row[col_brief]).strip()}")
            if col_means and str(row[col_means]).strip(): tech_elements.append(f"手段:{str(row[col_means]).strip()}")
            if col_effect and str(row[col_effect]).strip(): tech_elements.append(f"效益:{str(row[col_effect]).strip()}")
            if tech_elements:
                bits.append(f"技術特徵:{' '.join(tech_elements)}")
                
            patents_list += f"[{p_no}] {' | '.join(bits)}\n"

    # Stage 1: Generate global level 1 & 2 taxonomy, application areas, and efficacy nodes.
    prompt = f"""你是專利分類專家，請對這批專利進行語意分類與樹狀結構建模。
請注意：本階段【只生成技術1階與技術2階，不要生成技術3階】。

【分類限制要求】：
1. 應用領域：預設分類數量限制為 {config.app_area_count} 個。
2. 功效節點：預設分類數量限制為 {config.efficacy_count} 個。
3. 技術層級樹（只到2階）：
   - 技術1階：總共分類為 {config.tech1_count} 個主要技術類別。
   - 技術2階（依附於技術1階）：在每個「技術1階」下，分類為 {config.tech2_count} 個子技術類別。

【任務與格式規定】：
- 請構建全域分類目錄，並為每件專利匹配最合適的「應用領域」與「功效節點」標籤（可多選）。
- 為每件專利匹配符合層級依附的「技術路徑」陣列（即：從技術1階到技術2階的完整路徑，例如：["半導體", "先進封裝"]）。
- 一件專利可同時對應多條技術路徑。
- 產出一個 summary_title 概括這批專利的核心技術主題，必須是完整且有意義的名詞短語（例如：「光子積體電路技術與應用」、「半導體先進封裝技術」）。
- 務必調整分類命名的廣度 (Generalization/Specialization) 使得輸出的分類總數不違反上述限制。

【格式】ONLY output a JSON object with keys: summary_title (string), 應用領域 (array of strings), 功效節點 (array of strings), 技術樹 (array of objects), patents (array of objects).
技術樹結構：
"技術樹": [
  {{
    "技術1階": "技術1階名稱A",
    "技術2階": ["子技術1", "子技術2"]
  }}
]

每個專利物件結構：
{{
  "專利公開公告號": "...",
  "技術路徑": [
    ["技術1階名稱", "技術2階名稱"]
  ],
  "應用領域": ["領域1", "領域2"],
  "功效節點": ["功效A"]
}}

待分析清單：
{patents_list}
"""
    try:
        response_text = ""
        if provider == "openrouter":
            payload = {
                "model": "google/gemini-2.5-flash",
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
                "temperature": 0.1, "max_tokens": 16000
            }
            resp_data = analyzer.send_openrouter_request(payload, timeout=600.0)
            response_text = resp_data["choices"][0]["message"]["content"]
        else:
            resp = client.models.generate_content(
                model="gemini-2.5-flash", contents=prompt,
                config={"max_output_tokens": 16000, "temperature": 0.1, "response_mime_type": "application/json"}
            )
            response_text = resp.text

        parsed = robust_json_decode(response_text)
        return parsed
    except Exception as e:
        logger.error(f"Stage 1 LLM failed: {e}")
        return None

temp_storage = {}

@router.post("/api/mindmap/upload")
async def upload_for_mindmap(file: UploadFile = File(...)):
    try:
        file_id = str(uuid.uuid4())
        temp_dir = os.path.join(tempfile.gettempdir(), "mindmap", file_id)
        os.makedirs(temp_dir, exist_ok=True)
        file_path = os.path.join(temp_dir, file.filename)
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
        df = extract_patents_from_excel(file_path)
        text_content = df_to_ai_content(df)
        
        config = MindMapConfig()
        result = query_gemini_stage1(text_content, config, df=df)
        if not result: raise ValueError("AI processing failed.")
        
        # Clean and validate Stage 1 results
        patents = result.get("patents", [])
        for p in patents:
            if "專利公開公告號" not in p:
                for k in ["公開公告號", "專利號", "patent_number"]:
                    if k in p:
                        p["專利公開公告號"] = p[k]
                        break
            p["專利公開公告號"] = str(p.get("專利公開公告號", "")).strip()
            if "技術路徑" not in p or not p["技術路徑"]:
                p["技術路徑"] = [["其他", "其他"]]
            else:
                new_paths = []
                for path in p["技術路徑"]:
                    if len(path) < 2:
                        path = list(path) + ["其他"] * (2 - len(path))
                    new_paths.append(path[:2])
                p["技術路徑"] = new_paths
            if "應用領域" not in p or not p["應用領域"]:
                p["應用領域"] = ["其他"]
            if "功效節點" not in p or not p["功效節點"]:
                p["功效節點"] = ["其他"]

        temp_storage[file_id] = {
            "text": text_content,
            "df": df,
            "filename": file.filename,
            "stage1_result": result
        }
        
        result["file_id"] = file_id
        result["filename"] = file.filename
        result["is_stage1"] = True
        return result
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/mindmap/reprocess")
async def reprocess_mindmap(config: MindMapConfig):
    try:
        if config.file_id not in temp_storage: raise ValueError("Session expired.")
        text_content = temp_storage[config.file_id]["text"]
        df = temp_storage[config.file_id].get("df")
        result = query_gemini_stage1(text_content, config, df=df)
        if not result: raise ValueError("AI processing failed.")
        
        patents = result.get("patents", [])
        for p in patents:
            if "專利公開公告號" not in p:
                for k in ["公開公告號", "專利號", "patent_number"]:
                    if k in p:
                        p["專利公開公告號"] = p[k]
                        break
            p["專利公開公告號"] = str(p.get("專利公開公告號", "")).strip()
            if "技術路徑" not in p or not p["技術路徑"]:
                p["技術路徑"] = [["其他", "其他"]]
            else:
                new_paths = []
                for path in p["技術路徑"]:
                    if len(path) < 2:
                        path = list(path) + ["其他"] * (2 - len(path))
                    new_paths.append(path[:2])
                p["技術路徑"] = new_paths
            if "應用領域" not in p or not p["應用領域"]:
                p["應用領域"] = ["其他"]
            if "功效節點" not in p or not p["功效節點"]:
                p["功效節點"] = ["其他"]

        temp_storage[config.file_id]["stage1_result"] = result
        
        result["file_id"] = config.file_id
        result["filename"] = temp_storage[config.file_id]["filename"]
        result["is_stage1"] = True
        return result
    except Exception as e:
        logger.error(f"Reprocess error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/mindmap/generate_stage2")
async def generate_stage2(data: dict):
    try:
        file_id = data.get("file_id")
        taxonomy = data.get("taxonomy", {})
        patents_mapping = data.get("patents", [])
        config_dict = data.get("config", {})
        
        config = MindMapConfig(**config_dict)
        
        if not file_id or file_id not in temp_storage:
            raise HTTPException(status_code=400, detail="Session expired or file_id invalid.")
            
        df = temp_storage[file_id]["df"]
        pub_col_name = next((c for c in df.columns if "號" in str(c)), None)
        if not pub_col_name:
            raise HTTPException(status_code=500, detail="Could not identify patent number column.")
            
        patent_lookup = {}
        col_brief = next((c for c in df.columns if "AI技術簡述" in str(c)), "")
        col_means = next((c for c in df.columns if "技術特徵手段" in str(c)), "")
        col_effect = next((c for c in df.columns if "解決的技術問題或技術效益" in str(c)), "")
        
        for _, row in df.iterrows():
            p_no = str(row.get(pub_col_name, "")).strip()
            patent_lookup[p_no] = {
                "AI技術簡述": str(row.get(col_brief, "")).strip(),
                "技術特徵手段": str(row.get(col_means, "")).strip(),
                "解決的技術問題或技術效益": str(row.get(col_effect, "")).strip()
            }
            
        # Group patent numbers under unique (T1, T2) paths
        path_to_patents = {}
        for p in patents_mapping:
            p_no = str(p.get("專利公開公告號", "")).strip()
            paths = p.get("技術路徑", [])
            for path in paths:
                if len(path) >= 2:
                    t1, t2 = path[0], path[1]
                    path_to_patents.setdefault((t1, t2), []).append(p_no)
                    
        import dotenv
        dotenv.load_dotenv(override=True)
        provider = os.environ.get("API_PROVIDER", "gemini").lower().strip().replace('"', '').replace("'", "")
        client = get_genai_client() if provider != "openrouter" else None
        
        t3_results = {}
        
        # Strategy B: Loop through each subtree path and request Level 3 categories
        for (t1, t2), p_nos in path_to_patents.items():
            if not p_nos:
                continue
                
            batch_text = ""
            for p_no in p_nos:
                details = patent_lookup.get(p_no, {})
                brief = details.get("AI技術簡述", "")
                means = details.get("技術特徵手段", "")
                effect = details.get("解決的技術問題或技術效益", "")
                batch_text += f"[{p_no}] 簡述:{brief} | 手段:{means} | 效益:{effect}\n"
                
            prompt = f"""你是專利分類專家。現有以下專利被歸類於「技術1階：{t1}」->「技術2階：{t2}」下方。
請針對這批專利，在「技術2階：{t2}」之下進一步細分出最匹配的「技術3階」子類別。
並且為每件專利指派對應的「技術3階」子類別。

【分類限制】：
1. 技術3階：在此「技術2階：{t2}」子樹下，最多只能細分出 {config.tech3_count} 個「技術3階」子類別。
2. 命名必須是具體、明確的技術特徵，且長度適中。

【格式】ONLY output a JSON object with keys: "技術3階類別" (array of strings), "patents" (array of objects).
例如：
{{
  "技術3階類別": ["細分類別A", "細分類別B"],
  "patents": [
    {{
      "專利公開公告號": "...",
      "技術3階": ["細分類別A"]
    }}
  ]
}}

待分析專利清單：
{batch_text}
"""
            try:
                response_text = ""
                if provider == "openrouter":
                    payload = {
                        "model": "google/gemini-2.5-flash",
                        "messages": [{"role": "user", "content": prompt}],
                        "response_format": {"type": "json_object"},
                        "temperature": 0.1, "max_tokens": 16000
                    }
                    resp_data = analyzer.send_openrouter_request(payload, timeout=300.0)
                    response_text = resp_data["choices"][0]["message"]["content"]
                else:
                    resp = client.models.generate_content(
                        model="gemini-2.5-flash", contents=prompt,
                        config={"max_output_tokens": 16000, "temperature": 0.1, "response_mime_type": "application/json"}
                    )
                    response_text = resp.text
                    
                parsed = robust_json_decode(response_text)
                t3_categories = parsed.get("技術3階類別", [])
                patent_t3_list = parsed.get("patents", [])
                
                patent_t3_map = {}
                for item in patent_t3_list:
                    p_id = str(item.get("專利公開公告號", "")).strip()
                    t3_vals = item.get("技術3階", [])
                    if isinstance(t3_vals, str):
                        t3_vals = [t3_vals]
                    valid_t3s = [v for v in t3_vals if v in t3_categories]
                    if not valid_t3s and t3_categories:
                        valid_t3s = [t3_categories[0]]
                    elif not valid_t3s:
                        valid_t3s = ["其他"]
                    patent_t3_map[p_id] = valid_t3s
                    
                t3_results[(t1, t2)] = {
                    "T3_categories": t3_categories,
                    "patent_t3_map": patent_t3_map
                }
            except Exception as e:
                logger.error(f"Stage 2 Strategy B failed for path ({t1}, {t2}): {e}")
                t3_results[(t1, t2)] = {
                    "T3_categories": ["其他"],
                    "patent_t3_map": {p_no: ["其他"] for p_no in p_nos}
                }
                
        # Mechanical merge
        final_patents = []
        for p in patents_mapping:
            p_no = str(p.get("專利公開公告號", "")).strip()
            app_areas = p.get("應用領域", ["其他"])
            eff_nodes = p.get("功效節點", ["其他"])
            paths = p.get("技術路徑", [])
            
            details = patent_lookup.get(p_no, {})
            brief = details.get("AI技術簡述", "")
            means = details.get("技術特徵手段", "")
            effect = details.get("解決的技術問題或技術效益", "")
            
            if not paths:
                paths = [["其他", "其他"]]
                
            for path in paths:
                if len(path) < 2:
                    path = list(path) + ["其他"] * (2 - len(path))
                t1, t2 = path[0], path[1]
                
                t3_info = t3_results.get((t1, t2), {})
                patent_t3_map = t3_info.get("patent_t3_map", {})
                t3_vals = patent_t3_map.get(p_no, ["其他"])
                
                for t3 in t3_vals:
                    new_pat = {
                        "專利公開公告號": p_no,
                        "技術1階": [t1],
                        "技術2階": [t2],
                        "技術3階": [t3],
                        "應用領域": app_areas,
                        "功效節點": eff_nodes,
                        "AI技術簡述": brief,
                        "技術特徵手段": means,
                        "解決的技術問題或技術效益": effect
                    }
                    final_patents.append(new_pat)
                    
        return {
            "summary_title": taxonomy.get("summary_title", "專利分類心智圖"),
            "patents": final_patents,
            "file_id": file_id,
            "filename": temp_storage[file_id]["filename"]
        }
    except Exception as e:
        logger.error(f"Stage 2 execution error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def query_gemini_mindmap(text_content: str, config: MindMapConfig, df=None):
    res1 = query_gemini_stage1(text_content, config, df=df)
    if not res1:
        return None
    patents_mapping = res1.get("patents", [])
    final_patents = []
    col_brief = next((c for c in df.columns if "AI技術簡述" in str(c)), "") if df is not None else ""
    col_means = next((c for c in df.columns if "技術特徵手段" in str(c)), "") if df is not None else ""
    col_effect = next((c for c in df.columns if "解決的技術問題或技術效益" in str(c)), "") if df is not None else ""
    pub_col_name = next((c for c in df.columns if "號" in str(c)), None) if df is not None else None
    
    patent_lookup = {}
    if df is not None and pub_col_name:
        for _, row in df.iterrows():
            p_no = str(row.get(pub_col_name, "")).strip()
            patent_lookup[p_no] = {
                "AI技術簡述": str(row.get(col_brief, "")).strip(),
                "技術特徵手段": str(row.get(col_means, "")).strip(),
                "解決的技術問題或技術效益": str(row.get(col_effect, "")).strip()
            }

    for p in patents_mapping:
        p_no = p.get("專利公開公告號", "")
        app_areas = p.get("應用領域", ["其他"])
        eff_nodes = p.get("功效節點", ["其他"])
        paths = p.get("技術路徑", [["其他", "其他"]])
        
        details = patent_lookup.get(p_no, {})
        brief = details.get("AI技術簡述", "")
        means = details.get("技術特徵手段", "")
        effect = details.get("解決的技術問題或技術效益", "")
        
        for path in paths:
            t1, t2 = path[0], path[1]
            new_pat = {
                "專利公開公告號": p_no,
                "技術1階": [t1],
                "技術2階": [t2],
                "技術3階": ["其他"],
                "應用領域": app_areas,
                "功效節點": eff_nodes,
                "AI技術簡述": brief,
                "技術特徵手段": means,
                "解決的技術問題或技術效益": effect
            }
            final_patents.append(new_pat)
    return {"summary_title": res1.get("summary_title", "專利分類心智圖"), "patents": final_patents}

@router.post("/api/mindmap/export")
async def export_mindmap_excel(data: dict):
    patents = data.get("patents", [])
    original_filename = data.get("filename", "download")
    if not patents: raise HTTPException(status_code=400, detail="No data.")
    df_out = pd.DataFrame(patents)
    name, _ = os.path.splitext(original_filename)
    out_filename = f"{name}_AG.xlsx"
    temp_dir = os.path.join(tempfile.gettempdir(), "mindmap_export")
    os.makedirs(temp_dir, exist_ok=True)
    out_path = os.path.join(temp_dir, out_filename)
    df_out.to_excel(out_path, index=False)
    return FileResponse(path=out_path, filename=out_filename,
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
