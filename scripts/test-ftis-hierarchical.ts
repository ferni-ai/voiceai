#!/usr/bin/env npx tsx
/**
 * Test FTIS Hierarchical Classifier
 *
 * Quick test to verify the TypeScript classifier works.
 *
 * Usage: npx tsx scripts/test-ftis-hierarchical.ts
 */

import { initializeHierarchicalClassifier, getHierarchicalClassifier } from '../src/tools/intelligence/ftis-hierarchical-classifier.js';

const TEST_QUERIES = [
  "Play some jazz music",
  "Set an alarm for 7am",
  "I'm feeling anxious",
  "What's the weather like?",
  "Call mom",
  "Add milk to my list",
  "Transfer me to Maya",
];

async function main() {
  console.log('🧪 Testing FTIS Hierarchical Classifier (TypeScript)\n');
  
  try {
    // Initialize
    console.log('Initializing classifier...');
    const classifier = await initializeHierarchicalClassifier();
    
    if (!classifier.isReady()) {
      console.log('❌ Classifier not ready - models may not be available');
      console.log('   Run: cd models/ftis-merged && python train_all.py');
      return;
    }
    
    console.log('✅ Classifier ready\n');
    console.log(`Super-categories: ${classifier.getSuperCategories().join(', ')}\n`);
    
    // Test queries
    console.log('Running test queries...\n');
    
    for (const query of TEST_QUERIES) {
      const result = await classifier.classify(query);
      
      if (result) {
        console.log(`"${query}"`);
        console.log(`  → ${result.superCategory} (${(result.superConfidence * 100).toFixed(0)}%)`);
        console.log(`  → ${result.fineCategory} (${(result.fineConfidence * 100).toFixed(0)}%)`);
        console.log(`  → Tools: ${result.toolIds.slice(0, 3).join(', ')}${result.toolIds.length > 3 ? '...' : ''}`);
        console.log(`  → Combined: ${(result.combinedConfidence * 100).toFixed(0)}%, ${result.latencyMs}ms`);
        console.log();
      } else {
        console.log(`"${query}" → Classification failed\n`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
