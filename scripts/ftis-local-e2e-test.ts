#!/usr/bin/env npx tsx
/**
 * FTIS Local E2E Test
 *
 * Tests the hierarchical classification system end-to-end:
 * 1. Stage 1: Super-category classification
 * 2. Stage 2: Fine-category classification
 * 3. Tool mapping
 * 4. Optional: Gemini fallback for low confidence
 *
 * Usage: npx tsx scripts/ftis-local-e2e-test.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as ort from 'onnxruntime-node';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// CONFIGURATION
// ============================================================================

const MODELS_DIR = path.join(__dirname, '..', 'models', 'ftis-merged');
const CONFIDENCE_THRESHOLD = 0.85;

// Test queries covering all super-categories
const TEST_QUERIES = [
  // Media
  { query: "Play some jazz music", expectedSuper: "media", expectedFine: "play_music" },
  { query: "What song is this?", expectedSuper: "media", expectedFine: "music_control" },
  { query: "Tell me a joke", expectedSuper: "media", expectedFine: "joke" },
  
  // Calendar
  { query: "Set an alarm for 7am", expectedSuper: "calendar", expectedFine: "alarm_set" },
  { query: "What's on my calendar today?", expectedSuper: "calendar", expectedFine: "calendar_view" },
  { query: "Remind me to call mom at 5pm", expectedSuper: "calendar", expectedFine: "reminder_set" },
  
  // Productivity
  { query: "Add milk to my shopping list", expectedSuper: "productivity", expectedFine: "item_add" },
  { query: "Save this idea for later", expectedSuper: "productivity", expectedFine: "save_info" },
  { query: "What are my priorities today?", expectedSuper: "productivity", expectedFine: "priorities" },
  { query: "I'm grateful for my family", expectedSuper: "productivity", expectedFine: "reflection" },
  
  // Communication
  { query: "Call John", expectedSuper: "communication", expectedFine: "call_make" },
  { query: "Send a text to Sarah", expectedSuper: "communication", expectedFine: "message_send" },
  { query: "Read my emails", expectedSuper: "communication", expectedFine: "email_read" },
  
  // Health
  { query: "I did my morning run", expectedSuper: "health", expectedFine: "activity_log" },
  { query: "Log 8 glasses of water", expectedSuper: "health", expectedFine: "hydration_nutrition" },
  { query: "How's my sleep been?", expectedSuper: "health", expectedFine: "sleep" },
  { query: "Start my morning routine", expectedSuper: "health", expectedFine: "routine_run" },
  
  // Emotional
  { query: "I'm feeling anxious", expectedSuper: "emotional", expectedFine: "calm_support" },
  { query: "I need help with grief", expectedSuper: "emotional", expectedFine: "grief_support" },
  { query: "I feel like a fraud at work", expectedSuper: "emotional", expectedFine: "self_worth" },
  { query: "Motivate me", expectedSuper: "emotional", expectedFine: "coaching_motivation" },
  
  // Home
  { query: "Turn on the lights", expectedSuper: "home", expectedFine: "lights" },
  { query: "Set the thermostat to 72", expectedSuper: "home", expectedFine: "thermostat" },
  
  // Travel
  { query: "What's the weather like?", expectedSuper: "travel", expectedFine: "weather" },
  { query: "Get me directions to the airport", expectedSuper: "travel", expectedFine: "directions" },
  { query: "Find flights to New York", expectedSuper: "travel", expectedFine: "flights" },
  
  // Finance
  { query: "What's my budget for this month?", expectedSuper: "finance", expectedFine: "budget" },
  { query: "When are my bills due?", expectedSuper: "finance", expectedFine: "bills" },
  
  // System
  { query: "Transfer me to Maya", expectedSuper: "system", expectedFine: "handoff_maya" },
  { query: "What time is it?", expectedSuper: "system", expectedFine: "time" },
  { query: "What can you do?", expectedSuper: "system", expectedFine: "capabilities" },
];

// ============================================================================
// TOKENIZER (Simple whitespace-based for testing)
// ============================================================================

interface Tokenizer {
  encode: (text: string) => { input_ids: bigint[]; attention_mask: bigint[] };
}

async function loadTokenizer(modelDir: string): Promise<Tokenizer> {
  const tokenizerPath = path.join(modelDir, 'tokenizer.json');
  
  try {
    const tokenizerJson = JSON.parse(await fs.readFile(tokenizerPath, 'utf-8'));
    const vocab = tokenizerJson.model?.vocab || {};
    
    // Create word to id mapping
    const wordToId = new Map<string, number>();
    for (const [word, id] of Object.entries(vocab)) {
      wordToId.set(word.toLowerCase(), id as number);
    }
    
    const padId = wordToId.get('[PAD]') || 0;
    const unkId = wordToId.get('[UNK]') || 100;
    const clsId = wordToId.get('[CLS]') || 101;
    const sepId = wordToId.get('[SEP]') || 102;
    
    return {
      encode: (text: string) => {
        const words = text.toLowerCase().split(/\s+/);
        const ids: bigint[] = [BigInt(clsId)];
        
        for (const word of words) {
          // Simple subword tokenization
          let found = false;
          if (wordToId.has(word)) {
            ids.push(BigInt(wordToId.get(word)!));
            found = true;
          } else {
            // Try subwords
            for (let i = word.length; i > 0; i--) {
              const sub = word.slice(0, i);
              if (wordToId.has(sub)) {
                ids.push(BigInt(wordToId.get(sub)!));
                found = true;
                break;
              }
            }
          }
          if (!found) {
            ids.push(BigInt(unkId));
          }
        }
        
        ids.push(BigInt(sepId));
        
        // Pad to 64 tokens
        const maxLen = 64;
        while (ids.length < maxLen) {
          ids.push(BigInt(padId));
        }
        if (ids.length > maxLen) {
          ids.length = maxLen;
          ids[maxLen - 1] = BigInt(sepId);
        }
        
        const attentionMask = ids.map(id => id !== BigInt(padId) ? BigInt(1) : BigInt(0));
        
        return { input_ids: ids, attention_mask: attentionMask };
      }
    };
  } catch (error) {
    console.error('Failed to load tokenizer, using fallback');
    // Fallback tokenizer
    return {
      encode: (text: string) => {
        const ids = new Array(64).fill(BigInt(0));
        const mask = new Array(64).fill(BigInt(0));
        ids[0] = BigInt(101); // CLS
        mask[0] = BigInt(1);
        
        const words = text.toLowerCase().split(/\s+/).slice(0, 62);
        for (let i = 0; i < words.length; i++) {
          ids[i + 1] = BigInt(1000 + (words[i].charCodeAt(0) || 0));
          mask[i + 1] = BigInt(1);
        }
        ids[words.length + 1] = BigInt(102); // SEP
        mask[words.length + 1] = BigInt(1);
        
        return { input_ids: ids, attention_mask: mask };
      }
    };
  }
}

// ============================================================================
// MODEL INFERENCE
// ============================================================================

interface ClassificationResult {
  label: string;
  confidence: number;
  allScores: Record<string, number>;
}

async function loadModel(modelPath: string): Promise<ort.InferenceSession> {
  return await ort.InferenceSession.create(modelPath);
}

async function classify(
  session: ort.InferenceSession,
  tokenizer: Tokenizer,
  text: string,
  labelMap: Record<string, number>
): Promise<ClassificationResult> {
  const { input_ids, attention_mask } = tokenizer.encode(text);
  
  const inputIdsTensor = new ort.Tensor('int64', input_ids, [1, 64]);
  const attentionMaskTensor = new ort.Tensor('int64', attention_mask, [1, 64]);
  
  const feeds = {
    input_ids: inputIdsTensor,
    attention_mask: attentionMaskTensor,
  };
  
  const results = await session.run(feeds);
  const logits = results.logits?.data as Float32Array;
  
  // Softmax
  const maxLogit = Math.max(...logits);
  const expLogits = Array.from(logits).map(l => Math.exp(l - maxLogit));
  const sumExp = expLogits.reduce((a, b) => a + b, 0);
  const probs = expLogits.map(e => e / sumExp);
  
  // Get label names
  const idToLabel = Object.fromEntries(
    Object.entries(labelMap).map(([k, v]) => [v, k])
  );
  
  // Find best
  let bestIdx = 0;
  let bestProb = probs[0];
  for (let i = 1; i < probs.length; i++) {
    if (probs[i] > bestProb) {
      bestProb = probs[i];
      bestIdx = i;
    }
  }
  
  const allScores: Record<string, number> = {};
  for (let i = 0; i < probs.length; i++) {
    allScores[idToLabel[i] || `unknown_${i}`] = probs[i];
  }
  
  return {
    label: idToLabel[bestIdx] || `unknown_${bestIdx}`,
    confidence: bestProb,
    allScores,
  };
}

// ============================================================================
// MAIN TEST
// ============================================================================

async function main() {
  console.log('🧪 FTIS Local E2E Test\n');
  console.log('='.repeat(80));
  
  // Check if models exist
  try {
    await fs.access(path.join(MODELS_DIR, 'stage1', 'model.onnx'));
  } catch {
    console.error('❌ Models not found at', MODELS_DIR);
    console.error('   Run training first: cd models/ftis-merged && python train_all.py');
    process.exit(1);
  }
  
  // Load Stage 1 model
  console.log('\n📦 Loading Stage 1 model...');
  const stage1Model = await loadModel(path.join(MODELS_DIR, 'stage1', 'model.onnx'));
  const stage1LabelMap: Record<string, number> = JSON.parse(
    await fs.readFile(path.join(MODELS_DIR, 'stage1', 'label_map.json'), 'utf-8')
  );
  const stage1Tokenizer = await loadTokenizer(path.join(MODELS_DIR, 'stage1'));
  console.log('   ✓ Stage 1 loaded with', Object.keys(stage1LabelMap).length, 'super-categories');
  
  // Load Stage 2 models
  console.log('\n📦 Loading Stage 2 models...');
  const stage2Models: Record<string, { session: ort.InferenceSession; labelMap: Record<string, number>; tokenizer: Tokenizer }> = {};
  
  const superCategories = Object.keys(stage1LabelMap);
  for (const superCat of superCategories) {
    const modelPath = path.join(MODELS_DIR, 'stage2', superCat, 'model.onnx');
    try {
      await fs.access(modelPath);
      const session = await loadModel(modelPath);
      const labelMap = JSON.parse(
        await fs.readFile(path.join(MODELS_DIR, 'stage2', superCat, 'label_map.json'), 'utf-8')
      );
      const tokenizer = await loadTokenizer(path.join(MODELS_DIR, 'stage2', superCat));
      stage2Models[superCat] = { session, labelMap, tokenizer };
      console.log(`   ✓ ${superCat}: ${Object.keys(labelMap).length} fine categories`);
    } catch (error) {
      console.log(`   ✗ ${superCat}: model not found`);
    }
  }
  
  // Load tool mapping
  console.log('\n📦 Loading tool mapping...');
  const categoryToTools: Record<string, string[]> = JSON.parse(
    await fs.readFile(path.join(MODELS_DIR, 'category_to_tools.json'), 'utf-8')
  );
  console.log('   ✓ Loaded mapping for', Object.keys(categoryToTools).length, 'categories');
  
  // Run tests
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Running Classification Tests\n');
  
  let correct = 0;
  let total = 0;
  let correctSuper = 0;
  let lowConfidence = 0;
  
  for (const test of TEST_QUERIES) {
    total++;
    
    // Stage 1: Super-category
    const stage1Result = await classify(stage1Model, stage1Tokenizer, test.query, stage1LabelMap);
    const predictedSuper = stage1Result.label;
    const superCorrect = predictedSuper === test.expectedSuper;
    if (superCorrect) correctSuper++;
    
    // Stage 2: Fine category
    let predictedFine = 'unknown';
    let fineConfidence = 0;
    let fineCorrect = false;
    
    if (stage2Models[predictedSuper]) {
      const { session, labelMap, tokenizer } = stage2Models[predictedSuper];
      const stage2Result = await classify(session, tokenizer, test.query, labelMap);
      predictedFine = stage2Result.label;
      fineConfidence = stage2Result.confidence;
      fineCorrect = predictedFine === test.expectedFine;
    }
    
    if (superCorrect && fineCorrect) correct++;
    if (fineConfidence < CONFIDENCE_THRESHOLD) lowConfidence++;
    
    // Get mapped tools
    const tools = categoryToTools[predictedFine] || ['(no tools mapped)'];
    
    // Display result
    const superIcon = superCorrect ? '✓' : '✗';
    const fineIcon = fineCorrect ? '✓' : '✗';
    const confIcon = fineConfidence >= CONFIDENCE_THRESHOLD ? '' : '⚠️';
    
    console.log(`Query: "${test.query}"`);
    console.log(`  Stage 1: ${superIcon} ${predictedSuper} (${(stage1Result.confidence * 100).toFixed(1)}%) [expected: ${test.expectedSuper}]`);
    console.log(`  Stage 2: ${fineIcon} ${predictedFine} (${(fineConfidence * 100).toFixed(1)}%) ${confIcon} [expected: ${test.expectedFine}]`);
    console.log(`  Tools: ${tools.slice(0, 3).join(', ')}${tools.length > 3 ? '...' : ''}`);
    console.log();
  }
  
  // Summary
  console.log('='.repeat(80));
  console.log('📊 Results Summary\n');
  console.log(`  Stage 1 Accuracy: ${correctSuper}/${total} (${((correctSuper/total)*100).toFixed(1)}%)`);
  console.log(`  Combined Accuracy: ${correct}/${total} (${((correct/total)*100).toFixed(1)}%)`);
  console.log(`  Low Confidence (<${CONFIDENCE_THRESHOLD * 100}%): ${lowConfidence}/${total}`);
  
  if (lowConfidence > 0) {
    console.log(`\n  💡 ${lowConfidence} queries would benefit from Gemini fallback`);
  }
  
  console.log('\n' + '='.repeat(80));
}

main().catch(console.error);
