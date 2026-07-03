import os
import json
import logging
from datetime import datetime
import pandas as pd
import asyncio
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# Paths
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
LOGS_EXCEL = os.path.join(DATA_DIR, "usage_logs.xlsx")

# Concurrency lock to protect Excel file access
excel_lock = asyncio.Lock()

# In-memory sessions log state: session_id -> log_record_dict
# This stores active logs that are still running or updating.
# We also sync completed/timeout logs to the Excel file.
active_logs: Dict[str, dict] = {}

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

def calculate_duration(start_time_str: str, end_time_str: str) -> str:
    """Calculate HH:MM:SS duration between two ISO format datetime strings."""
    try:
        start = datetime.fromisoformat(start_time_str)
        end = datetime.fromisoformat(end_time_str)
        delta = end - start
        
        # Format as HH:MM:SS
        total_seconds = int(delta.total_seconds())
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    except Exception as e:
        logger.error(f"Error calculating duration: {e}")
        return "00:00:00"

async def read_all_logs_from_excel() -> pd.DataFrame:
    """Read all records from usage_logs.xlsx. Always protected by excel_lock."""
    if not os.path.exists(LOGS_EXCEL):
        return get_empty_log_df()
    try:
        # Run pd.read_excel in a separate thread to avoid blocking the event loop
        df = await asyncio.to_thread(pd.read_excel, LOGS_EXCEL)
        # Ensure all columns exist
        empty_df = get_empty_log_df()
        for col in empty_df.columns:
            if col not in df.columns:
                df[col] = None
        # Cast to object type to prevent float64 dtype TypeError when setting strings
        df = df.astype(object)
        return df
    except Exception as e:
        logger.error(f"Error reading Excel logs: {e}")
        return get_empty_log_df()

async def write_logs_to_excel(df: pd.DataFrame):
    """Write the DataFrame to usage_logs.xlsx. Always protected by excel_lock."""
    try:
        # Run df.to_excel in a separate thread to avoid blocking the event loop
        await asyncio.to_thread(df.to_excel, LOGS_EXCEL, index=False)
    except Exception as e:
        logger.error(f"Error writing Excel logs: {e}")

async def sync_log_to_excel(session_id: str, record: dict):
    """
    Sync or insert a single session log record to the Excel file.
    Uses asyncio.Lock to prevent write collisions.
    """
    async with excel_lock:
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
            "Patents Processed": record.get("patents_processed", 0),
            "Excel Downloads": record.get("excel_downloads", 0),
            "PNG Downloads": record.get("png_downloads", 0),
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

# --- Session Logging API Functions ---

async def get_or_restore_log_record(session_id: str) -> Optional[dict]:
    """Retrieve the log record from active memory or restore it from Excel if missing."""
    if session_id in active_logs:
        return active_logs[session_id]
        
    # Read Excel to try restoring it
    async with excel_lock:
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
                "patents_processed": int(row.get("Patents Processed", 0) if pd.notna(row.get("Patents Processed")) else 0),
                "excel_downloads": int(row.get("Excel Downloads", 0) if pd.notna(row.get("Excel Downloads")) else 0),
                "png_downloads": int(row.get("PNG Downloads", 0) if pd.notna(row.get("PNG Downloads")) else 0),
                "last_active_time": str(row.get("Last Active Time", "")),
                "status": str(row.get("Status", "active"))
            }
            active_logs[session_id] = record
            return record
            
    return None

async def log_login(session_id: str, username: str, ip_address: str):
    """Log user login event."""
    now_str = datetime.now().isoformat()
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
        now_str = datetime.now().isoformat()
        record["last_active_time"] = now_str
        # We don't sync heartbeats to Excel immediately to avoid high disk IO
        # The background cleaner or final logout will sync this.

async def log_logout(session_id: str):
    """Log user logout event."""
    record = await get_or_restore_log_record(session_id)
    if record:
        now_str = datetime.now().isoformat()
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
        now_str = datetime.now().isoformat()
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

async def increment_excel_downloads(session_id: str):
    """Increment Excel download count under the active session."""
    record = await get_or_restore_log_record(session_id)
    if record:
        record["excel_downloads"] += 1
        await sync_log_to_excel(session_id, record)

async def increment_png_downloads(session_id: str):
    """Increment PNG download count under the active session."""
    record = await get_or_restore_log_record(session_id)
    if record:
        record["png_downloads"] += 1
        await sync_log_to_excel(session_id, record)

# --- Background Task: Clean Timeout Sessions ---

async def clean_expired_sessions(timeout_seconds: int = 60):
    """
    Scans active logs in memory.
    If last_active_time is older than timeout_seconds, mark it as timeout,
    write duration to Excel, and remove it from active memory.
    """
    now = datetime.now()
    expired_session_ids = []
    
    for session_id, record in list(active_logs.items()):
        try:
            last_active = datetime.fromisoformat(record["last_active_time"])
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

async def session_timeout_cleanup_loop(interval: int = 30, timeout: int = 60):
    """Infinite loop for the background thread to scan timeouts."""
    while True:
        try:
            await asyncio.sleep(interval)
            await clean_expired_sessions(timeout)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in session timeout cleanup loop: {e}")
