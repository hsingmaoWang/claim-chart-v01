import os
import re
import json
import logging
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
DATA_DIR = os.path.join(CURRENT_DIR, "data")
CACHE_FILE = os.path.join(DATA_DIR, "ipc_dict.json")
EXCEL_PATH = os.path.join(PROJECT_ROOT, "IPC all 中文版.xlsx")

# In-memory dictionary: "CODE#SUB" -> description
_IPC_DICT: Optional[Dict[str, str]] = None


def clean_ipc_description(text: Any) -> str:
    """Clean IPC text description according to requirements: remove （...） and version tags."""
    if not text:
        return ""
    s = str(text)
    # Remove Chinese full-width brackets （...）
    s = re.sub(r'（[^）]*）', '', s)
    # Remove version tags like [1,2006.01]
    s = re.sub(r'\[[^\]]*\]', '', s)
    # Collapse multiple spaces
    s = re.sub(r'\s+', ' ', s)
    return s.strip()


def load_ipc_dictionary() -> Dict[str, str]:
    """Load IPC dictionary from json cache or build from Excel file."""
    global _IPC_DICT
    if _IPC_DICT is not None:
        return _IPC_DICT

    os.makedirs(DATA_DIR, exist_ok=True)
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                _IPC_DICT = json.load(f)
            logger.info(f"Loaded {len(_IPC_DICT)} IPC definitions from cache: {CACHE_FILE}")
            return _IPC_DICT
        except Exception as e:
            logger.warning(f"Failed to load IPC cache {CACHE_FILE}: {e}")

    # Build from Excel if cache not found
    if not os.path.exists(EXCEL_PATH):
        logger.error(f"IPC Excel file not found: {EXCEL_PATH}")
        _IPC_DICT = {}
        return _IPC_DICT

    try:
        import openpyxl
        logger.info(f"Building IPC dictionary from Excel: {EXCEL_PATH}")
        wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True)
        ws = wb.active

        temp_map = {}
        for i, row in enumerate(ws.iter_rows(values_only=True)):
            if i == 0:
                continue
            try:
                year = int(row[1]) if row[1] else 0
            except Exception:
                year = 0
            code = str(row[2]).strip() if row[2] else ""
            sub = str(row[3]).strip() if row[3] is not None and str(row[3]).strip() != "None" else ""
            desc = str(row[5]) if row[5] else ""

            key = f"{code}#{sub}"
            if key not in temp_map or year > temp_map[key]["year"]:
                temp_map[key] = {
                    "year": year,
                    "desc": clean_ipc_description(desc)
                }
        wb.close()

        _IPC_DICT = {k: v["desc"] for k, v in temp_map.items()}
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(_IPC_DICT, f, ensure_ascii=False)
        logger.info(f"Saved {len(_IPC_DICT)} IPC definitions to cache {CACHE_FILE}")
        return _IPC_DICT
    except Exception as e:
        logger.error(f"Error parsing IPC Excel: {e}")
        _IPC_DICT = {}
        return _IPC_DICT


def parse_ipc_subgroup_code(raw_code: str) -> Optional[Dict[str, str]]:
    """
    Parse an IPC subgroup string according to Rule 2:
    a. Subgroup string might be 12-14 chars or formatted with space/slash
    b. First 4 characters = IPC Subclass (部類碼), e.g. A47C
    c. Characters 5-8 = skip leading zeros in 5-7, e.g. '0004' -> '4', '0050' -> '50'
    d. c + '/' + remaining chars after 8th char (preserve zeros) = IPC Main/Subgroup (IPC主次目)
    
    Returns dict:
      section: 'A'
      class_code: 'A47'
      subclass: 'A47C'
      main_group_num: '1/00'
      subgroup_num: '1/02'
      main_group_full: 'A47C 1/00'
      subgroup_full: 'A47C 1/02'
      is_main_group: True if ends with /00
    """
    s = str(raw_code).strip()
    if not s or s.lower() in ("nan", "none", "-"):
        return None

    # Check if format is already standard e.g. "A47C 1/02" or "A47C 0001/02" or "A47C 1/00"
    m_std = re.match(r'^([A-H]\d{2}[A-Z])\s*(\d{1,4})/(\d{2,6})$', s, re.IGNORECASE)
    if m_std:
        subclass = m_std.group(1).upper()
        mg_num = str(int(m_std.group(2)))
        sg_suffix = m_std.group(3)
        section = subclass[0]
        class_code = subclass[:3]
        subgroup_num = f"{mg_num}/{sg_suffix}"
        main_group_num = f"{mg_num}/00"
        return {
            "section": section,
            "class_code": class_code,
            "subclass": subclass,
            "main_group_num": main_group_num,
            "subgroup_num": subgroup_num,
            "main_group_full": f"{subclass} {main_group_num}",
            "subgroup_full": f"{subclass} {subgroup_num}",
            "is_main_group": subgroup_num.endswith("/00")
        }

    # Otherwise process by character indices (Rule 2b, 2c, 2d)
    # Remove any internal spaces or slashes if it's raw fixed-width code
    clean_s = s.replace(" ", "")
    if len(clean_s) < 4:
        return None

    subclass = clean_s[:4].upper()
    section = subclass[0]
    class_code = subclass[:3]

    if len(clean_s) == 4:
        # Only subclass given
        return {
            "section": section,
            "class_code": class_code,
            "subclass": subclass,
            "main_group_num": "",
            "subgroup_num": "",
            "main_group_full": "",
            "subgroup_full": subclass,
            "is_main_group": False
        }

    # If it contains a slash
    if "/" in clean_s[4:]:
        parts = clean_s[4:].split("/", 1)
        mg_raw = parts[0]
        sg_raw = parts[1]
        try:
            mg_num = str(int(mg_raw))
        except Exception:
            mg_num = mg_raw.lstrip("0") or "0"
        subgroup_num = f"{mg_num}/{sg_raw}"
        main_group_num = f"{mg_num}/00"
    else:
        # Character indices: 5-8 (index 4 to 8)
        part_5_8 = clean_s[4:8] if len(clean_s) >= 8 else clean_s[4:]
        # Skip leading '0' in 5-7 (first 3 digits of part_5_8)
        # e.g., '0004' -> '4', '0050' -> '50'
        mg_num = part_5_8.lstrip("0") or "0"

        # Character 9 and beyond (index 8 onwards)
        part_9_plus = clean_s[8:] if len(clean_s) > 8 else "00"
        # Normalize ST.8 trailing 0 padding for fixed-width IPC (e.g. '080000' -> '08', '000000' -> '00')
        if len(part_9_plus) > 2:
            part_9_plus = part_9_plus[:2] + part_9_plus[2:].rstrip("0")
        subgroup_num = f"{mg_num}/{part_9_plus}"
        main_group_num = f"{mg_num}/00"

    return {
        "section": section,
        "class_code": class_code,
        "subclass": subclass,
        "main_group_num": main_group_num,
        "subgroup_num": subgroup_num,
        "main_group_full": f"{subclass} {main_group_num}",
        "subgroup_full": f"{subclass} {subgroup_num}",
        "is_main_group": subgroup_num.endswith("/00")
    }


def lookup_ipc_definitions(ipc_keys: List[str]) -> Dict[str, Any]:
    """
    Given a list of IPC raw subgroup strings (or parsed keys),
    returns definitions for all 5 hierarchy levels:
    - section (Level 1)
    - class (Level 2)
    - subclass (Level 3)
    - main_group (Level 4)
    - subgroup (Level 5)
    Along with concatenated ancestor descriptions for full context.
    """
    dict_map = load_ipc_dictionary()
    definitions = {}
    full_paths = {}

    def get_desc(code: str, sub: str = "") -> str:
        c = code.strip()
        s = sub.strip()
        return (
            dict_map.get(f"{c}#{s}") or
            dict_map.get(f"{c} {s}") or
            dict_map.get(f"{c}{s}") or
            (dict_map.get(f"{c}#") if not s else "") or
            dict_map.get(c) or
            ""
        )

    for raw in ipc_keys:
        if not raw:
            continue
        s_raw = str(raw).strip()
        parsed = parse_ipc_subgroup_code(s_raw)

        if not parsed:
            # Short code direct fallback (e.g. 'A', 'A47', 'A47C')
            if len(s_raw) <= 4:
                d = get_desc(s_raw, "")
                if d:
                    definitions[s_raw] = d
            continue

        sec = parsed["section"]
        cls = parsed["class_code"]
        subcls = parsed["subclass"]
        mg_num = parsed["main_group_num"]
        sg_num = parsed["subgroup_num"]
        mg_full = parsed["main_group_full"]
        sg_full = parsed["subgroup_full"]

        # Level 1
        sec_desc = get_desc(sec, "")
        if sec not in definitions:
            definitions[sec] = sec_desc

        # Level 2
        cls_desc = get_desc(cls, "")
        if cls not in definitions:
            definitions[cls] = cls_desc

        # Level 3
        subcls_desc = get_desc(subcls, "")
        if subcls not in definitions:
            definitions[subcls] = subcls_desc

        # Level 4
        mg_desc = get_desc(subcls, mg_num)
        if mg_full and mg_full not in definitions:
            definitions[mg_full] = mg_desc

        # Level 5
        sg_desc = get_desc(subcls, sg_num)
        if sg_full and sg_full not in definitions:
            definitions[sg_full] = sg_desc

        # Build full concatenated description for all 5 levels
        path_parts = []
        if sec_desc:
            path_parts.append(f"{sec} ({sec_desc})")
        else:
            path_parts.append(sec)

        if cls_desc:
            path_parts.append(f"{cls} ({cls_desc})")
        else:
            path_parts.append(cls)

        if subcls_desc:
            path_parts.append(f"{subcls} ({subcls_desc})")
        else:
            path_parts.append(subcls)

        if mg_full and mg_desc:
            path_parts.append(f"{mg_full} ({mg_desc})")
        elif mg_full:
            path_parts.append(mg_full)

        if sg_full and not parsed["is_main_group"]:
            if sg_desc:
                path_parts.append(f"{sg_full} ({sg_desc})")
            else:
                path_parts.append(sg_full)

        full_paths[sg_full] = " ➔ ".join(path_parts)
        if mg_full and mg_full not in full_paths:
            full_paths[mg_full] = " ➔ ".join(path_parts[:4])
        if subcls not in full_paths:
            full_paths[subcls] = " ➔ ".join(path_parts[:3])
        if cls not in full_paths:
            full_paths[cls] = " ➔ ".join(path_parts[:2])
        if sec not in full_paths:
            full_paths[sec] = path_parts[0]

    return {
        "definitions": definitions,
        "full_paths": full_paths
    }
