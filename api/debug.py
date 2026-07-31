"""
Lightweight debug endpoint - does NOT import backend.main at all.
Used to diagnose FUNCTION_INVOCATION_FAILED before fixing imports.
Access at: /api/debug
"""
import sys
import os
import traceback

def handler(request, response=None):
    """Minimal WSGI handler for Vercel diagnostics."""
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
        "fastapi", "pydantic", "requests", "httpx",
        "pandas", "openpyxl", "pdfplumber", "pypdf",
        "beautifulsoup4", "google.genai", "dotenv",
        "PIL", "json_repair", "truststore"
    ]

    for pkg in packages:
        try:
            __import__(pkg)
            results["import_tests"][pkg] = "OK"
        except Exception as e:
            results["import_tests"][pkg] = f"FAILED: {e}"

    # Try importing the main app
    try:
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from backend.main import app
        results["backend_import"] = "OK"
    except Exception as e:
        results["backend_import"] = f"FAILED: {traceback.format_exc()}"

    import json
    body = json.dumps(results, indent=2, ensure_ascii=False)

    # Vercel expects a tuple: (status_code, headers, body)
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": body
    }
