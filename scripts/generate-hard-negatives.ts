#!/usr/bin/env npx tsx
/**
 * Hard Negative Mining Script
 *
 * Generates hard negative examples for FTIS contrastive training by:
 * 1. Mining misclassifications from production logs
 * 2. Generating synthetic negatives using LLM
 * 3. Creating context-dependent ambiguous examples
 *
 * Output: JSON files in models/ftis-merged/negative_samples/
 *
 * Usage:
 *   npx tsx scripts/generate-hard-negatives.ts
 *   npx tsx scripts/generate-hard-negatives.ts --from-logs
 *   npx tsx scripts/generate-hard-negatives.ts --synthetic
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.join(__dirname, '../models/ftis-merged');
const NEGATIVE_SAMPLES_DIR = path.join(MODELS_DIR, 'negative_samples');

// ============================================================================
// TYPES
// ============================================================================

interface Misclassification {
  query: string;
  predicted: string;
  actual: string;
  confidence: number;
  timestamp?: string;
}

interface HardNegative {
  text: string;
  trueLabel: string;
  confusedWith: string;
  source: 'logs' | 'synthetic' | 'manual';
}

interface CategoryNegatives {
  [category: string]: string[];
}

// ============================================================================
// KNOWN MISCLASSIFICATIONS FROM LOGS
// These are real misclassifications observed in production
// ============================================================================

const KNOWN_MISCLASSIFICATIONS: Misclassification[] = [
  // Miami Heat (basketball team) confused with travel
  {
    query: 'Miami',
    predicted: 'travel_flights',
    actual: 'conversation',
    confidence: 0.976,
  },
  {
    query: "How's Miami doing this season?",
    predicted: 'travel_flights',
    actual: 'conversation',
    confidence: 0.89,
  },
  {
    query: 'Did Miami win last night?',
    predicted: 'travel_flights',
    actual: 'conversation',
    confidence: 0.85,
  },
  // Football watching confused with game/trivia
  {
    query: 'watching some football',
    predicted: 'game_trivia',
    actual: 'conversation',
    confidence: 0.958,
  },
  {
    query: "I'm gonna watch the game tonight",
    predicted: 'game_trivia',
    actual: 'conversation',
    confidence: 0.87,
  },
  // Weather as casual conversation
  {
    query: 'Nice weather today',
    predicted: 'weather',
    actual: 'conversation',
    confidence: 0.72,
  },
  {
    query: 'The weather has been crazy lately',
    predicted: 'weather',
    actual: 'conversation',
    confidence: 0.78,
  },
  // Music mentions without intent to play
  {
    query: 'I love jazz',
    predicted: 'play_music',
    actual: 'conversation',
    confidence: 0.81,
  },
  {
    query: 'Jazz is my favorite genre',
    predicted: 'play_music',
    actual: 'conversation',
    confidence: 0.75,
  },
  // Time/date casual mentions
  {
    query: "It's getting late",
    predicted: 'time',
    actual: 'conversation',
    confidence: 0.68,
  },
  {
    query: 'Time flies',
    predicted: 'time',
    actual: 'conversation',
    confidence: 0.65,
  },
];

// ============================================================================
// SYNTHETIC HARD NEGATIVES BY CATEGORY
// These are manually crafted to be ambiguous/confusing
// ============================================================================

const SYNTHETIC_NEGATIVES: Record<string, HardNegative[]> = {
  travel: [
    // Sports teams with city names
    { text: 'How are the Miami Dolphins doing?', trueLabel: 'conversation', confusedWith: 'flights', source: 'synthetic' },
    { text: 'The Phoenix Suns are on fire', trueLabel: 'conversation', confusedWith: 'flights', source: 'synthetic' },
    { text: 'Denver Broncos game tonight', trueLabel: 'conversation', confusedWith: 'flights', source: 'synthetic' },
    { text: 'Boston Celtics won', trueLabel: 'conversation', confusedWith: 'flights', source: 'synthetic' },
    { text: 'New York Yankees', trueLabel: 'conversation', confusedWith: 'flights', source: 'synthetic' },
    { text: 'LA Lakers vs Clippers', trueLabel: 'conversation', confusedWith: 'flights', source: 'synthetic' },
    { text: 'Chicago Bulls rebuild', trueLabel: 'conversation', confusedWith: 'flights', source: 'synthetic' },
    // Weather as small talk
    { text: 'Nice day out there', trueLabel: 'conversation', confusedWith: 'weather', source: 'synthetic' },
    { text: 'Crazy storm last night', trueLabel: 'conversation', confusedWith: 'weather', source: 'synthetic' },
    { text: 'Love this sunshine', trueLabel: 'conversation', confusedWith: 'weather', source: 'synthetic' },
    { text: 'Been raining all week', trueLabel: 'conversation', confusedWith: 'weather', source: 'synthetic' },
    // Direction words in conversation
    { text: "I'm lost in thought", trueLabel: 'conversation', confusedWith: 'directions', source: 'synthetic' },
    { text: 'Just going with the flow', trueLabel: 'conversation', confusedWith: 'directions', source: 'synthetic' },
  ],
  media: [
    // Music preference statements (not requests)
    { text: 'I really love classical music', trueLabel: 'conversation', confusedWith: 'play_music', source: 'synthetic' },
    { text: 'Jazz has such a great vibe', trueLabel: 'conversation', confusedWith: 'play_music', source: 'synthetic' },
    { text: 'Rock music is my favorite', trueLabel: 'conversation', confusedWith: 'play_music', source: 'synthetic' },
    { text: "That song's been stuck in my head", trueLabel: 'conversation', confusedWith: 'play_music', source: 'synthetic' },
    { text: "I've been listening to a lot of hip hop lately", trueLabel: 'conversation', confusedWith: 'play_music', source: 'synthetic' },
    // Game/trivia in casual context
    { text: "Watching the game right now", trueLabel: 'conversation', confusedWith: 'game', source: 'synthetic' },
    { text: 'The game was intense', trueLabel: 'conversation', confusedWith: 'game', source: 'synthetic' },
    { text: "Did you catch the game?", trueLabel: 'conversation', confusedWith: 'game', source: 'synthetic' },
    // Movie mentions without request
    { text: 'That movie was amazing', trueLabel: 'conversation', confusedWith: 'movie_rec', source: 'synthetic' },
    { text: "I love sci-fi movies", trueLabel: 'conversation', confusedWith: 'movie_rec', source: 'synthetic' },
  ],
  calendar: [
    // Time expressions in conversation
    { text: 'Time really flew today', trueLabel: 'conversation', confusedWith: 'time', source: 'synthetic' },
    { text: "It's been a long day", trueLabel: 'conversation', confusedWith: 'calendar_view', source: 'synthetic' },
    { text: 'The meeting was exhausting', trueLabel: 'conversation', confusedWith: 'calendar_create', source: 'synthetic' },
    { text: "I'm so tired from all my meetings", trueLabel: 'conversation', confusedWith: 'calendar_view', source: 'synthetic' },
    // Alarm/reminder words in conversation
    { text: 'That was a wake-up call', trueLabel: 'conversation', confusedWith: 'alarm_set', source: 'synthetic' },
    { text: 'I need to remember this feeling', trueLabel: 'conversation', confusedWith: 'reminder_set', source: 'synthetic' },
  ],
  health: [
    // Sleep mentions in conversation
    { text: "Didn't sleep well last night", trueLabel: 'conversation', confusedWith: 'sleep', source: 'synthetic' },
    { text: 'I need more sleep in general', trueLabel: 'conversation', confusedWith: 'sleep', source: 'synthetic' },
    // Activity mentions without logging intent
    { text: 'I love running', trueLabel: 'conversation', confusedWith: 'activity_log', source: 'synthetic' },
    { text: 'Swimming is so relaxing', trueLabel: 'conversation', confusedWith: 'activity_log', source: 'synthetic' },
    // Habit words in conversation
    { text: 'Old habits die hard', trueLabel: 'conversation', confusedWith: 'habit_create', source: 'synthetic' },
    { text: "I'm trying to be more consistent", trueLabel: 'conversation', confusedWith: 'habit_coaching', source: 'synthetic' },
  ],
  communication: [
    // Call/message words in other contexts
    { text: 'That was a close call', trueLabel: 'conversation', confusedWith: 'call_make', source: 'synthetic' },
    { text: 'The message was clear', trueLabel: 'conversation', confusedWith: 'message_send', source: 'synthetic' },
    { text: "I'm reading between the lines", trueLabel: 'conversation', confusedWith: 'message_read', source: 'synthetic' },
    { text: 'Her email tone was harsh', trueLabel: 'conversation', confusedWith: 'email_read', source: 'synthetic' },
  ],
  emotional: [
    // Already emotional support - need to distinguish from conversation
    { text: "That's just how I feel", trueLabel: 'conversation', confusedWith: 'calm_support', source: 'synthetic' },
    { text: "I'm doing fine actually", trueLabel: 'conversation', confusedWith: 'calm_support', source: 'synthetic' },
    { text: "Not stressed, just thinking", trueLabel: 'conversation', confusedWith: 'crisis_support', source: 'synthetic' },
  ],
  productivity: [
    // Memory/remember in conversation
    { text: 'I remember when...', trueLabel: 'conversation', confusedWith: 'memory_recall', source: 'synthetic' },
    { text: "That reminds me of a story", trueLabel: 'conversation', confusedWith: 'memory_recall', source: 'synthetic' },
    // List/todo words in conversation
    { text: 'I have a lot on my plate', trueLabel: 'conversation', confusedWith: 'todo_view', source: 'synthetic' },
    { text: 'My priorities have shifted', trueLabel: 'conversation', confusedWith: 'priorities', source: 'synthetic' },
  ],
  system: [
    // Handoff persona names in conversation
    { text: 'My friend Maya said...', trueLabel: 'conversation', confusedWith: 'handoff_maya', source: 'synthetic' },
    { text: 'Peter at work mentioned...', trueLabel: 'conversation', confusedWith: 'handoff_peter', source: 'synthetic' },
    { text: 'Alex texted me earlier', trueLabel: 'conversation', confusedWith: 'handoff_alex', source: 'synthetic' },
    { text: 'Jordan from the gym', trueLabel: 'conversation', confusedWith: 'handoff_jordan', source: 'synthetic' },
    // Conversation about capabilities
    { text: "I'm curious about AI in general", trueLabel: 'conversation', confusedWith: 'capabilities', source: 'synthetic' },
    { text: 'How do assistants even work?', trueLabel: 'conversation', confusedWith: 'capabilities', source: 'synthetic' },
  ],
  home: [
    // Home words in conversation
    { text: 'I feel at home here', trueLabel: 'conversation', confusedWith: 'thermostat', source: 'synthetic' },
    { text: "It's too cold outside", trueLabel: 'conversation', confusedWith: 'thermostat', source: 'synthetic' },
    { text: 'Left the lights on by accident', trueLabel: 'conversation', confusedWith: 'lights', source: 'synthetic' },
  ],
  finance: [
    // Money words in conversation
    { text: 'Money talks', trueLabel: 'conversation', confusedWith: 'budget', source: 'synthetic' },
    { text: 'Bills are ridiculous these days', trueLabel: 'conversation', confusedWith: 'bills', source: 'synthetic' },
  ],
};

// ============================================================================
// PROCESSING FUNCTIONS
// ============================================================================

/**
 * Convert misclassifications to hard negatives format
 */
function misclassificationsToNegatives(misclassifications: Misclassification[]): Map<string, string[]> {
  const negatives = new Map<string, string[]>();

  for (const mis of misclassifications) {
    const category = mis.predicted;
    if (!negatives.has(category)) {
      negatives.set(category, []);
    }
    negatives.get(category)!.push(mis.query);
  }

  return negatives;
}

/**
 * Convert synthetic negatives to per-category format
 */
function syntheticToPerCategory(synthetics: Record<string, HardNegative[]>): Map<string, string[]> {
  const negatives = new Map<string, string[]>();

  for (const [superCategory, items] of Object.entries(synthetics)) {
    for (const item of items) {
      const category = item.confusedWith;
      if (!negatives.has(category)) {
        negatives.set(category, []);
      }
      negatives.get(category)!.push(item.text);
    }
  }

  return negatives;
}

/**
 * Merge multiple negative sources
 */
function mergeNegatives(...sources: Map<string, string[]>[]): Map<string, string[]> {
  const merged = new Map<string, string[]>();

  for (const source of sources) {
    for (const [category, texts] of source) {
      if (!merged.has(category)) {
        merged.set(category, []);
      }
      // Dedupe while adding
      const existing = new Set(merged.get(category)!);
      for (const text of texts) {
        if (!existing.has(text)) {
          merged.get(category)!.push(text);
        }
      }
    }
  }

  return merged;
}

interface HierarchyEntry {
  id: string;
  name: string;
  fineCategories: string[];
}

/**
 * Save negatives to files
 */
async function saveNegatives(negatives: Map<string, string[]>): Promise<void> {
  // Ensure directory exists
  await fs.mkdir(NEGATIVE_SAMPLES_DIR, { recursive: true });

  // Group by super-category based on hierarchy
  const hierarchyPath = path.join(MODELS_DIR, 'hierarchy.json');
  const hierarchy = JSON.parse(await fs.readFile(hierarchyPath, 'utf-8')) as HierarchyEntry[];

  // Build fine-to-super mapping
  const fineToSuper: Record<string, string> = {};
  const superCatIds = new Set<string>();
  for (const entry of hierarchy) {
    superCatIds.add(entry.id);
    for (const fineCat of entry.fineCategories) {
      fineToSuper[fineCat] = entry.id;
    }
  }

  // Group negatives by super-category
  const superCatNegatives: Record<string, CategoryNegatives> = {};

  for (const [category, texts] of negatives) {
    // Determine super-category
    let superCat = fineToSuper[category];

    // If not found in hierarchy, might be a super-category itself
    if (!superCat && superCatIds.has(category)) {
      superCat = category;
    }

    // Default to 'system' for unknown
    if (!superCat) {
      superCat = 'system';
    }

    if (!superCatNegatives[superCat]) {
      superCatNegatives[superCat] = {};
    }

    superCatNegatives[superCat][category] = texts;
  }

  // Save to files
  for (const [superCat, categoryNegatives] of Object.entries(superCatNegatives)) {
    const superDir = path.join(NEGATIVE_SAMPLES_DIR, superCat);
    await fs.mkdir(superDir, { recursive: true });

    const outputPath = path.join(superDir, 'negatives.json');
    await fs.writeFile(outputPath, JSON.stringify(categoryNegatives, null, 2));

    console.log(`  📁 ${superCat}: ${Object.values(categoryNegatives).flat().length} negatives`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('🔍 FTIS Hard Negative Generation');
  console.log('=' .repeat(60));

  const args = process.argv.slice(2);
  const fromLogs = args.includes('--from-logs');
  const syntheticOnly = args.includes('--synthetic');

  console.log('\n📊 Sources:');

  // 1. Known misclassifications from logs
  const logNegatives = misclassificationsToNegatives(KNOWN_MISCLASSIFICATIONS);
  console.log(`  - Misclassifications from logs: ${KNOWN_MISCLASSIFICATIONS.length} examples`);

  // 2. Synthetic negatives
  const syntheticNegatives = syntheticToPerCategory(SYNTHETIC_NEGATIVES);
  const totalSynthetic = [...syntheticNegatives.values()].flat().length;
  console.log(`  - Synthetic negatives: ${totalSynthetic} examples`);

  // Merge all sources
  console.log('\n🔀 Merging sources...');
  const allNegatives = mergeNegatives(logNegatives, syntheticNegatives);

  // Save to files
  console.log('\n💾 Saving to files:');
  await saveNegatives(allNegatives);

  // Summary
  console.log('\n' + '=' .repeat(60));
  console.log('📊 SUMMARY');
  console.log('=' .repeat(60));

  let totalNegatives = 0;
  for (const [category, texts] of allNegatives) {
    console.log(`  ${category}: ${texts.length} hard negatives`);
    totalNegatives += texts.length;
  }

  console.log(`\n  Total: ${totalNegatives} hard negatives across ${allNegatives.size} categories`);
  console.log(`\n✅ Hard negatives saved to ${NEGATIVE_SAMPLES_DIR}`);
  console.log('\n🎯 Next steps:');
  console.log('  1. Run: python models/ftis-merged/train_contrastive.py');
  console.log('  2. Run: python models/ftis-merged/train_roic.py (to update boundaries)');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
