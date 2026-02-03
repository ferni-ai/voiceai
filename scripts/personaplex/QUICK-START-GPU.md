# PersonaPlex GPU Quick Start

## Option 1: Google Cloud GPU (Recommended)

### 1. Create a GPU VM

```bash
# Create a GPU instance (A100 or T4)
gcloud compute instances create personaplex-server \
  --zone=us-central1-a \
  --machine-type=n1-standard-8 \
  --accelerator=type=nvidia-tesla-t4,count=1 \
  --image-family=pytorch-latest-gpu \
  --image-project=deeplearning-platform-release \
  --boot-disk-size=100GB \
  --maintenance-policy=TERMINATE

# SSH into the instance
gcloud compute ssh personaplex-server --zone=us-central1-a
```

### 2. Install PersonaPlex

```bash
# On the GPU VM
git clone https://github.com/NVIDIA/personaplex
cd personaplex
pip install moshi/.

# Install opus codec
sudo apt install libopus-dev
```

### 3. Copy Voice Samples

```bash
# From your local machine
gcloud compute scp --recurse voice-embeddings/samples/ personaplex-server:~/personaplex/voices/ --zone=us-central1-a
```

### 4. Generate Embeddings

```bash
# On the GPU VM
export HF_TOKEN=your-token  # Get from huggingface.co/settings/tokens

# Accept license first: https://huggingface.co/nvidia/personaplex-7b-v1

cd ~/personaplex
for persona in ferni maya alex peter jordan nayan; do
  echo "Generating embedding for $persona..."
  python -m moshi.offline \
    --voice-prompt "voices/${persona}.wav" \
    --text-prompt "Hello, this is a test." \
    --input-wav "voices/silence-10s.wav" \
    --output-wav "/dev/null" \
    --save-voice-prompt-embeddings

  mv "voices/${persona}.pt" "voices/"
done
```

### 5. Start PersonaPlex Server

```bash
# On the GPU VM
SSL_DIR=$(mktemp -d)
python -m moshi.server --ssl "$SSL_DIR" --voice-prompt-dir ~/personaplex/voices --host 0.0.0.0

# Note the external IP
curl ifconfig.me
```

### 6. Open Firewall

```bash
# Allow port 8998
gcloud compute firewall-rules create allow-personaplex \
  --allow tcp:8998 \
  --source-ranges 0.0.0.0/0 \
  --description "Allow PersonaPlex server"
```

### 7. Connect from Ferni

```bash
# Set environment variables
export USE_PERSONAPLEX=true
export PERSONAPLEX_URL=wss://<GPU-VM-IP>:8998/api/chat
export PERSONAPLEX_VOICE_DIR=./voice-embeddings

# Test connection
pnpm tsx scripts/personaplex/demo-client.ts --url wss://<GPU-VM-IP>:8998/api/chat
```

---

## Option 2: Local GPU (If you have NVIDIA GPU)

### Check GPU

```bash
nvidia-smi
```

### Install PersonaPlex

```bash
git clone https://github.com/NVIDIA/personaplex
cd personaplex
pip install moshi/.
brew install opus  # macOS
```

### Generate Embeddings

```bash
export HF_TOKEN=your-token
./scripts/personaplex/generate-embeddings.sh
```

### Start Server

```bash
SSL_DIR=$(mktemp -d)
python -m moshi.server --ssl "$SSL_DIR" --voice-prompt-dir voice-embeddings
```

---

## Option 3: RunPod / Lambda Labs (Pay-per-hour GPU)

### RunPod

1. Go to https://runpod.io
2. Launch a PyTorch template with A100 or RTX 4090
3. Follow Option 1 steps 2-5

### Lambda Labs

1. Go to https://lambdalabs.com
2. Launch an A100 instance
3. Follow Option 1 steps 2-5

---

## Cost Estimates

| Provider | GPU  | Cost/Hour | Min Time |
| -------- | ---- | --------- | -------- |
| GCP T4   | T4   | ~$0.35    | ~1 hour  |
| GCP A100 | A100 | ~$2.50    | ~30 min  |
| RunPod   | A100 | ~$1.99    | ~30 min  |
| Lambda   | A100 | ~$1.10    | ~30 min  |

Embedding generation takes ~5-10 minutes per persona.
Total: ~30-60 minutes of GPU time for initial setup.

---

## Troubleshooting

### "CUDA out of memory"

Add `--cpu-offload` flag to offload layers to CPU:

```bash
python -m moshi.server --ssl "$SSL_DIR" --cpu-offload
```

### "Model not found"

1. Accept license: https://huggingface.co/nvidia/personaplex-7b-v1
2. Verify HF_TOKEN is set

### "Connection refused"

1. Check firewall rules
2. Verify server is running
3. Try with IP instead of hostname
