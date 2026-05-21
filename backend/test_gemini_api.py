import os
import requests
from dotenv import load_dotenv

load_dotenv()
api_key = os.environ.get("GEMINI_API_KEY")

url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={api_key}"
payload = {"contents": [{"parts": [{"text": "Hello"}]}]}
response = requests.post(url, json=payload, headers={"Content-Type": "application/json"})
print("Status Code:", response.status_code)
print("Response:", response.text)
