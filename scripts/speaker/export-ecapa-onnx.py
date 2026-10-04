#!/usr/bin/env python3
"""Export SpeechBrain ECAPA-TDNN for the voice agent: raw 16 kHz audio in, unit embedding out.

The speaker-embedding worker (src/services/voice/speaker-embedding-worker-thread.ts)
loads this file from SPEAKER_MODEL_PATH with onnxruntime-node. The graph contains
SpeechBrain's own front end (Fbank, 80 mels) and the sentence mean normalization
that SpeakerRecognition.encode_batch applies, so nothing is reimplemented in
TypeScript. Input: `waveform` [batch, samples] float32 in [-1, 1].
Output: `embedding` [batch, 192], L2-normalized.

Why not the ferni-speaker model (gcr.io/<project>/ferni-speaker:latest, checked
2026-10-04): its ecapa_tdnn.onnx is the export script's untrained fallback CNN
(1.95M params, zero biases), the image has no .node addon, and the addon's Rust
mel front end does not match SpeechBrain's, so even real weights through it
separate voices poorly (EER 30-35% vs 0.3% with this export, six TTS voices).

Checks parity against SpeechBrain's encode_batch and exits non-zero if it fails.

Usage (about 2 GB of pip downloads, Python 3.12):
  python3.12 -m venv /tmp/sb && /tmp/sb/bin/pip install torch torchaudio speechbrain onnx onnxruntime
  /tmp/sb/bin/python scripts/speaker/export-ecapa-onnx.py ecapa-tdnn.onnx
  # fp32, about 84 MB. Record its sha256 next to wherever it is hosted.
"""


import os
import sys
import tempfile

import numpy as np
import onnxruntime as ort
import torch
import torch.nn as nn
from speechbrain.inference.speaker import SpeakerRecognition

out_path = sys.argv[1]
sr = SpeakerRecognition.from_hparams(
    source="speechbrain/spkrec-ecapa-voxceleb", savedir=os.path.join(tempfile.gettempdir(), "spkrec-ecapa")
)


N_FFT, HOP = 400, 160


class EndToEnd(nn.Module):
    """SpeechBrain Fbank with torch.stft replaced by an equal conv1d DFT.

    torch.stft does not export to ONNX here. SpeechBrain's STFT is: Hamming
    window (periodic, 400), n_fft 400, hop 160, center=True with zero padding,
    one-sided; spectral_magnitude(power=1) is re^2 + im^2. The conv kernels are
    window * cos / -window * sin, so the power spectrum is identical. The mel
    filterbank and log are SpeechBrain's own module.
    """

    def __init__(self, mods):
        super().__init__()
        self.filterbank = mods["compute_features"].compute_fbanks
        self.emb = mods["embedding_model"]
        n = torch.arange(N_FFT, dtype=torch.float64)
        k = torch.arange(N_FFT // 2 + 1, dtype=torch.float64)[:, None]
        win = torch.hamming_window(N_FFT, dtype=torch.float64)
        ang = 2 * torch.pi * k * n / N_FFT
        self.register_buffer("re", (win * torch.cos(ang)).float()[:, None, :])
        self.register_buffer("im", (-win * torch.sin(ang)).float()[:, None, :])

    def forward(self, wav):
        x = nn.functional.pad(wav[:, None, :], (N_FFT // 2, N_FFT // 2))
        re = nn.functional.conv1d(x, self.re, stride=HOP)
        im = nn.functional.conv1d(x, self.im, stride=HOP)
        power = (re * re + im * im).transpose(1, 2)  # [batch, frames, 201]
        feats = self.filterbank(power)  # [batch, frames, 80]
        feats = feats - feats.mean(dim=1, keepdim=True)  # InputNormalization(sentence, std_norm=False)
        e = self.emb(feats)[:, 0, :]  # [batch, 192]
        return e / (e.norm(dim=1, keepdim=True) + 1e-10)


m = EndToEnd(sr.mods).eval()
dummy = torch.randn(1, 32000) * 0.1
torch.onnx.export(
    m,
    dummy,
    out_path,
    input_names=["waveform"],
    output_names=["embedding"],
    dynamic_axes={"waveform": {0: "batch", 1: "samples"}, "embedding": {0: "batch"}},
    opset_version=17,
    do_constant_folding=True,
    dynamo=False,
)

# Parity: ORT on the exported graph vs SpeechBrain's own encode_batch.
sess = ort.InferenceSession(out_path)
rng = np.random.default_rng(0)
worst = 1.0
for n in (16000, 24000, 32000):
    wav = (rng.standard_normal(n) * 0.1).astype(np.float32)
    got = sess.run(None, {"waveform": wav[None, :]})[0][0]
    with torch.no_grad():
        ref = sr.encode_batch(torch.from_numpy(wav)[None, :]).squeeze().numpy()
    ref = ref / np.linalg.norm(ref)
    c = float(np.dot(got, ref))
    worst = min(worst, c)
    print(f"samples={n} cosine(onnx, speechbrain)={c:.6f}")
print("exported", out_path, "worst parity cosine", worst)
if worst < 0.999:
    sys.exit("parity check failed")
