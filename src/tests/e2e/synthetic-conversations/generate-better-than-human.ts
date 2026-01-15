#!/usr/bin/env npx tsx
/**
 * Generate "Better Than Human" synthetic test conversations
 *
 * These tests validate Ferni's superhuman capabilities:
 * - Perfect Memory: Never forgets a detail
 * - Pattern Recognition: Sees what humans miss
 * - Commitment Tracking: Promises never forgotten
 * - Relationship Network: Tracks complex social graphs
 * - Emotional Anticipation: Knows before they say it
 *
 * Run: npx tsx src/tests/e2e/synthetic-conversations/generate-better-than-human.ts
 */

import {
  ConversationGenerator,
  type ConversationCategory,
  type SyntheticConversation,
} from './conversation-generator.js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BETTER_THAN_HUMAN_CATEGORIES: ConversationCategory[] = [
  'perfect_memory',
  'pattern_recognition',
  'commitment_tracking',
  'relationship_network',
  'emotional_anticipation',
  // Also include stress tests of core capabilities
  'name_capture',
  'correction_handling',
  'stress_test',
  'edge_cases',
];

const DIFFICULTIES = ['easy', 'medium', 'hard', 'edge-case'] as const;

async function generateBetterThanHumanTests(conversationsPerCategory: number = 3): Promise<void> {
  console.log('🦸 Generating "Better Than Human" synthetic tests...\n');

  const generator = new ConversationGenerator();
  const conversations: SyntheticConversation[] = [];
  const errors: string[] = [];

  for (const category of BETTER_THAN_HUMAN_CATEGORIES) {
    console.log(`\n📦 Category: ${category}`);

    for (let i = 0; i < conversationsPerCategory; i++) {
      const difficulty = DIFFICULTIES[i % DIFFICULTIES.length];

      try {
        console.log(`  ⏳ Generating ${difficulty} conversation...`);
        const conv = await generator.generateConversation(category, difficulty);
        conversations.push(conv);
        console.log(`  ✅ Generated: ${conv.scenario.slice(0, 60)}...`);

        // Small delay to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (err) {
        const errorMsg = `Failed ${category}/${difficulty}: ${err}`;
        console.error(`  ❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }
  }

  // Save results
  const outputDir = path.join(__dirname, 'generated');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'better-than-human-tests.json');
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalConversations: conversations.length,
        categories: [...new Set(conversations.map((c) => c.category))],
        conversations,
      },
      null,
      2
    )
  );

  // Also update latest test suite
  const latestPath = path.join(outputDir, 'test-suite-latest.json');

  // Load existing conversations if any
  let existingConvs: SyntheticConversation[] = [];
  if (fs.existsSync(latestPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
      existingConvs = existing.conversations || [];
    } catch {
      // Ignore parse errors
    }
  }

  // Merge new conversations
  const allConversations = [...existingConvs, ...conversations];

  fs.writeFileSync(
    latestPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalConversations: allConversations.length,
        conversations: allConversations,
      },
      null,
      2
    )
  );

  console.log('\n' + '═'.repeat(60));
  console.log(`🎉 Generation Complete!`);
  console.log(`   Total: ${conversations.length} new conversations`);
  console.log(`   Combined: ${allConversations.length} total conversations`);
  console.log(`   Categories: ${[...new Set(conversations.map((c) => c.category))].join(', ')}`);
  console.log(`   Errors: ${errors.length}`);
  console.log(`   Output: ${outputPath}`);
  console.log('═'.repeat(60));

  if (errors.length > 0) {
    console.log('\n⚠️  Errors:');
    errors.forEach((e) => console.log(`   - ${e}`));
  }
}

// Run if executed directly
generateBetterThanHumanTests(3).catch(console.error);
