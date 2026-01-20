#!/usr/bin/env npx tsx
/**
 * FTIS Confusion Analysis
 * 
 * Analyzes which categories are being confused to guide targeted data generation.
 */

import { config } from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import * as path from 'path';

config();

const MODELS_DIR = 'models/ftis-hierarchical';

interface Example {
  query: string;
  label: string;
}

interface ConfusionPair {
  predicted: string;
  actual: string;
  count: number;
  examples: string[];
}

async function analyzeCategory(categoryName: string): Promise<{
  accuracy: number;
  confusions: ConfusionPair[];
  labelCounts: Record<string, number>;
}> {
  const dir = `${MODELS_DIR}/stage2/${categoryName}`;
  
  // Load test data
  const testPath = `${dir}/test.json`;
  if (!existsSync(testPath)) {
    console.log(`  ⚠️ No test data for ${categoryName}`);
    return { accuracy: 0, confusions: [], labelCounts: {} };
  }
  
  const testData: Example[] = JSON.parse(readFileSync(testPath, 'utf-8'));
  const labelMap: Record<string, number> = JSON.parse(readFileSync(`${dir}/label_map.json`, 'utf-8'));
  const idToLabel = Object.fromEntries(Object.entries(labelMap).map(([k, v]) => [v, k]));
  
  // Count labels
  const labelCounts: Record<string, number> = {};
  for (const ex of testData) {
    labelCounts[ex.label] = (labelCounts[ex.label] || 0) + 1;
  }
  
  // Load metadata to get accuracy
  const metadata = JSON.parse(readFileSync(`${dir}/metadata.json`, 'utf-8'));
  
  return {
    accuracy: metadata.test_accuracy,
    confusions: [], // We'd need to run inference to get actual confusions
    labelCounts,
  };
}

async function main() {
  console.log('🔍 FTIS Confusion Analysis\n');
  
  const targetCategories = [
    'health',      // 91.60%
    'productivity', // 92.00%
    'emotional',   // 93.64%
    'media',       // 93.81%
    'finance',     // 94.00%
    'travel',      // 96.02%
    'communication', // 97.72%
  ];
  
  const analysis: Record<string, any> = {};
  
  for (const cat of targetCategories) {
    console.log(`\n📊 Analyzing: ${cat}`);
    const result = await analyzeCategory(cat);
    analysis[cat] = result;
    
    console.log(`   Accuracy: ${(result.accuracy * 100).toFixed(2)}%`);
    console.log(`   Labels: ${Object.keys(result.labelCounts).length}`);
    console.log(`   Distribution:`);
    for (const [label, count] of Object.entries(result.labelCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`     - ${label}: ${count}`);
    }
  }
  
  // Save analysis
  writeFileSync(`${MODELS_DIR}/confusion_analysis.json`, JSON.stringify(analysis, null, 2));
  console.log(`\n✅ Analysis saved to ${MODELS_DIR}/confusion_analysis.json`);
  
  // Generate improvement recommendations
  console.log('\n' + '='.repeat(60));
  console.log('📋 IMPROVEMENT RECOMMENDATIONS');
  console.log('='.repeat(60));
  
  console.log(`
## Health (91.60% → 98%+)
- 10 fine categories: habit_log, habit_create, habit_view, habit_coaching, 
  routine_run, routine_manage, exercise_log, nutrition, water, sleep
- LIKELY CONFUSIONS:
  * habit_log vs exercise_log (both about logging activities)
  * habit_coaching vs routine_manage (both about guidance)
  * nutrition vs water (both intake tracking)
- STRATEGY: Add more distinctive examples with clear differentiators

## Productivity (92.00% → 98%+)
- 11 fine categories: todo_add, todo_view, todo_complete, list_manage,
  voice_memo, memory_save, memory_recall, briefing, priorities, journal, gratitude
- LIKELY CONFUSIONS:
  * todo_add vs list_manage (both about adding items)
  * voice_memo vs memory_save (both about saving info)
  * journal vs gratitude (both personal reflection)
  * priorities vs todo_view (both about viewing tasks)
- STRATEGY: Add clear context clues that differentiate similar intents

## Emotional (93.64% → 98%+)
- 11 fine categories: crisis_support, grounding, wellness_check, coaching_motivation,
  coaching_goals, coaching_reflection, grief_support, relationship_advice,
  breakup_support, self_compassion, imposter_syndrome
- LIKELY CONFUSIONS:
  * grounding vs crisis_support (both for distress)
  * breakup_support vs relationship_advice (both relationship)
  * self_compassion vs imposter_syndrome (both self-related)
  * coaching_motivation vs coaching_goals (both coaching)
- STRATEGY: Add emotional cues and specific context triggers

## Media (93.81% → 98%+)
- 10 fine categories: music_play, music_control, music_search, music_playlist,
  music_mood, movie_rec, book_rec, podcast_rec, game, joke
- LIKELY CONFUSIONS:
  * music_play vs music_mood (both about playing music)
  * music_search vs music_playlist (both finding music)
  * book_rec vs podcast_rec (both content recommendations)
- STRATEGY: Add clear action verbs and content type markers

## Finance (94.00% → 98%+)
- 2 fine categories: budget, bills
- ONLY 2 CATEGORIES - should be easy to improve
- LIKELY CONFUSIONS:
  * budget (tracking spending) vs bills (paying/viewing bills)
- STRATEGY: Add clear payment vs tracking language

## Travel (96.02% → 98%+)
- 5 fine categories: travel_plan, flights, directions, weather_current, weather_forecast
- LIKELY CONFUSIONS:
  * weather_current vs weather_forecast (temporal)
  * travel_plan vs flights (both about travel)
- STRATEGY: Add temporal markers (now vs later) and specific action verbs

## Communication (97.72% → 98%+)
- 7 fine categories: call_make, call_manage, message_send, message_read,
  email_send, email_read, contact_manage
- LIKELY CONFUSIONS:
  * call_make vs message_send (both initiating contact)
  * email_send vs message_send (both sending)
  * email_read vs message_read (both reading)
- STRATEGY: Add channel-specific keywords and action verbs
`);
}

main().catch(console.error);
