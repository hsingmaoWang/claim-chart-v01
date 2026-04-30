# --- 修改 1: 在檔案頂部新增導入 ---
import tempfile  # <--- 新增這行
import sys
import os
import logging
import shutil
import uuid
import requests
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi.responses import FileResponse

from extractor import extract_pdf_content, scrape_google_patents
from analyzer import identify_independent_claims, extract_and_map_elements
from pptx_generator import generate_claim_chart_pptx

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Patent Claim Chart Generator API")

# Configure CORS so the React frontend can call this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, this should be restricted
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

@app.post("/api/process/pdf")
async def process_pdf(file: UploadFile = File(...)):
    """ Endpoint to handle PDF uploads and process them into PPTX. """
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    
    logger.info(f"Received PDF file: {file.filename}")
    
    run_id = str(uuid.uuid4())
# --- 修改 2: 修改 PDF 處理的暫存路徑 ---
#    temp_dir = os.path.join("temp_processing", run_id)
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
async def process_extension(request: ExtensionDataRequest):
    """ Endpoint to process pre-extracted data from the Browser Extension. """
    logger.info(f"Received extension data for patent: {request.patent_number}")
    
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
