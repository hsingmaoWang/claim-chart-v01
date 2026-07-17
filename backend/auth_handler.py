import os
import json
import hashlib
import secrets
import logging
import threading
import requests
from typing import Dict, Optional
from fastapi import Header, HTTPException, status, Depends

logger = logging.getLogger(__name__)

# Paths
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
USERS_FILE = os.path.join(DATA_DIR, "users.json")

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

# File read/write lock for user database
users_file_lock = threading.Lock()

# Active sessions in-memory store: token -> {username, role, session_id}
active_sessions: Dict[str, dict] = {}

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

def is_supabase_enabled() -> bool:
    return bool(SUPABASE_URL and SUPABASE_KEY)

def get_password_hash(password: str, salt: str) -> str:
    """Hash password using SHA-256 and salt."""
    return hashlib.sha256((password + salt).encode('utf-8')).hexdigest()

def init_default_users():
    """Initialize users database with default admin and general user if it doesn't exist."""
    with users_file_lock:
        if is_supabase_enabled():
            try:
                headers = {
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}"
                }
                res = requests.get(f"{SUPABASE_URL}/rest/v1/users?select=username", headers=headers, timeout=10)
                res.raise_for_status()
                if not res.json():
                    logger.info("Initializing default users in Supabase...")
                    admin_salt = secrets.token_hex(16)
                    user_salt = secrets.token_hex(16)
                    default_users = {
                        "admin": {
                            "password_hash": get_password_hash("admin_password", admin_salt),
                            "salt": admin_salt,
                            "role": "admin",
                            "notes": ""
                        },
                        "user": {
                            "password_hash": get_password_hash("user_password", user_salt),
                            "salt": user_salt,
                            "role": "user",
                            "notes": ""
                        }
                    }
                    save_users(default_users)
                return
            except Exception as e:
                logger.error(f"Error initializing default users in Supabase: {e}")
                # Fallback to local file initialization

        if not os.path.exists(USERS_FILE):
            logger.info("Initializing default users database locally...")
            admin_salt = secrets.token_hex(16)
            user_salt = secrets.token_hex(16)
            
            default_users = {
                "admin": {
                    "password_hash": get_password_hash("admin_password", admin_salt),
                    "salt": admin_salt,
                    "role": "admin"
                },
                "user": {
                    "password_hash": get_password_hash("user_password", user_salt),
                    "salt": user_salt,
                    "role": "user"
                }
            }
            try:
                with open(USERS_FILE, "w", encoding="utf-8") as f:
                    json.dump(default_users, f, ensure_ascii=False, indent=4)
            except Exception as e:
                logger.error(f"Error writing local default users: {e}")

# Initialize on module import
init_default_users()

def load_users() -> dict:
    """Load users from Supabase or local JSON file."""
    if is_supabase_enabled():
        try:
            headers = {
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}"
            }
            res = requests.get(f"{SUPABASE_URL}/rest/v1/users", headers=headers, timeout=10)
            res.raise_for_status()
            users = {}
            for row in res.json():
                users[row["username"]] = {
                    "password_hash": row["password_hash"],
                    "salt": row["salt"],
                    "role": row["role"],
                    "notes": row.get("notes", "")
                }
            return users
        except Exception as e:
            logger.error(f"Error loading users from Supabase: {e}")
            # Fallback to local users.json on failure

    with users_file_lock:
        if not os.path.exists(USERS_FILE):
            return {}
        try:
            with open(USERS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading local users database: {e}")
            return {}

def save_users(users: dict) -> bool:
    """Save users to Supabase or local JSON file."""
    if is_supabase_enabled():
        try:
            headers = {
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates"
            }
            
            # Fetch current usernames in Supabase to find deleted ones
            res_current = requests.get(f"{SUPABASE_URL}/rest/v1/users?select=username", headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}"
            }, timeout=10)
            res_current.raise_for_status()
            current_db_usernames = {row["username"] for row in res_current.json()}
            
            # Usernames in target dict
            target_usernames = set(users.keys())
            
            # Deleted usernames
            deleted_usernames = current_db_usernames - target_usernames
            if deleted_usernames:
                from urllib.parse import quote
                in_str = quote(f"({','.join(deleted_usernames)})")
                res_del = requests.delete(
                    f"{SUPABASE_URL}/rest/v1/users?username=in.{in_str}",
                    headers={
                        "apikey": SUPABASE_KEY,
                        "Authorization": f"Bearer {SUPABASE_KEY}"
                    },
                    timeout=10
                )
                res_del.raise_for_status()
                
            # Upsert target users
            payload = []
            for username, data in users.items():
                payload.append({
                    "username": username,
                    "password_hash": data.get("password_hash"),
                    "salt": data.get("salt"),
                    "role": data.get("role", "user"),
                    "notes": data.get("notes", "")
                })
            
            if payload:
                res_upsert = requests.post(
                    f"{SUPABASE_URL}/rest/v1/users",
                    json=payload,
                    headers=headers,
                    timeout=10
                )
                res_upsert.raise_for_status()
            return True
        except Exception as e:
            logger.error(f"Error saving users to Supabase: {e}")
            # Fallback to local file on failure

    with users_file_lock:
        try:
            with open(USERS_FILE, "w", encoding="utf-8") as f:
                json.dump(users, f, ensure_ascii=False, indent=4)
            return True
        except Exception as e:
            logger.error(f"Error saving local users database: {e}")
            return False

def verify_credentials(username: str, password: str) -> Optional[dict]:
    """Verify credentials and return user info (without sensitive data) or None."""
    users = load_users()
    if username not in users:
        return None
    
    user_data = users[username]
    salt = user_data.get("salt", "")
    password_hash = get_password_hash(password, salt)
    
    if password_hash == user_data.get("password_hash"):
        return {
            "username": username,
            "role": user_data.get("role", "user")
        }
    return None

def create_session(username: str, role: str) -> str:
    """Create a new session, generate a token, and return it."""
    token = secrets.token_hex(32)
    session_id = secrets.token_hex(16)
    active_sessions[token] = {
        "username": username,
        "role": role,
        "session_id": session_id
    }
    return token

def remove_session(token: str) -> Optional[dict]:
    """Remove a session by token and return the removed session info."""
    return active_sessions.pop(token, None)

def get_session_by_token(token: str) -> Optional[dict]:
    """Get active session by token."""
    return active_sessions.get(token)

async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """
    FastAPI dependency to validate the token.
    Expects header: Authorization: Bearer <token>
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header."
        )
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization scheme. Use Bearer token."
        )
    
    token = authorization.split(" ")[1]
    session_info = get_session_by_token(token)
    
    if not session_info:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired or token is invalid."
        )
    
    return session_info

async def get_current_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """FastAPI dependency to validate admin role."""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator permissions required."
        )
    return current_user
