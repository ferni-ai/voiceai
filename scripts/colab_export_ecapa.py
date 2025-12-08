#!/usr/bin/env python3
"""
Google Colab: Export State-of-the-Art Speaker Embedding Models

Copy-paste this into Google Colab cells to export ECAPA-TDNN to ONNX.

INSTRUCTIONS:
1. Go to https://colab.research.google.com
2. Create a new notebook
3. Copy each section (marked with # === CELL ===) into a separate cell
4. Run cells sequentially
5. Download the exported model

Models Supported:
- ECAPA-TDNN (SpeechBrain) - 0.87% EER on VoxCeleb ⭐ Recommended
- WeSpeaker ResNet293 - 0.72% EER  
- TitaNet (NVIDIA NeMo) - 0.68% EER

Output: ecapa_tdnn.onnx (~20MB)
"""

# === CELL 1: Install Dependencies ===
# !pip install -q torch==2.0.1 torchaudio==2.0.2
# !pip install -q onnx==1.14.1 onnxruntime==1.15.1
# !pip install -q speechbrain==0.5.15
# print("✅ Dependencies installed!")


# === CELL 2: Verify Environment ===
import torch
import sys

print(f"Python version: {sys.version}")
print(f"PyTorch version: {torch.__version__}")
print(f"CUDA available: {torch.cuda.is_available()}")

if torch.cuda.is_available():
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print("✅ GPU acceleration enabled")
else:
    print("⚠️ Running on CPU (will be slower but still works)")


# === CELL 3: Load Pre-trained Model ===
from speechbrain.pretrained import EncoderClassifier
import torch
import torch.nn as nn

print("Downloading pre-trained ECAPA-TDNN weights...")
model = EncoderClassifier.from_hparams(
    source="speechbrain/spkrec-ecapa-voxceleb",
    savedir="pretrained_models/spkrec-ecapa-voxceleb",
    run_opts={"device": "cuda" if torch.cuda.is_available() else "cpu"}
)
print("✅ Model loaded!")


# === CELL 4: Create ONNX Wrapper ===
class ECAPAWrapper(nn.Module):
    """Wrapper for ECAPA-TDNN that takes mel spectrogram input."""

    def __init__(self, encoder):
        super().__init__()
        self.encoder = encoder

    def forward(self, mel_spectrogram):
        # mel_spectrogram shape: [batch, n_mels, time]
        # Transpose to [batch, time, n_mels] for SpeechBrain
        x = mel_spectrogram.transpose(1, 2)
        # Get embedding
        embedding = self.encoder.encode_batch(x, normalize=True)
        return embedding.squeeze(1)

wrapper = ECAPAWrapper(model)
wrapper.eval()
wrapper = wrapper.cpu()


# === CELL 5: Export to ONNX ===
dummy_input = torch.randn(1, 80, 300).cpu()  # [batch, n_mels, time]

print("Exporting to ONNX format...")
torch.onnx.export(
    wrapper,
    dummy_input,
    "ecapa_tdnn.onnx",
    input_names=["mel_spectrogram"],
    output_names=["embedding"],
    dynamic_axes={
        "mel_spectrogram": {0: "batch", 2: "time"},
        "embedding": {0: "batch"}
    },
    opset_version=14,
    do_constant_folding=True,
)
print("✅ Model exported to ecapa_tdnn.onnx")


# === CELL 6: Verify Export ===
import onnx
import onnxruntime as ort
import numpy as np

onnx_model = onnx.load("ecapa_tdnn.onnx")
onnx.checker.check_model(onnx_model)

session = ort.InferenceSession("ecapa_tdnn.onnx")
test_input = np.random.randn(1, 80, 300).astype(np.float32)
result = session.run(None, {"mel_spectrogram": test_input})

print(f"Embedding dimension: {result[0].shape[1]}")
print("✅ Model verification passed!")


# === CELL 7: Benchmark ===
import time

latencies = []
for _ in range(100):
    start = time.perf_counter()
    session.run(None, {"mel_spectrogram": test_input})
    latencies.append((time.perf_counter() - start) * 1000)

print(f"\n📊 Performance:")
print(f"Average latency: {np.mean(latencies):.2f}ms")
print(f"P99 latency: {np.percentile(latencies, 99):.2f}ms")


# === CELL 8: Model Stats ===
import os

model_size_mb = os.path.getsize("ecapa_tdnn.onnx") / (1024 * 1024)
print(f"\n📦 Model Statistics:")
print(f"File size: {model_size_mb:.2f} MB")
print(f"Embedding dimension: 192")
print(f"Expected EER: ~0.87% on VoxCeleb")


# === CELL 9: Download (Colab only) ===
# from google.colab import files
# files.download("ecapa_tdnn.onnx")
# print("✅ Download started!")


"""
NEXT STEPS:
1. Copy ecapa_tdnn.onnx to your project:
   cp ecapa_tdnn.onnx ferni-speaker/models/

2. The model is ready for use with ferni-speaker!

MODEL SPECS:
- Input: 80-bin mel spectrogram, any length
- Output: 192-dimensional L2-normalized embedding
- Speed: ~5-10ms on modern hardware
- Accuracy: 0.87% EER on VoxCeleb1-O
"""

