"""
Patent List Processing Utility (專利清單處理工具模組)
Implements:
1. 公開公告合併 (Publication/Grant Merge by Application Number)
2. 專利家族計數 (Patent Family Counting: 案 vs 件 by INPADOC Family ID)
3. 專利家族合併 (Patent Family Consolidation by Country Code Priority: US, WO, EP, TW, CN, JP, KR)
"""

import re
from datetime import datetime
from typing import List, Dict, Any, Tuple, Optional

# 專利家族合併之國別優先序
DEFAULT_COUNTRY_PRIORITY = ["US", "WO", "EP", "TW", "CN", "JP", "KR"]

# 欄位關鍵字別名 mapping
FIELD_ALIASES = {
    "publication_number": [
        "publication number", "專利號", "專利公開公告號", "公開號", "公告號", "pub no", "pub_no", "doc_number"
    ],
    "application_number": [
        "application number", "申請號", "app no", "app_no", "appl. no.", "appl_no", "application no"
    ],
    "publication_date": [
        "publication date", "公開日", "公告日", "公開公告日", "pub date", "pub_date", "issue date", "issue_date"
    ],
    "family_id": [
        "inpadoc family id", "family id", "專利家族號", "家族編號", "inpadoc", "family_id", "inpadoc_family_id"
    ],
    "country_code": [
        "publication country code", "country code", "國別", "國家", "country", "pub country", "pub_country"
    ]
}


def resolve_field_key(patent: Dict[str, Any], standard_field: str) -> Optional[str]:
    """Find the key in the patent dict that corresponds to the standard field name."""
    if standard_field in patent:
        return standard_field
    
    aliases = FIELD_ALIASES.get(standard_field, [])
    # 1. Exact match ignoring case and spaces/underscores
    for k in patent.keys():
        cleaned_k = re.sub(r'[\s_\-]+', '', str(k)).lower()
        for alias in aliases:
            cleaned_alias = re.sub(r'[\s_\-]+', '', alias).lower()
            if cleaned_k == cleaned_alias:
                return k
                
    # 2. Substring match
    for k in patent.keys():
        cleaned_k = str(k).lower()
        for alias in aliases:
            if alias in cleaned_k:
                return k
    return None


def parse_patent_date(date_val: Any) -> str:
    """Normalize any date representation to 'YYYY-MM-DD' or comparable string."""
    if date_val is None:
        return "1900-01-01"
    
    # Handle pandas Timestamp or datetime
    if hasattr(date_val, "strftime"):
        return date_val.strftime("%Y-%m-%d")
        
    s = str(date_val).strip()
    if not s or s.lower() == "nan" or s.lower() == "nat":
        return "1900-01-01"
        
    # Match standard formats like YYYYMMDD
    if re.match(r'^\d{8}$', s):
        return f"{s[:4]}-{s[4:6]}-{s[6:8]}"
        
    # Match YYYY/MM/DD, YYYY-MM-DD, YYYY.MM.DD
    m = re.match(r'^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})', s)
    if m:
        year, month, day = m.groups()
        return f"{year}-{int(month):02d}-{int(day):02d}"
        
    # Match YYYY-MM
    m_year_month = re.match(r'^(\d{4})[-/.](\d{1,2})$', s)
    if m_year_month:
        year, month = m_year_month.groups()
        return f"{year}-{int(month):02d}-01"
        
    # Match only year YYYY
    m_year = re.match(r'^(\d{4})$', s)
    if m_year:
        return f"{m_year.group(1)}-01-01"
        
    return s


def extract_country_code(patent: Dict[str, Any]) -> str:
    """Extract country code from explicit field or fallback to first 2 letters of publication number."""
    cc_key = resolve_field_key(patent, "country_code")
    if cc_key and patent.get(cc_key):
        code = str(patent[cc_key]).strip().upper()
        if code and code != "NAN":
            return code[:2]
            
    pub_key = resolve_field_key(patent, "publication_number")
    if pub_key and patent.get(pub_key):
        pub_str = str(patent[pub_key]).strip().upper()
        m = re.match(r'^([A-Z]{2})', pub_str)
        if m:
            return m.group(1)
            
    return ""


# ---------------------------------------------------------------------------
# 規則 1: 公開公告合併 (Publication / Grant Consolidation)
# ---------------------------------------------------------------------------
def deduplicate_publication_by_application(patents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    規則 1: 公開公告合併
    當超過 1 個不同 Publication Number 的專利具有相同的 Application Number 時，
    僅選擇該些專利中 Publication Date 為最新的一件，計數僅為 1 件。
    若無 Application Number 則各自保留。
    """
    app_groups: Dict[str, List[Dict[str, Any]]] = {}
    no_app_patents: List[Dict[str, Any]] = []

    for p in patents:
        app_key = resolve_field_key(p, "application_number")
        app_num = str(p.get(app_key, "")).strip() if app_key else ""
        
        if not app_num or app_num.lower() in ("nan", "none", "-", ""):
            no_app_patents.append(p)
        else:
            if app_num not in app_groups:
                app_groups[app_num] = []
            app_groups[app_num].append(p)

    merged: List[Dict[str, Any]] = []

    for app_num, group in app_groups.items():
        if len(group) == 1:
            merged.append(group[0])
        else:
            # Sort descending by Publication Date
            def get_sort_key(item):
                d_key = resolve_field_key(item, "publication_date")
                d_val = parse_patent_date(item.get(d_key)) if d_key else "1900-01-01"
                # Tie-breaker: prefer grant codes like B, B1, B2 in publication number
                pub_key = resolve_field_key(item, "publication_number")
                pub_val = str(item.get(pub_key, "")).upper() if pub_key else ""
                is_granted = 1 if re.search(r'[B][0-9]?$', pub_val) else 0
                return (d_val, is_granted)

            best_patent = max(group, key=get_sort_key)
            merged.append(best_patent)

    # 加上無申請號專利
    merged.extend(no_app_patents)
    return merged


# ---------------------------------------------------------------------------
# 規則 2: 專利家族計數規則 (Patent Family Counting)
# ---------------------------------------------------------------------------
def count_patent_families(patents: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    規則 2: 專利家族計數規則
    針對已進行專利公開公告合併後的結果：
    - 當具有相同的 INPADOC Family ID 時，計為 1 "案"
    - 該家族內專利總件數若為 N，則計為 N "件"
    """
    family_groups: Dict[str, List[Dict[str, Any]]] = {}
    no_family_count = 0

    for p in patents:
        fam_key = resolve_field_key(p, "family_id")
        fam_id = str(p.get(fam_key, "")).strip() if fam_key else ""
        
        if not fam_id or fam_id.lower() in ("nan", "none", "-", ""):
            no_family_count += 1
            # Treat each as individual single-case family
            single_key = f"__NO_FAMILY_{no_family_count}__"
            family_groups[single_key] = [p]
        else:
            if fam_id not in family_groups:
                family_groups[fam_id] = []
            family_groups[fam_id].append(p)

    total_cases = len(family_groups)
    total_pieces = len(patents)

    family_details = []
    for fam_id, members in family_groups.items():
        is_independent = fam_id.startswith("__NO_FAMILY_")
        family_details.append({
            "family_id": None if is_independent else fam_id,
            "case_count": 1,
            "piece_count": len(members),
            "members": members
        })

    return {
        "total_cases": total_cases,        # 總案數
        "total_pieces": total_pieces,      # 總件數
        "summary": f"{total_cases} 案 {total_pieces} 件",
        "family_details": family_details
    }


# ---------------------------------------------------------------------------
# 規則 3: 專利家族合併規則 (Patent Family Consolidation)
# ---------------------------------------------------------------------------
def consolidate_patent_families(
    patents: List[Dict[str, Any]], 
    country_priority: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """
    規則 3: 專利家族合併規則
    同一個專利家族的多個專利，依照 Publication Country Code 順序，僅選擇一件專利作為代表。
    順序為: US, WO, EP, TW, CN, JP, KR (或自訂)
    """
    if country_priority is None:
        country_priority = DEFAULT_COUNTRY_PRIORITY

    # 建立優先順位評分映射 (數字越小越優先)
    priority_rank = {code.upper(): idx for idx, code in enumerate(country_priority)}

    family_groups: Dict[str, List[Dict[str, Any]]] = {}
    no_family_patents: List[Dict[str, Any]] = []

    for p in patents:
        fam_key = resolve_field_key(p, "family_id")
        fam_id = str(p.get(fam_key, "")).strip() if fam_key else ""
        
        if not fam_id or fam_id.lower() in ("nan", "none", "-", ""):
            no_family_patents.append(p)
        else:
            if fam_id not in family_groups:
                family_groups[fam_id] = []
            family_groups[fam_id].append(p)

    consolidated: List[Dict[str, Any]] = []

    for fam_id, members in family_groups.items():
        if len(members) == 1:
            consolidated.append(members[0])
        else:
            def member_rank(item):
                cc = extract_country_code(item)
                rank = priority_rank.get(cc, 999)  # 國別不在名單者排最後
                d_key = resolve_field_key(item, "publication_date")
                d_val = parse_patent_date(item.get(d_key)) if d_key else "1900-01-01"
                # Rank smaller is better; for tie in same rank, latest date is better
                return (rank, -int(d_val.replace("-", "")))

            best_patent = min(members, key=member_rank)
            consolidated.append(best_patent)

    consolidated.extend(no_family_patents)
    return consolidated


# ---------------------------------------------------------------------------
# 全流程一站式處理 (End-to-End Pipeline)
# ---------------------------------------------------------------------------
def process_patent_list(
    raw_patents: List[Dict[str, Any]], 
    country_priority: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    執行完整的專利清單三步驟處理流程：
    1. 公開公告合併 (規則 1)
    2. 專利家族計數統計 (規則 2)
    3. 專利家族代表合併 (規則 3)
    """
    # 步驟 1: 公開公告合併
    patents_after_pub_merge = deduplicate_publication_by_application(raw_patents)
    
    # 步驟 2: 專利家族統計 (以步驟 1 為基準)
    family_stats = count_patent_families(patents_after_pub_merge)
    
    # 步驟 3: 專利家族代表合併
    consolidated_patents = consolidate_patent_families(
        patents_after_pub_merge, country_priority=country_priority
    )

    return {
        "stats": {
            "raw_count": len(raw_patents),
            "after_pub_merge_count": len(patents_after_pub_merge),
            "family_cases": family_stats["total_cases"],
            "family_pieces": family_stats["total_pieces"],
            "summary": family_stats["summary"],
            "consolidated_count": len(consolidated_patents),
        },
        "patents_after_pub_merge": patents_after_pub_merge,
        "family_stats": family_stats,
        "consolidated_patents": consolidated_patents
    }
