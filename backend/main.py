import tempfile
import sys
import os
import asyncio

# Ensure local imports work regardless of where uvicorn is run from
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import logging
import shutil
import uuid
import requests
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import FileResponse
from typing import Optional
from contextlib import asynccontextmanager

from extractor import extract_pdf_content, scrape_google_patents
from analyzer import identify_independent_claims, extract_and_map_elements
from pptx_generator import generate_claim_chart_pptx
from mindmap_processor import router as mindmap_router
from auth_handler import (
    verify_credentials, create_session, remove_session, get_session_by_token,
    get_current_user, get_current_admin, load_users, save_users, get_password_hash,
    active_sessions
)
import auth_handler
import secrets
from logger_handler import (
    log_login, log_logout, log_heartbeat, log_unload,
    add_uploaded_file, increment_patents_processed,
    increment_excel_downloads, increment_png_downloads,
    session_timeout_cleanup_loop, init_logs_excel, active_logs
)

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Lifespan context manager ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize Excel log file and start background cleanup task
    await init_logs_excel()
    cleanup_task = asyncio.create_task(session_timeout_cleanup_loop(interval=30, timeout=60))
    logger.info("Session cleanup background task started.")
    yield
    # Shutdown: cancel the cleanup task
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    logger.info("Session cleanup background task stopped.")

app = FastAPI(title="Patent Claim Chart Generator API", lifespan=lifespan)
app.include_router(mindmap_router)

# Configure CORS so the React frontend can call this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, this should be restricted
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"]
)

# --- Auth Pydantic Models ---
class LoginRequest(BaseModel):
    username: str
    password: str

class HeartbeatRequest(BaseModel):
    session_id: str

class PngLogRequest(BaseModel):
    session_id: str

class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "user"  # 'user' or 'admin'

class UpdateUserRequest(BaseModel):
    password: Optional[str] = None
    role: Optional[str] = None
    notes: Optional[str] = None

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

# --- Original Models ---
class UrlProcessRequest(BaseModel):
    url: str

class ExtensionDataRequest(BaseModel):
    title: str
    patent_number: str
    abstract: str
    claims: list[str]
    raw_text: str
    figures: list[str]
    source_url: str


@app.get("/")
def read_root():
    return {"message": "Patent Claim Chart API is running!"}

# =====================================================
# Auth & Session Endpoints
# =====================================================

@app.post("/api/auth/login")
async def login(request: LoginRequest, req: Request):
    """Authenticate user and create a session."""
    user_info = verify_credentials(request.username, request.password)
    if not user_info:
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    
    token = create_session(user_info["username"], user_info["role"])
    session_id = active_sessions[token]["session_id"]
    
    # Get client IP address
    ip_address = req.headers.get("X-Forwarded-For", req.headers.get("X-Real-IP", req.client.host))
    
    # Log the login event
    await log_login(session_id, user_info["username"], ip_address)
    
    logger.info(f"User '{user_info['username']}' logged in. Session: {session_id}, IP: {ip_address}")
    
    return {
        "token": token,
        "session_id": session_id,
        "username": user_info["username"],
        "role": user_info["role"]
    }

@app.post("/api/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    """Log the user out and finalize the session record."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token.")
    
    token = authorization.split(" ")[1]
    session_info = get_session_by_token(token)
    if session_info:
        session_id = session_info["session_id"]
        await log_logout(session_id)
        remove_session(token)
    
    return {"message": "Logged out successfully."}

@app.post("/api/auth/change-password")
async def change_password(
    data: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user)
):
    """Allow a logged-in user to change their own password."""
    username = current_user["username"]

    # Validate new password length
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="新密碼長度至少需要 6 個字元。")

    # Verify current password is correct
    user_info = verify_credentials(username, data.current_password)
    if not user_info:
        raise HTTPException(status_code=400, detail="目前的密碼不正確，請重新輸入。")

    # Update with new password
    users = load_users()
    new_salt = secrets.token_hex(16)
    users[username]["password_hash"] = get_password_hash(data.new_password, new_salt)
    users[username]["salt"] = new_salt

    if not save_users(users):
        raise HTTPException(status_code=500, detail="儲存密碼時發生錯誤，請稍後再試。")

    logger.info(f"User '{username}' changed their password successfully.")
    return {"message": "密碼已成功更新。"}

@app.post("/api/auth/heartbeat")
async def heartbeat(data: HeartbeatRequest):
    """Update the last active time for a session (called every 30s by frontend)."""
    await log_heartbeat(data.session_id)
    return {"status": "ok"}

@app.post("/api/auth/unload")
async def unload(data: HeartbeatRequest):
    """Called by navigator.sendBeacon when the tab is closed."""
    await log_unload(data.session_id)
    return {"status": "ok"}

@app.post("/api/usage/log-png")
async def log_png_download(data: PngLogRequest):
    """Frontend calls this when a PNG download is triggered."""
    await increment_png_downloads(data.session_id)
    return {"status": "ok"}

# =====================================================
# Admin Endpoints (Admin only)
# =====================================================

@app.get("/api/admin/users")
async def admin_list_users(current_admin: dict = Depends(get_current_admin)):
    """List all users (admin only)."""
    users = load_users()
    # Return without password hashes
    return {
        "users": [
            {"username": k, "role": v.get("role", "user"), "notes": v.get("notes", "")}
            for k, v in users.items()
        ]
    }

@app.post("/api/admin/users")
async def admin_create_or_update_user(
    data: CreateUserRequest,
    current_admin: dict = Depends(get_current_admin)
):
    """Create a new user or update an existing one (admin only)."""
    users = load_users()
    salt = secrets.token_hex(16)
    password_hash = get_password_hash(data.password, salt)
    
    is_update = data.username in users
    users[data.username] = {
        "password_hash": password_hash,
        "salt": salt,
        "role": data.role
    }
    
    if not save_users(users):
        raise HTTPException(status_code=500, detail="Failed to save user data.")
    
    action = "updated" if is_update else "created"
    logger.info(f"Admin '{current_admin['username']}' {action} user '{data.username}'.")
    return {"message": f"User '{data.username}' {action} successfully.", "username": data.username, "role": data.role}

@app.put("/api/admin/users/{username}")
async def admin_update_user(
    username: str,
    data: UpdateUserRequest,
    current_admin: dict = Depends(get_current_admin)
):
    """Update user password and/or role (admin only)."""
    users = load_users()
    if username not in users:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found.")
    
    if data.password:
        salt = secrets.token_hex(16)
        users[username]["password_hash"] = get_password_hash(data.password, salt)
        users[username]["salt"] = salt
    
    if data.role:
        users[username]["role"] = data.role

    if data.notes is not None:
        users[username]["notes"] = data.notes
    
    if not save_users(users):
        raise HTTPException(status_code=500, detail="Failed to save user data.")
    
    logger.info(f"Admin '{current_admin['username']}' updated user '{username}'.")
    return {"message": f"User '{username}' updated successfully."}

@app.delete("/api/admin/users/{username}")
async def admin_delete_user(
    username: str,
    current_admin: dict = Depends(get_current_admin)
):
    """Delete a user (admin only)."""
    if username == current_admin["username"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account.")
    
    users = load_users()
    if username not in users:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found.")
    
    del users[username]
    if not save_users(users):
        raise HTTPException(status_code=500, detail="Failed to save user data.")
    
    logger.info(f"Admin '{current_admin['username']}' deleted user '{username}'.")
    return {"message": f"User '{username}' deleted successfully."}

@app.get("/api/admin/logs")
async def admin_get_logs(current_admin: dict = Depends(get_current_admin)):
    """Read all usage logs (admin only)."""
    from logger_handler import read_all_logs_from_excel, excel_lock, is_supabase_enabled
    if is_supabase_enabled():
        df = await read_all_logs_from_excel()
    else:
        async with excel_lock:
            df = await read_all_logs_from_excel()
    records = df.fillna("").to_dict(orient="records")
    return {"logs": records}

@app.get("/api/admin/logs/download")
async def admin_download_logs(current_admin: dict = Depends(get_current_admin)):
    """Download usage_logs.xlsx (admin only) - generated from Supabase or local file."""
    from logger_handler import read_all_logs_from_excel, excel_lock, is_supabase_enabled, LOGS_EXCEL
    if is_supabase_enabled():
        # Generate xlsx on-the-fly in /tmp (writable on Vercel)
        df = await read_all_logs_from_excel()
        tmp_path = os.path.join(tempfile.gettempdir(), "usage_logs_export.xlsx")
        await asyncio.to_thread(df.to_excel, tmp_path, index=False)
        return FileResponse(
            path=tmp_path,
            filename="usage_logs.xlsx",
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    else:
        if not os.path.exists(LOGS_EXCEL):
            raise HTTPException(status_code=404, detail="Log file does not exist yet.")
        return FileResponse(
            path=LOGS_EXCEL,
            filename="usage_logs.xlsx",
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

@app.post("/api/process/pdf")
async def process_pdf(
    file: UploadFile = File(...),
    x_session_id: Optional[str] = Header(None)
):
    """ Endpoint to handle PDF uploads and process them into PPTX. """
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    
    logger.info(f"Received PDF file: {file.filename}")
    
    # Log uploaded filename to session if session_id provided
    if x_session_id:
        await add_uploaded_file(x_session_id, file.filename)
    
    run_id = str(uuid.uuid4())
    temp_dir = os.path.join(tempfile.gettempdir(), "temp_processing", run_id)
    os.makedirs(temp_dir, exist_ok=True)
    
    temp_pdf_path = os.path.join(temp_dir, file.filename)
    
    with open(temp_pdf_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # 2. Extract text and images via PyMuPDF
    logger.info("Extracting PDF contents...")
    extracted_data = extract_pdf_content(temp_pdf_path, output_image_dir=os.path.join(temp_dir, "images"))
    text = extracted_data["text"]
    figures_list = extracted_data["figures"]
    
    # 3. Analyze independent claims
    logger.info("Identifying independent claims...")
    indep_claims = identify_independent_claims(text)
    
    claims_data = []
    
    for claim_text in indep_claims:
        logger.info(f"Analyzing claim elements...")
        mapping = extract_and_map_elements(claim_text, figures_list)
        
        # Determine image_path from matched fig_id
        matched_image_path = None
        best_id = mapping.get("best_figure_id", "")
        for fig in figures_list:
            if fig["fig_id"] == best_id:
                matched_image_path = fig["image_path"]
                break
                
        claims_data.append({
            "claim_text": claim_text,
            "best_figure_id": best_id,
            "image_path": matched_image_path,
            "elements": mapping.get("elements", [])
        })
    
    # Log patent count (1 PDF = 1 patent processed)
    if x_session_id:
        await increment_patents_processed(x_session_id, 1)
        
    # 4. Generate PPTX
    out_pptx_filename = f"patent_claims_{run_id}.pptx"
    out_pptx_path = os.path.join(temp_dir, out_pptx_filename)
    
    logger.info("Generating PPTX...")
    generate_claim_chart_pptx(claims_data, out_pptx_path)
    
    # 5. Return success / link to download (Actually serving the file for simplicity)
    return FileResponse(path=out_pptx_path, filename=out_pptx_filename, media_type='application/vnd.openxmlformats-officedocument.presentationml.presentation')
@app.post("/api/process/url")
async def process_url(request: UrlProcessRequest):
    """ Endpoint to process an imported Google Patents URL. """
    logger.info(f"Received URL: {request.url}")
    return {"status": "success", "message": "Standard URL scraping pending. Use the Antigravity Browser Extension!"}

@app.post("/api/process/extension")
async def process_extension(
    request: ExtensionDataRequest,
    x_session_id: Optional[str] = Header(None)
):
    """ Endpoint to process pre-extracted data from the Browser Extension. """
    logger.info(f"Received extension data for patent: {request.patent_number}")
    
    if x_session_id:
        await add_uploaded_file(x_session_id, f"Extension_{request.patent_number}")
        await increment_patents_processed(x_session_id, 1)
        
    run_id = str(uuid.uuid4())
# --- 修改 3: 修改瀏覽器擴充功能數據處理的暫存路徑 ---    
#    temp_dir = os.path.join("temp_processing", run_id)
    temp_dir = os.path.join(tempfile.gettempdir(), "temp_processing", run_id)
    images_dir = os.path.join(temp_dir, "images")
    os.makedirs(images_dir, exist_ok=True)
    
    text = request.raw_text
    
    # 1. Download images to pass to local generator
    figures_list = []
    for i, url in enumerate(request.figures):
        if url.startswith('http'):
            try:
                img_data = requests.get(url).content
                local_path = os.path.join(images_dir, f"fig_{i}.jpg")
                with open(local_path, "wb") as f:
                    f.write(img_data)
                
                # Give a generic fig ID unless parsed from image url context
                figures_list.append({
                    "fig_id": f"Fig {i+1}",
                    "image_path": local_path
                })
            except Exception as e:
                logger.error(f"Failed to download image {url}: {e}")

    # 3. Analyze independent claims
    logger.info("Identifying independent claims...")
    indep_claims = identify_independent_claims(text)
    
    if not indep_claims and request.claims:
        indep_claims = request.claims # Fallback to whatever extension found

    claims_data = []
    for claim_text in indep_claims:
        logger.info(f"Analyzing claim elements...")
        mapping = extract_and_map_elements(claim_text, figures_list)
        
        matched_image_path = None
        best_id = mapping.get("best_figure_id", "")
        for fig in figures_list:
            if fig["fig_id"] == best_id:
                matched_image_path = fig["image_path"]
                break
                
        claims_data.append({
            "claim_text": claim_text,
            "best_figure_id": best_id,
            "image_path": matched_image_path,
            "elements": mapping.get("elements", [])
        })
        
    # 4. Generate PPTX
    out_pptx_filename = f"patent_claims_{request.patent_number}_{run_id}.pptx"
    out_pptx_path = os.path.join(temp_dir, out_pptx_filename)
    
    logger.info("Generating PPTX...")
    generate_claim_chart_pptx(claims_data, out_pptx_path)
    
    # 5. Return success / link to download
    return FileResponse(path=out_pptx_path, filename=out_pptx_filename, media_type='application/vnd.openxmlformats-officedocument.presentationml.presentation')
