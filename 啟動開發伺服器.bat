@echo off
title Patent Analyzer - Dev Server

set "PROJECT_ROOT=%~dp0"
set "BACKEND_DIR=%PROJECT_ROOT%backend"
set "FRONTEND_DIR=%PROJECT_ROOT%frontend"
set "VENV_PYTHON=%PROJECT_ROOT%backend\venv\Scripts\python.exe"

if not exist "%VENV_PYTHON%" (
    echo [ERROR] Python not found: %VENV_PYTHON%
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found. Please install Node.js.
    pause
    exit /b 1
)

echo Starting Backend  (FastAPI on http://127.0.0.1:8000) ...
start "Backend - Patent Analyzer" /D "%BACKEND_DIR%" cmd /k ""%VENV_PYTHON%" -m uvicorn main:app --reload --host 127.0.0.1 --port 8000"

echo Starting Frontend (Vite on http://localhost:5173) ...
timeout /t 2 /nobreak >nul
start "Frontend - Patent Analyzer" /D "%FRONTEND_DIR%" cmd /k "npm run dev"

echo.
echo ============================================================
echo   Backend  : http://127.0.0.1:8000
echo   Frontend : http://localhost:5173
echo ============================================================
echo.

timeout /t 5 /nobreak >nul
start "" "http://localhost:5173"
