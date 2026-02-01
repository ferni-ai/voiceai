# PersonaPlex Evaluation Environment

This directory contains tools for evaluating NVIDIA PersonaPlex for Ferni's voice system.

## Quick Start

### 1. Install Dependencies

```bash
# Create Python virtual environment
python3 -m venv venv
source venv/bin/activate

# Install PersonaPlex
git clone https://github.com/NVIDIA/personaplex.git
pip install personaplex/moshi/.

# Install evaluation dependencies
pip install -r requirements.txt
```

### 2. Set Up HuggingFace Token

Accept the model license at: https://huggingface.co/nvidia/personaplex-7b-v1

```bash
export HF_TOKEN=<your-token>
```

### 3. Record Voice Sample

Record a clean voice sample for the persona you want to test:

- **Format**: WAV, mono, 24kHz
- **Duration**: 30-60 seconds
- **Content**: Varied sentences, emotional range
- **Environment**: Quiet room, minimal reverb

Save to `voices/samples/<persona>.wav`

### 4. Extract Voice Embedding

```bash
python scripts/extract_embedding.py \
  --audio voices/samples/ferni.wav \
  --output voices/embeddings/ferni.pt
```

### 5. Test Offline

```bash
python scripts/offline_test.py \
  --voice-prompt voices/embeddings/ferni.pt \
  --text-prompt "$(cat prompts/ferni.txt)" \
  --input-wav test-inputs/sample-conversation.wav \
  --output-wav test-outputs/ferni-response.wav
```

### 6. Compare with Cartesia

```bash
python scripts/compare_quality.py \
  --personaplex voices/embeddings/ferni.pt \
  --cartesia-voice-id fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc \
  --test-texts test-inputs/test-sentences.txt \
  --output-dir comparison-results/
```

### 7. Run Full Benchmark

```bash
python scripts/run_benchmark.py --all
```

## Directory Structure

```
apps/experiments/personaplex/
├── README.md                    # This file
├── requirements.txt             # Python dependencies
├── personaplex/                 # Cloned PersonaPlex repo
├── voices/
│   ├── samples/                 # Raw audio recordings
│   │   ├── ferni.wav
│   │   ├── maya.wav
│   │   └── ...
│   └── embeddings/              # Extracted .pt files
│       ├── ferni.pt
│       └── ...
├── prompts/                     # Text prompts for personas
│   ├── ferni.txt
│   └── ...
├── test-inputs/                 # Test audio/text inputs
│   ├── sample-conversation.wav
│   └── test-sentences.txt
├── test-outputs/                # Generated outputs
├── comparison-results/          # A/B comparison results
├── scripts/
│   ├── extract_embedding.py     # Extract Mimi voice embedding
│   ├── offline_test.py          # Test offline synthesis
│   ├── compare_quality.py       # Compare PersonaPlex vs Cartesia
│   ├── measure_latency.py       # Latency benchmarks
│   ├── server_test.py           # Test live server mode
│   └── run_benchmark.py         # Full benchmark suite
└── results/                     # Benchmark results & reports
    └── evaluation-report.md
```

## Pre-packaged Voices

PersonaPlex includes 16 pre-packaged voices:

| ID      | Type           | Description                  |
| ------- | -------------- | ---------------------------- |
| NATF0-3 | Natural Female | Conversational, warm         |
| NATM0-3 | Natural Male   | Conversational, professional |
| VARF0-4 | Variety Female | Expressive range             |
| VARM0-4 | Variety Male   | Expressive range             |

These can be used as fallbacks when custom embeddings aren't available.

## Evaluation Criteria

### Voice Quality (Target: Pass)

- [ ] Speaker similarity > 0.65 (WavLM TDNN)
- [ ] MOS estimation > 4.0
- [ ] No audible artifacts
- [ ] Natural prosody

### Latency (Target: < 300ms TTFAB)

- [ ] First byte latency < 300ms
- [ ] E2E latency < 500ms
- [ ] Stable under load

### Functionality (Target: Pass)

- [ ] Full-duplex works correctly
- [ ] Interruption handling
- [ ] Persona handoffs work
- [ ] Function calling via JSON works

## Go/No-Go Criteria

**GO** if:

- Voice quality metrics meet targets
- Latency is competitive with Cartesia
- No blocking technical issues
- Cost is within 150% of current

**NO-GO** if:

- Voice quality significantly worse
- Latency > 500ms consistently
- Critical functionality broken
- Cost > 200% of current

## Resources

- [PersonaPlex Paper](https://research.nvidia.com/labs/adlr/personaplex/)
- [PersonaPlex GitHub](https://github.com/NVIDIA/personaplex)
- [Moshi (Base Model)](https://github.com/kyutai-labs/moshi)
- [HuggingFace Model](https://huggingface.co/nvidia/personaplex-7b-v1)
