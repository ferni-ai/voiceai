# PersonaPlex Integration Scripts

Scripts for integrating Ferni with NVIDIA PersonaPlex full-duplex speech-to-speech model.

## Quick Start

```bash
# 1. Run integration tests
pnpm personaplex:test

# 2. Generate voice samples from Cartesia
pnpm personaplex:samples

# 3. (On GPU machine) Generate embeddings
./scripts/personaplex/generate-embeddings.sh

# 4. Test connection to PersonaPlex server
pnpm personaplex:demo
```

## Scripts

| Script | Description |
|--------|-------------|
| `test-integration.ts` | Runs 17+ tests to verify integration components |
| `generate-voice-samples.ts` | Generates WAV files from Cartesia TTS for each persona |
| `generate-embeddings.sh` | Converts WAV files to PersonaPlex .pt embeddings (requires GPU) |
| `demo-client.ts` | Demo script to test connection to PersonaPlex server |

## Voice Sample Generation

```bash
# Generate all 6 persona voice samples
pnpm personaplex:samples

# Generate just Ferni's voice
pnpm personaplex:samples:ferni

# Generate specific persona
npx tsx scripts/personaplex/generate-voice-samples.ts --persona maya
```

**Output:** `voice-embeddings/samples/*.wav`

## Embedding Generation

Embeddings must be generated on a machine with:
- NVIDIA GPU
- PersonaPlex installed (`pip install moshi/.`)
- HuggingFace token with PersonaPlex model access

```bash
# Set HuggingFace token
export HF_TOKEN=your-token

# Run embedding generation
./scripts/personaplex/generate-embeddings.sh

# Generate just one persona
./scripts/personaplex/generate-embeddings.sh --persona ferni
```

**Output:** `voice-embeddings/*.pt`

## Testing Connection

```bash
# Default (localhost:8998)
pnpm personaplex:demo

# Custom server
npx tsx scripts/personaplex/demo-client.ts --url wss://your-server:8998/api/chat

# Different persona
npx tsx scripts/personaplex/demo-client.ts --persona maya
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CARTESIA_API_KEY` | Required for voice sample generation | - |
| `HF_TOKEN` | Required for embedding generation | - |
| `PERSONAPLEX_URL` | PersonaPlex server WebSocket URL | `wss://localhost:8998/api/chat` |
| `PERSONAPLEX_VOICE_DIR` | Directory containing .pt embeddings | `./voice-embeddings` |
| `USE_PERSONAPLEX` | Enable PersonaPlex in Ferni | `false` |

## Directory Structure

```
voice-embeddings/
├── samples/           # WAV files from Cartesia (generated)
│   ├── ferni.wav
│   ├── maya.wav
│   ├── alex.wav
│   ├── peter.wav
│   ├── jordan.wav
│   ├── nayan.wav
│   └── silence-10s.wav
└── *.pt               # PersonaPlex embeddings (from GPU machine)
    ├── ferni.pt
    ├── maya.pt
    └── ...
```

## Workflow

1. **Generate voice samples** (any machine with CARTESIA_API_KEY)
   ```bash
   pnpm personaplex:samples
   ```

2. **Copy samples to GPU machine**
   ```bash
   scp -r voice-embeddings/samples/ gpu-machine:/path/to/project/voice-embeddings/
   ```

3. **Generate embeddings** (GPU machine)
   ```bash
   ./scripts/personaplex/generate-embeddings.sh
   ```

4. **Copy embeddings back**
   ```bash
   scp gpu-machine:/path/to/project/voice-embeddings/*.pt voice-embeddings/
   ```

5. **Start PersonaPlex server** (GPU machine)
   ```bash
   python -m moshi.server --voice-prompt-dir /path/to/voice-embeddings
   ```

6. **Connect Ferni** (any machine)
   ```bash
   export USE_PERSONAPLEX=true
   export PERSONAPLEX_URL=wss://gpu-machine:8998/api/chat
   pnpm dev
   ```

## Voice Mapping

| Persona | Cartesia ID | Custom Embedding | Fallback |
|---------|-------------|------------------|----------|
| Ferni | `fdeb5d75-...` | `ferni.pt` | `NATM1` |
| Maya | `11175483-...` | `maya.pt` | `NATF2` |
| Alex | `81c164d9-...` | `alex.pt` | `NATF1` |
| Peter | `3f04e815-...` | `peter.pt` | `NATM0` |
| Jordan | `b2d14370-...` | `jordan.pt` | `NATF0` |
| Nayan | `52f0a563-...` | `nayan.pt` | `NATM2` |

## Troubleshooting

### "CARTESIA_API_KEY not found"
```bash
export CARTESIA_API_KEY=your-key
# or source from .env
source .env
```

### "PersonaPlex (moshi) not installed"
```bash
git clone https://github.com/NVIDIA/personaplex
cd personaplex
pip install moshi/.
```

### "HF_TOKEN not found"
1. Get token from https://huggingface.co/settings/tokens
2. Accept model license: https://huggingface.co/nvidia/personaplex-7b-v1
3. Export token:
   ```bash
   export HF_TOKEN=your-token
   ```

### Connection fails
1. Verify PersonaPlex server is running
2. Check firewall allows port 8998
3. Ensure SSL certificates are valid (or use `--ssl` flag)
