"""
Ferni Tool Router Training on Modal.com
Run with: modal run train_modal.py

Cost: ~$0.15 for ~30 min on T4 GPU
"""
import modal
import os

# Create Modal app
app = modal.App("ferni-router-training")

# Define the training image with all dependencies
training_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch",
        "transformers>=4.45.0",
        "datasets",
        "accelerate",
        "peft",
        "bitsandbytes",
        "scikit-learn",
        "tqdm",
    )
)

# Mount the training data
training_data = modal.Mount.from_local_dir(
    "/Users/sethford/Documents/voiceai/data/ftis-training-sota",
    remote_path="/data",
)

# Output volume for the trained model
model_volume = modal.Volume.from_name("ferni-router-model", create_if_missing=True)


@app.function(
    image=training_image,
    gpu="T4",  # NVIDIA T4 GPU (~$0.30/hr)
    timeout=7200,  # 2 hour timeout
    mounts=[training_data],
    volumes={"/output": model_volume},
)
def train():
    """Train the Ferni tool router model."""
    import json
    import torch
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        TrainingArguments,
        Trainer,
    )
    from datasets import Dataset
    from sklearn.preprocessing import MultiLabelBinarizer
    import numpy as np

    print("🚀 Starting Ferni Router Training on Modal T4 GPU")
    print(f"CUDA available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    # Load data
    print("\n📂 Loading training data...")
    with open("/data/train.jsonl", "r") as f:
        train_data = [json.loads(line) for line in f]
    with open("/data/validation.jsonl", "r") as f:
        val_data = [json.loads(line) for line in f]
    with open("/data/label_map.json", "r") as f:
        label_map = json.load(f)

    print(f"Training examples: {len(train_data)}")
    print(f"Validation examples: {len(val_data)}")
    print(f"Number of labels: {len(label_map)}")

    # Prepare multi-label data
    all_tools = list(label_map.keys())
    mlb = MultiLabelBinarizer(classes=all_tools)
    mlb.fit([all_tools])

    def prepare_labels(examples):
        labels = []
        for ex in examples:
            tools = ex.get("selected_tools", ex.get("tools", []))
            if isinstance(tools, str):
                tools = [tools]
            labels.append(tools)
        return mlb.transform(labels)

    train_labels = prepare_labels(train_data)
    val_labels = prepare_labels(val_data)

    # Load tokenizer and model
    print("\n🔧 Loading Qwen 2.5 0.5B model...")
    model_name = "Qwen/Qwen2.5-0.5B"
    tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForSequenceClassification.from_pretrained(
        model_name,
        num_labels=len(label_map),
        problem_type="multi_label_classification",
        trust_remote_code=True,
    )
    model.config.pad_token_id = tokenizer.pad_token_id

    # Tokenize
    print("\n📝 Tokenizing data...")

    def tokenize_data(examples, labels):
        queries = [ex["query"] for ex in examples]
        encodings = tokenizer(
            queries,
            truncation=True,
            padding="max_length",
            max_length=128,
            return_tensors="np",
        )
        return Dataset.from_dict(
            {
                "input_ids": encodings["input_ids"],
                "attention_mask": encodings["attention_mask"],
                "labels": labels.astype(np.float32),
            }
        )

    train_dataset = tokenize_data(train_data, train_labels)
    val_dataset = tokenize_data(val_data, val_labels)

    # Training arguments
    print("\n🏋️ Starting training...")
    training_args = TrainingArguments(
        output_dir="/output/checkpoints",
        eval_strategy="steps",
        eval_steps=200,
        save_steps=200,
        save_total_limit=2,
        learning_rate=5e-5,
        per_device_train_batch_size=32,
        per_device_eval_batch_size=32,
        num_train_epochs=1,
        weight_decay=0.01,
        logging_steps=50,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        report_to="none",
        fp16=True,  # Use FP16 on T4
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
    )

    trainer.train()

    # Save the model
    print("\n💾 Saving model...")
    trainer.save_model("/output/ferni-router-1069")
    tokenizer.save_pretrained("/output/ferni-router-1069")

    # Save label map
    with open("/output/ferni-router-1069/label_map.json", "w") as f:
        json.dump(label_map, f)

    print("\n✅ Training complete!")
    print("Model saved to Modal volume: ferni-router-model")

    # Commit the volume
    model_volume.commit()

    return {"status": "success", "model_path": "/output/ferni-router-1069"}


@app.function(
    image=training_image,
    volumes={"/output": model_volume},
)
def download_model():
    """Download the trained model from Modal volume."""
    import shutil
    import os

    model_path = "/output/ferni-router-1069"
    if os.path.exists(model_path):
        # Create a zip file
        shutil.make_archive("/tmp/ferni-router-1069", "zip", model_path)
        with open("/tmp/ferni-router-1069.zip", "rb") as f:
            return f.read()
    else:
        return None


@app.local_entrypoint()
def main():
    """Main entrypoint - train and download."""
    print("🚀 Launching training on Modal T4 GPU...")
    result = train.remote()
    print(f"Training result: {result}")

    print("\n📥 Downloading trained model...")
    model_zip = download_model.remote()

    if model_zip:
        output_path = "/Users/sethford/Documents/voiceai/models/ferni-router-1069.zip"
        with open(output_path, "wb") as f:
            f.write(model_zip)
        print(f"✅ Model downloaded to: {output_path}")
        print("\nNext steps:")
        print(f"  unzip {output_path} -d /Users/sethford/Documents/voiceai/models/ferni-router-1069")
    else:
        print("❌ Model not found in volume")
