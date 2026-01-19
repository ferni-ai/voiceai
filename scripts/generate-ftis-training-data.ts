#!/usr/bin/env npx tsx
/**
 * Generate FTIS Training Data
 *
 * Generates comprehensive synthetic training data for the RouterModel ONNX.
 *
 * Usage:
 *   npx tsx scripts/generate-ftis-training-data.ts
 *   npx tsx scripts/generate-ftis-training-data.ts --examples-per-tool 20
 *   npx tsx scripts/generate-ftis-training-data.ts --output ./data/ftis-training
 *
 * Options:
 *   --examples-per-tool  Number of examples per tool (default: 12)
 *   --paraphrase-count   Number of paraphrases per query (default: 3)
 *   --output             Output directory (default: ./data/ftis-training)
 *   --format             Export format: jsonl, csv (default: jsonl)
 *   --include-embeddings Include query embeddings (slower, default: false)
 *
 * @module scripts/generate-ftis-training-data
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// ============================================================================
// PARSE ARGS
// ============================================================================

const args = process.argv.slice(2);
const options: Record<string, string> = {};

for (let i = 0; i < args.length; i += 2) {
  if (args[i].startsWith('--')) {
    options[args[i].slice(2)] = args[i + 1] || 'true';
  }
}

const config = {
  examplesPerTool: parseInt(options['examples-per-tool'] || '12', 10),
  paraphraseCount: parseInt(options['paraphrase-count'] || '3', 10),
  outputDir: options.output || './data/ftis-training',
  format: options.format || 'jsonl',
  includeEmbeddings: options['include-embeddings'] === 'true',
};

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('🚀 FTIS Training Data Generator');
  console.log('================================');
  console.log(`Examples per tool: ${config.examplesPerTool}`);
  console.log(`Paraphrase count: ${config.paraphraseCount}`);
  console.log(`Output directory: ${config.outputDir}`);
  console.log(`Format: ${config.format}`);
  console.log('');

  // Import generator (dynamic to avoid circular deps)
  const { SyntheticTrainingGenerator } = await import(
    '../src/tools/intelligence/router/training/synthetic-generator.js'
  );

  // Create generator with config
  const generator = new SyntheticTrainingGenerator({
    examplesPerTool: config.examplesPerTool,
    paraphraseCount: config.paraphraseCount,
  });

  // Generate data
  console.log('📊 Generating synthetic training data...');
  const startTime = Date.now();

  const result = await generator.generateAll();

  console.log('');
  console.log('✅ Generation Complete');
  console.log('======================');
  console.log(`Total tools: ${result.stats.totalTools}`);
  console.log(`Total examples: ${result.stats.totalExamples}`);
  console.log(`Hard negatives: ${result.stats.hardNegatives}`);
  console.log(`Generation time: ${result.stats.generationTimeMs}ms`);
  console.log(`Coverage: ${result.stats.coverage.domains} domains`);
  console.log('');

  // Create output directory
  if (!existsSync(config.outputDir)) {
    mkdirSync(config.outputDir, { recursive: true });
  }

  // Export data
  console.log('💾 Exporting dataset...');

  // Split into train/validation/test (80/10/10)
  const shuffled = [...result.examples].sort(() => Math.random() - 0.5);
  const trainSize = Math.floor(shuffled.length * 0.8);
  const valSize = Math.floor(shuffled.length * 0.1);

  const trainSet = shuffled.slice(0, trainSize);
  const valSet = shuffled.slice(trainSize, trainSize + valSize);
  const testSet = shuffled.slice(trainSize + valSize);

  // Export based on format
  if (config.format === 'jsonl') {
    exportJsonl(trainSet, join(config.outputDir, 'train.jsonl'));
    exportJsonl(valSet, join(config.outputDir, 'validation.jsonl'));
    exportJsonl(testSet, join(config.outputDir, 'test.jsonl'));
    exportJsonl(result.hardNegatives, join(config.outputDir, 'hard_negatives.jsonl'));
  } else if (config.format === 'csv') {
    exportCsv(trainSet, join(config.outputDir, 'train.csv'));
    exportCsv(valSet, join(config.outputDir, 'validation.csv'));
    exportCsv(testSet, join(config.outputDir, 'test.csv'));
  }

  // Export metadata
  const metadata = {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    config,
    stats: result.stats,
    splits: {
      train: trainSet.length,
      validation: valSet.length,
      test: testSet.length,
    },
    toolDistribution: calculateToolDistribution(result.examples),
  };

  writeFileSync(
    join(config.outputDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );

  console.log('');
  console.log('📁 Output files:');
  console.log(`   ${join(config.outputDir, 'train.jsonl')} (${trainSet.length} examples)`);
  console.log(`   ${join(config.outputDir, 'validation.jsonl')} (${valSet.length} examples)`);
  console.log(`   ${join(config.outputDir, 'test.jsonl')} (${testSet.length} examples)`);
  console.log(`   ${join(config.outputDir, 'hard_negatives.jsonl')} (${result.hardNegatives.length} examples)`);
  console.log(`   ${join(config.outputDir, 'metadata.json')}`);
  console.log('');
  console.log(`✨ Done in ${Date.now() - startTime}ms`);
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

interface Example {
  id: string;
  query: string;
  personaId: string;
  emotion: string;
  timeOfDay: string;
  selectedTools: string[];
  [key: string]: unknown;
}

function exportJsonl(data: Example[], filepath: string): void {
  const lines = data.map((item) => JSON.stringify(item));
  writeFileSync(filepath, lines.join('\n'));
}

function exportCsv(data: Example[], filepath: string): void {
  const headers = ['id', 'query', 'personaId', 'emotion', 'timeOfDay', 'selectedTools'];
  const rows = data.map((item) =>
    headers
      .map((h) => {
        const val = item[h];
        if (Array.isArray(val)) return val.join(';');
        if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
        return String(val);
      })
      .join(',')
  );
  writeFileSync(filepath, [headers.join(','), ...rows].join('\n'));
}

function calculateToolDistribution(
  examples: Example[]
): Record<string, number> {
  const distribution: Record<string, number> = {};
  for (const ex of examples) {
    for (const tool of ex.selectedTools) {
      distribution[tool] = (distribution[tool] || 0) + 1;
    }
  }
  return distribution;
}

// ============================================================================
// RUN
// ============================================================================

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
