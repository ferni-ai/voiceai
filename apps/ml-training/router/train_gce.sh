#!/bin/bash
# Train Ferni Router on GCE with GPU
#
# This script:
# 1. Creates a GPU VM (or uses existing)
# 2. Copies training code, configs, and data
# 3. Runs training on NVIDIA L4 GPU
# 4. Provides commands to download trained model
#
# Usage:
#   ./train_gce.sh stage1          # Train V7 Stage 1 (domain classifier)
#   ./train_gce.sh stage2          # Train V7 Stage 2 (meta-tool classifier)
#   ./train_gce.sh both            # Train both stages sequentially
#   ./train_gce.sh v6              # Retrain V6 (flat 860-class)
#   ./train_gce.sh --create-vm     # Create VM first, then prompt for stage

set -e

# Configuration
PROJECT_ID="johnb-2025"
ZONE="${GCE_ZONE:-us-central1-b}"
VM_NAME="ferni-ml-training"
MACHINE_TYPE="g2-standard-8"      # 8 vCPUs, 32GB RAM, 1x NVIDIA L4
GPU_TYPE="nvidia-l4"
GPU_COUNT=1

# Paths
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"
REMOTE_DIR="/home/\$USER/ferni-training"

# Parse arguments
STAGE="${1:-}"
CREATE_VM=false

if [[ "$STAGE" == "--create-vm" ]]; then
    CREATE_VM=true
    STAGE="${2:-}"
fi

if [[ -z "$STAGE" ]] && [[ "$CREATE_VM" == false ]]; then
    echo "Usage: $0 [--create-vm] <stage1|stage2|both|v6>"
    echo ""
    echo "Stages:"
    echo "  stage1  - V7 domain classifier (44 classes)"
    echo "  stage2  - V7 meta-tool classifier (112 classes)"
    echo "  both    - Train stage1 then stage2"
    echo "  v6      - Retrain V6 flat classifier (860 classes)"
    echo ""
    echo "Options:"
    echo "  --create-vm  Create the GPU VM before training"
    exit 1
fi

echo "🚀 Ferni Router Training on GCE"
echo "================================"
echo "Project:  $PROJECT_ID"
echo "VM:       $VM_NAME ($MACHINE_TYPE + $GPU_TYPE)"
echo "Stage:    ${STAGE:-'(VM creation only)'}"
echo ""

# Check if VM exists
VM_EXISTS=$(gcloud compute instances list \
    --project=$PROJECT_ID \
    --filter="name=$VM_NAME" \
    --format="value(name)" 2>/dev/null || echo "")

if [[ "$CREATE_VM" == true ]] || [[ -z "$VM_EXISTS" ]]; then
    echo "📦 Creating GPU VM: $VM_NAME"

    gcloud compute instances create $VM_NAME \
        --project=$PROJECT_ID \
        --zone=$ZONE \
        --machine-type=$MACHINE_TYPE \
        --accelerator="type=$GPU_TYPE,count=$GPU_COUNT" \
        --maintenance-policy=TERMINATE \
        --image-family=pytorch-2-7-cu128-ubuntu-2204-nvidia-570 \
        --image-project=deeplearning-platform-release \
        --boot-disk-size=200GB \
        --boot-disk-type=pd-ssd \
        --scopes=cloud-platform

    echo "⏳ Waiting for VM to be ready..."
    sleep 60

    echo "📥 Installing dependencies..."
    gcloud compute ssh $VM_NAME \
        --project=$PROJECT_ID \
        --zone=$ZONE \
        --command="
        pip install transformers>=4.45.0 peft>=0.12.0 datasets>=2.20.0 \
            scikit-learn accelerate>=0.32.0 pyyaml tensorboard
        pip install torch --index-url https://download.pytorch.org/whl/cu121
    "
else
    echo "✅ VM $VM_NAME already exists"
fi

# If no stage specified (just VM creation), exit
if [[ -z "$STAGE" ]]; then
    echo ""
    echo "VM ready. Run with a stage argument to start training:"
    echo "  $0 stage1"
    echo "  $0 stage2"
    echo "  $0 both"
    exit 0
fi

# Get VM IP
VM_IP=$(gcloud compute instances describe $VM_NAME \
    --project=$PROJECT_ID \
    --zone=$ZONE \
    --format="value(networkInterfaces[0].accessConfigs[0].natIP)")
echo "📍 VM IP: $VM_IP"

# Upload training code and data
upload_files() {
    echo ""
    echo "📤 Uploading training code and data..."

    # Create remote directory structure
    gcloud compute ssh $VM_NAME \
        --project=$PROJECT_ID \
        --zone=$ZONE \
        --command="mkdir -p ~/ferni-training/data/v7"

    # Core training files
    for f in train.py config.yaml config_v7_stage1.yaml config_v7_stage2.yaml \
             v7_taxonomy.py v7_relabel.py requirements.txt; do
        if [[ -f "$LOCAL_DIR/$f" ]]; then
            gcloud compute scp "$LOCAL_DIR/$f" \
                "$VM_NAME:~/ferni-training/$f" \
                --project=$PROJECT_ID \
                --zone=$ZONE
        fi
    done

    # Upload V6 data (used by both V6 retraining and V7 relabeling)
    echo "📤 Uploading training data..."
    for f in train_v6.jsonl validation_v6.jsonl test_v5_860.jsonl; do
        local_path="$LOCAL_DIR/data/$f"
        if [[ -f "$local_path" ]]; then
            gcloud compute scp "$local_path" \
                "$VM_NAME:~/ferni-training/data/$f" \
                --project=$PROJECT_ID \
                --zone=$ZONE
        else
            echo "⚠️  $local_path not found, skipping"
        fi
    done

    # Upload V7 data if it exists
    if [[ -d "$LOCAL_DIR/data/v7" ]]; then
        echo "📤 Uploading V7 relabeled data..."
        for f in "$LOCAL_DIR/data/v7/"*.jsonl; do
            if [[ -f "$f" ]]; then
                gcloud compute scp "$f" \
                    "$VM_NAME:~/ferni-training/data/v7/" \
                    --project=$PROJECT_ID \
                    --zone=$ZONE
            fi
        done
    fi
}

# Run training for a specific config
run_training() {
    local config_file="$1"
    local stage_name="$2"

    echo ""
    echo "🏋️ Starting $stage_name training..."

    gcloud compute ssh $VM_NAME \
        --project=$PROJECT_ID \
        --zone=$ZONE \
        --command="
        cd ~/ferni-training

        # Check GPU
        nvidia-smi

        # Run V7 relabeling if V7 data doesn't exist yet
        if [[ '$config_file' == config_v7_* ]] && [[ ! -f data/v7/stage1_train.jsonl ]]; then
            echo '📋 Running V7 relabeling...'
            python3 v7_relabel.py \
                --input data/train_v6.jsonl \
                --validation data/validation_v6.jsonl \
                --test data/test_v5_860.jsonl \
                --output-dir data/v7/
        fi

        # Run training with nohup so it continues if connection drops
        nohup python3 train.py \
            --config $config_file \
            --data_dir ./data \
            > training_${stage_name}.log 2>&1 &

        echo 'Training started in background. PID:' \$!
        echo 'Monitor with: tail -f ~/ferni-training/training_${stage_name}.log'
    "
}

upload_files

case "$STAGE" in
    stage1)
        run_training "config_v7_stage1.yaml" "v7-stage1"
        ;;
    stage2)
        run_training "config_v7_stage2.yaml" "v7-stage2"
        ;;
    both)
        # For "both", run stage1 in foreground then stage2
        echo ""
        echo "🏋️ Training both stages sequentially..."

        gcloud compute ssh $VM_NAME \
            --project=$PROJECT_ID \
            --zone=$ZONE \
            --command="
            cd ~/ferni-training

            nvidia-smi

            # Run V7 relabeling if needed
            if [[ ! -f data/v7/stage1_train.jsonl ]]; then
                echo '📋 Running V7 relabeling...'
                python3 v7_relabel.py \
                    --input data/train_v6.jsonl \
                    --validation data/validation_v6.jsonl \
                    --test data/test_v5_860.jsonl \
                    --output-dir data/v7/
            fi

            # Train Stage 1, then Stage 2
            nohup bash -c '
                echo \"=== Stage 1: Domain Classifier ===\"
                python3 train.py --config config_v7_stage1.yaml --data_dir ./data
                echo \"\"
                echo \"=== Stage 2: Meta-tool Classifier ===\"
                python3 train.py --config config_v7_stage2.yaml --data_dir ./data
                echo \"\"
                echo \"=== Both stages complete! ===\"
            ' > training_v7_both.log 2>&1 &

            echo 'Both stages started in background. PID:' \$!
            echo 'Monitor with: tail -f ~/ferni-training/training_v7_both.log'
        "
        ;;
    v6)
        run_training "config.yaml" "v6"
        ;;
    *)
        echo "❌ Unknown stage: $STAGE"
        echo "Use: stage1, stage2, both, or v6"
        exit 1
        ;;
esac

echo ""
echo "✅ Training started on GCE!"
echo ""
echo "📊 Monitor progress:"
echo "   gcloud compute ssh $VM_NAME --project=$PROJECT_ID --zone=$ZONE --command='tail -f ~/ferni-training/training_*.log'"
echo ""
echo "📥 Download trained model when done:"
if [[ "$STAGE" == "stage1" ]] || [[ "$STAGE" == "both" ]]; then
    echo "   gcloud compute scp --recurse $VM_NAME:~/ferni-training/outputs/ferni-router-v7-stage1 $LOCAL_DIR/outputs/ --project=$PROJECT_ID --zone=$ZONE"
fi
if [[ "$STAGE" == "stage2" ]] || [[ "$STAGE" == "both" ]]; then
    echo "   gcloud compute scp --recurse $VM_NAME:~/ferni-training/outputs/ferni-router-v7-stage2 $LOCAL_DIR/outputs/ --project=$PROJECT_ID --zone=$ZONE"
fi
if [[ "$STAGE" == "v6" ]]; then
    echo "   gcloud compute scp --recurse $VM_NAME:~/ferni-training/outputs/ferni-router-v6 $LOCAL_DIR/outputs/ --project=$PROJECT_ID --zone=$ZONE"
fi
echo ""
echo "🛑 Stop VM when done (save costs):"
echo "   gcloud compute instances stop $VM_NAME --project=$PROJECT_ID --zone=$ZONE"
