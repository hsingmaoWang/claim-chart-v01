# Extractor module for parsing PDFs and scraping URLs
import requests
from bs4 import BeautifulSoup
import os

def extract_pdf_content(file_path: str, output_image_dir: str = "temp_images"):
    """
    Extracts text and reference images from a given PDF file using pure-python/stable libraries.
    Replaced PyMuPDF (fitz) with pdfplumber/pypdf to avoid DLL loading issues.
    """
    import pdfplumber
    from pypdf import PdfReader
    
    if not os.path.exists(output_image_dir):
        os.makedirs(output_image_dir)
        
    full_text = ""
    extracted_images = []
    
    # 1. Extract Text using pdfplumber (best for layout preservation and text)
    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    full_text += text + "\n"
    except Exception as e:
        print(f"Text extraction failed: {e}")

    # 2. Extract Images using pypdf (more stable pure-python approach)
    try:
        reader = PdfReader(file_path)
        for i, page in enumerate(reader.pages):
            for img_index, image_obj in enumerate(page.images):
                try:
                    # Clean up filename and save
                    ext = image_obj.name.split('.')[-1] if '.' in image_obj.name else "png"
                    image_filename = os.path.join(output_image_dir, f"page{i+1}_img{img_index}.{ext}")
                    
                    with open(image_filename, "wb") as f:
                        f.write(image_obj.data)
                        
                    extracted_images.append({
                        "fig_id": f"Page {i+1} Figure {img_index}",
                        "image_path": image_filename
                    })
                except Exception as img_err:
                    print(f"Skipping an image on page {i+1}: {img_err}")
    except Exception as e:
        print(f"Image extraction via pypdf failed: {e}")
            
    return {"text": full_text, "figures": extracted_images}

def scrape_google_patents(url: str):
    """
    Scrapes a Google Patents URL to find the patent text and images.
    """
    # Placeholder for actual complex scraping. Returns raw text for now.
    try:
        response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
        response.raise_for_status()
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Google Patents usually has a <section itemprop="description"> or <div class="claims">
        claims_section = soup.find('section', itemprop='claims')
        desc_section = soup.find('section', itemprop='description')
        
        text = ""
        if claims_section:
            text += claims_section.get_text(separator='\n') + "\n"
        if desc_section:
            text += desc_section.get_text(separator='\n') + "\n"
            
        if not text:
            # Fallback to all text
            text = soup.get_text(separator='\n')
            
        return {"text": text, "figures": []} # Images scraping from Google Patents requires specific logic or API
    except Exception as e:
        print(f"Failed to scrape Google Patents: {e}")
        return {"text": "", "figures": []}
