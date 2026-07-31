"""
Lightweight diagnostic endpoint for Vercel deployment debugging.
Access at: /api/debug
"""
import sys
import os
import traceback

from fastapi import FastAPI

app = FastAPI()

@app.get("/api/debug")
def debug():
    results = {
        "python_version": sys.version,
        "platform": sys.platform,
        "env_vars": {
            "VERCEL": os.environ.get("VERCEL"),
            "SUPABASE_URL_set": bool(os.environ.get("SUPABASE_URL")),
            "SUPABASE_KEY_set": bool(os.environ.get("SUPABASE_KEY")),
            "OPENROUTER_API_KEY_set": bool(os.environ.get("OPENROUTER_API_KEY")),
        },
        "import_tests": {}
    }

    packages = [
        ("fastapi", "fastapi"),
        ("pydantic", "pydantic"),
        ("requests", "requests"),
        ("httpx", "httpx"),
        ("pandas", "pandas"),
        ("openpyxl", "openpyxl"),
        ("pdfplumber", "pdfplumber"),
        ("pypdf", "pypdf"),
        ("beautifulsoup4", "bs4"),
        ("google-genai", "google.genai"),
        ("python-dotenv", "dotenv"),
        ("Pillow", "PIL"),
        ("json-repair", "json_repair"),
        ("truststore", "truststore"),
    ]

    for display_name, import_name in packages:
        try:
            __import__(import_name)
            results["import_tests"][display_name] = "OK"
        except Exception as e:
            results["import_tests"][display_name] = f"FAILED: {e}"

    # Try importing the main backend app
    try:
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from backend.main import app as main_app  # noqa: F401
        results["backend_main_import"] = "OK"
    except Exception:
        results["backend_main_import"] = f"FAILED:\n{traceback.format_exc()}"

    return results
