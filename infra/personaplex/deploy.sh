#!/bin/bash
# =============================================================================
# PersonaPlex GCE GPU Deployment
# =============================================================================
# Deploys PersonaPlex server on a GPU-enabled GCE instance
#
# Usage:
#   ./deploy.sh              # Full deployment
#   ./deploy.sh --create     # Create instance only
#   ./deploy.sh --update     # Update existing instance
#   ./deploy.sh --voices     # Generate voice embeddings only
#   ./deploy.sh --destroy    # Tear down instance
# =============================================================================

set -euo pipefail

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-voiceai-426818}"
ZONE="us-central1-a"
INSTANCE_NAME="personaplex-server"
MACHINE_TYPE="n1-standard-8"
GPU_TYPE="nvidia-l4"
GPU_COUNT=1
BOOT_DISK_SIZE="100GB"
IMAGE_FAMILY="pytorch-latest-gpu"
IMAGE_PROJECT="deeplearning-platform-release"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[PersonaPlex]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# =============================================================================
# CHECK PREREQUISITES
# =============================================================================

check_prerequisites() {
  log "Checking prerequisites..."
  
  # Check gcloud
  if ! command -v gcloud &> /dev/null; then
    error "gcloud CLI not found. Install: https://cloud.google.com/sdk/docs/install"
  fi
  
  # Check HF_TOKEN
  if [[ -z "${HF_TOKEN:-}" ]]; then
    error "HF_TOKEN not set. Get one from: https://huggingface.co/settings/tokens"
  fi
  
  # Check GPU quota
  log "Checking GPU quota..."
  QUOTA=$(gcloud compute regions describe us-central1 \
    --format="value(quotas.filter(metric='NVIDIA_L4_GPUS').limit)" 2>/dev/null || echo "0")
  
  if [[ "$QUOTA" == "0" ]]; then
    warn "No L4 GPU quota. Request at: https://console.cloud.google.com/iam-admin/quotas"
    warn "Falling back to T4 GPU..."
    GPU_TYPE="nvidia-tesla-t4"
  fi
  
  success "Prerequisites OK"
}

# =============================================================================
# CREATE INSTANCE
# =============================================================================

create_instance() {
  log "Creating GPU instance: $INSTANCE_NAME"
  
  # Check if instance exists
  if gcloud compute instances describe "$INSTANCE_NAME" --zone="$ZONE" &>/dev/null; then
    warn "Instance already exists. Use --update to update it."
    return 0
  fi
  
  # Create startup script
  cat > /tmp/personaplex-startup.sh << 'STARTUP'
#!/bin/bash
set -e

# Install dependencies
apt-get update
apt-get install -y git python3-pip libopus-dev ffmpeg

# Clone PersonaPlex
if [[ ! -d /opt/personaplex ]]; then
  git clone https://github.com/NVIDIA/personaplex /opt/personaplex
  cd /opt/personaplex
  pip install moshi/.
fi

# Create voices directory
mkdir -p /opt/voices

# Download model (if not already cached)
python3 -c "
from huggingface_hub import snapshot_download
import os
os.environ['HF_TOKEN'] = '${HF_TOKEN}'
snapshot_download('nvidia/personaplex-7b-v1', local_dir='/opt/personaplex/model')
" || echo "Model download will happen on first run"

# Create systemd service
cat > /etc/systemd/system/personaplex.service << 'SERVICE'
[Unit]
Description=PersonaPlex Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/personaplex
Environment="HF_TOKEN=${HF_TOKEN}"
ExecStart=/usr/bin/python3 -m moshi.server --ssl /tmp/ssl --voice-prompt-dir /opt/voices --host 0.0.0.0 --port 8998
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable personaplex
systemctl start personaplex

echo "PersonaPlex server started on port 8998"
STARTUP

  # Create instance
  gcloud compute instances create "$INSTANCE_NAME" \
    --project="$PROJECT_ID" \
    --zone="$ZONE" \
    --machine-type="$MACHINE_TYPE" \
    --accelerator="type=$GPU_TYPE,count=$GPU_COUNT" \
    --image-family="$IMAGE_FAMILY" \
    --image-project="$IMAGE_PROJECT" \
    --boot-disk-size="$BOOT_DISK_SIZE" \
    --boot-disk-type="pd-ssd" \
    --maintenance-policy="TERMINATE" \
    --metadata-from-file="startup-script=/tmp/personaplex-startup.sh" \
    --metadata="HF_TOKEN=$HF_TOKEN" \
    --tags="personaplex,https-server" \
    --scopes="default,storage-rw"
  
  success "Instance created: $INSTANCE_NAME"
  
  # Get external IP
  sleep 5
  EXTERNAL_IP=$(gcloud compute instances describe "$INSTANCE_NAME" \
    --zone="$ZONE" \
    --format="get(networkInterfaces[0].accessConfigs[0].natIP)")
  
  log "External IP: $EXTERNAL_IP"
  
  # Create firewall rule
  if ! gcloud compute firewall-rules describe allow-personaplex &>/dev/null; then
    gcloud compute firewall-rules create allow-personaplex \
      --allow="tcp:8998" \
      --target-tags="personaplex" \
      --description="Allow PersonaPlex server traffic"
    success "Firewall rule created"
  fi
  
  echo ""
  success "PersonaPlex server deploying!"
  log "Wait 5-10 minutes for setup to complete"
  log "Then test: curl -k https://$EXTERNAL_IP:8998/health"
  log ""
  log "Connection URL: wss://$EXTERNAL_IP:8998/api/chat"
}

# =============================================================================
# UPLOAD VOICE SAMPLES
# =============================================================================

upload_voices() {
  log "Uploading voice samples..."
  
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  VOICE_DIR="$SCRIPT_DIR/../../voice-embeddings/samples"
  
  if [[ ! -d "$VOICE_DIR" ]]; then
    error "Voice samples not found. Run: pnpm personaplex:samples"
  fi
  
  # Upload samples
  gcloud compute scp --recurse "$VOICE_DIR/"* \
    "$INSTANCE_NAME:/opt/voices/" \
    --zone="$ZONE"
  
  success "Voice samples uploaded"
}

# =============================================================================
# GENERATE EMBEDDINGS
# =============================================================================

generate_embeddings() {
  log "Generating voice embeddings on GPU..."
  
  gcloud compute ssh "$INSTANCE_NAME" --zone="$ZONE" --command='
    cd /opt/personaplex
    for wav in /opt/voices/*.wav; do
      if [[ -f "$wav" ]]; then
        name=$(basename "$wav" .wav)
        if [[ ! -f "/opt/voices/${name}.pt" ]]; then
          echo "Generating embedding for $name..."
          python3 -m moshi.offline \
            --voice-prompt "$wav" \
            --text-prompt "Hello, this is a test." \
            --input-wav "/opt/voices/silence-10s.wav" \
            --output-wav "/dev/null" \
            --save-voice-prompt-embeddings
          mv "${name}.pt" /opt/voices/ 2>/dev/null || true
        else
          echo "Embedding already exists for $name"
        fi
      fi
    done
    echo "Done! Generated embeddings:"
    ls -la /opt/voices/*.pt 2>/dev/null || echo "No .pt files found"
  '
  
  success "Voice embeddings generated"
}

# =============================================================================
# CHECK HEALTH
# =============================================================================

check_health() {
  log "Checking PersonaPlex health..."
  
  EXTERNAL_IP=$(gcloud compute instances describe "$INSTANCE_NAME" \
    --zone="$ZONE" \
    --format="get(networkInterfaces[0].accessConfigs[0].natIP)")
  
  if curl -sk "https://$EXTERNAL_IP:8998/health" | grep -q "ok"; then
    success "PersonaPlex is healthy!"
    log "WebSocket URL: wss://$EXTERNAL_IP:8998/api/chat"
  else
    warn "PersonaPlex not responding yet. Check logs: ./deploy.sh --logs"
  fi
}

# =============================================================================
# VIEW LOGS
# =============================================================================

view_logs() {
  log "Viewing PersonaPlex logs..."
  gcloud compute ssh "$INSTANCE_NAME" --zone="$ZONE" --command='
    journalctl -u personaplex -f --no-pager
  '
}

# =============================================================================
# DESTROY INSTANCE
# =============================================================================

destroy_instance() {
  warn "This will delete the PersonaPlex server and all data!"
  read -p "Are you sure? (y/N) " -n 1 -r
  echo
  
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    gcloud compute instances delete "$INSTANCE_NAME" --zone="$ZONE" --quiet
    success "Instance deleted"
  else
    log "Aborted"
  fi
}

# =============================================================================
# MAIN
# =============================================================================

case "${1:-}" in
  --create)
    check_prerequisites
    create_instance
    ;;
  --update)
    upload_voices
    generate_embeddings
    ;;
  --voices)
    upload_voices
    generate_embeddings
    ;;
  --health)
    check_health
    ;;
  --logs)
    view_logs
    ;;
  --destroy)
    destroy_instance
    ;;
  --help|-h)
    echo "PersonaPlex GCE GPU Deployment"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  --create    Create GPU instance"
    echo "  --update    Update voices on existing instance"
    echo "  --voices    Upload and generate voice embeddings"
    echo "  --health    Check server health"
    echo "  --logs      View server logs"
    echo "  --destroy   Delete instance"
    echo ""
    echo "Environment:"
    echo "  HF_TOKEN    HuggingFace token (required)"
    echo "  GCP_PROJECT_ID  GCP project (default: voiceai-426818)"
    ;;
  *)
    check_prerequisites
    create_instance
    upload_voices
    # Wait for instance to be ready
    log "Waiting for instance to initialize (this takes 5-10 minutes)..."
    sleep 300
    generate_embeddings
    check_health
    ;;
esac
