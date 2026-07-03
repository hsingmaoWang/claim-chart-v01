import os
import json
import hashlib
import secrets
import logging
from typing import Dict, Optional
from fastapi import Header, HTTPException, status, Depends

logger = logging.getLogger(__name__)

# Paths
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
USERS_FILE = os.path.join(DATA_DIR, "users.json")

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

# File read/write lock for user database
import threading
users_file_lock = threading.Lock()

# Active sessions in-memory store: token -> {username, role, session_id}
# We store active sessions globally in memory.
active_sessions: Dict[str, dict] = {}

def get_password_hash(password: str, salt: str) -> str:
    """Hash password using SHA-256 and salt."""
    return hashlib.sha256((password + salt).encode('utf-8')).hexdigest()

def init_default_users():
    """Initialize users.json with default admin and general user if it doesn't exist."""
    with users_file_lock:
        if not os.path.exists(USERS_FILE):
            logger.info("Initializing default users database...")
            # Generate salts
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
            with open(USERS_FILE, "w", encoding="utf-8") as f:
                json.dump(default_users, f, ensure_ascii=False, indent=4)

# Initialize on module import
init_default_users()

def load_users() -> dict:
    """Load users from the JSON file."""
    with users_file_lock:
        if not os.path.exists(USERS_FILE):
            return {}
        try:
            with open(USERS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading users database: {e}")
            return {}

def save_users(users: dict) -> bool:
    """Save users to the JSON file."""
    with users_file_lock:
        try:
            with open(USERS_FILE, "w", encoding="utf-8") as f:
                json.dump(users, f, ensure_ascii=False, indent=4)
            return True
        except Exception as e:
            logger.error(f"Error saving users database: {e}")
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
