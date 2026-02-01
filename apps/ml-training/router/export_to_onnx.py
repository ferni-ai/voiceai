#!/usr/bin/env python3
"""
Export trained hierarchical models to ONNX for production inference.
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
    """Export a single model to ONNX."""
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
    
    # Export to ONNX
    dummy_input = tokenizer("test query", return_tensors="pt", max_length=64, 
                           truncation=True, padding="max_length")
    
    onnx_path = output_path / "model.onnx"
    
    torch.onnx.export(
        model,
        (dummy_input["input_ids"], dummy_input["attention_mask"]),
        str(onnx_path),
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch"},
            "attention_mask": {0: "batch"},
            "logits": {0: "batch"},
        },
        opset_version=14,
    )
    
    # Copy label map
    label_map_src = model_path / "label_map.json"
    if label_map_src.exists():
        shutil.copy(label_map_src, output_path / "label_map.json")
    
    print(f"  ✅ Exported to {onnx_path}")
    return onnx_path

def main():
    print("🚀 Exporting hierarchical models to ONNX")
    print("=" * 60)
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Export Stage 1
    stage1_path = INPUT_DIR / "stage1"
    with open(stage1_path / "label_map.json") as f:
        stage1_labels = json.load(f)
    export_model(stage1_path, OUTPUT_DIR / "stage1", len(stage1_labels))
    
    # Export Stage 2 models
    stage2_dir = INPUT_DIR / "stage2"
    for category_dir in sorted(stage2_dir.iterdir()):
        if category_dir.is_dir():
            label_map_path = category_dir / "label_map.json"
            if label_map_path.exists():
                with open(label_map_path) as f:
                    labels = json.load(f)
                export_model(category_dir, OUTPUT_DIR / "stage2" / category_dir.name, len(labels))
    
    # Copy tokenizer
    print("\n📝 Copying tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(INPUT_DIR / "stage1", trust_remote_code=True)
    tokenizer.save_pretrained(OUTPUT_DIR / "tokenizer")
    
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
    
    print("\n" + "=" * 60)
    print("🎉 EXPORT COMPLETE!")
    print(f"📁 Models saved to: {OUTPUT_DIR}")
    print("\nFiles created:")
    for p in sorted(OUTPUT_DIR.rglob("*")):
        if p.is_file():
            size = p.stat().st_size / 1024
            print(f"  {p.relative_to(OUTPUT_DIR)}: {size:.1f} KB")

if __name__ == "__main__":
    main()
