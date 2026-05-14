import os
import json
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

def get_genai_client():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key or api_key == "AIzaSyYourKeyHere":
        raise ValueError("Valid GEMINI_API_KEY not found in environment.")
    return genai.Client(api_key=api_key, http_options={'timeout': 600000})

def identify_independent_claims(text: str):
    """
    Uses Gemini LLM to find independent claims within a body of patent claims.
    """
    client = get_genai_client()
    
    prompt = f"""
    You are a patent attorney. I am providing you with the text of a patent document.
    Please extract all the INDEPENDENT claims. Ignore dependent claims.
    Return the result as a strictly formatted JSON array of strings, where each string is the full text of an independent claim including its claim number.
    Do not include markdown blocks like ```json in the final response. Only output raw JSON.

    PATENT TEXT:
    {text}
    """
    
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt,
        config=types.GenerateContentConfig(response_mime_type="application/json")
    )
    
    try:
        return json.loads(response.text)
    except Exception as e:
        print("Failed to parse claims from LLM:", e)
        return []

def extract_and_map_elements(claim_text: str, figures_list: list):
    """
    Uses Gemini LLM to parse a claim into elements, find reference numerals, 
    and identify the single best matching figure from the provided list.
    
    figures_list is a list of dicts: [{"fig_id": "Fig 1", "image_path": "path/to/img"}, ...]
    """
    client = get_genai_client()
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
    
    # Append PIL images and their IDs
    for fig in figures_list:
        try:
            img = Image.open(fig["image_path"])
            contents.append(f"Figure ID: {fig['fig_id']}")
            contents.append(img)
        except Exception as e:
            print(f"Could not load image {fig['image_path']}: {e}")
            
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=contents,
        config=types.GenerateContentConfig(response_mime_type="application/json")
    )
    
    try:
         return json.loads(response.text)
    except Exception as e:
         print("Failed to parse elements from LLM:", e)
         return {"best_figure_id": "", "elements": []}
