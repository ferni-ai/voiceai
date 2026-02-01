#!/usr/bin/env python3
"""
Export trained hierarchical models as merged PyTorch models for production.
Creates a simple format that can be loaded with transformers.js or Python inference.
"""

import json
import shutil
import torch
from pathlib import Path
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from peft import PeftModel

INPUT_DIR = Path("/Users/sethford/Documents/voiceai/models/ftis-hierarchical-qwen")
OUTPUT_DIR = Path("/Users/sethford/Documents/voiceai/models/ftis-hierarchical-prod")

def export_model(model_path: Path, output_path: Path, num_labels: int):
    """Export a single model by merging LoRA weights."""
    print(f"📦 Exporting {model_path.name}...")
    
    # Load tokenizer
    tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)
    
    # Load base model
    base_model = AutoModelForSequenceClassification.from_pretrained(
        "Qwen/Qwen2.5-0.5B",
        num_labels=num_labels,
        trust_remote_code=True,
        torch_dtype=torch.float32,
    )
    
    # Load LoRA weights
    model = PeftModel.from_pretrained(base_model, model_path)
    model = model.merge_and_unload()  # Merge LoRA into base
    model.eval()
    
    # Create output directory
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Save merged model
    model.save_pretrained(output_path, safe_serialization=True)
    tokenizer.save_pretrained(output_path)
    
    # Copy label map
    label_map_src = model_path / "label_map.json"
    if label_map_src.exists():
        shutil.copy(label_map_src, output_path / "label_map.json")
    
    # Create config for inference
    config = {
        "model_type": "qwen2.5-0.5b-classification",
        "num_labels": num_labels,
        "max_length": 64,
    }
    with open(output_path / "inference_config.json", "w") as f:
        json.dump(config, f, indent=2)
    
    print(f"  ✅ Exported to {output_path}")
    return output_path

def main():
    print("🚀 Exporting hierarchical models (merged PyTorch)")
    print("=" * 60)
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Export Stage 1
    stage1_path = INPUT_DIR / "stage1"
    with open(stage1_path / "label_map.json") as f:
        stage1_labels = json.load(f)
    export_model(stage1_path, OUTPUT_DIR / "stage1", len(stage1_labels))
    
    # Export Stage 2 models
    stage2_dir = INPUT_DIR / "stage2"
    categories_exported = []
    for category_dir in sorted(stage2_dir.iterdir()):
        if category_dir.is_dir():
            label_map_path = category_dir / "label_map.json"
            if label_map_path.exists():
                with open(label_map_path) as f:
                    labels = json.load(f)
                export_model(category_dir, OUTPUT_DIR / "stage2" / category_dir.name, len(labels))
                categories_exported.append(category_dir.name)
    
    # Create tool mapping from taxonomy
    print("\n🔗 Creating tool mapping...")
    taxonomy_path = Path("/Users/sethford/Documents/voiceai/models/ftis-hierarchical-full/taxonomy_consolidated.json")
    with open(taxonomy_path) as f:
        taxonomy = json.load(f)
    
    # Create category_to_tools mapping
    category_to_tools = taxonomy["category_to_tools"]
    with open(OUTPUT_DIR / "category_to_tools.json", "w") as f:
        json.dump(category_to_tools, f, indent=2)
    
    # Create tool_to_category mapping  
    with open(OUTPUT_DIR / "tool_to_category.json", "w") as f:
        json.dump(taxonomy["tool_to_category"], f, indent=2)
    
    # Create manifest
    manifest = {
        "version": "2.0.0",
        "trained_at": "2026-01-22",
        "stage1_categories": list(stage1_labels.keys()),
        "stage2_categories": categories_exported,
        "total_tools": len(taxonomy["tool_to_category"]),
        "training_accuracy": {
            "stage1": 1.0,
            "stage2_avg": 0.985,
            "combined": 0.985,
        },
    }
    with open(OUTPUT_DIR / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)
    
    print("\n" + "=" * 60)
    print("🎉 EXPORT COMPLETE!")
    print(f"📁 Models saved to: {OUTPUT_DIR}")
    print("\nManifest:")
    print(json.dumps(manifest, indent=2))
    
    # Calculate total size
    total_size = sum(f.stat().st_size for f in OUTPUT_DIR.rglob("*") if f.is_file())
    print(f"\n📊 Total size: {total_size / 1024 / 1024:.1f} MB")

if __name__ == "__main__":
    main()
