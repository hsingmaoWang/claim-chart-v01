import os
import json
import base64
import requests
import ssl
import httpx
import truststore
import re
import json_repair
from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel

load_dotenv()

# --- Pydantic Schemas for Structured Outputs ---

class IndependentClaims(BaseModel):
    claims: list[str]

class ClaimElement(BaseModel):
    text: str
    numeral: str

class ClaimAnalysis(BaseModel):
    best_figure_id: str
    elements: list[ClaimElement]

# --- Shared Helpers for JSON & LLM Schema ---

def robust_json_decode(text: str):
    """
    優化後的自癒 JSON 解析器，支援修復受損的 JSON 格式與轉義字元
    """
    if not text:
        return {}
    text = text.strip()
    
    # 移除 Markdown Codeblock 標記
    text = re.sub(r'^```json\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    
    # 清除控制字元（Unterminated string 的主要元兇）
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)
    
    # 1. 嘗試標準直接解析
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 2. 使用 json_repair 進行修復並載入
    try:
        repaired_data = json_repair.loads(text)
        if repaired_data is not None:
            return repaired_data
    except Exception:
        pass

    # 3. 備援方案：尋找外層第一個 { 和最後一個 }（針對夾雜無關說明的生成）
    start_idx = text.find('{')
    end_idx = text.rfind('}')
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        try:
            candidate = text[start_idx:end_idx+1]
            return json_repair.loads(candidate)
        except Exception:
            pass

    # 4. 針對陣列的備援方案（有些 LLM 回應最外層是 [ ... ]）
    start_arr_idx = text.find('[')
    end_arr_idx = text.rfind(']')
    if start_arr_idx != -1 and end_arr_idx != -1 and end_arr_idx > start_arr_idx:
        try:
            candidate = text[start_arr_idx:end_arr_idx+1]
            return json_repair.loads(candidate)
        except Exception:
            pass

    raise ValueError("Could not recover valid JSON from model response.")

def configure_response_format(response_schema, provider: str):
    """
    為 Gemini Direct 或 OpenRouter 提供 Structured Output / JSON Schema 參數配置
    """
    if not response_schema:
        if provider == "openrouter":
            return {"response_format": {"type": "json_object"}}
        else:
            return {"response_mime_type": "application/json"}

    if provider == "openrouter":
        return {
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": response_schema.__name__,
                    "strict": True,
                    "schema": response_schema.model_json_schema()
                }
            }
        }
    else:
        return {
            "response_mime_type": "application/json",
            "response_schema": response_schema
        }

def send_openrouter_request(payload: dict, timeout: float = 60.0) -> dict:
    """
    Unified helper to send POST requests to OpenRouter API using truststore and httpx.
    Resolves corporate proxy/self-signed SSL certificate issues using the OS trust store.
    """
    openrouter_key = os.environ.get("OPENROUTER_API_KEY")
    if not openrouter_key:
        raise ValueError("Valid OPENROUTER_API_KEY not found in environment.")
        
    headers = {
        "Authorization": f"Bearer {openrouter_key}",
        "Content-Type": "application/json"
    }
    
    ctx = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    with httpx.Client(verify=ctx, timeout=timeout) as http_client:
        response = http_client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload
        )
        response.raise_for_status()
        return response.json()

def get_genai_client():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key or api_key == "AIzaSyYourKeyHere":
        raise ValueError("Valid GEMINI_API_KEY not found in environment.")
    return genai.Client(api_key=api_key, http_options={'timeout': 600000})

def identify_independent_claims(text: str):
    """
    Uses Gemini LLM to find independent claims within a body of patent claims.
    """
    provider = os.environ.get("API_PROVIDER", "gemini").lower()
    
    prompt = f"""
    You are a patent attorney. I am providing you with the text of a patent document.
    Please extract all the INDEPENDENT claims. Ignore dependent claims.
    Return the result as a strictly formatted JSON object with a single key "claims" (array of strings), where each string in the array is the full text of an independent claim including its claim number.
    Do not include markdown blocks like ```json in the final response. Only output raw JSON.

    PATENT TEXT:
    {text}
    """
    
    config_params = configure_response_format(IndependentClaims, provider)
    
    if provider == "openrouter":
        try:
            payload = {
                "model": "google/gemini-2.5-flash",
                "messages": [{"role": "user", "content": prompt}],
                **config_params
            }
            data = send_openrouter_request(payload, timeout=180.0)
            parsed = robust_json_decode(data["choices"][0]["message"]["content"])
            if isinstance(parsed, list):
                return parsed
            return parsed.get("claims", [])
        except Exception as e:
            print("Failed to parse claims from OpenRouter:", e)
            return []
    else:
        client = get_genai_client()
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(**config_params)
        )
        
        try:
            parsed = robust_json_decode(response.text)
            if isinstance(parsed, list):
                return parsed
            return parsed.get("claims", [])
        except Exception as e:
            print("Failed to parse claims from LLM:", e)
            return []

def extract_and_map_elements(claim_text: str, figures_list: list):
    """
    Uses Gemini LLM to parse a claim into elements, find reference numerals, 
    and identify the single best matching figure from the provided list.
    
    figures_list is a list of dicts: [{"fig_id": "Fig 1", "image_path": "path/to/img"}, ...]
    """
    from PIL import Image
    
    prompt = f"""
    You are a patent analyst. Analyze the following independent claim and the provided figure images.
    1. Break down the claim into its logical elements (e.g., "a base (10)", "a lever (12)").
    2. Identify the single best figure from the provided images that illustrates these elements, based on the reference numerals matching visually.
    
    Return strictly formatted JSON:
    {{
        "best_figure_id": "the exact fig_id of the matched image",
        "elements": [
            {{"text": "a base", "numeral": "10"}},
            {{"text": "a lever", "numeral": "12"}}
        ]
    }}
    
    CLAIM:
    {claim_text}
    
    AVAILABLE FIGURES CONTEXT:
    """
    contents = [prompt]
    
    # Setup for openrouter
    provider = os.environ.get("API_PROVIDER", "gemini").lower()
    openrouter_content_array = [{"type": "text", "text": prompt}]
    
    # Append PIL images and their IDs
    for fig in figures_list:
        try:
            img = Image.open(fig["image_path"])
            contents.append(f"Figure ID: {fig['fig_id']}")
            contents.append(img)
            
            if provider == "openrouter":
                with open(fig["image_path"], "rb") as image_file:
                    encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
                img_format = "jpeg"
                if fig["image_path"].lower().endswith(".png"): img_format = "png"
                
                openrouter_content_array.append({"type": "text", "text": f"Figure ID: {fig['fig_id']}"})
                openrouter_content_array.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/{img_format};base64,{encoded_string}"
                    }
                })
        except Exception as e:
            print(f"Could not load image {fig['image_path']}: {e}")
            
    config_params = configure_response_format(ClaimAnalysis, provider)
            
    if provider == "openrouter":
        try:
            payload = {
                "model": "google/gemini-2.5-flash",
                "messages": [{"role": "user", "content": openrouter_content_array}],
                **config_params
            }
            data = send_openrouter_request(payload, timeout=300.0)
            return robust_json_decode(data["choices"][0]["message"]["content"])
        except Exception as e:
             print("Failed to parse elements from OpenRouter:", e)
             return {"best_figure_id": "", "elements": []}
    else:
        client = get_genai_client() # Move initialization here
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=contents,
            config=types.GenerateContentConfig(**config_params)
        )
        
        try:
             return robust_json_decode(response.text)
        except Exception as e:
             print("Failed to parse elements from LLM:", e)
             return {"best_figure_id": "", "elements": []}
