/**
 * Debug Script: Music Routing Confidence Analysis
 *
 * Tests what confidence scores "play some jazz" and similar phrases get
 * to understand why music isn't auto-executing.
 *
 * Run: npx tsx scripts/debug-music-routing.ts
 */

import { SemanticRouter } from '../src/tools/semantic-router/router.js';
import { musicTools } from '../src/tools/semantic-router/tool-definitions/music.semantic.js';
import { getThresholds, isGeminiProblemPhrase, getGeminiConfidenceBoost } from '../src/tools/semantic-router/integration/config.js';

async function main() {
  console.log('🎵 Music Routing Confidence Debug\n');
  console.log('='.repeat(60));

  // Get current thresholds
  const thresholds = getThresholds();
  console.log('\n📊 Current Thresholds:');
  console.log(`   Auto-execute: ${(thresholds.autoExecute * 100).toFixed(0)}% (bypasses LLM)`);
  console.log(`   Confirm:      ${(thresholds.confirm * 100).toFixed(0)}% (asks for confirmation)`);
  console.log(`   Hint:         ${(thresholds.hint * 100).toFixed(0)}% (adds hint to LLM)`);

  // Initialize router with music tools only
  const router = new SemanticRouter({
    tools: musicTools,
    thresholds,
  });
  await router.initialize();

  // Test phrases
  const testPhrases = [
    'play some jazz',
    'play music',
    'can you play some music',
    'play christmas music',
    'put on some jazz',
    'I want to hear some music',
    "let's hear some jazz",
    'play something relaxing',
    'play Bohemian Rhapsody',
    'could you play some chill music',
  ];

  console.log('\n🎯 Testing Phrases:\n');
  console.log('| Phrase                          | Raw Conf | Gemini Boost | Final   | Action          |');
  console.log('|' + '-'.repeat(33) + '|' + '-'.repeat(10) + '|' + '-'.repeat(14) + '|' + '-'.repeat(9) + '|' + '-'.repeat(17) + '|');

  for (const phrase of testPhrases) {
    const result = await router.route(phrase);
    const topMatch = result.matches[0];

    if (topMatch) {
      const isGeminiProblem = isGeminiProblemPhrase(phrase);
      const geminiBoost = getGeminiConfidenceBoost(phrase);
      const rawConf = topMatch.confidence / geminiBoost; // Reverse the boost to get raw
      const finalConf = topMatch.confidence;

      let action: string;
      if (finalConf >= thresholds.autoExecute) {
        action = '✅ AUTO-EXECUTE';
      } else if (finalConf >= thresholds.confirm) {
        action = '⚠️ CONFIRM';
      } else if (finalConf >= thresholds.hint) {
        action = '💡 HINT';
      } else {
        action = '❌ NO MATCH';
      }

      const boostStr = geminiBoost > 1 ? `+${((geminiBoost - 1) * 100).toFixed(0)}%` : '-';

      console.log(
        `| ${phrase.padEnd(31)} | ${(rawConf * 100).toFixed(1).padStart(5)}%   | ${boostStr.padStart(12)} | ${(finalConf * 100).toFixed(1).padStart(5)}%  | ${action.padEnd(15)} |`
      );
    } else {
      console.log(`| ${phrase.padEnd(31)} | -        | -            | -       | ❌ NO MATCH      |`);
    }
  }

  console.log('\n');
  console.log('='.repeat(60));
  console.log('\n📋 Analysis:');
  console.log(`   - Phrases with < ${(thresholds.autoExecute * 100).toFixed(0)}% confidence will NOT auto-execute`);
  console.log(`   - These go to LLM with a "hint" but Gemini often ignores it`);
  console.log(`   - Consider lowering autoExecute threshold or boosting music confidence`);
  console.log('\n💡 Suggested Fix Options:');
  console.log('   1. Lower autoExecute threshold from 92% to 85% for music tools');
  console.log('   2. Increase Gemini boost from 15% to 25% for music phrases');
  console.log('   3. Add more exact-match patterns to music tool triggers');
}

main().catch(console.error);
