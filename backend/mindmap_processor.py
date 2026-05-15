import os
import json
import logging
import uuid
import pandas as pd
from fastapi import APIRouter, File, UploadFile, Form, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
import tempfile

try:
    from analyzer import get_genai_client
    from extractor import extract_pdf_content
except ImportError:
    from backend.analyzer import get_genai_client
    from backend.extractor import extract_pdf_content

from google.genai import types

logger = logging.getLogger(__name__)

router = APIRouter()

class MindMapConfig(BaseModel):
    app_area_count: str = "3~7"
    tech1_count: str = "3~5"
    tech2_count: str = "3~7"
    tech3_count: str = "3~5"
    efficacy_count: str = "3~5"
    file_id: str = "" # Reference to the uploaded file's temp storage

def extract_patents_from_excel(file_path):
    df = pd.read_excel(file_path)
    df = df.fillna("")
    patents = []
    
    # Try to heuristically find columns
    cols = list(df.columns)
    
    for intro_idx, row in df.iterrows():
        # Just convert the row to a JSON string for the AI to parse
        row_dict = row.to_dict()
        patents.append(json.dumps(row_dict, ensure_ascii=False))
        
    return "\n".join(patents)

def query_gemini_mindmap(text_content: str, config: MindMapConfig):
    client = get_genai_client()
    
    prompt = f"""
    You are an expert patent analyst. I am providing you with patent data (either from an Excel spreadsheet or a PDF).
    Your task is to analyze this data and generate a structured categorization for a Patent Mind Map.
    
    CRITICAL CATEGORIZATION RULES:
    1. A single patent can be assigned to 1 to 3 categories for each level, depending on its content. Return these categories as an array of strings (e.g., ["Category A", "Category B"]).
    2. 應用領域 (Application Area), 功效節點 (Efficacy Node), and 技術1階 (Tech Level 1) should be categorized based on the ENTIRE SET of patents. Establish overall categories: {config.app_area_count} categories for 應用領域, {config.efficacy_count} categories for 功效節點, and {config.tech1_count} categories for 技術1階.
    3. 技術2階 (Tech Level 2) must be categorized INDEPENDENTLY within each specific 技術1階. The sub-categories for a Tech Level 1 must be derived strictly from the patents in that Tech Level 1 branch, totaling {config.tech2_count} local categories per branch.
    4. 技術3階 (Tech Level 3) must be categorized INDEPENDENTLY within each specific combination of (技術1階 and 技術2階), totaling {config.tech3_count} local categories per branch.
    
    For EACH individual patent, generate the following fields in traditional Chinese (繁體中文):
    1. 專利公開公告號 (Patent Publication Number - extract carefully, if missing invent a placeholder based on title)
    2. AI技術簡述 (AI Tech Summary - brief summary)
    3. 技術特徵手段 (Tech Features/Means)
    4. 解決的技術問題或技術效益 (Tech Problem/Benefit)
    5. 應用領域 (Array of 1 to 3 strings)
    6. 技術1階 (Array of 1 to 3 strings)
    7. 技術2階 (Array of 1 to 3 strings)
    8. 技術3階 (Array of 1 to 3 strings)
    9. 功效節點 (Array of 1 to 3 strings)
    
    Finally, give a general title for the entire mind map based on the patent collection ("mind_map_title").
    
    Return the result strictly as a JSON object with this structure:
    {{
      "mind_map_title": "...",
      "patents": [
        {{
          "專利公開公告號": "...",
          "AI技術簡述": "...",
          "技術特徵手段": "...",
          "解決的技術問題或技術效益": "...",
          "應用領域": ["..."],
          "技術1階": ["..."],
          "技術2階": ["..."],
          "技術3階": ["..."],
          "功效節點": ["..."]
        }}
      ]
    }}
    
    Do not output any markdown formatting, only the raw JSON.
    
    PATENT DATA:
    {text_content[:100000]}
    """
    
    response_stream = client.models.generate_content_stream(
        model='gemini-2.5-flash',
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json")
    )
    
    full_text = ""
    for chunk in response_stream:
        if chunk.text:
            full_text += chunk.text
            
    try:
        return json.loads(full_text)
    except Exception as e:
        logger.error(f"Failed to parse JSON from AI: {e}")
        return None

# Temporary storage for uploaded files so we can re-process them with new configs
# In a real app this should be a DB or S3. 
temp_storage = {}

@router.post("/api/mindmap/upload")
async def upload_for_mindmap(file: UploadFile = File(...)):
    try:
        file_id = str(uuid.uuid4())
        temp_dir = os.path.join(tempfile.gettempdir(), "mindmap", file_id)
        os.makedirs(temp_dir, exist_ok=True)
        file_path = os.path.join(temp_dir, file.filename)
        
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
            
        text_content = ""
        if file.filename.endswith(".xlsx") or file.filename.endswith(".xls") or file.filename.endswith(".csv"):
            text_content = extract_patents_from_excel(file_path)
        elif file.filename.endswith(".pdf"):
            temp_images_dir = os.path.join(temp_dir, "images")
            doc_data = extract_pdf_content(file_path, output_image_dir=temp_images_dir)
            text_content = doc_data["text"]
        else:
            raise ValueError("Only PDF and Excel files supported for mind map.")
            
        temp_storage[file_id] = {
            "text": text_content,
            "filename": file.filename
        }
        
        # Process with default config
        config = MindMapConfig()
        result = query_gemini_mindmap(text_content, config)
        if not result:
            raise ValueError("AI processing failed or returned empty data.")
            
        result["file_id"] = file_id
        result["filename"] = file.filename
        return result
    except Exception as e:
        import traceback
        logger.error(f"Upload mindmap error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/mindmap/reprocess")
async def reprocess_mindmap(config: MindMapConfig):
    try:
        if config.file_id not in temp_storage:
            raise ValueError("File session not found. Please upload again.")
            
        text_content = temp_storage[config.file_id]["text"]
        result = query_gemini_mindmap(text_content, config)
        if not result:
             raise ValueError("AI processing failed or returned empty data.")
             
        result["file_id"] = config.file_id
        result["filename"] = temp_storage[config.file_id]["filename"]
        return result
    except Exception as e:
        import traceback
        logger.error(f"Reprocess mindmap error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/mindmap/export")
async def export_mindmap_excel(data: dict):
    # data should be the 'patents' array, plus 'filename'
    patents = data.get("patents", [])
    original_filename = data.get("filename", "download")
    
    if not patents:
        raise HTTPException(status_code=400, detail="No patents to export.")
        
    df = pd.DataFrame(patents)
    
    # Generate filename
    name, ext = os.path.splitext(original_filename)
    if ext == '':
        ext = '.xlsx'
    out_filename = f"{name}_AG{ext}"
    if not out_filename.endswith(".xlsx"):
        out_filename = f"{name}_AG.xlsx"
        
    temp_dir = os.path.join(tempfile.gettempdir(), "mindmap_export")
    os.makedirs(temp_dir, exist_ok=True)
    out_path = os.path.join(temp_dir, out_filename)
    
    df.to_excel(out_path, index=False)
    
    return FileResponse(path=out_path, filename=out_filename, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
