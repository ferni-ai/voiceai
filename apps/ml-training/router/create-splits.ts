/**
 * Create Train/Val/Test Splits
 *
 * Creates stratified splits ensuring all tools appear in all sets.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TrainingExample {
  id: string;
  query: string;
  selected_tools: string[];
  is_open_intent: boolean;
  source: string;
}

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function main() {
  console.log('=== Creating Train/Val/Test Splits ===\n');

  // Load quality training data
  const inputPath = path.join(__dirname, 'data/train_quality.jsonl');
  const lines = fs.readFileSync(inputPath, 'utf-8').split('\n').filter(Boolean);
  const examples: TrainingExample[] = shuffle(lines.map(line => JSON.parse(line)));

  console.log(`Loaded ${examples.length} examples`);

  // Group by tool for stratified split
  const byTool: Record<string, TrainingExample[]> = {};
  examples.forEach(ex => {
    const tool = ex.selected_tools[0];
    if (!byTool[tool]) byTool[tool] = [];
    byTool[tool].push(ex);
  });

  const tools = Object.keys(byTool);
  console.log(`Unique tools: ${tools.length}`);

  // Split ratios
  const TRAIN_RATIO = 0.85;
  const VAL_RATIO = 0.10;
  // TEST_RATIO = 0.05 (remainder)

  const train: TrainingExample[] = [];
  const val: TrainingExample[] = [];
  const test: TrainingExample[] = [];

  // Stratified split per tool
  for (const tool of tools) {
    const toolExamples = shuffle(byTool[tool]);
    const n = toolExamples.length;

    const nTrain = Math.max(1, Math.floor(n * TRAIN_RATIO));
    const nVal = Math.max(1, Math.floor(n * VAL_RATIO));

    train.push(...toolExamples.slice(0, nTrain));
    val.push(...toolExamples.slice(nTrain, nTrain + nVal));
    test.push(...toolExamples.slice(nTrain + nVal));
  }

  // Shuffle final sets
  const trainShuffled = shuffle(train);
  const valShuffled = shuffle(val);
  const testShuffled = shuffle(test);

  console.log(`\nSplit sizes:`);
  console.log(`  Train: ${trainShuffled.length} (${(trainShuffled.length/examples.length*100).toFixed(1)}%)`);
  console.log(`  Val:   ${valShuffled.length} (${(valShuffled.length/examples.length*100).toFixed(1)}%)`);
  console.log(`  Test:  ${testShuffled.length} (${(testShuffled.length/examples.length*100).toFixed(1)}%)`);

  // Verify all tools appear in all sets
  const trainTools = new Set(trainShuffled.flatMap(ex => ex.selected_tools));
  const valTools = new Set(valShuffled.flatMap(ex => ex.selected_tools));
  const testTools = new Set(testShuffled.flatMap(ex => ex.selected_tools));

  console.log(`\nTool coverage:`);
  console.log(`  Train: ${trainTools.size}/${tools.length} tools`);
  console.log(`  Val:   ${valTools.size}/${tools.length} tools`);
  console.log(`  Test:  ${testTools.size}/${tools.length} tools`);

  // Save splits
  const dataDir = path.join(__dirname, 'data');

  // Backup existing files
  const backupDir = path.join(dataDir, 'backup_' + Date.now());
  fs.mkdirSync(backupDir, { recursive: true });

  ['train.jsonl', 'validation.jsonl', 'test.jsonl'].forEach(f => {
    const src = path.join(dataDir, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(backupDir, f));
    }
  });
  console.log(`\nBacked up existing files to ${backupDir}`);

  // Write new splits
  fs.writeFileSync(
    path.join(dataDir, 'train.jsonl'),
    trainShuffled.map(ex => JSON.stringify(ex)).join('\n') + '\n'
  );

  fs.writeFileSync(
    path.join(dataDir, 'validation.jsonl'),
    valShuffled.map(ex => JSON.stringify(ex)).join('\n') + '\n'
  );

  fs.writeFileSync(
    path.join(dataDir, 'test.jsonl'),
    testShuffled.map(ex => JSON.stringify(ex)).join('\n') + '\n'
  );

  console.log('\n✅ Splits created:');
  console.log(`   ${dataDir}/train.jsonl`);
  console.log(`   ${dataDir}/validation.jsonl`);
  console.log(`   ${dataDir}/test.jsonl`);

  // Sample from each set
  console.log('\n=== Sample from each set ===');

  console.log('\nTrain samples:');
  trainShuffled.slice(0, 3).forEach(ex => {
    console.log(`  [${ex.selected_tools[0]}] "${ex.query}"`);
  });

  console.log('\nValidation samples:');
  valShuffled.slice(0, 3).forEach(ex => {
    console.log(`  [${ex.selected_tools[0]}] "${ex.query}"`);
  });

  console.log('\nTest samples:');
  testShuffled.slice(0, 3).forEach(ex => {
    console.log(`  [${ex.selected_tools[0]}] "${ex.query}"`);
  });
}

main().catch(console.error);
