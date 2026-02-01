#!/bin/bash
# Train FTIS V5 Router on GCE with GPU
#
# This script:
# 1. Creates a GPU VM with L4 GPU (24GB VRAM - good for 796 labels)
# 2. Copies V5 training code and data
# 3. Runs training on NVIDIA GPU
# 4. Downloads the trained model
#
# Usage: ./train_gce_v5.sh [--create-vm | --resume | --download | --stop]
#
# Cost: ~$0.70/hr for n1-standard-8 + L4 GPU
# Expected training time: ~2-3 hours for V5 (30k examples, 796 labels)

set -e

# Configuration
PROJECT_ID="johnb-2025"
ZONE="us-central1-a"
VM_NAME="ferni-ml-training-v5"
MACHINE_TYPE="g2-standard-8"      # 8 vCPUs, 32GB RAM (required for L4)
GPU_TYPE="nvidia-l4"              # L4 has 24GB VRAM - good for large label space
GPU_COUNT=1

# Paths
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Use /tmp for simpler permissions
REMOTE_DIR="/tmp/ferni-training-v5"

echo "🚀 FTIS V5 Training on GCE"
echo "=========================="
echo "GPU: $GPU_TYPE (24GB VRAM)"
echo "Labels: 796 classes"
echo "Data: ~30k examples"
echo ""

# Helper function
run_remote() {
    gcloud compute ssh $VM_NAME --zone=$ZONE --command="$1"
}

# Handle commands
case "${1:-start}" in
    --create-vm)
        echo "📦 Creating GPU VM: $VM_NAME"
        
        # G2 machine types include the L4 GPU automatically
        gcloud compute instances create $VM_NAME \
            --project=$PROJECT_ID \
            --zone=$ZONE \
            --machine-type=$MACHINE_TYPE \
            --maintenance-policy=TERMINATE \
            --image-family=pytorch-2-7-cu128-ubuntu-2204-nvidia-570 \
            --image-project=deeplearning-platform-release \
            --boot-disk-size=200GB \
            --boot-disk-type=pd-ssd \
            --scopes=cloud-platform
        
        echo "⏳ Waiting for VM to be ready (90s)..."
        sleep 90
        
        echo "📥 Installing dependencies..."
        run_remote "pip install transformers==4.44.0 peft datasets scikit-learn accelerate tensorboard tqdm pyyaml"
        
        echo "✅ VM created successfully!"
        ;;
        
    --resume|start)
        # Check if VM exists
        VM_EXISTS=$(gcloud compute instances list --filter="name=$VM_NAME" --format="value(name)" 2>/dev/null || echo "")
        
        if [[ -z "$VM_EXISTS" ]]; then
            echo "❌ VM doesn't exist. Run with --create-vm first."
            exit 1
        fi
        
        # Start VM if stopped
        VM_STATUS=$(gcloud compute instances describe $VM_NAME --zone=$ZONE --format="value(status)")
        if [[ "$VM_STATUS" != "RUNNING" ]]; then
            echo "🔄 Starting stopped VM..."
            gcloud compute instances start $VM_NAME --zone=$ZONE
            sleep 30
        fi
        
        echo "📤 Uploading V5 training code and data..."
        
        # Create remote directory
        run_remote "mkdir -p $REMOTE_DIR/data"
        
        # Copy training script
        gcloud compute scp "$LOCAL_DIR/train.py" $VM_NAME:$REMOTE_DIR/ --zone=$ZONE
        gcloud compute scp "$LOCAL_DIR/config_v5.yaml" $VM_NAME:$REMOTE_DIR/ --zone=$ZONE
        
        # Copy V5 data files
        echo "📤 Uploading training data (~30k examples)..."
        gcloud compute scp "$LOCAL_DIR/data/train_v5.jsonl" $VM_NAME:$REMOTE_DIR/data/ --zone=$ZONE
        gcloud compute scp "$LOCAL_DIR/data/validation_v5.jsonl" $VM_NAME:$REMOTE_DIR/data/ --zone=$ZONE
        gcloud compute scp "$LOCAL_DIR/data/test_v5.jsonl" $VM_NAME:$REMOTE_DIR/data/ --zone=$ZONE
        
        echo ""
        echo "🏋️ Starting V5 training on GPU..."
        
        # Create remote config with correct paths
        run_remote "cat > $REMOTE_DIR/config_v5_remote.yaml << 'EOF'
# FTIS V5 Training Configuration - GCE Remote
model:
  base_model: 'Qwen/Qwen3-1.7B'
  task: 'multi_label_classification'
  num_labels: 796

lora:
  r: 16
  lora_alpha: 32
  target_modules:
    - 'q_proj'
    - 'k_proj'
    - 'v_proj'
    - 'o_proj'
    - 'gate_proj'
    - 'up_proj'
    - 'down_proj'
  lora_dropout: 0.1
  bias: 'none'
  task_type: 'SEQ_CLS'

training:
  learning_rate: 2.0e-5
  num_train_epochs: 3
  per_device_train_batch_size: 4      # Smaller batch for 796 labels
  per_device_eval_batch_size: 8
  gradient_accumulation_steps: 8      # Effective batch = 32
  warmup_ratio: 0.1
  weight_decay: 0.01
  max_grad_norm: 1.0
  lr_scheduler_type: 'cosine'
  eval_strategy: 'steps'
  eval_steps: 500
  save_strategy: 'steps'
  save_steps: 500
  save_total_limit: 3
  load_best_model_at_end: true
  metric_for_best_model: 'f1'
  greater_is_better: true
  fp16: true                          # Enable for GPU
  dataloader_num_workers: 4

data:
  max_length: 128
  pad_to_max_length: false
  train_file: 'data/train_v5.jsonl'
  validation_file: 'data/validation_v5.jsonl'
  test_file: 'data/test_v5.jsonl'

output:
  output_dir: 'outputs/ferni-router-v5'
  logging_dir: 'logs/v5'
  report_to: 'tensorboard'
EOF"
        
        # Run training (use python3 explicitly)
        run_remote "cd $REMOTE_DIR && \
            nvidia-smi && \
            export PATH=\$PATH:/home/sethford/.local/bin && \
            nohup python3 train.py --config config_v5_remote.yaml --data_dir ./data --output_dir ./outputs/ferni-router-v5 > training_v5.log 2>&1 &
            echo 'Training started! PID:' \$!
            sleep 10
            tail -50 training_v5.log 2>/dev/null || cat training_v5.log 2>/dev/null || echo 'Waiting for logs...'
        "
        
        echo ""
        echo "✅ V5 Training started on GCE!"
        echo ""
        echo "📊 Monitor progress:"
        echo "   $0 --logs"
        echo ""
        echo "📥 Download when done:"
        echo "   $0 --download"
        echo ""
        echo "🛑 Stop VM when done (save \$\$):"
        echo "   $0 --stop"
        ;;
        
    --logs)
        echo "📊 Training logs:"
        run_remote "tail -100 $REMOTE_DIR/training_v5.log"
        ;;
        
    --status)
        echo "📊 Training status:"
        run_remote "ps aux | grep python | grep -v grep || echo 'No training process running'"
        run_remote "ls -la $REMOTE_DIR/outputs/ferni-router-v5/ 2>/dev/null || echo 'No outputs yet'"
        run_remote "tail -30 $REMOTE_DIR/training_v5.log 2>/dev/null || echo 'No logs yet'"
        ;;
        
    --download)
        echo "📥 Downloading trained V5 model..."
        
        mkdir -p "$LOCAL_DIR/outputs/ferni-router-v5-gce"
        
        # Download final model
        gcloud compute scp --recurse \
            $VM_NAME:$REMOTE_DIR/outputs/ferni-router-v5/final \
            "$LOCAL_DIR/outputs/ferni-router-v5-gce/" \
            --zone=$ZONE
        
        # Download label map
        gcloud compute scp \
            $VM_NAME:$REMOTE_DIR/outputs/ferni-router-v5/label_map.json \
            "$LOCAL_DIR/outputs/ferni-router-v5-gce/" \
            --zone=$ZONE
        
        # Download test results
        gcloud compute scp \
            $VM_NAME:$REMOTE_DIR/outputs/ferni-router-v5/test_results.json \
            "$LOCAL_DIR/outputs/ferni-router-v5-gce/" \
            --zone=$ZONE 2>/dev/null || true
        
        echo "✅ Model downloaded to: $LOCAL_DIR/outputs/ferni-router-v5-gce/"
        ;;
        
    --stop)
        echo "🛑 Stopping VM to save costs..."
        gcloud compute instances stop $VM_NAME --zone=$ZONE
        echo "✅ VM stopped. Restart with: $0 --resume"
        ;;
        
    --delete)
        echo "🗑️ Deleting VM..."
        read -p "Are you sure? This will delete all data on the VM. (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            gcloud compute instances delete $VM_NAME --zone=$ZONE --quiet
            echo "✅ VM deleted"
        fi
        ;;
        
    --ssh)
        echo "🔌 Connecting to VM..."
        gcloud compute ssh $VM_NAME --zone=$ZONE
        ;;
        
    *)
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  --create-vm   Create new GPU VM"
        echo "  start         Upload data and start training (default)"
        echo "  --resume      Same as start"
        echo "  --logs        Show training logs"
        echo "  --status      Show training status"
        echo "  --download    Download trained model"
        echo "  --stop        Stop VM (save costs)"
        echo "  --delete      Delete VM entirely"
        echo "  --ssh         SSH into VM"
        ;;
esac
