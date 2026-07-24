import os
import json
import logging
from datetime import datetime, timezone
import pandas as pd
import asyncio
import requests
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# Paths
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
LOGS_EXCEL = os.path.join(DATA_DIR, "usage_logs.xlsx")

# Concurrency lock to protect Excel file access
excel_lock = asyncio.Lock()

# In-memory sessions log state: session_id -> log_record_dict
# This stores active logs that are still running or updating.
active_logs: Dict[str, dict] = {}

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

def is_supabase_enabled() -> bool:
    return bool(SUPABASE_URL and SUPABASE_KEY)

def get_empty_log_df() -> pd.DataFrame:
    """Return an empty DataFrame with the proper columns for usage logs."""
    return pd.DataFrame(columns=[
        "Session ID",
        "Username",
        "IP Address",
        "Login Time",
        "Logout Time",
        "Duration",
        "Uploaded Files",
        "Patents Processed",
        "Excel Downloads",
        "PNG Downloads",
        "Excel Download Size (bytes)",
        "PNG Download Size (bytes)",
        "Last Active Time",
        "Status"
    ])

async def init_logs_excel():
    """Initialize the usage_logs.xlsx file if it doesn't exist."""
    async with excel_lock:
        if not os.path.exists(LOGS_EXCEL):
            try:
                df = get_empty_log_df()
                df.to_excel(LOGS_EXCEL, index=False)
                logger.info(f"Initialized empty usage log Excel at {LOGS_EXCEL}")
            except Exception as e:
                logger.error(f"Error initializing usage log Excel: {e}")

# Call init on import using asyncio task (run in event loop)
try:
    asyncio.create_task(init_logs_excel())
except Exception:
    pass

def parse_datetime(val) -> Optional[datetime]:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    if hasattr(val, "to_pydatetime"):
        return val.to_pydatetime()
        
    val_str = str(val).strip()
    if not val_str or val_str.lower() in ("—", "none", "null", "nan", "nat"):
        return None
        
    if val_str.endswith('Z') or val_str.endswith('z'):
        val_str = val_str[:-1] + '+00:00'
        
    try:
        return datetime.fromisoformat(val_str)
    except ValueError:
        pass
        
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y/%m/%d %H:%M:%S",
        "%Y/%m/%d %H:%M:%S.%f",
    ):
        try:
            return datetime.strptime(val_str, fmt)
        except ValueError:
            continue
            
    return None

def calculate_duration(start_time_str: str, end_time_str: str) -> str:
    """Calculate HH:MM:SS duration between two ISO format datetime strings."""
    try:
        start = parse_datetime(start_time_str)
        end = parse_datetime(end_time_str)
        if not start or not end:
            return "00:00:00"
            
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        else:
            start = start.astimezone(timezone.utc)
            
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        else:
            end = end.astimezone(timezone.utc)
            
        delta = end - start
        total_seconds = int(delta.total_seconds())
        
        # Get machine local timezone offset
        try:
            local_offset = datetime.now().astimezone().utcoffset()
            local_offset_seconds = int(local_offset.total_seconds()) if local_offset else 0
        except Exception:
            local_offset_seconds = 28800  # Default to Taiwan / GMT+8 if offset check fails
            
        # Adjust for timezone offset mismatches (e.g. naive time treated as UTC)
        if local_offset_seconds > 0:
            if total_seconds < 0 and total_seconds + local_offset_seconds >= 0:
                total_seconds += local_offset_seconds
            elif total_seconds >= local_offset_seconds:
                # If duration is extremely large (e.g. > local offset) and subtracting offset is still positive,
                # it's likely a mismatch where end time was treated as UTC but was local, or start was UTC and end was local.
                # Check if the adjusted duration is within a reasonable limit (e.g., less than 2 hours)
                if total_seconds - local_offset_seconds < 7200:
                    total_seconds -= local_offset_seconds
                    
        if total_seconds < 0:
            total_seconds = 0
            
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    except Exception as e:
        logger.error(f"Error calculating duration: {e}")
        return "00:00:00"

async def read_all_logs_from_supabase() -> pd.DataFrame:
    """Read all records from Supabase usage_logs table."""
    try:
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}"
        }
        
        def do_get():
            res = requests.get(f"{SUPABASE_URL}/rest/v1/usage_logs?order=login_time.desc", headers=headers, timeout=10)
            res.raise_for_status()
            return res.json()
            
        rows = await asyncio.to_thread(do_get)
        
        local_df = pd.DataFrame()
        if os.path.exists(LOGS_EXCEL):
            try:
                local_df = pd.read_excel(LOGS_EXCEL)
            except Exception:
                pass
        
        excel_rows = []
        for r in rows:
            sid = r.get("session_id")
            files_list = r.get("uploaded_files")
            if isinstance(files_list, list):
                files_str = ", ".join(files_list)
            else:
                files_str = str(files_list or "")
                
            excel_bytes = int(r.get("excel_download_bytes") or 0)
            png_bytes = int(r.get("png_download_bytes") or 0)
            
            # Fallback merge: if Supabase returns 0 (e.g. column missing or not updated), read from active memory or local Excel
            if sid in active_logs:
                if excel_bytes == 0:
                    excel_bytes = int(active_logs[sid].get("excel_download_bytes", 0))
                if png_bytes == 0:
                    png_bytes = int(active_logs[sid].get("png_download_bytes", 0))
                    
            if not local_df.empty and "Session ID" in local_df.columns:
                matches = local_df[local_df["Session ID"] == sid]
                if not matches.empty:
                    loc_row = matches.iloc[0]
                    if excel_bytes == 0:
                        excel_bytes = int(loc_row.get("Excel Download Size (bytes)") or 0)
                    if png_bytes == 0:
                        png_bytes = int(loc_row.get("PNG Download Size (bytes)") or 0)
                
            excel_rows.append({
                "Session ID": sid,
                "Username": r.get("username"),
                "IP Address": r.get("ip_address"),
                "Login Time": r.get("login_time") or "",
                "Logout Time": r.get("logout_time") or "",
                "Duration": r.get("duration", "00:00:00"),
                "Uploaded Files": files_str,
                "Patents Processed": int(r.get("patents_processed") or 0),
                "Excel Downloads": int(r.get("excel_downloads") or 0),
                "PNG Downloads": int(r.get("png_downloads") or 0),
                "Excel Download Size (bytes)": excel_bytes,
                "PNG Download Size (bytes)": png_bytes,
                "Last Active Time": r.get("last_active_time") or "",
                "Status": r.get("status", "active")
            })
        return pd.DataFrame(excel_rows)
    except Exception as e:
        logger.error(f"Error reading logs from Supabase: {e}")
        return get_empty_log_df()

async def read_all_logs_from_excel() -> pd.DataFrame:
    """Read all records from usage_logs.xlsx or Supabase."""
    if is_supabase_enabled():
        return await read_all_logs_from_supabase()

    if not os.path.exists(LOGS_EXCEL):
        return get_empty_log_df()
    try:
        # Run pd.read_excel in a separate thread to avoid blocking the event loop
        df = await asyncio.to_thread(pd.read_excel, LOGS_EXCEL)
        empty_df = get_empty_log_df()
        
        # Ensure all columns exist
        for col in empty_df.columns:
            if col not in df.columns:
                if "Size" in col or "Downloads" in col or "Processed" in col:
                    df[col] = 0
                else:
                    df[col] = None
                    
        # Reindex columns to strictly match get_empty_log_df() order
        df = df.reindex(columns=empty_df.columns)
        
        # Fill NaN for numeric columns
        for col in ["Patents Processed", "Excel Downloads", "PNG Downloads", "Excel Download Size (bytes)", "PNG Download Size (bytes)"]:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype(int)
            
        df = df.astype(object)
        return df
    except Exception as e:
        logger.error(f"Error reading Excel logs: {e}")
        return get_empty_log_df()

async def write_logs_to_excel(df: pd.DataFrame):
    """Write the DataFrame to usage_logs.xlsx. Always protected by excel_lock."""
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        # Ensure column order matches get_empty_log_df()
        empty_df = get_empty_log_df()
        df = df.reindex(columns=empty_df.columns)
        await asyncio.to_thread(df.to_excel, LOGS_EXCEL, index=False)
    except Exception as e:
        logger.error(f"Error writing Excel logs: {e}")

async def sync_log_to_supabase(session_id: str, record: dict) -> bool:
    """Sync a single session log record to Supabase usage_logs table."""
    try:
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
        }
        
        db_row = {
            "session_id": record.get("session_id"),
            "username": record.get("username"),
            "ip_address": record.get("ip_address"),
            "login_time": record.get("login_time") or None,
            "logout_time": record.get("logout_time") or None,
            "duration": record.get("duration", "00:00:00"),
            "uploaded_files": record.get("uploaded_files", []),
            "patents_processed": int(record.get("patents_processed", 0)),
            "excel_downloads": int(record.get("excel_downloads", 0)),
            "png_downloads": int(record.get("png_downloads", 0)),
            "excel_download_bytes": int(record.get("excel_download_bytes", 0)),
            "png_download_bytes": int(record.get("png_download_bytes", 0)),
            "last_active_time": record.get("last_active_time") or None,
            "status": record.get("status", "active")
        }
        
        def do_post():
            res = requests.post(f"{SUPABASE_URL}/rest/v1/usage_logs?on_conflict=session_id", json=db_row, headers=headers, timeout=10)
            if res.status_code == 400 and ("excel_download_bytes" in res.text or "png_download_bytes" in res.text):
                # Fallback if Supabase schema cache hasn't updated columns yet
                fallback_row = {k: v for k, v in db_row.items() if k not in ("excel_download_bytes", "png_download_bytes")}
                res2 = requests.post(f"{SUPABASE_URL}/rest/v1/usage_logs?on_conflict=session_id", json=fallback_row, headers=headers, timeout=10)
                res2.raise_for_status()
                return False # Full byte sync failed due to missing Supabase columns
            else:
                res.raise_for_status()
                return True
            
        full_sync_ok = await asyncio.to_thread(do_post)
        return full_sync_ok
    except Exception as e:
        logger.error(f"Error syncing log to Supabase: {e}")
        return False

async def sync_log_to_excel(session_id: str, record: dict):
    """
    Sync or insert a single session log record to Supabase or Excel file.
    """
    supabase_success = False
    if is_supabase_enabled():
        supabase_success = await sync_log_to_supabase(session_id, record)
        
    try:
        async with excel_lock:
            # If Supabase is enabled and sync succeeded, skip local Excel writing
            if is_supabase_enabled() and supabase_success:
                return
            
            df = await read_all_logs_from_excel()
            
            # Clean record fields for Excel representation
            excel_row = {
                "Session ID": record.get("session_id"),
                "Username": record.get("username"),
                "IP Address": record.get("ip_address"),
                "Login Time": record.get("login_time"),
                "Logout Time": record.get("logout_time", ""),
                "Duration": record.get("duration", "00:00:00"),
                "Uploaded Files": ", ".join(record.get("uploaded_files", [])),
                "Patents Processed": int(record.get("patents_processed", 0)),
                "Excel Downloads": int(record.get("excel_downloads", 0)),
                "PNG Downloads": int(record.get("png_downloads", 0)),
                "Excel Download Size (bytes)": int(record.get("excel_download_bytes", 0)),
                "PNG Download Size (bytes)": int(record.get("png_download_bytes", 0)),
                "Last Active Time": record.get("last_active_time"),
                "Status": record.get("status", "active")
            }
            
            # Check if record already exists in Excel
            if not df.empty and "Session ID" in df.columns:
                matches = df[df["Session ID"] == session_id]
                if not matches.empty:
                    # Update existing row
                    idx = matches.index[0]
                    for col, val in excel_row.items():
                        df.at[idx, col] = val
                    await write_logs_to_excel(df)
                    return
            
            # Append new row
            new_row_df = pd.DataFrame([excel_row])
            df = pd.concat([df, new_row_df], ignore_index=True)
            await write_logs_to_excel(df)
    except Exception as e:
        logger.warning(f"Error writing local log backup (expected on Vercel): {e}")

# --- Session Logging API Functions ---

async def get_or_restore_log_record(session_id: str) -> dict:
    """Retrieve the log record from active memory or restore/create it if missing."""
    if session_id in active_logs:
        return active_logs[session_id]
        
    if is_supabase_enabled():
        try:
            headers = {
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}"
            }
            def do_get():
                res = requests.get(f"{SUPABASE_URL}/rest/v1/usage_logs?session_id=eq.{session_id}", headers=headers, timeout=10)
                res.raise_for_status()
                return res.json()
                
            rows = await asyncio.to_thread(do_get)
            if rows:
                row = rows[0]
                files_list = row.get("uploaded_files")
                if not isinstance(files_list, list):
                    files_list = []
                    
                record = {
                    "session_id": session_id,
                    "username": str(row.get("username", "unknown")),
                    "ip_address": str(row.get("ip_address", "unknown")),
                    "login_time": row.get("login_time"),
                    "logout_time": row.get("logout_time"),
                    "duration": str(row.get("duration", "00:00:00")),
                    "uploaded_files": files_list,
                    "patents_processed": int(row.get("patents_processed") or 0),
                    "excel_downloads": int(row.get("excel_downloads") or 0),
                    "png_downloads": int(row.get("png_downloads") or 0),
                    "excel_download_bytes": int(row.get("excel_download_bytes") or 0),
                    "png_download_bytes": int(row.get("png_download_bytes") or 0),
                    "last_active_time": row.get("last_active_time"),
                    "status": str(row.get("status", "active"))
                }
                active_logs[session_id] = record
                return record
        except Exception as e:
            logger.error(f"Error restoring session from Supabase: {e}")
            
    # Read Excel to try restoring it (do NOT hold excel_lock here to avoid deadlock with sync_log_to_excel)
    try:
        df = await read_all_logs_from_excel()
            
        if not df.empty and "Session ID" in df.columns:
            matches = df[df["Session ID"] == session_id]
            if not matches.empty:
                row = matches.iloc[0]
                # Convert uploaded files string back to list
                uploaded_files_str = str(row.get("Uploaded Files", ""))
                uploaded_files = [f.strip() for f in uploaded_files_str.split(",") if f.strip()]
                
                record = {
                    "session_id": session_id,
                    "username": str(row.get("Username", "unknown")),
                    "ip_address": str(row.get("IP Address", "unknown")),
                    "login_time": str(row.get("Login Time", "")),
                    "logout_time": str(row.get("Logout Time", "")),
                    "duration": str(row.get("Duration", "00:00:00")),
                    "uploaded_files": uploaded_files,
                    "patents_processed": int(row.get("Patents Processed") or 0),
                    "excel_downloads": int(row.get("Excel Downloads") or 0),
                    "png_downloads": int(row.get("PNG Downloads") or 0),
                    "excel_download_bytes": int(row.get("Excel Download Size (bytes)") or 0),
                    "png_download_bytes": int(row.get("PNG Download Size (bytes)") or 0),
                    "last_active_time": str(row.get("Last Active Time", "")),
                    "status": str(row.get("Status", "active"))
                }
                active_logs[session_id] = record
                logger.info(f"Session {session_id} restored from Excel: excel_bytes={record['excel_download_bytes']}, png_bytes={record['png_download_bytes']}")
                return record
    except Exception as e:
        logger.warning(f"Error restoring session from local Excel: {e}")
            
    # Fallback: create a new active log record if session_id is valid but wasn't found
    now_str = datetime.now(timezone.utc).isoformat()
    fallback_record = {
        "session_id": session_id,
        "username": "unknown",
        "ip_address": "unknown",
        "login_time": now_str,
        "logout_time": None,
        "duration": "00:00:00",
        "uploaded_files": [],
        "patents_processed": 0,
        "excel_downloads": 0,
        "png_downloads": 0,
        "excel_download_bytes": 0,
        "png_download_bytes": 0,
        "last_active_time": now_str,
        "status": "active"
    }
    active_logs[session_id] = fallback_record
    await sync_log_to_excel(session_id, fallback_record)
    return fallback_record

async def log_login(session_id: str, username: str, ip_address: str):
    """Log user login event."""
    now_str = datetime.now(timezone.utc).isoformat()
    record = {
        "session_id": session_id,
        "username": username,
        "ip_address": ip_address,
        "login_time": now_str,
        "logout_time": None,
        "duration": "00:00:00",
        "uploaded_files": [],
        "patents_processed": 0,
        "excel_downloads": 0,
        "png_downloads": 0,
        "excel_download_bytes": 0,
        "png_download_bytes": 0,
        "last_active_time": now_str,
        "status": "active"
    }
    active_logs[session_id] = record
    await sync_log_to_excel(session_id, record)
    logger.info(f"User {username} login logged. Session: {session_id}")

async def log_heartbeat(session_id: str):
    """Update last active time for the session."""
    record = await get_or_restore_log_record(session_id)
    if record:
        now_str = datetime.now(timezone.utc).isoformat()
        record["last_active_time"] = now_str
        if record.get("status") == "timeout":
            record["status"] = "active"
            record["logout_time"] = None

async def log_logout(session_id: str):
    """Log user logout event."""
    record = await get_or_restore_log_record(session_id)
    if record:
        now_str = datetime.now(timezone.utc).isoformat()
        record["logout_time"] = now_str
        record["last_active_time"] = now_str
        record["duration"] = calculate_duration(record["login_time"], now_str)
        record["status"] = "logged_out"
        
        await sync_log_to_excel(session_id, record)
        # Remove from active memory since it is finished
        active_logs.pop(session_id, None)
        logger.info(f"User logged out. Session: {session_id}")

async def log_unload(session_id: str):
    """Log user tab/window close event (BeforeUnload)."""
    record = await get_or_restore_log_record(session_id)
    if record:
        now_str = datetime.now(timezone.utc).isoformat()
        record["logout_time"] = now_str
        record["last_active_time"] = now_str
        record["duration"] = calculate_duration(record["login_time"], now_str)
        record["status"] = "closed"
        
        await sync_log_to_excel(session_id, record)
        active_logs.pop(session_id, None)
        logger.info(f"User session closed proactively. Session: {session_id}")

# --- Event Counter Modification API Functions ---

async def add_uploaded_file(session_id: str, filename: str):
    """Record an uploaded file name under the active session."""
    record = await get_or_restore_log_record(session_id)
    if record:
        if filename not in record["uploaded_files"]:
            record["uploaded_files"].append(filename)
            await sync_log_to_excel(session_id, record)

async def increment_patents_processed(session_id: str, count: int = 1):
    """Increment processed patents count under the active session."""
    record = await get_or_restore_log_record(session_id)
    if record:
        record["patents_processed"] += count
        await sync_log_to_excel(session_id, record)

async def increment_excel_downloads(session_id: str, file_size_bytes: int = 0):
    """Increment Excel download count and accumulate total file size under the active session."""
    record = await get_or_restore_log_record(session_id)
    if record:
        record["excel_downloads"] += 1
        record["excel_download_bytes"] = record.get("excel_download_bytes", 0) + max(0, int(file_size_bytes))
        if record.get("status") == "timeout":
            record["status"] = "active"
            record["logout_time"] = None
        logger.info(f"Excel download logged: session={session_id}, size={file_size_bytes}, total_bytes={record['excel_download_bytes']}, count={record['excel_downloads']}")
        await sync_log_to_excel(session_id, record)

async def increment_png_downloads(session_id: str, file_size_bytes: int = 0):
    """Increment PNG download count and accumulate total file size under the active session."""
    record = await get_or_restore_log_record(session_id)
    if record:
        record["png_downloads"] += 1
        record["png_download_bytes"] = record.get("png_download_bytes", 0) + max(0, int(file_size_bytes))
        if record.get("status") == "timeout":
            record["status"] = "active"
            record["logout_time"] = None
        logger.info(f"PNG download logged: session={session_id}, size={file_size_bytes}, total_bytes={record['png_download_bytes']}, count={record['png_downloads']}")
        await sync_log_to_excel(session_id, record)

# --- Background Task: Clean Timeout Sessions ---

async def clean_expired_sessions(timeout_seconds: int = 300):
    """
    Scans active logs in memory.
    If last_active_time is older than timeout_seconds (default 5 minutes), mark it as timeout,
    write duration to Excel, and remove it from active memory.
    """
    now = datetime.now(timezone.utc)
    expired_session_ids = []
    
    for session_id, record in list(active_logs.items()):
        try:
            last_active = datetime.fromisoformat(record["last_active_time"])
            if last_active.tzinfo is None:
                last_active = last_active.replace(tzinfo=timezone.utc)
            elapsed = (now - last_active).total_seconds()
            
            if elapsed > timeout_seconds:
                # Mark as timeout
                record["logout_time"] = record["last_active_time"]  # use last active as logout
                record["duration"] = calculate_duration(record["login_time"], record["last_active_time"])
                record["status"] = "timeout"
                
                # Sync updates
                await sync_log_to_excel(session_id, record)
                expired_session_ids.append(session_id)
                logger.info(f"Session {session_id} timed out. Last active was {elapsed}s ago. Logged as timeout.")
        except Exception as e:
            logger.error(f"Error checking timeout for session {session_id}: {e}")
            
    # Clean up memory
    for session_id in expired_session_ids:
        active_logs.pop(session_id, None)

async def session_timeout_cleanup_loop(interval: int = 30, timeout: int = 300):
    """Infinite loop for the background thread to scan timeouts."""
    while True:
        try:
            await asyncio.sleep(interval)
            await clean_expired_sessions(timeout)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in session timeout cleanup loop: {e}")

