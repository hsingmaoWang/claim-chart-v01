"""
Patent List Processing Utility for Backend
Implements patent-list-processing Skill rules:
1. 公開公告合併 (Publication/Grant Consolidation by Application Number)
2. 專利家族計數 (Patent Family Counting: 案 vs 件 by INPADOC Family ID)
3. 專利家族合併 (Patent Family Consolidation by Country Code Priority)
"""

import re
import pandas as pd
from datetime import datetime
from typing import Dict, Any, Tuple, Optional, List

FIELD_ALIASES = {
    "publication_number": [
        "publication number", "專利號", "專利公開公告號", "公開號", "公告號", "pub no", "pub_no",
        "doc_number", "document number", "公開/公告號", "專利編號", "publication no"
    ],
    "application_number": [
        "application number", "申請號", "app no", "app_no", "appl. no.", "appl_no",
        "application no", "appl number", "app num", "申請編號"
    ],
    "publication_date": [
        "publication date", "公開日", "公告日", "公開公告日", "pub date", "pub_date",
        "issue date", "issue_date", "公開/公告日", "發證日"
    ],
    "family_id": [
        "inpadoc family id", "family id", "專利家族號", "家族編號", "inpadoc", "family_id",
        "inpadoc_family_id", "inpadoc 家族", "dwpi family", "家族 id", "familyid"
    ],
    "country_code": [
        "publication country code", "country code", "國別", "國家", "country", "pub country", "pub_country"
    ]
}

DEFAULT_COUNTRY_PRIORITY = ["US", "WO", "EP", "TW", "CN", "JP", "KR"]


def find_column_by_field(columns: List[str], standard_field: str) -> Optional[str]:
    """Find the column name in `columns` matching standard_field aliases."""
    aliases = FIELD_ALIASES.get(standard_field, [])
    # 1. Exact match ignoring case and spaces/underscores/slashes
    for col in columns:
        col_clean = re.sub(r'[\s_\-/\.]+', '', str(col)).lower()
        for alias in aliases:
            alias_clean = re.sub(r'[\s_\-/\.]+', '', alias).lower()
            if col_clean == alias_clean:
                return col

    # 2. Substring match
    for col in columns:
        col_lower = str(col).lower()
        for alias in aliases:
            if alias in col_lower:
                return col
    return None


def parse_patent_date(date_val: Any) -> str:
    """Normalize date value to comparable 'YYYY-MM-DD' string."""
    if date_val is None or pd.isna(date_val):
        return "1900-01-01"

    if hasattr(date_val, "strftime"):
        try:
            return date_val.strftime("%Y-%m-%d")
        except Exception:
            pass

    s = str(date_val).strip()
    if not s or s.lower() in ("nan", "nat", "none", "-"):
        return "1900-01-01"

    # Match YYYYMMDD
    if re.match(r'^\d{8}$', s):
        return f"{s[:4]}-{s[4:6]}-{s[6:8]}"

    # Match YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
    m = re.match(r'^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})', s)
    if m:
        year, month, day = m.groups()
        return f"{year}-{int(month):02d}-{int(day):02d}"

    # Match YYYY-MM
    m_ym = re.match(r'^(\d{4})[-/.](\d{1,2})$', s)
    if m_ym:
        year, month = m_ym.groups()
        return f"{year}-{int(month):02d}-01"

    # Match YYYY
    m_y = re.match(r'^(\d{4})$', s)
    if m_y:
        return f"{m_y.group(1)}-01-01"

    return s


def to_native_types(obj: Any) -> Any:
    """Recursively convert numpy types, Series/DataFrame scalar items, and non-primitives to native Python types."""
    if obj is None:
        return None
    if hasattr(obj, "item") and callable(getattr(obj, "item")):
        try:
            return obj.item()
        except Exception:
            pass
    if isinstance(obj, dict):
        return {str(k): to_native_types(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [to_native_types(x) for x in obj]
    return obj


def process_patent_dataframe_with_skill(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Process patent DataFrame following the patent-list-processing skill:
    1. Check for application number and publication date columns.
       - If present, perform publication merge (keep latest publication date, count = 1).
       - If absent, record as unperformed item with reason.
    2. Check for INPADOC family ID column.
       - If present, perform family counting (N cases, M pieces).
       - If absent, record as unperformed item with reason.
    Returns: (df_processed, processing_info)
    """
    cols = [str(c) for c in df.columns]
    raw_count = int(len(df))

    app_col = find_column_by_field(cols, "application_number")
    date_col = find_column_by_field(cols, "publication_date")
    pub_col = find_column_by_field(cols, "publication_number")
    family_col = find_column_by_field(cols, "family_id")

    processed_items = []
    unprocessed_items = []

    # -------------------------------------------------------------
    # 步驟 1: 專利公開公告合併
    # -------------------------------------------------------------
    pub_merge_performed = False
    dedup_count = 0
    df_merged = df.copy()

    if app_col and date_col:
        pub_merge_performed = True
        
        # Helper to compute normalized date and grant flag
        parsed_dates = df[date_col].apply(parse_patent_date)
        df_temp = df.copy()
        df_temp["_parsed_date"] = parsed_dates
        if pub_col:
            df_temp["_is_grant"] = df_temp[pub_col].astype(str).str.upper().apply(
                lambda x: 1 if re.search(r'[B][0-9]?$', x) else 0
            )
        else:
            df_temp["_is_grant"] = 0

        # Split into rows with valid application number vs empty application number
        valid_app_mask = df_temp[app_col].astype(str).str.strip().str.lower().isin(
            ["", "nan", "none", "-", "nat"]
        )
        df_no_app = df_temp[valid_app_mask].drop(columns=["_parsed_date", "_is_grant"])
        df_has_app = df_temp[~valid_app_mask]

        if not df_has_app.empty:
            # Sort within application groups descending by date then grant
            df_sorted = df_has_app.sort_values(
                by=["_parsed_date", "_is_grant"],
                ascending=[False, False]
            )
            df_deduped_app = df_sorted.drop_duplicates(subset=[app_col], keep="first")
            df_deduped_app = df_deduped_app.drop(columns=["_parsed_date", "_is_grant"])
            df_merged = pd.concat([df_deduped_app, df_no_app], ignore_index=True)
        else:
            df_merged = df.copy()

        merged_count = int(len(df_merged))
        dedup_count = int(raw_count - merged_count)

        if dedup_count > 0:
            msg = f"公開公告合併：由 {raw_count:,} 件合併為 {merged_count:,} 件（去重 {dedup_count:,} 件）"
        else:
            msg = f"公開公告合併：專利清單無重複申請號，維持 {raw_count:,} 件"
            
        processed_items.append({
            "action": "公開公告合併",
            "status": "success",
            "message": msg,
            "details": f"依據最新公開日合併，共計 {merged_count:,} 件"
        })
    else:
        missing_reasons = []
        if not app_col:
            missing_reasons.append("申請號 (Application Number)")
        if not date_col:
            missing_reasons.append("公開/公告日 (Publication Date)")
        reason_str = " 及 ".join(missing_reasons)
        
        unprocessed_items.append({
            "action": "公開公告合併",
            "status": "skipped",
            "message": f"未進行公開公告合併（上傳檔案缺少「{reason_str}」欄位）",
            "details": f"專利件數維持原始 {raw_count:,} 件"
        })
        merged_count = int(raw_count)

    # -------------------------------------------------------------
    # 步驟 2: 專利家族計數 (以公開公告合併後的結果為基準)
    # -------------------------------------------------------------
    family_stats_performed = False
    family_cases = None
    family_pieces = int(merged_count)
    family_summary = ""

    if family_col:
        family_stats_performed = True
        
        # Calculate distinct non-empty family IDs
        fam_series = df_merged[family_col].astype(str).str.strip()
        fam_empty_mask = fam_series.str.lower().isin(["", "nan", "none", "-", "nat"])
        
        unique_families = int(fam_series[~fam_empty_mask].nunique())
        no_family_patents = int(fam_empty_mask.sum())
        
        # Total cases = unique family IDs + independent patents with no family ID
        family_cases = int(unique_families + no_family_patents)
        family_summary = f"{family_cases:,} 案 {family_pieces:,} 件"
        
        processed_items.append({
            "action": "專利家族統計",
            "status": "success",
            "message": f"INPADOC專利家族統計：共 {family_summary}",
            "details": f"共 {family_cases:,} 案、{family_pieces:,} 件"
        })
    else:
        unprocessed_items.append({
            "action": "專利家族統計",
            "status": "skipped",
            "message": "未進行專利家族統計（上傳檔案缺少「INPADOC Family ID / 專利家族號」欄位）",
            "details": f"專利件數為 {family_pieces:,} 件（無法統計家族案數）"
        })

    # 綜合計數結果字串
    if family_stats_performed and pub_merge_performed:
        count_summary = f"統計結果：{family_cases:,} 案 / {family_pieces:,} 件（原始 {raw_count:,} 件，公開公告合併去重 {dedup_count:,} 件）"
    elif family_stats_performed:
        count_summary = f"統計結果：{family_cases:,} 案 / {family_pieces:,} 件（原始共 {raw_count:,} 件）"
    elif pub_merge_performed:
        count_summary = f"統計結果：共 {family_pieces:,} 件（原始 {raw_count:,} 件，公開公告合併去重 {dedup_count:,} 件）"
    else:
        count_summary = f"統計結果：共 {raw_count:,} 件"

    processing_info = {
        "raw_count": raw_count,
        "merged_count": merged_count,
        "dedup_count": dedup_count,
        "family_cases": family_cases,
        "family_pieces": family_pieces,
        "family_summary": family_summary,
        "count_summary": count_summary,
        "pub_merge_performed": pub_merge_performed,
        "family_stats_performed": family_stats_performed,
        "processed_items": processed_items,
        "unprocessed_items": unprocessed_items,
        "detected_columns": {
            "publication_number": pub_col,
            "application_number": app_col,
            "publication_date": date_col,
            "family_id": family_col
        }
    }

    return df_merged, to_native_types(processing_info)
