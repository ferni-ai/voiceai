#!/bin/bash
set -e

# FTIS V6 Training - Upload data to GCE and start training
# Usage: bash upload_and_train.sh

VM_NAME="ferni-ml-training-v5-860"
VM_ZONE="us-east4-a"
REMOTE_DIR="/home/sethford/router"

echo "============================================"
echo "FTIS V6: Upload & Train on GCE"
echo "============================================"

# Step 1: Upload training files
echo ""
echo "[1/4] Uploading training data and scripts..."

# Create remote directory
gcloud compute ssh $VM_NAME --zone=$VM_ZONE --command="mkdir -p $REMOTE_DIR/data $REMOTE_DIR/outputs"

# Upload training script, config, and data
gcloud compute scp \
  apps/ml-training/router/train.py \
  apps/ml-training/router/config.yaml \
  $VM_NAME:$REMOTE_DIR/ --zone=$VM_ZONE

echo "  Uploading train_v6.jsonl (~450K examples)..."
gcloud compute scp \
  apps/ml-training/router/data/train_v6.jsonl \
  $VM_NAME:$REMOTE_DIR/data/ --zone=$VM_ZONE

echo "  Uploading validation_v6.jsonl..."
gcloud compute scp \
  apps/ml-training/router/data/validation_v6.jsonl \
  $VM_NAME:$REMOTE_DIR/data/ --zone=$VM_ZONE

# Also upload test file if it exists
if [ -f apps/ml-training/router/data/test.jsonl ]; then
  echo "  Uploading test.jsonl..."
  gcloud compute scp \
    apps/ml-training/router/data/test.jsonl \
    $VM_NAME:$REMOTE_DIR/data/ --zone=$VM_ZONE
fi

echo "  Done!"

# Step 2: Verify upload
echo ""
echo "[2/4] Verifying uploaded files..."
gcloud compute ssh $VM_NAME --zone=$VM_ZONE --command="
  echo 'Files on VM:'
  ls -lh $REMOTE_DIR/data/*.jsonl
  echo ''
  echo 'Line counts:'
  wc -l $REMOTE_DIR/data/*.jsonl
  echo ''
  echo 'Config check:'
  cat $REMOTE_DIR/config.yaml | head -15
"

# Step 3: Check GPU
echo ""
echo "[3/4] Checking GPU status..."
gcloud compute ssh $VM_NAME --zone=$VM_ZONE --command="
  nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader
  python3 -c 'import torch; print(f\"PyTorch {torch.__version__}, CUDA: {torch.cuda.is_available()}\")'
"

# Step 4: Start training
echo ""
echo "[4/4] Starting training in tmux session..."
gcloud compute ssh $VM_NAME --zone=$VM_ZONE --command="
  cd $REMOTE_DIR

  # Kill any existing training
  tmux kill-session -t training 2>/dev/null || true

  # Start training in tmux (persists after SSH disconnect)
  tmux new-session -d -s training 'python3 train.py --config config.yaml --data_dir ./data --output_dir ./outputs/ferni-router-v6 2>&1 | tee training_v6.log'

  echo ''
  echo '=========================================='
  echo 'Training started in tmux session!'
  echo '=========================================='
  echo ''
  echo 'To monitor:'
  echo '  gcloud compute ssh $VM_NAME --zone=$VM_ZONE --command=\"tmux attach -t training\"'
  echo '  gcloud compute ssh $VM_NAME --zone=$VM_ZONE --command=\"tail -50 $REMOTE_DIR/training_v6.log\"'
  echo ''
  echo 'Dataset:'
  wc -l $REMOTE_DIR/data/train_v6.jsonl $REMOTE_DIR/data/validation_v6.jsonl
"

echo ""
echo "============================================"
echo "Training launched! Monitor with:"
echo "  gcloud compute ssh $VM_NAME --zone=$VM_ZONE --command='tail -f /home/sethford/router/training_v6.log'"
echo "============================================"
