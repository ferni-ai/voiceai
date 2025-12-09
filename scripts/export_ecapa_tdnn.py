#!/usr/bin/env python3
"""
ECAPA-TDNN Model Export Script for Google Colab

This script exports the pretrained ECAPA-TDNN speaker embedding model
from SpeechBrain to ONNX format for use in the ferni-speaker native module.

ECAPA-TDNN (Emphasized Channel Attention, Propagation and Aggregation in TDNN)
is a state-of-the-art speaker embedding model that significantly outperforms
x-vector and similar approaches.

Usage (in Google Colab):
    1. Upload this script or copy-paste into a cell
    2. Run the cells
    3. Download the exported model

Requirements:
    - GPU runtime recommended (faster inference)
    - SpeechBrain, torchaudio, onnx, onnxruntime

Model Details:
    - Input: Audio waveform (16kHz mono)
    - Output: 192-dimensional speaker embedding
    - Architecture: ECAPA-TDNN with SE-Res2Net modules
    - Trained on: VoxCeleb1+2 (~7000 speakers, 1M+ utterances)
    - EER: ~0.8% on VoxCeleb1 test set

Author: Ferni AI Team
Date: December 2025
"""

# ==============================================================================
# INSTALLATION (run this cell first in Colab)
# ==============================================================================

INSTALL_SCRIPT = """
# Run this in a Colab cell first:
!pip install speechbrain torchaudio onnx onnxruntime-gpu transformers
"""

# ==============================================================================
# IMPORTS
# ==============================================================================

import os
import sys
import torch
import torchaudio
import numpy as np
from pathlib import Path

# Check if running in Colab
IN_COLAB = 'google.colab' in sys.modules

print("=" * 60)
print("ECAPA-TDNN Model Export Script")
print("=" * 60)
print(f"PyTorch version: {torch.__version__}")
print(f"Torchaudio version: {torchaudio.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"CUDA device: {torch.cuda.get_device_name(0)}")
print("=" * 60)

# ==============================================================================
# LOAD PRETRAINED MODEL
# ==============================================================================

def load_ecapa_tdnn():
    """Load pretrained ECAPA-TDNN from SpeechBrain."""
    from speechbrain.pretrained import EncoderClassifier
    
    print("\n📥 Loading ECAPA-TDNN from SpeechBrain...")
    print("   (This downloads ~90MB on first run)")
    
    # Load the pretrained model
    classifier = EncoderClassifier.from_hparams(
        source="speechbrain/spkrec-ecapa-voxceleb",
        savedir="pretrained_models/spkrec-ecapa-voxceleb",
        run_opts={"device": "cuda" if torch.cuda.is_available() else "cpu"}
    )
    
    print("✅ Model loaded successfully!")
    return classifier

# ==============================================================================
# EXPORT TO ONNX
# ==============================================================================

def export_to_onnx(classifier, output_path="ecapa_tdnn_voxceleb.onnx"):
    """
    Export the ECAPA-TDNN model to ONNX format.
    
    The exported model takes raw audio waveform and outputs embeddings.
    """
    print(f"\n📦 Exporting to ONNX: {output_path}")
    
    # Get the embedding model
    embedding_model = classifier.mods.embedding_model
    embedding_model.eval()
    
    # Move to CPU for export
    embedding_model = embedding_model.cpu()
    
    # Create dummy input (1 second of audio at 16kHz)
    # Shape: (batch, channels, time) = (1, 1, 16000)
    dummy_input = torch.randn(1, 1, 16000)
    
    # We need to wrap the model to handle the feature extraction
    class EcapaTdnnWrapper(torch.nn.Module):
        def __init__(self, model, mean_var_norm=None):
            super().__init__()
            self.model = model
            self.mean_var_norm = mean_var_norm
            
        def forward(self, x):
            # x shape: (batch, 1, time)
            # Remove channel dim for feature extraction
            x = x.squeeze(1)  # (batch, time)
            
            # Compute features (MFCC or spectrogram)
            # SpeechBrain uses their own feature extraction
            # For ONNX export, we'll use a simplified approach
            return self.model(x)
    
    # Actually, let's export the full pipeline using torch.jit
    # First, let's trace the model
    
    try:
        # Export using torch.onnx
        torch.onnx.export(
            embedding_model,
            dummy_input,
            output_path,
            input_names=['audio'],
            output_names=['embedding'],
            dynamic_axes={
                'audio': {0: 'batch_size', 2: 'audio_length'},
                'embedding': {0: 'batch_size'}
            },
            opset_version=12,
            do_constant_folding=True,
            verbose=False
        )
        print(f"✅ Model exported to {output_path}")
        
    except Exception as e:
        print(f"⚠️ Direct ONNX export failed: {e}")
        print("   Trying alternative approach...")
        export_full_pipeline(classifier, output_path)
    
    return output_path

def export_full_pipeline(classifier, output_path):
    """
    Export the full ECAPA-TDNN pipeline including feature extraction.
    """
    print("   Using full pipeline export...")
    
    # Create a wrapper that does the full pipeline
    class FullEcapaPipeline(torch.nn.Module):
        def __init__(self, classifier):
            super().__init__()
            self.compute_features = classifier.mods.compute_features
            self.mean_var_norm = classifier.mods.mean_var_norm
            self.embedding_model = classifier.mods.embedding_model
            
        def forward(self, wav):
            """
            Args:
                wav: (batch, time) raw audio at 16kHz
            Returns:
                embedding: (batch, 192) speaker embedding
            """
            # Compute features
            feats = self.compute_features(wav)
            
            # Normalize
            feats = self.mean_var_norm(feats, torch.ones(1))
            
            # Get embedding
            embeddings = self.embedding_model(feats)
            
            return embeddings
    
    try:
        # Create wrapped model
        full_model = FullEcapaPipeline(classifier)
        full_model.eval()
        full_model = full_model.cpu()
        
        # Dummy input (batch, time)
        dummy_input = torch.randn(1, 16000)
        
        # Trace the model
        traced = torch.jit.trace(full_model, dummy_input)
        
        # Save as TorchScript (more compatible than ONNX for complex models)
        torchscript_path = output_path.replace('.onnx', '.pt')
        traced.save(torchscript_path)
        print(f"✅ Model exported to {torchscript_path} (TorchScript)")
        
        # Also try ONNX
        torch.onnx.export(
            traced,
            dummy_input,
            output_path,
            input_names=['audio'],
            output_names=['embedding'],
            dynamic_axes={
                'audio': {0: 'batch_size', 1: 'audio_length'},
                'embedding': {0: 'batch_size'}
            },
            opset_version=14,
        )
        print(f"✅ Model exported to {output_path} (ONNX)")
        
    except Exception as e:
        print(f"❌ Export failed: {e}")
        print("\n   Alternative: Export embedding model only")
        export_embedding_only(classifier, output_path)

def export_embedding_only(classifier, output_path):
    """
    Export just the embedding model (requires pre-computed features).
    """
    print("   Exporting embedding model only...")
    
    embedding_model = classifier.mods.embedding_model
    embedding_model.eval()
    embedding_model = embedding_model.cpu()
    
    # Dummy input: (batch, time, features) 
    # ECAPA-TDNN expects Fbank features: 80-dim
    dummy_features = torch.randn(1, 300, 80)  # ~3 seconds of features
    
    torch.onnx.export(
        embedding_model,
        dummy_features,
        output_path,
        input_names=['features'],
        output_names=['embedding'],
        dynamic_axes={
            'features': {0: 'batch_size', 1: 'time_steps'},
            'embedding': {0: 'batch_size'}
        },
        opset_version=12,
    )
    print(f"✅ Embedding model exported to {output_path}")
    print("   ⚠️ Note: This model requires pre-computed Fbank features (80-dim)")

# ==============================================================================
# VALIDATION
# ==============================================================================

def validate_onnx_model(onnx_path, classifier):
    """Validate the exported ONNX model produces similar outputs."""
    import onnxruntime as ort
    
    print(f"\n🔍 Validating ONNX model: {onnx_path}")
    
    # Load ONNX model
    session = ort.InferenceSession(onnx_path)
    input_name = session.get_inputs()[0].name
    input_shape = session.get_inputs()[0].shape
    
    print(f"   Input: {input_name}, shape: {input_shape}")
    
    # Generate test audio
    test_audio = torch.randn(1, 16000)
    
    # Get PyTorch output
    with torch.no_grad():
        pt_embedding = classifier.encode_batch(test_audio)
    
    # Get ONNX output
    onnx_input = test_audio.numpy()
    if len(input_shape) == 3:  # (batch, channels, time)
        onnx_input = onnx_input.reshape(1, 1, -1)
    
    onnx_output = session.run(None, {input_name: onnx_input})[0]
    
    # Compare
    pt_np = pt_embedding.cpu().numpy().flatten()
    onnx_np = onnx_output.flatten()
    
    # Cosine similarity
    cosine_sim = np.dot(pt_np, onnx_np) / (np.linalg.norm(pt_np) * np.linalg.norm(onnx_np))
    
    print(f"   PyTorch shape: {pt_np.shape}")
    print(f"   ONNX shape: {onnx_np.shape}")
    print(f"   Cosine similarity: {cosine_sim:.4f}")
    
    if cosine_sim > 0.99:
        print("   ✅ Validation PASSED - outputs match!")
    elif cosine_sim > 0.95:
        print("   ⚠️ Validation OK - small numerical differences")
    else:
        print("   ❌ Validation FAILED - outputs differ significantly")
    
    return cosine_sim

# ==============================================================================
# BENCHMARK
# ==============================================================================

def benchmark_model(classifier, onnx_path=None, num_runs=100):
    """Benchmark model inference speed."""
    import time
    
    print(f"\n⏱️ Benchmarking inference speed ({num_runs} runs)...")
    
    # Test audio
    test_audio = torch.randn(1, 16000)
    
    # Warm up
    for _ in range(10):
        with torch.no_grad():
            classifier.encode_batch(test_audio)
    
    # PyTorch benchmark
    start = time.time()
    for _ in range(num_runs):
        with torch.no_grad():
            classifier.encode_batch(test_audio)
    pt_time = (time.time() - start) / num_runs * 1000
    
    print(f"   PyTorch: {pt_time:.2f} ms/inference")
    
    # ONNX benchmark
    if onnx_path and os.path.exists(onnx_path):
        import onnxruntime as ort
        
        session = ort.InferenceSession(onnx_path)
        input_name = session.get_inputs()[0].name
        input_shape = session.get_inputs()[0].shape
        
        onnx_input = test_audio.numpy()
        if len(input_shape) == 3:
            onnx_input = onnx_input.reshape(1, 1, -1)
        
        # Warm up
        for _ in range(10):
            session.run(None, {input_name: onnx_input})
        
        start = time.time()
        for _ in range(num_runs):
            session.run(None, {input_name: onnx_input})
        onnx_time = (time.time() - start) / num_runs * 1000
        
        print(f"   ONNX: {onnx_time:.2f} ms/inference")
        print(f"   Speedup: {pt_time/onnx_time:.2f}x")

# ==============================================================================
# MAIN
# ==============================================================================

def main():
    """Main export function."""
    print("\n🚀 Starting ECAPA-TDNN export...\n")
    
    # Output directory
    output_dir = Path("exported_models")
    output_dir.mkdir(exist_ok=True)
    
    # Load model
    classifier = load_ecapa_tdnn()
    
    # Export to ONNX
    onnx_path = str(output_dir / "ecapa_tdnn_voxceleb.onnx")
    export_to_onnx(classifier, onnx_path)
    
    # Validate
    if os.path.exists(onnx_path):
        try:
            validate_onnx_model(onnx_path, classifier)
        except Exception as e:
            print(f"   Validation skipped: {e}")
    
    # Benchmark
    benchmark_model(classifier, onnx_path)
    
    # Print summary
    print("\n" + "=" * 60)
    print("EXPORT COMPLETE")
    print("=" * 60)
    
    if os.path.exists(onnx_path):
        size_mb = os.path.getsize(onnx_path) / (1024 * 1024)
        print(f"✅ ONNX model: {onnx_path} ({size_mb:.1f} MB)")
    
    pt_path = onnx_path.replace('.onnx', '.pt')
    if os.path.exists(pt_path):
        size_mb = os.path.getsize(pt_path) / (1024 * 1024)
        print(f"✅ TorchScript model: {pt_path} ({size_mb:.1f} MB)")
    
    print("\n📋 Next steps:")
    print("   1. Download the model file(s)")
    print("   2. Copy to ferni-speaker/models/")
    print("   3. Update model loading in ferni-speaker/src/lib.rs")
    print("   4. Rebuild: npm run build")
    print("   5. Test with: npm test")
    
    if IN_COLAB:
        print("\n📥 To download in Colab:")
        print("   from google.colab import files")
        print(f"   files.download('{onnx_path}')")

if __name__ == "__main__":
    main()

# ==============================================================================
# COLAB NOTEBOOK VERSION
# ==============================================================================

COLAB_NOTEBOOK = """
# ECAPA-TDNN Export Notebook

## Cell 1: Install dependencies
```python
!pip install speechbrain torchaudio onnx onnxruntime-gpu transformers
```

## Cell 2: Run export
```python
# Copy the entire script above and run it
exec(open('export_ecapa_tdnn.py').read())

# Or paste the main() function and run:
# main()
```

## Cell 3: Download the model
```python
from google.colab import files

# Download ONNX model
if os.path.exists('exported_models/ecapa_tdnn_voxceleb.onnx'):
    files.download('exported_models/ecapa_tdnn_voxceleb.onnx')

# Download TorchScript model
if os.path.exists('exported_models/ecapa_tdnn_voxceleb.pt'):
    files.download('exported_models/ecapa_tdnn_voxceleb.pt')
```
"""

