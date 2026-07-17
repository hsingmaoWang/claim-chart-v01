"""
One-time migration script: Upload all users from local users.json to Supabase.
Run this from the project root:
    python migrate_users_to_supabase.py
"""

import os
import json
import sys
import requests
import urllib3

# Suppress SSL warning for self-signed cert on Windows Python
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ── 設定 ────────────────────────────────────────────────────────────────────
# 直接從環境變數讀取，或手動填入
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")  # 使用 service_role key

USERS_FILE = os.path.join(os.path.dirname(__file__), "backend", "data", "users.json")
# ─────────────────────────────────────────────────────────────────────────────


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[ERROR] Please set SUPABASE_URL and SUPABASE_KEY environment variables.")
        print("   Example:")
        print("   $env:SUPABASE_URL='https://xxxx.supabase.co'")
        print("   $env:SUPABASE_KEY='eyJhbGci...'")
        sys.exit(1)

    if not os.path.exists(USERS_FILE):
        print(f"[ERROR] users.json not found: {USERS_FILE}")
        sys.exit(1)

    with open(USERS_FILE, "r", encoding="utf-8") as f:
        users: dict = json.load(f)

    print(f"[INFO] Found {len(users)} users. Migrating to Supabase...")

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    payload = []
    for username, data in users.items():
        payload.append({
            "username": username,
            "password_hash": data.get("password_hash", ""),
            "salt": data.get("salt", ""),
            "role": data.get("role", "user"),
            "notes": data.get("notes", ""),
        })

    # Upsert all users at once (on_conflict=username)
    res = requests.post(
        f"{SUPABASE_URL}/rest/v1/users?on_conflict=username",
        json=payload,
        headers=headers,
        timeout=30,
        verify=False,
    )

    if res.status_code in (200, 201):
        print(f"[OK] Successfully migrated {len(payload)} users!")
        for u in payload:
            role_tag = "[admin]" if u["role"] == "admin" else "[user] "
            notes = f" ({u['notes']})" if u.get("notes") else ""
            print(f"   {role_tag}  {u['username']}{notes}")
    else:
        print(f"[ERROR] Migration failed HTTP {res.status_code}")
        print(res.text[:500])
        sys.exit(1)


if __name__ == "__main__":
    main()
