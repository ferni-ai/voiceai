#!/usr/bin/env npx tsx
/**
 * FTIS Accuracy Comparison
 *
 * Compares accuracy across all FTIS model versions:
 * - V1: Original hierarchical (79 categories)
 * - V2: With hard negatives
 * - V3: Merged categories (70 categories)
 * - V4: ModernBERT (if available)
 *
 * Usage: npx tsx scripts/ftis-accuracy-comparison.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface TrainingResults {
  stage1_accuracy: number;
  stage2_accuracies?: Record<string, number>;
  stage2_average?: number;
  combined_estimate?: number;
}

interface ModelVersion {
  name: string;
  path: string;
  categories: number;
  description: string;
}

const MODEL_VERSIONS: ModelVersion[] = [
  {
    name: 'V1 Hierarchical',
    path: 'models/ftis-hierarchical/training_results.json',
    categories: 79,
    description: 'Original hierarchical classification',
  },
  {
    name: 'V2 Hard Negatives',
    path: 'models/ftis-hierarchical-v2/training_results.json',
    categories: 79,
    description: 'With targeted hard negative examples',
  },
  {
    name: 'V3 Merged',
    path: 'models/ftis-merged/training_results.json',
    categories: 70,
    description: 'Merged ambiguous categories (10 fewer)',
  },
  {
    name: 'V4 ModernBERT',
    path: 'models/ftis-merged/trained_models/training_results.json',
    categories: 70,
    description: 'ModernBERT fine-tuned on merged categories',
  },
];

async function loadResults(version: ModelVersion): Promise<TrainingResults | null> {
  const fullPath = path.join(__dirname, '..', version.path);
  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return '-';
  return (value * 100).toFixed(2) + '%';
}

async function main() {
  console.log('📊 FTIS Model Accuracy Comparison\n');
  console.log('='.repeat(80));

  const results: Array<{
    version: ModelVersion;
    results: TrainingResults | null;
  }> = [];

  for (const version of MODEL_VERSIONS) {
    const res = await loadResults(version);
    results.push({ version, results: res });
  }

  // Print comparison table
  console.log('\n' + '─'.repeat(80));
  console.log(
    '│ Model Version       │ Categories │ Stage 1   │ Stage 2 Avg │ Combined    │'
  );
  console.log('├' + '─'.repeat(78) + '┤');

  for (const { version, results: res } of results) {
    if (!res) {
      console.log(
        `│ ${version.name.padEnd(19)} │ ${String(version.categories).padStart(10)} │ ${'N/A'.padStart(9)} │ ${'N/A'.padStart(11)} │ ${'N/A'.padStart(11)} │`
      );
    } else {
      const stage1 = formatPercent(res.stage1_accuracy).padStart(9);
      const stage2 = formatPercent(res.stage2_average).padStart(11);
      const combined = formatPercent(res.combined_estimate).padStart(11);
      console.log(
        `│ ${version.name.padEnd(19)} │ ${String(version.categories).padStart(10)} │ ${stage1} │ ${stage2} │ ${combined} │`
      );
    }
  }
  console.log('└' + '─'.repeat(78) + '┘');

  // Print detailed Stage 2 breakdown
  console.log('\n📋 Stage 2 Per-Category Breakdown:\n');

  const superCategories = [
    'calendar',
    'communication',
    'emotional',
    'finance',
    'health',
    'home',
    'media',
    'productivity',
    'system',
    'travel',
  ];

  console.log('│ Category       │ V1 Hier  │ V2 HN    │ V3 Merged │ Δ V3-V1   │');
  console.log('├' + '─'.repeat(66) + '┤');

  for (const cat of superCategories) {
    const v1 = results[0].results?.stage2_accuracies?.[cat];
    const v2 = results[1].results?.stage2_accuracies?.[cat];
    const v3 = results[2].results?.stage2_accuracies?.[cat];

    const delta = v1 && v3 ? ((v3 - v1) * 100).toFixed(2) : '-';
    const deltaStr = delta !== '-' ? (parseFloat(delta) >= 0 ? `+${delta}%` : `${delta}%`) : '-';

    console.log(
      `│ ${cat.padEnd(14)} │ ${formatPercent(v1).padStart(8)} │ ${formatPercent(v2).padStart(8)} │ ${formatPercent(v3).padStart(9)} │ ${deltaStr.padStart(9)} │`
    );
  }
  console.log('└' + '─'.repeat(66) + '┘');

  // Summary
  console.log('\n📈 Summary:\n');
  
  const v1Combined = results[0].results?.combined_estimate;
  const v3Combined = results[2].results?.combined_estimate;
  
  if (v1Combined && v3Combined) {
    const improvement = ((v3Combined - v1Combined) * 100).toFixed(2);
    console.log(`  V1 → V3 Improvement: ${improvement}%`);
  }

  // Recommendations
  console.log('\n🎯 Recommendations:\n');
  
  const bestResult = results.find(r => r.results !== null);
  if (bestResult?.results) {
    const combined = bestResult.results.combined_estimate || 0;
    
    if (combined >= 0.98) {
      console.log('  ✅ Target accuracy (98%+) achieved!');
    } else if (combined >= 0.95) {
      console.log('  🔸 Good accuracy (95%+). Consider Gemini fallback for last 3-5%');
    } else if (combined >= 0.93) {
      console.log('  🔸 Moderate accuracy. Recommend:');
      console.log('     1. Try ModernBERT (Phase 3)');
      console.log('     2. Add Gemini fallback for low-confidence predictions');
    } else {
      console.log('  ⚠️  Low accuracy. Need additional data augmentation or model changes.');
    }
  }
}

main().catch(console.error);
