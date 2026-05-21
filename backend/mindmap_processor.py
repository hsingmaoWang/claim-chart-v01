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
    app_area_count: str = "4"
    tech1_count: str = "4"
    tech2_count: str = "5"
    tech3_count: str = "4"
    efficacy_count: str = "4"
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

def enforce_category_limits(patents: list, config: MindMapConfig) -> list:
    """
    後端強制分類限制器：
    如果 AI 產出的類別數超過設定值，自動合併最小的類別到最鄰近的大類。
    這是真正解決「AI 無視數量限制」的根治方案。
    """
    def safe_int(val, default):
        try: return int(str(val).strip())
        except: return default

    limits = {
        "技術1階": safe_int(config.tech1_count, 4),
        "技術2階": safe_int(config.tech2_count, 5),
        "技術3階": safe_int(config.tech3_count, 4),
        "應用領域": safe_int(config.app_area_count, 4),
        "功效節點": safe_int(config.efficacy_count, 4),
    }

    def normalize_to_list(val):
        if isinstance(val, list): return val
        if isinstance(val, str):
            if ',' in val or '、' in val:
                return [v.strip() for v in re.split(r'[,、]', val) if v.strip()]
            return [val.strip()] if val.strip() else []
        return []

    def merge_excess(patents, field, max_count):
        """統計各類別件數，超出限制的小類別合併到最大的類別"""
        # 統計各值的頻次
        freq = Counter()
        for p in patents:
            vals = normalize_to_list(p.get(field, []))
            for v in vals:
                freq[v] += 1

        unique_vals = list(freq.keys())
        if len(unique_vals) <= max_count:
            return patents  # 未超出，不需處理

        # 按頻次排序，保留前 max_count 個，其餘合併入最大的
        sorted_vals = sorted(unique_vals, key=lambda x: freq[x], reverse=True)
        keep = set(sorted_vals[:max_count])
        fallback = sorted_vals[0]  # 最大的類別作為 fallback

        logger.info(f"[Enforce] {field}: {len(unique_vals)} cats → merging to {max_count}. Fallback: {fallback}")

        for p in patents:
            vals = normalize_to_list(p.get(field, []))
            new_vals = []
            for v in vals:
                new_vals.append(v if v in keep else fallback)
            p[field] = list(dict.fromkeys(new_vals))  # dedup preserving order
        return patents

    # Apply limits to all hierarchy fields
    for field, max_count in limits.items():
        patents = merge_excess(patents, field, max_count)

    return patents

def query_gemini_mindmap(text_content: str, config: MindMapConfig, df=None):
    import dotenv
    dotenv.load_dotenv(override=True)
    provider = os.environ.get("API_PROVIDER", "gemini").lower().strip().replace('"', '').replace("'", "")

    total_patents = len(df) if df is not None else 0
    pub_col_name = next((c for c in df.columns if "號" in str(c)), None) if df is not None else None
    col_app = next((c for c in df.columns if "應用領域" in str(c)), "")
    col_t1  = next((c for c in df.columns if "技術1階" in str(c)), "")
    col_t2  = next((c for c in df.columns if "技術2階" in str(c)), "")
    col_t3  = next((c for c in df.columns if "技術3階" in str(c)), "")
    col_eff = next((c for c in df.columns if "功效節點" in str(c)), "")

    patents_list = ""
    if df is not None:
        for _, row in df.iterrows():
            p_no = str(row.get(pub_col_name, "N/A")).strip()
            bits = []
            if col_app: bits.append(f"領域:{str(row[col_app]).replace(chr(10),' ')}")
            if col_t1:  bits.append(f"T1:{str(row[col_t1]).replace(chr(10),' ')}")
            if col_t2:  bits.append(f"T2:{str(row[col_t2]).replace(chr(10),' ')}")
            if col_t3:  bits.append(f"T3:{str(row[col_t3]).replace(chr(10),' ')}")
            if col_eff: bits.append(f"功效:{str(row[col_eff]).replace(chr(10),' ')}")
            patents_list += f"[{p_no}] {' | '.join(bits)}\n"

    prompt = f"""你是專利分類專家，請對 {total_patents} 件專利輸出分類標籤清單。

【任務】：
1. 閱讀每件專利的「領域、T1、T2、T3、功效」欄位內容。
2. 為每件專利的五個維度，輸出「歸納後的宏觀標籤」，不可直接搬運細碎原文。
3. 額外產出一個 summary_title，概括這批專利的技術主題。

【重要：每個欄位均輸出「陣列格式」】
- 一件專利可同時屬於多個技術類別（多維掛載），請依實際分析決定是否給予多個標籤。
- 技術1階、技術2階、技術3階：陣列 (array of strings)。
- 應用領域、功效節點：陣列 (array of strings)。

【格式】ONLY output a JSON object with keys: summary_title (string), patents (array).
Each patent object MUST follow this exact schema:
{{
  "專利公開公告號": "...",
  "技術1階": ["類別A", "類別B"],
  "技術2階": ["子類X"],
  "技術3階": ["集群Y"],
  "應用領域": ["領域1", "領域2"],
  "功效節點": ["功效A"]
}}

待分析清單：
{patents_list}
"""

    try:
        response_text = ""
        if provider == "openrouter":
            import httpx, ssl, truststore
            ctx = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            payload = {
                "model": "google/gemini-2.5-flash",
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
                "temperature": 0.1, "max_tokens": 16000
            }
            logger.info(f"Flat+Enforce Request ({total_patents}) via OpenRouter...")
            with httpx.Client(verify=ctx, timeout=600.0) as client:
                resp = client.post("https://openrouter.ai/api/v1/chat/completions",
                                   headers={"Authorization": f"Bearer {os.environ.get('OPENROUTER_API_KEY')}"},
                                   json=payload)
                response_text = resp.json()["choices"][0]["message"]["content"]
        else:
            client = get_genai_client()
            resp = client.models.generate_content(
                model="gemini-2.5-flash", contents=prompt,
                config={"max_output_tokens": 16000, "temperature": 0.1}
            )
            response_text = resp.text

        parsed = robust_json_decode(response_text)

        # Extract patents list and summary_title
        summary_title = parsed.get("summary_title", "")
        patents = parsed.get("patents", parsed if isinstance(parsed, list) else [])

        # === BACKEND ENFORCEMENT ===
        patents = enforce_category_limits(patents, config)

        # === RULE 9: Data enrichment ===
        if df is not None and pub_col_name:
            data_map = {str(row[pub_col_name]).strip(): row for _, row in df.iterrows()}
            for p in patents:
                p_no = str(p.get("專利公開公告號", "")).strip()
                if p_no in data_map:
                    row = data_map[p_no]
                    for fld in ["AI技術簡述", "技術特徵手段", "解決的技術問題或技術效益"]:
                        actual_col = next((c for c in df.columns if fld in str(c)), None)
                        if actual_col:
                            p[fld] = str(row[actual_col])

        return {"summary_title": summary_title, "patents": patents}

    except Exception as e:
        logger.error(f"Flat+Enforce Error: {e}")
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
        temp_storage[file_id] = {"text": text_content, "df": df, "filename": file.filename}
        config = MindMapConfig()
        result = query_gemini_mindmap(text_content, config, df=df)
        if not result: raise ValueError("AI processing failed.")
        result["file_id"] = file_id
        result["filename"] = file.filename
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
        result = query_gemini_mindmap(text_content, config, df=df)
        if not result: raise ValueError("AI processing failed.")
        result["file_id"] = config.file_id
        result["filename"] = temp_storage[config.file_id]["filename"]
        return result
    except Exception as e:
        logger.error(f"Reprocess error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
