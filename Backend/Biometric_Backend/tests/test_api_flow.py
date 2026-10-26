"""
Biometric Backend API Integration Test Script
"""

import io
import requests
from PIL import Image, ImageDraw

BASE_URL = "http://localhost:8000/api/v1"

def generate_sample_face_image(color=(120, 150, 200)):
    """Generate a simple synthetic face-like JPEG image for testing."""
    img = Image.new("RGB", (300, 300), color=(240, 240, 240))
    draw = ImageDraw.Draw(img)
    # Head oval
    draw.ellipse((50, 30, 250, 270), fill=color, outline=(50, 50, 50), width=3)
    # Eyes
    draw.ellipse((90, 90, 130, 120), fill=(255, 255, 255))
    draw.ellipse((105, 100, 115, 110), fill=(0, 0, 0))
    draw.ellipse((170, 90, 210, 120), fill=(255, 255, 255))
    draw.ellipse((185, 100, 195, 110), fill=(0, 0, 0))
    # Mouth
    draw.arc((110, 170, 190, 220), start=0, end=180, fill=(200, 50, 50), width=4)
    
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()

def main():
    print("--- 1. Testing Health Check ---")
    res = requests.get(f"{BASE_URL}/health")
    print("Health Status:", res.status_code, res.json())

    print("\n--- 2. Enrolling User (usr_alex) ---")
    img_bytes1 = generate_sample_face_image((140, 160, 210))
    img_bytes2 = generate_sample_face_image((135, 155, 205))
    
    files = [
        ("images", ("front.jpg", img_bytes1, "image/jpeg")),
        ("images", ("side.jpg", img_bytes2, "image/jpeg")),
    ]
    data = {
        "user_id": "usr_alex",
        "consent_given": "true",
    }
    
    enroll_res = requests.post(f"{BASE_URL}/biometric/enroll", data=data, files=files)
    print("Enroll Status:", enroll_res.status_code, enroll_res.json())

    print("\n--- 3. Checking Enrollment Status ---")
    status_res = requests.get(f"{BASE_URL}/biometric/usr_alex/status")
    print("Status Result:", status_res.status_code, status_res.json())

    print("\n--- 4. Testing 1:1 Verification ---")
    verify_res = requests.post(
        f"{BASE_URL}/biometric/verify",
        data={"user_id": "usr_alex"},
        files={"image": ("test_verify.jpg", img_bytes1, "image/jpeg")},
    )
    print("Verify Result:", verify_res.status_code, verify_res.json())

    print("\n--- 5. Testing 1:N Identification (Gate Search) ---")
    identify_res = requests.post(
        f"{BASE_URL}/biometric/identify",
        files={"image": ("test_gate.jpg", img_bytes1, "image/jpeg")},
    )
    print("Identify Result:", identify_res.status_code, identify_res.json())

if __name__ == "__main__":
    main()
