#!/usr/bin/env python3
"""
FTIS BaseCal Confidence Calibration Training

Implements the BaseCal (2026) approach to fix overconfident predictions:
- Compares fine-tuned model confidence with base model confidence
- Trains a recalibration network that detects when fine-tuned is overconfident
- Key insight: When fine-tuned is confident but base is uncertain, prediction is likely wrong

Output: Calibration models for Stage 1 and each Stage 2 classifier

Reference: BaseCal (January 2026) - Using base model signals for calibration
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import random

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, TensorDataset
from transformers import AutoTokenizer, AutoModel
from sklearn.metrics import accuracy_score
import numpy as np

sys.stdout.reconfigure(line_buffering=True)

# ============================================================================
# CONFIG
# ============================================================================

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
MAX_LENGTH = 64
BATCH_SIZE = 64
CALIBRATION_EPOCHS = 30
CALIBRATION_LR = 1e-3
OUTPUT_DIR = Path(__file__).parent.parent / "models" / "ftis-merged"
CALIBRATION_DIR = OUTPUT_DIR / "calibration"

# ============================================================================
# CALIBRATION NETWORK
# ============================================================================

class BaseCalNetwork(nn.Module):
    """
    BaseCal recalibration network.
    
    Takes features from both fine-tuned and base model predictions
    and outputs a calibrated confidence score.
    
    Features:
    - fine_confidence: Max softmax probability from fine-tuned model
    - base_confidence: Max softmax probability from base model (on same input)
    - entropy_diff: Difference in prediction entropy
    - confidence_gap: Absolute difference between confidences
    """
    
    def __init__(self, input_dim: int = 5):
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(input_dim, 32),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(32, 16),
            nn.ReLU(),
            nn.Linear(16, 1),
            nn.Sigmoid()
        )
    
    def forward(self, features: torch.Tensor) -> torch.Tensor:
        """
        Args:
            features: [batch, 5] tensor with:
                - fine_confidence
                - base_confidence  
                - fine_entropy
                - base_entropy
                - confidence_gap
        
        Returns:
            Calibrated confidence [batch, 1]
        """
        return self.network(features)


def compute_entropy(logits: torch.Tensor) -> torch.Tensor:
    """Compute prediction entropy from logits."""
    probs = F.softmax(logits, dim=-1)
    log_probs = F.log_softmax(logits, dim=-1)
    entropy = -(probs * log_probs).sum(dim=-1)
    return entropy


# ============================================================================
# BASE MODEL INFERENCE
# ============================================================================

class BaseModelInference:
    """Runs inference with the base (non-fine-tuned) MiniLM model."""
    
    def __init__(self, device: torch.device):
        self.device = device
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        self.model = AutoModel.from_pretrained(MODEL_NAME).to(device)
        self.model.eval()
    
    def mean_pooling(self, outputs, attention_mask):
        """Apply mean pooling to get sentence embedding."""
        token_embeddings = outputs.last_hidden_state
        input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
        sum_embeddings = torch.sum(token_embeddings * input_mask_expanded, 1)
        sum_mask = torch.clamp(input_mask_expanded.sum(1), min=1e-9)
        return sum_embeddings / sum_mask
    
    def get_embedding(self, texts: List[str]) -> torch.Tensor:
        """Get base model embeddings for texts."""
        encoded = self.tokenizer(
            texts,
            max_length=MAX_LENGTH,
            truncation=True,
            padding='max_length',
            return_tensors='pt'
        )
        
        with torch.no_grad():
            input_ids = encoded['input_ids'].to(self.device)
            attention_mask = encoded['attention_mask'].to(self.device)
            outputs = self.model(input_ids=input_ids, attention_mask=attention_mask)
            embeddings = self.mean_pooling(outputs, attention_mask)
            embeddings = F.normalize(embeddings, p=2, dim=1)
        
        return embeddings
    
    def get_pseudo_logits(self, texts: List[str], centroids: torch.Tensor) -> torch.Tensor:
        """
        Get pseudo-logits from base model by comparing embeddings to class centroids.
        
        This simulates what the base model "would predict" if it had the same
        classification head, giving us a signal for calibration.
        """
        embeddings = self.get_embedding(texts)
        
        # Compute similarity to each centroid
        # centroids: [num_classes, embed_dim]
        # embeddings: [batch, embed_dim]
        similarities = torch.mm(embeddings, centroids.T)  # [batch, num_classes]
        
        # Scale to logit-like values
        return similarities * 10.0  # Temperature scaling


# ============================================================================
# FINE-TUNED MODEL INFERENCE (PyTorch)
# ============================================================================

class SimpleClassifier(nn.Module):
    """Simple but effective classifier for hierarchical stages (matching train_all.py)."""
    
    def __init__(self, model_name: str, num_labels: int, dropout: float = 0.1):
        super().__init__()
        self.encoder = AutoModel.from_pretrained(model_name)
        self.dropout = nn.Dropout(dropout)
        hidden_size = self.encoder.config.hidden_size
        self.classifier = nn.Linear(hidden_size, num_labels)

    def forward(self, input_ids, attention_mask):
        outputs = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        # Mean pooling
        token_embeddings = outputs.last_hidden_state
        input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
        sum_embeddings = torch.sum(token_embeddings * input_mask_expanded, 1)
        sum_mask = torch.clamp(input_mask_expanded.sum(1), min=1e-9)
        pooled = sum_embeddings / sum_mask
        pooled = self.dropout(pooled)
        logits = self.classifier(pooled)
        return logits


class FineTunedModelInference:
    """Runs inference with fine-tuned PyTorch model."""
    
    def __init__(self, model_dir: str, label_map_path: str, device: torch.device):
        self.device = device
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        
        # Load label map
        with open(label_map_path) as f:
            self.label_map = json.load(f)
        self.id_to_label = {v: k for k, v in self.label_map.items()}
        
        # Load PyTorch model
        num_labels = len(self.label_map)
        self.model = SimpleClassifier(MODEL_NAME, num_labels).to(device)
        
        model_path = Path(model_dir) / "best_model.pt"
        if model_path.exists():
            self.model.load_state_dict(torch.load(model_path, map_location=device))
        else:
            raise FileNotFoundError(f"Model not found: {model_path}")
        
        self.model.eval()
    
    def predict(self, texts: List[str]) -> Tuple[torch.Tensor, List[str]]:
        """
        Run inference and return logits and predicted labels.
        
        Returns:
            logits: [batch, num_classes] tensor
            labels: List of predicted label strings
        """
        encoded = self.tokenizer(
            texts,
            max_length=MAX_LENGTH,
            truncation=True,
            padding='max_length',
            return_tensors='pt'
        )
        
        with torch.no_grad():
            input_ids = encoded['input_ids'].to(self.device)
            attention_mask = encoded['attention_mask'].to(self.device)
            logits = self.model(input_ids, attention_mask)
        
        logits = logits.cpu()
        preds = logits.argmax(dim=-1).numpy()
        labels = [self.id_to_label[p] for p in preds]
        
        return logits, labels


# ============================================================================
# CALIBRATION DATA COLLECTION
# ============================================================================

def collect_calibration_data(
    fine_model: FineTunedModelInference,
    base_model: BaseModelInference,
    texts: List[str],
    true_labels: List[int],
    centroids: torch.Tensor,
    batch_size: int = 64
) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    Collect calibration features and targets.
    
    Returns:
        features: [N, 5] tensor of calibration features
        targets: [N, 1] tensor of binary correctness labels
    """
    all_features = []
    all_targets = []
    
    for i in range(0, len(texts), batch_size):
        batch_texts = texts[i:i + batch_size]
        batch_true_labels = true_labels[i:i + batch_size]
        
        # Get fine-tuned model predictions
        fine_logits, _ = fine_model.predict(batch_texts)
        fine_probs = F.softmax(fine_logits, dim=-1)
        fine_confidence = fine_probs.max(dim=-1).values
        fine_preds = fine_logits.argmax(dim=-1)
        fine_entropy = compute_entropy(fine_logits)
        
        # Get base model pseudo-predictions
        base_logits = base_model.get_pseudo_logits(batch_texts, centroids)
        base_probs = F.softmax(base_logits, dim=-1)
        base_confidence = base_probs.max(dim=-1).values
        base_entropy = compute_entropy(base_logits)
        
        # Move everything to CPU for feature computation
        fine_confidence = fine_confidence.cpu()
        fine_entropy = fine_entropy.cpu()
        base_confidence = base_confidence.cpu()
        base_entropy = base_entropy.cpu()
        
        # Compute features
        confidence_gap = (fine_confidence - base_confidence).abs()
        
        features = torch.stack([
            fine_confidence,
            base_confidence,
            fine_entropy,
            base_entropy,
            confidence_gap
        ], dim=1)
        
        # Targets: 1 if prediction is correct, 0 otherwise
        true_labels_tensor = torch.tensor(batch_true_labels)
        correct = (fine_preds == true_labels_tensor).float().unsqueeze(1)
        
        all_features.append(features)
        all_targets.append(correct)
    
    return torch.cat(all_features, dim=0), torch.cat(all_targets, dim=0)


# ============================================================================
# CALIBRATION TRAINING
# ============================================================================

def train_calibration_model(
    features: torch.Tensor,
    targets: torch.Tensor,
    device: torch.device
) -> Tuple[BaseCalNetwork, Dict]:
    """Train a calibration model on the collected data."""
    
    # Split into train/val
    n = len(features)
    indices = list(range(n))
    random.shuffle(indices)
    split = int(0.8 * n)
    
    train_idx = indices[:split]
    val_idx = indices[split:]
    
    train_features = features[train_idx].to(device)
    train_targets = targets[train_idx].to(device)
    val_features = features[val_idx].to(device)
    val_targets = targets[val_idx].to(device)
    
    train_dataset = TensorDataset(train_features, train_targets)
    train_loader = DataLoader(train_dataset, batch_size=32, shuffle=True)
    
    # Model
    model = BaseCalNetwork(input_dim=5).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=CALIBRATION_LR)
    criterion = nn.BCELoss()
    
    best_val_loss = float('inf')
    best_state = None
    
    for epoch in range(CALIBRATION_EPOCHS):
        # Training
        model.train()
        train_loss = 0
        for batch_features, batch_targets in train_loader:
            optimizer.zero_grad()
            outputs = model(batch_features)
            loss = criterion(outputs, batch_targets)
            loss.backward()
            optimizer.step()
            train_loss += loss.item()
        
        train_loss /= len(train_loader)
        
        # Validation
        model.eval()
        with torch.no_grad():
            val_outputs = model(val_features)
            val_loss = criterion(val_outputs, val_targets).item()
            
            # Compute ECE (Expected Calibration Error)
            ece = compute_ece(val_outputs.cpu().numpy(), val_targets.cpu().numpy())
        
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_state = model.state_dict().copy()
        
        if (epoch + 1) % 10 == 0:
            print(f"    Epoch {epoch+1}/{CALIBRATION_EPOCHS}: Train Loss {train_loss:.4f} | Val Loss {val_loss:.4f} | ECE {ece:.4f}")
    
    # Load best model
    model.load_state_dict(best_state)
    
    # Final metrics
    model.eval()
    with torch.no_grad():
        val_outputs = model(val_features)
        final_ece = compute_ece(val_outputs.cpu().numpy(), val_targets.cpu().numpy())
        final_loss = criterion(val_outputs, val_targets).item()
    
    metrics = {
        'final_val_loss': final_loss,
        'final_ece': final_ece,
        'train_samples': len(train_idx),
        'val_samples': len(val_idx)
    }
    
    return model, metrics


def compute_ece(predictions: np.ndarray, targets: np.ndarray, n_bins: int = 10) -> float:
    """
    Compute Expected Calibration Error (ECE).
    
    Lower is better. 0.0 = perfectly calibrated.
    """
    predictions = predictions.flatten()
    targets = targets.flatten()
    
    bin_boundaries = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    
    for i in range(n_bins):
        in_bin = (predictions >= bin_boundaries[i]) & (predictions < bin_boundaries[i + 1])
        prop_in_bin = in_bin.mean()
        
        if prop_in_bin > 0:
            avg_confidence = predictions[in_bin].mean()
            avg_accuracy = targets[in_bin].mean()
            ece += prop_in_bin * abs(avg_confidence - avg_accuracy)
    
    return ece


# ============================================================================
# CENTROID COMPUTATION
# ============================================================================

def compute_centroids(
    base_model: BaseModelInference,
    texts: List[str],
    labels: List[int],
    num_classes: int,
    batch_size: int = 64
) -> torch.Tensor:
    """Compute class centroids from base model embeddings."""
    
    # Collect embeddings by class
    class_embeddings: Dict[int, List[torch.Tensor]] = {i: [] for i in range(num_classes)}
    
    for i in range(0, len(texts), batch_size):
        batch_texts = texts[i:i + batch_size]
        batch_labels = labels[i:i + batch_size]
        
        embeddings = base_model.get_embedding(batch_texts)
        
        for emb, label in zip(embeddings, batch_labels):
            class_embeddings[label].append(emb.cpu())
    
    # Compute centroids
    centroids = []
    for i in range(num_classes):
        if class_embeddings[i]:
            centroid = torch.stack(class_embeddings[i]).mean(dim=0)
            centroid = F.normalize(centroid, p=2, dim=0)
        else:
            # Random initialization if no samples
            centroid = torch.randn(384)
            centroid = F.normalize(centroid, p=2, dim=0)
        centroids.append(centroid)
    
    return torch.stack(centroids)


# ============================================================================
# EXPORT CALIBRATION MODEL
# ============================================================================

def export_calibration_model(
    model: BaseCalNetwork,
    output_path: Path,
    metadata: Dict
):
    """Export calibration model weights and metadata."""
    
    # Save weights as JSON (for easy loading in TypeScript)
    weights = {
        'layer_0_weight': model.network[0].weight.data.cpu().tolist(),
        'layer_0_bias': model.network[0].bias.data.cpu().tolist(),
        'layer_3_weight': model.network[3].weight.data.cpu().tolist(),
        'layer_3_bias': model.network[3].bias.data.cpu().tolist(),
        'layer_5_weight': model.network[5].weight.data.cpu().tolist(),
        'layer_5_bias': model.network[5].bias.data.cpu().tolist(),
    }
    
    output = {
        'weights': weights,
        'metadata': metadata,
        'input_features': ['fine_confidence', 'base_confidence', 'fine_entropy', 'base_entropy', 'confidence_gap']
    }
    
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)


# ============================================================================
# MAIN
# ============================================================================

def train_stage_calibration(
    stage_name: str,
    stage_dir: Path,
    base_model: BaseModelInference,
    device: torch.device
) -> Optional[Dict]:
    """Train calibration for a single stage."""
    
    print(f"\n{'='*60}")
    print(f"🎯 Training Calibration: {stage_name}")
    print(f"{'='*60}")
    
    model_path = stage_dir / "best_model.pt"
    label_map_path = stage_dir / "label_map.json"
    
    if not model_path.exists():
        print(f"  ⚠️ Model not found: {model_path}")
        return None
    
    # Load fine-tuned model
    fine_model = FineTunedModelInference(str(stage_dir), str(label_map_path), device)
    
    # Load validation data
    val_path = stage_dir / "validation.json"
    with open(val_path) as f:
        val_data = json.load(f)
    
    val_texts = [d.get('text', d.get('query', '')) for d in val_data]
    val_labels = [fine_model.label_map[d['label']] for d in val_data]
    num_classes = len(fine_model.label_map)
    
    print(f"  Classes: {num_classes}")
    print(f"  Validation samples: {len(val_texts)}")
    
    # Compute centroids for base model pseudo-predictions
    print("  Computing base model centroids...")
    train_path = stage_dir / "train.json"
    with open(train_path) as f:
        train_data = json.load(f)
    
    train_texts = [d.get('text', d.get('query', '')) for d in train_data]
    train_labels = [fine_model.label_map[d['label']] for d in train_data]
    
    centroids = compute_centroids(base_model, train_texts, train_labels, num_classes)
    centroids = centroids.to(device)
    
    # Collect calibration data
    print("  Collecting calibration features...")
    features, targets = collect_calibration_data(
        fine_model, base_model, val_texts, val_labels, centroids
    )
    
    # Train calibration model
    print("  Training calibration network...")
    cal_model, metrics = train_calibration_model(features, targets, device)
    
    print(f"  ✅ ECE: {metrics['final_ece']:.4f} | Val Loss: {metrics['final_val_loss']:.4f}")
    
    # Export
    output_dir = CALIBRATION_DIR / stage_dir.name
    output_dir.mkdir(parents=True, exist_ok=True)
    
    export_path = output_dir / "calibration.json"
    export_calibration_model(cal_model, export_path, metrics)
    
    # Also save centroids for runtime use
    centroids_path = output_dir / "base_centroids.json"
    with open(centroids_path, 'w') as f:
        json.dump(centroids.cpu().tolist(), f)
    
    return metrics


def main():
    print("🚀 FTIS BaseCal Calibration Training")
    print("   Fix overconfident predictions using base model signals")
    print("=" * 60)
    
    # Device
    if torch.backends.mps.is_available():
        device = torch.device("mps")
        print("\n🖥️  Using Apple MPS")
    elif torch.cuda.is_available():
        device = torch.device("cuda")
        print("\n🖥️  Using CUDA")
    else:
        device = torch.device("cpu")
        print("\n🖥️  Using CPU")
    
    # Initialize base model
    print("\n📚 Loading base model...")
    base_model = BaseModelInference(device)
    
    # Create calibration directory
    CALIBRATION_DIR.mkdir(exist_ok=True)
    
    results = {}
    
    # Stage 1 calibration
    stage1_dir = OUTPUT_DIR / "stage1"
    if (stage1_dir / "best_model.pt").exists():
        results['stage1'] = train_stage_calibration("Stage 1", stage1_dir, base_model, device)
    
    # Stage 2 calibrations
    stage2_dir = OUTPUT_DIR / "stage2"
    stage2_results = {}
    
    for super_dir in sorted(stage2_dir.iterdir()):
        if not super_dir.is_dir():
            continue
        if not (super_dir / "best_model.pt").exists():
            continue
        
        super_name = super_dir.name
        result = train_stage_calibration(f"Stage 2 ({super_name})", super_dir, base_model, device)
        if result:
            stage2_results[super_name] = result
    
    results['stage2'] = stage2_results
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 CALIBRATION TRAINING COMPLETE")
    print("=" * 60)
    
    if results.get('stage1'):
        print(f"\n🎯 Stage 1 ECE: {results['stage1']['final_ece']:.4f}")
    
    print("\n🎯 Stage 2 ECE by category:")
    avg_ece = 0
    count = 0
    for name, data in sorted(stage2_results.items()):
        print(f"   {name}: {data['final_ece']:.4f}")
        avg_ece += data['final_ece']
        count += 1
    
    if count > 0:
        avg_ece /= count
        print(f"\n   Average ECE: {avg_ece:.4f}")
    
    # Save overall results
    with open(CALIBRATION_DIR / "calibration_results.json", 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\n✅ Calibration models saved to {CALIBRATION_DIR}")


if __name__ == "__main__":
    main()
