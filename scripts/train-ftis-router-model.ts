#!/usr/bin/env npx tsx
/**
 * FTIS Router Model Training Pipeline
 *
 * Trains a new ONNX router model for 100% FTIS coverage.
 *
 * Pipeline:
 * 1. Generate 150K+ synthetic training examples
 * 2. Train a SentenceTransformer-based classifier
 * 3. Export to ONNX format
 * 4. Validate accuracy on held-out test set
 * 5. Update label_map.json
 *
 * Requirements:
 *   pip install transformers torch onnx onnxruntime sentence-transformers scikit-learn
 *
 * Usage:
 *   npx tsx scripts/train-ftis-router-model.ts
 *   npx tsx scripts/train-ftis-router-model.ts --examples-per-tool 200
 *   npx tsx scripts/train-ftis-router-model.ts --dry-run
 *
 * @module scripts/train-ftis-router-model
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { execSync, spawn } from 'child_process';
import { performance } from 'perf_hooks';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

interface TrainingConfig {
  examplesPerTool: number;
  hardNegativeRatio: number;
  trainSplit: number;
  validationSplit: number;
  testSplit: number;
  modelName: string;
  maxLength: number;
  batchSize: number;
  epochs: number;
  learningRate: number;
  outputDir: string;
  dryRun: boolean;
}

const DEFAULT_CONFIG: TrainingConfig = {
  examplesPerTool: 150, // 150 examples × 886 tools = 132,900 examples
  hardNegativeRatio: 0.1, // 10% hard negatives
  trainSplit: 0.8,
  validationSplit: 0.1,
  testSplit: 0.1,
  modelName: 'sentence-transformers/all-MiniLM-L6-v2', // Fast, good quality
  maxLength: 128,
  batchSize: 64,
  epochs: 3,
  learningRate: 2e-5,
  outputDir: './models/ftis-router-v2',
  dryRun: false,
};

// ============================================================================
// TOOL DEFINITIONS (from domain bridge)
// ============================================================================

interface ToolDefinition {
  id: string;
  category: string;
  description: string;
  examples: string[];
  keywords: string[];
}

// Load all semantic tool IDs from domain bridge
async function loadToolDefinitions(): Promise<ToolDefinition[]> {
  const { getAllMappings, getMappingStats } = await import(
    '../src/tools/semantic-router/domain-bridge.js'
  );

  const stats = getMappingStats();
  console.log(`📦 Loading ${stats.totalMappings} tools from domain bridge...`);

  const allMappings = getAllMappings();
  const tools: ToolDefinition[] = [];

  for (const [semanticId, mapping] of Object.entries(allMappings)) {
    // Extract category from semantic ID (e.g., "music_play" → "music")
    const category = semanticId.split('_')[0];

    tools.push({
      id: semanticId,
      category,
      description: `Tool for ${semanticId.replace(/_/g, ' ')}`,
      examples: generateBaseExamples(semanticId, category),
      keywords: extractKeywords(semanticId),
    });
  }

  return tools;
}

function generateBaseExamples(toolId: string, category: string): string[] {
  // Generate base examples from tool ID
  const readable = toolId.replace(/_/g, ' ');
  return [
    readable,
    `I want to ${readable}`,
    `Can you ${readable}`,
    `Please ${readable}`,
    `Help me ${readable}`,
  ];
}

function extractKeywords(toolId: string): string[] {
  return toolId.split('_').filter((w) => w.length > 2);
}

// ============================================================================
// QUERY TEMPLATES (Expanded for 150K examples)
// ============================================================================

const QUERY_TEMPLATES = {
  // Direct commands
  direct: [
    '{action}',
    '{action} please',
    '{action} now',
    'just {action}',
    'quickly {action}',
    'go ahead and {action}',
  ],

  // Polite requests
  polite: [
    'can you {action}',
    'could you {action}',
    'would you {action}',
    'will you {action}',
    'please {action}',
    'can you please {action}',
    'could you please {action}',
    'would you mind {action}',
    "i'd appreciate if you could {action}",
  ],

  // Desire expressions
  desire: [
    'I want to {action}',
    'I need to {action}',
    "I'd like to {action}",
    'I would like to {action}',
    'I wanna {action}',
    'I gotta {action}',
    "let's {action}",
    'time to {action}',
  ],

  // Questions
  questions: [
    'how do I {action}',
    'can I {action}',
    'is it possible to {action}',
    'what if I want to {action}',
    'help me {action}',
    'show me how to {action}',
  ],

  // Casual
  casual: [
    'yo {action}',
    'hey {action}',
    'ok {action}',
    'alright {action}',
    'so {action}',
    'um {action}',
    'uh {action}',
  ],

  // Context-aware
  contextual: [
    "I'm trying to {action}",
    'I was hoping to {action}',
    'I thought maybe I could {action}',
    'actually {action}',
    'wait {action}',
    'oh {action}',
    'hmm {action}',
  ],
};

// Action variations for different tool categories
const CATEGORY_ACTIONS: Record<string, string[]> = {
  music: [
    'play music',
    'play some music',
    'put on music',
    'start playing',
    'play tunes',
    'play songs',
    'play a song',
    'play something',
    'listen to music',
    'hear some music',
  ],
  weather: [
    'check the weather',
    'get the weather',
    "what's the weather",
    'weather update',
    'weather forecast',
    'tell me the weather',
    'how is the weather',
  ],
  calendar: [
    'check my calendar',
    'show my schedule',
    "what's on my calendar",
    'my appointments',
    'schedule an event',
    'create an event',
    'add to calendar',
    'calendar check',
  ],
  alarm: [
    'set an alarm',
    'create an alarm',
    'wake me up',
    'alarm for',
    'set alarm',
    'make an alarm',
    'new alarm',
  ],
  timer: [
    'set a timer',
    'start a timer',
    'timer for',
    'countdown',
    'set timer',
    'make a timer',
  ],
  reminder: [
    'remind me',
    'set a reminder',
    'create a reminder',
    'reminder to',
    'remember to',
    "don't let me forget",
    'make sure I',
  ],
  habit: [
    'track my habit',
    'log my habit',
    'mark habit done',
    'complete my habit',
    'habit check',
    'did my habit',
    'habit progress',
  ],
  call: [
    'call',
    'phone',
    'dial',
    'ring',
    'make a call to',
    'call someone',
    'phone call',
  ],
  message: [
    'send a message',
    'text',
    'message',
    'send text',
    'write a message',
    'compose message',
  ],
  handoff: [
    'talk to',
    'switch to',
    'transfer to',
    'hand off to',
    'let me speak with',
    'connect me to',
    'I want to talk to',
  ],
  research: [
    'research',
    'look up',
    'find out about',
    'search for',
    'investigate',
    'learn about',
    'tell me about',
  ],
  crisis: [
    'help me calm down',
    "I'm not okay",
    'need support',
    'crisis',
    'emergency',
    'panic',
    "I can't breathe",
    "I'm struggling",
  ],
  home: [
    'turn on lights',
    'turn off lights',
    'set temperature',
    'adjust thermostat',
    'lock door',
    'unlock door',
    'smart home',
  ],
  game: [
    'play a game',
    'start a game',
    'game time',
    'trivia',
    'quiz me',
    "let's play",
    'game',
  ],
  list: [
    'add to list',
    'add to my list',
    'put on my list',
    'grocery list',
    'shopping list',
    'todo list',
    'make a list',
  ],
  health: [
    'track exercise',
    'log workout',
    'health check',
    'how am I doing',
    'wellness',
    'hydration',
    'sleep tracking',
  ],
  finance: [
    'budget',
    'expenses',
    'spending',
    'bills',
    'savings',
    'money',
    'financial',
  ],
  travel: [
    'book a flight',
    'find hotels',
    'plan a trip',
    'travel plans',
    'vacation',
    'directions',
  ],
};

// ============================================================================
// SYNTHETIC DATA GENERATION
// ============================================================================

interface TrainingExample {
  query: string;
  label: string;
  category: string;
}

function generateExamplesForTool(
  tool: ToolDefinition,
  count: number
): TrainingExample[] {
  const examples: TrainingExample[] = [];
  const allTemplates = Object.values(QUERY_TEMPLATES).flat();

  // Get category-specific actions or fall back to tool keywords
  const actions =
    CATEGORY_ACTIONS[tool.category] ||
    tool.keywords.map((k) => k + ' ' + tool.keywords.join(' '));

  let generated = 0;

  while (generated < count) {
    for (const action of actions) {
      if (generated >= count) break;

      // Use base action
      examples.push({
        query: action,
        label: tool.id,
        category: tool.category,
      });
      generated++;

      // Apply templates
      for (const template of allTemplates) {
        if (generated >= count) break;

        const query = template.replace('{action}', action);
        examples.push({
          query,
          label: tool.id,
          category: tool.category,
        });
        generated++;
      }
    }

    // Add variations with typos, filler words, etc.
    if (generated < count) {
      for (const action of actions) {
        if (generated >= count) break;

        // Add filler words
        const fillers = ['um', 'uh', 'like', 'you know', 'so', 'well'];
        const filler = fillers[Math.floor(Math.random() * fillers.length)];
        examples.push({
          query: `${filler} ${action}`,
          label: tool.id,
          category: tool.category,
        });
        generated++;

        // Add context
        const contexts = [
          'actually',
          'wait',
          'oh',
          'hey',
          'ok so',
          'alright',
        ];
        const context = contexts[Math.floor(Math.random() * contexts.length)];
        examples.push({
          query: `${context} ${action}`,
          label: tool.id,
          category: tool.category,
        });
        generated++;
      }
    }
  }

  return examples.slice(0, count);
}

function generateHardNegatives(
  tools: ToolDefinition[],
  count: number
): TrainingExample[] {
  // Hard negatives are queries that look like they might be tool calls but aren't
  const hardNegatives: TrainingExample[] = [];

  const conversationalQueries = [
    'how are you',
    "how's it going",
    'what do you think',
    'tell me a story',
    "I'm bored",
    'what should I do',
    'I had a bad day',
    'thanks for listening',
    'you know what',
    "I've been thinking",
    'so anyway',
    'that reminds me',
    'speaking of which',
    'by the way',
    "what's your opinion",
    'do you agree',
    "I'm not sure",
    'maybe',
    'I guess',
    'whatever',
    "let's chat",
    'just talking',
    "I'm feeling",
    'how do you feel about',
    'interesting',
    'cool',
    'nice',
    'awesome',
    'great',
    'okay',
    "that's fine",
    "I understand",
    'makes sense',
    'got it',
    'sure',
    'yeah',
    'yep',
    'nope',
    'no thanks',
    "I'm good",
  ];

  // Add conversational queries as "conversation" label
  for (const query of conversationalQueries) {
    if (hardNegatives.length >= count) break;
    hardNegatives.push({
      query,
      label: '__conversation__',
      category: 'conversation',
    });

    // Add variations
    const variations = [
      `hey ${query}`,
      `um ${query}`,
      `so ${query}`,
      `well ${query}`,
    ];
    for (const v of variations) {
      if (hardNegatives.length >= count) break;
      hardNegatives.push({
        query: v,
        label: '__conversation__',
        category: 'conversation',
      });
    }
  }

  // Add ambiguous queries
  const ambiguous = [
    'play', // Could be music or game
    'check', // Could be many things
    'set', // Alarm, timer, reminder
    'help', // Crisis or general
    'tell me', // Info or conversation
    'show me', // Many things
    'what', // Question or command
    'how', // Question or command
  ];

  for (const query of ambiguous) {
    if (hardNegatives.length >= count) break;
    hardNegatives.push({
      query,
      label: '__ambiguous__',
      category: 'ambiguous',
    });
  }

  return hardNegatives.slice(0, count);
}

// ============================================================================
// TRAINING SCRIPT GENERATOR
// ============================================================================

function generatePythonTrainingScript(config: TrainingConfig): string {
  return `#!/usr/bin/env python3
"""
FTIS Router Model Training Script
Generated by train-ftis-router-model.ts

This script trains a SentenceTransformer-based classifier for tool routing.
"""

import json
import os
import sys
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset
from transformers import AutoTokenizer, AutoModel, get_linear_schedule_with_warmup
from sklearn.metrics import accuracy_score, classification_report
import onnx
from onnxruntime.quantization import quantize_dynamic, QuantType

# ============================================================================
# CONFIG
# ============================================================================

MODEL_NAME = "${config.modelName}"
MAX_LENGTH = ${config.maxLength}
BATCH_SIZE = ${config.batchSize}
EPOCHS = ${config.epochs}
LEARNING_RATE = ${config.learningRate}
OUTPUT_DIR = "${config.outputDir}"

# ============================================================================
# DATASET
# ============================================================================

class ToolRoutingDataset(Dataset):
    def __init__(self, examples, tokenizer, label2id, max_length=128):
        self.examples = examples
        self.tokenizer = tokenizer
        self.label2id = label2id
        self.max_length = max_length

    def __len__(self):
        return len(self.examples)

    def __getitem__(self, idx):
        example = self.examples[idx]
        encoding = self.tokenizer(
            example["query"],
            max_length=self.max_length,
            padding="max_length",
            truncation=True,
            return_tensors="pt"
        )
        return {
            "input_ids": encoding["input_ids"].squeeze(),
            "attention_mask": encoding["attention_mask"].squeeze(),
            "label": torch.tensor(self.label2id[example["label"]])
        }

# ============================================================================
# MODEL
# ============================================================================

class ToolRouterModel(nn.Module):
    def __init__(self, model_name, num_labels):
        super().__init__()
        self.encoder = AutoModel.from_pretrained(model_name)
        self.dropout = nn.Dropout(0.1)
        self.classifier = nn.Linear(self.encoder.config.hidden_size, num_labels)

    def forward(self, input_ids, attention_mask):
        outputs = self.encoder(input_ids=input_ids, attention_mask=attention_mask)
        # Mean pooling
        token_embeddings = outputs.last_hidden_state
        input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
        pooled = torch.sum(token_embeddings * input_mask_expanded, 1) / torch.clamp(input_mask_expanded.sum(1), min=1e-9)
        pooled = self.dropout(pooled)
        logits = self.classifier(pooled)
        return logits

# ============================================================================
# TRAINING
# ============================================================================

def train():
    print("🚀 FTIS Router Model Training")
    print("=" * 60)

    # Load data
    print("\\n📦 Loading training data...")
    train_data = json.loads(Path("${config.outputDir}/train.json").read_text())
    val_data = json.loads(Path("${config.outputDir}/validation.json").read_text())
    test_data = json.loads(Path("${config.outputDir}/test.json").read_text())
    label_map = json.loads(Path("${config.outputDir}/label_map.json").read_text())

    label2id = label_map
    id2label = {v: k for k, v in label_map.items()}
    num_labels = len(label_map)

    print(f"  Train: {len(train_data):,} examples")
    print(f"  Validation: {len(val_data):,} examples")
    print(f"  Test: {len(test_data):,} examples")
    print(f"  Labels: {num_labels}")

    # Tokenizer
    print("\\n🔤 Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

    # Datasets
    train_dataset = ToolRoutingDataset(train_data, tokenizer, label2id, MAX_LENGTH)
    val_dataset = ToolRoutingDataset(val_data, tokenizer, label2id, MAX_LENGTH)
    test_dataset = ToolRoutingDataset(test_data, tokenizer, label2id, MAX_LENGTH)

    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=BATCH_SIZE)
    test_loader = DataLoader(test_dataset, batch_size=BATCH_SIZE)

    # Model
    print("\\n🧠 Initializing model...")
    device = torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")
    print(f"  Device: {device}")

    model = ToolRouterModel(MODEL_NAME, num_labels)
    model.to(device)

    # Optimizer
    optimizer = torch.optim.AdamW(model.parameters(), lr=LEARNING_RATE)
    total_steps = len(train_loader) * EPOCHS
    scheduler = get_linear_schedule_with_warmup(optimizer, num_warmup_steps=int(total_steps * 0.1), num_training_steps=total_steps)
    criterion = nn.CrossEntropyLoss()

    # Training loop
    print("\\n🏋️ Training...")
    best_val_acc = 0

    for epoch in range(EPOCHS):
        model.train()
        total_loss = 0
        correct = 0
        total = 0

        for batch_idx, batch in enumerate(train_loader):
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["label"].to(device)

            optimizer.zero_grad()
            logits = model(input_ids, attention_mask)
            loss = criterion(logits, labels)
            loss.backward()
            optimizer.step()
            scheduler.step()

            total_loss += loss.item()
            preds = torch.argmax(logits, dim=1)
            correct += (preds == labels).sum().item()
            total += labels.size(0)

            if batch_idx % 100 == 0:
                print(f"  Epoch {epoch+1}/{EPOCHS} | Batch {batch_idx}/{len(train_loader)} | Loss: {loss.item():.4f}")

        train_acc = correct / total
        avg_loss = total_loss / len(train_loader)
        print(f"  Epoch {epoch+1} complete | Loss: {avg_loss:.4f} | Train Acc: {train_acc:.4f}")

        # Validation
        model.eval()
        val_preds = []
        val_labels = []

        with torch.no_grad():
            for batch in val_loader:
                input_ids = batch["input_ids"].to(device)
                attention_mask = batch["attention_mask"].to(device)
                labels = batch["label"]

                logits = model(input_ids, attention_mask)
                preds = torch.argmax(logits, dim=1).cpu().numpy()
                val_preds.extend(preds)
                val_labels.extend(labels.numpy())

        val_acc = accuracy_score(val_labels, val_preds)
        print(f"  Validation Accuracy: {val_acc:.4f}")

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(model.state_dict(), f"{OUTPUT_DIR}/best_model.pt")
            print(f"  ✅ Best model saved!")

    # Test evaluation
    print("\\n📊 Final Test Evaluation...")
    model.load_state_dict(torch.load(f"{OUTPUT_DIR}/best_model.pt"))
    model.eval()

    test_preds = []
    test_labels = []

    with torch.no_grad():
        for batch in test_loader:
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["label"]

            logits = model(input_ids, attention_mask)
            preds = torch.argmax(logits, dim=1).cpu().numpy()
            test_preds.extend(preds)
            test_labels.extend(labels.numpy())

    test_acc = accuracy_score(test_labels, test_preds)
    print(f"\\n🎯 Test Accuracy: {test_acc:.4f}")

    # Classification report (top 20 most common)
    print("\\n📋 Classification Report (sample):")
    print(classification_report(test_labels, test_preds, target_names=[id2label[i] for i in range(min(20, num_labels))], labels=list(range(min(20, num_labels)))))

    # Export to ONNX
    print("\\n📦 Exporting to ONNX...")
    model.cpu()
    model.eval()

    dummy_input = tokenizer("play some music", return_tensors="pt", max_length=MAX_LENGTH, padding="max_length", truncation=True)

    torch.onnx.export(
        model,
        (dummy_input["input_ids"], dummy_input["attention_mask"]),
        f"{OUTPUT_DIR}/ferni-router.onnx",
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch_size"},
            "attention_mask": {0: "batch_size"},
            "logits": {0: "batch_size"}
        },
        opset_version=14
    )

    # Quantize for faster inference
    print("  Quantizing model...")
    quantize_dynamic(
        f"{OUTPUT_DIR}/ferni-router.onnx",
        f"{OUTPUT_DIR}/ferni-router-quantized.onnx",
        weight_type=QuantType.QUInt8
    )

    # Verify ONNX
    print("  Verifying ONNX model...")
    onnx_model = onnx.load(f"{OUTPUT_DIR}/ferni-router-quantized.onnx")
    onnx.checker.check_model(onnx_model)

    print(f"\\n✅ Training complete!")
    print(f"  Model: {OUTPUT_DIR}/ferni-router-quantized.onnx")
    print(f"  Test Accuracy: {test_acc:.4f}")
    print(f"  Labels: {num_labels}")

    # Save metadata
    metadata = {
        "model_name": MODEL_NAME,
        "num_labels": num_labels,
        "max_length": MAX_LENGTH,
        "test_accuracy": test_acc,
        "best_val_accuracy": best_val_acc,
        "epochs": EPOCHS,
        "batch_size": BATCH_SIZE,
        "learning_rate": LEARNING_RATE
    }
    Path(f"{OUTPUT_DIR}/metadata.json").write_text(json.dumps(metadata, indent=2))

if __name__ == "__main__":
    train()
`;
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     FTIS ROUTER MODEL TRAINING PIPELINE - 100% COVERAGE    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');

  // Parse args
  const args = process.argv.slice(2);
  const config: TrainingConfig = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--examples-per-tool' && args[i + 1]) {
      config.examplesPerTool = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--dry-run') {
      config.dryRun = true;
    } else if (args[i] === '--epochs' && args[i + 1]) {
      config.epochs = parseInt(args[i + 1], 10);
      i++;
    }
  }

  // Load tools
  console.log('📦 Step 1: Loading tool definitions...');
  const tools = await loadToolDefinitions();
  console.log(`   ✅ Loaded ${tools.length} tools\n`);

  // Calculate totals
  const totalExamples = tools.length * config.examplesPerTool;
  const hardNegativeCount = Math.floor(totalExamples * config.hardNegativeRatio);
  const totalWithNegatives = totalExamples + hardNegativeCount;

  console.log('📊 Training Configuration:');
  console.log('─'.repeat(50));
  console.log(`   Tools:              ${tools.length}`);
  console.log(`   Examples/Tool:      ${config.examplesPerTool}`);
  console.log(`   Total Examples:     ${totalExamples.toLocaleString()}`);
  console.log(`   Hard Negatives:     ${hardNegativeCount.toLocaleString()}`);
  console.log(`   Grand Total:        ${totalWithNegatives.toLocaleString()}`);
  console.log(`   Train Split:        ${(config.trainSplit * 100).toFixed(0)}%`);
  console.log(`   Validation Split:   ${(config.validationSplit * 100).toFixed(0)}%`);
  console.log(`   Test Split:         ${(config.testSplit * 100).toFixed(0)}%`);
  console.log(`   Model:              ${config.modelName}`);
  console.log(`   Epochs:             ${config.epochs}`);
  console.log(`   Output:             ${config.outputDir}`);
  console.log('');

  if (config.dryRun) {
    console.log('🔍 DRY RUN - No files will be written\n');
    return;
  }

  // Create output directory
  if (!existsSync(config.outputDir)) {
    mkdirSync(config.outputDir, { recursive: true });
  }

  // Generate training data
  console.log('🔄 Step 2: Generating synthetic training data...');
  const startGen = performance.now();

  const allExamples: TrainingExample[] = [];
  const labelMap: Record<string, number> = {};

  // Generate examples for each tool
  let labelIndex = 0;
  for (const tool of tools) {
    const examples = generateExamplesForTool(tool, config.examplesPerTool);
    allExamples.push(...examples);

    if (!(tool.id in labelMap)) {
      labelMap[tool.id] = labelIndex++;
    }

    if (labelIndex % 100 === 0) {
      process.stdout.write(`   Processing tool ${labelIndex}/${tools.length}...\r`);
    }
  }

  // Add hard negatives
  const hardNegatives = generateHardNegatives(tools, hardNegativeCount);
  allExamples.push(...hardNegatives);

  // Add special labels
  labelMap['__conversation__'] = labelIndex++;
  labelMap['__ambiguous__'] = labelIndex++;

  console.log(`   ✅ Generated ${allExamples.length.toLocaleString()} examples in ${((performance.now() - startGen) / 1000).toFixed(1)}s\n`);

  // Shuffle and split
  console.log('🔀 Step 3: Shuffling and splitting data...');

  // Fisher-Yates shuffle
  for (let i = allExamples.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allExamples[i], allExamples[j]] = [allExamples[j], allExamples[i]];
  }

  const trainEnd = Math.floor(allExamples.length * config.trainSplit);
  const valEnd = trainEnd + Math.floor(allExamples.length * config.validationSplit);

  const trainData = allExamples.slice(0, trainEnd);
  const valData = allExamples.slice(trainEnd, valEnd);
  const testData = allExamples.slice(valEnd);

  console.log(`   Train:      ${trainData.length.toLocaleString()} examples`);
  console.log(`   Validation: ${valData.length.toLocaleString()} examples`);
  console.log(`   Test:       ${testData.length.toLocaleString()} examples\n`);

  // Write data files
  console.log('💾 Step 4: Writing data files...');

  writeFileSync(
    path.join(config.outputDir, 'train.json'),
    JSON.stringify(trainData, null, 2)
  );
  writeFileSync(
    path.join(config.outputDir, 'validation.json'),
    JSON.stringify(valData, null, 2)
  );
  writeFileSync(
    path.join(config.outputDir, 'test.json'),
    JSON.stringify(testData, null, 2)
  );
  writeFileSync(
    path.join(config.outputDir, 'label_map.json'),
    JSON.stringify(labelMap, null, 2)
  );

  console.log(`   ✅ Data files written to ${config.outputDir}\n`);

  // Generate Python training script
  console.log('🐍 Step 5: Generating Python training script...');

  const pythonScript = generatePythonTrainingScript(config);
  const scriptPath = path.join(config.outputDir, 'train.py');
  writeFileSync(scriptPath, pythonScript);
  execSync(`chmod +x ${scriptPath}`);

  console.log(`   ✅ Training script: ${scriptPath}\n`);

  // Summary
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    GENERATION COMPLETE                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n');
  console.log('📁 Output Files:');
  console.log(`   ${config.outputDir}/train.json        (${trainData.length.toLocaleString()} examples)`);
  console.log(`   ${config.outputDir}/validation.json   (${valData.length.toLocaleString()} examples)`);
  console.log(`   ${config.outputDir}/test.json         (${testData.length.toLocaleString()} examples)`);
  console.log(`   ${config.outputDir}/label_map.json    (${Object.keys(labelMap).length} labels)`);
  console.log(`   ${config.outputDir}/train.py          (training script)`);
  console.log('\n');
  console.log('🚀 Next Steps:');
  console.log('   1. Install Python dependencies:');
  console.log('      pip install transformers torch onnx onnxruntime sentence-transformers scikit-learn');
  console.log('\n');
  console.log('   2. Run training:');
  console.log(`      python ${scriptPath}`);
  console.log('\n');
  console.log('   3. Copy trained model to production:');
  console.log(`      cp ${config.outputDir}/ferni-router-quantized.onnx models/ferni-router.onnx`);
  console.log(`      cp ${config.outputDir}/label_map.json models/label_map.json`);
  console.log('\n');
  console.log('   4. Deploy with FTIS_ONLY_MODE=true');
  console.log('\n');

  // Estimate training time
  const estimatedMinutes = Math.ceil((totalWithNegatives / 10000) * config.epochs * 2);
  console.log(`⏱️  Estimated training time: ~${estimatedMinutes} minutes (on GPU)`);
  console.log('   (CPU training will be 5-10x slower)\n');
}

main().catch((error) => {
  console.error('💥 Error:', error);
  process.exit(1);
});
