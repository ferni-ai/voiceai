#!/usr/bin/env python3
"""Test Vertex AI Imagen style customization"""

import base64
import json
import subprocess
import sys
from pathlib import Path

def get_access_token():
    """Get OAuth token from gcloud"""
    result = subprocess.run(
        ['gcloud', 'auth', 'print-access-token'],
        capture_output=True, text=True
    )
    return result.stdout.strip()

def test_style_customization():
    """Test Vertex AI with style reference image"""
    
    # Config
    project_id = "johnb-2025"
    location = "us-central1"
    model = "imagegeneration@006"
    
    # Read style reference image
    style_image_path = Path("images/generated/avatars/avatar-maya.png")
    if not style_image_path.exists():
        print(f"ERROR: Style image not found: {style_image_path}")
        return
    
    with open(style_image_path, 'rb') as f:
        style_b64 = base64.b64encode(f.read()).decode('utf-8')
    
    print(f"Loaded style reference: {style_image_path.name} ({len(style_b64)} bytes)")
    
    # Build request
    url = f"https://{location}-aiplatform.googleapis.com/v1/projects/{project_id}/locations/{location}/publishers/google/models/{model}:predict"
    
    request_body = {
        "instances": [{
            "prompt": "TOP-DOWN bird's eye view of nested sage green ceramic bowls with peaceful face in center, zen style, matte ceramic texture, white background"
        }],
        "parameters": {
            "sampleCount": 4,
            "aspectRatio": "1:1",
            "styleImageConfig": {
                "styleImage": {
                    "bytesBase64Encoded": style_b64
                },
                "styleStrength": 0.8
            }
        }
    }
    
    print(f"\nCalling Vertex AI...")
    print(f"  Model: {model}")
    print(f"  Style strength: 0.8")
    
    # Make request using urllib (built-in)
    import urllib.request
    import urllib.error
    
    headers = {
        "Authorization": f"Bearer {get_access_token()}",
        "Content-Type": "application/json"
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(request_body).encode('utf-8'),
        headers=headers,
        method='POST'
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print(f"\nERROR {e.code}:")
        error_body = e.read().decode('utf-8')
        try:
            error = json.loads(error_body)
            print(json.dumps(error, indent=2)[:500])
        except:
            print(error_body[:500])
        return
    
    if "predictions" not in data:
        print("No predictions in response")
        print(json.dumps(data, indent=2)[:500])
        return
    
    # Save generated images
    output_dir = Path("images/generated/avatars-vertex")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    for i, pred in enumerate(data["predictions"]):
        img_b64 = pred.get("bytesBase64Encoded", "")
        if img_b64:
            filename = f"avatar-ferni-style-v{i+1}.png"
            output_path = output_dir / filename
            with open(output_path, 'wb') as f:
                f.write(base64.b64decode(img_b64))
            print(f"  Saved: {output_path}")
    
    print(f"\nSUCCESS! Check {output_dir}")
    print("Open folder:")
    subprocess.run(['open', str(output_dir)])

if __name__ == "__main__":
    test_style_customization()

