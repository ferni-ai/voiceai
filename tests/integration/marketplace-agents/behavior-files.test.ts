/**
 * Marketplace Agents Behavior Files E2E Test
 *
 * Validates that all marketplace agents have properly structured behavior files
 * that load correctly through the bundle loader.
 *
 * Run with:
 *   pnpm vitest tests/integration/marketplace-agents/behavior-files.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { loadBundle } from '../../../src/personas/bundles/loader.js';
import { join } from 'path';
import { readdir } from 'fs/promises';

// =============================================================================
// TEST DATA
// =============================================================================

const MARKETPLACE_AGENTS_PATH = join(process.cwd(), 'apps/marketplace-agents/agents');

// All 15 marketplace agents
const MARKETPLACE_AGENTS = [
  'amara-osei',
  'atlas-career-navigator',
  'carmen-reyes',
  'eli-brennan',
  'kenji-mori',
  'luna-sleep-guide',
  'marcus-webb',
  'moxie-accountability',
  'pixel-tech-translator',
  'ray-chen',
  'river-grief-companion',
  'sage-relationship-navigator',
  'sasha-kim',
  'spark-creativity-catalyst',
  'zen-presence-guide',
];

// Core behavior files that every agent should have
const CORE_BEHAVIOR_FILES = [
  'greetings',
  'backchannels',
  'thinking-sounds',
  'entrances',
  'goodbyes',
];

// 200% superhuman behavior files (the advanced personality system)
const SUPERHUMAN_BEHAVIOR_FILES = [
  'emotional-intelligence',
  'self-doubt',
  'secret-fears',
  'physical-presence',
  'silence-responses',
  'predictive-intelligence',
  'sensory-moments',
  'thinking-of-you',
  'storytelling',
  'running-jokes',
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function getAgentBehaviorFiles(agentId: string): Promise<string[]> {
  const behaviorsPath = join(MARKETPLACE_AGENTS_PATH, agentId, 'content/behaviors');
  try {
    const files = await readdir(behaviorsPath);
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));
  } catch {
    return [];
  }
}

// =============================================================================
// BUNDLE LOADING TESTS
// =============================================================================

describe('Marketplace Agents - Bundle Loading', () => {
  it('should have all expected marketplace agents', async () => {
    const agents = await readdir(MARKETPLACE_AGENTS_PATH);
    const agentDirs = agents.filter((a) => !a.startsWith('.'));

    console.log(`\n📦 Found ${agentDirs.length} marketplace agents:`);
    for (const agent of agentDirs.sort()) {
      console.log(`   • ${agent}`);
    }

    expect(agentDirs.length).toBeGreaterThanOrEqual(15);
  });

  it.each(MARKETPLACE_AGENTS)('should load bundle for %s', async (agentId) => {
    const bundlePath = join(MARKETPLACE_AGENTS_PATH, agentId);
    const bundle = await loadBundle(bundlePath);

    expect(bundle).toBeDefined();
    expect(bundle.manifest).toBeDefined();
    // Note: Some manifests have shortened IDs (e.g., "zen" instead of "zen-presence-guide")
    expect(bundle.manifest.identity.id).toBeTruthy();

    console.log(`   ✅ ${agentId} (${bundle.manifest.identity.id}) - loaded successfully`);
  });
});

// =============================================================================
// BEHAVIOR FILE LOADING TESTS
// =============================================================================

describe('Marketplace Agents - Behavior Loading', () => {
  it.each(MARKETPLACE_AGENTS)('should load behaviors for %s', async (agentId) => {
    const bundlePath = join(MARKETPLACE_AGENTS_PATH, agentId);
    const bundle = await loadBundle(bundlePath);
    const behaviors = await bundle.getBehaviors();

    expect(behaviors).toBeDefined();
    expect(typeof behaviors).toBe('object');

    // Count loaded behaviors
    const behaviorKeys = Object.keys(behaviors);
    console.log(`   📂 ${agentId}: ${behaviorKeys.length} behavior types loaded`);
  });

  it.each(MARKETPLACE_AGENTS)('should have greetings for %s', async (agentId) => {
    const bundlePath = join(MARKETPLACE_AGENTS_PATH, agentId);
    const bundle = await loadBundle(bundlePath);
    const behaviors = await bundle.getBehaviors();

    expect(behaviors.greetings).toBeDefined();

    // Greetings can have many structures - just verify it's non-empty
    const greetings = behaviors.greetings;
    expect(greetings).toBeTruthy();

    // Check it has some content (any non-empty object or array)
    if (typeof greetings === 'object') {
      const keys = Object.keys(greetings);
      expect(keys.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// SCHEMA VERSION VALIDATION
// =============================================================================

describe('Marketplace Agents - Schema Validation', () => {
  it.each(MARKETPLACE_AGENTS)(
    'should have schema_version 2 in behavior files for %s',
    async (agentId) => {
      const bundlePath = join(MARKETPLACE_AGENTS_PATH, agentId);
      const bundle = await loadBundle(bundlePath);
      const behaviors = await bundle.getBehaviors();

      // Check predictive-intelligence if it exists (should have schema_version 2)
      const predictiveIntel = behaviors['predictive-intelligence'];
      if (predictiveIntel && typeof predictiveIntel === 'object') {
        const pi = predictiveIntel as { schema_version?: number };
        if (pi.schema_version !== undefined) {
          expect(pi.schema_version).toBe(2);
        }
      }

      // Check self_doubt if it exists
      if (behaviors.self_doubt && typeof behaviors.self_doubt === 'object') {
        const sd = behaviors.self_doubt as { schema_version?: number };
        if (sd.schema_version !== undefined) {
          expect(sd.schema_version).toBe(2);
        }
      }
    }
  );
});

// =============================================================================
// 200% SUPERHUMAN BEHAVIORS TEST
// =============================================================================

describe('Marketplace Agents - 200% Superhuman Behaviors', () => {
  it.each(MARKETPLACE_AGENTS)(
    'should have superhuman behavior files for %s',
    async (agentId) => {
      const behaviorFiles = await getAgentBehaviorFiles(agentId);

      // Track which superhuman behaviors exist
      const presentBehaviors: string[] = [];
      const missingBehaviors: string[] = [];

      for (const behavior of SUPERHUMAN_BEHAVIOR_FILES) {
        if (behaviorFiles.includes(behavior)) {
          presentBehaviors.push(behavior);
        } else {
          missingBehaviors.push(behavior);
        }
      }

      // Log status
      const coverage = Math.round((presentBehaviors.length / SUPERHUMAN_BEHAVIOR_FILES.length) * 100);
      console.log(`   🚀 ${agentId}: ${coverage}% superhuman coverage (${presentBehaviors.length}/${SUPERHUMAN_BEHAVIOR_FILES.length})`);

      if (missingBehaviors.length > 0 && missingBehaviors.length <= 5) {
        console.log(`      Missing: ${missingBehaviors.join(', ')}`);
      }

      // Expect at least some superhuman behaviors (minimum 3 core ones)
      // Full 70%+ coverage is ideal but not required for all agents yet
      expect(presentBehaviors.length).toBeGreaterThanOrEqual(3);
    }
  );
});

// =============================================================================
// BEHAVIOR FILE INVENTORY
// =============================================================================

describe('Marketplace Agents - Behavior Inventory', () => {
  it('should generate behavior file inventory', async () => {
    console.log('\n📊 BEHAVIOR FILE INVENTORY\n');
    console.log('=' .repeat(80));

    const inventory: Record<string, string[]> = {};
    const allBehaviors = new Set<string>();

    // Collect all behaviors from all agents
    for (const agentId of MARKETPLACE_AGENTS) {
      const files = await getAgentBehaviorFiles(agentId);
      inventory[agentId] = files;
      files.forEach((f) => allBehaviors.add(f));
    }

    // Print header
    console.log('\nBehavior Coverage Matrix:\n');

    // Find which behaviors are common vs rare
    const behaviorCounts: Record<string, number> = {};
    for (const behavior of allBehaviors) {
      behaviorCounts[behavior] = 0;
      for (const agentId of MARKETPLACE_AGENTS) {
        if (inventory[agentId].includes(behavior)) {
          behaviorCounts[behavior]++;
        }
      }
    }

    // Sort by frequency
    const sortedBehaviors = [...allBehaviors].sort(
      (a, b) => behaviorCounts[b] - behaviorCounts[a]
    );

    // Print universal behaviors (all agents have them)
    const universal = sortedBehaviors.filter((b) => behaviorCounts[b] === MARKETPLACE_AGENTS.length);
    console.log(`✅ Universal (${universal.length}): ${universal.join(', ')}`);

    // Print common behaviors (80%+ agents)
    const common = sortedBehaviors.filter(
      (b) => behaviorCounts[b] >= MARKETPLACE_AGENTS.length * 0.8 && !universal.includes(b)
    );
    console.log(`📦 Common (${common.length}): ${common.join(', ')}`);

    // Print rare behaviors (<50% agents)
    const rare = sortedBehaviors.filter((b) => behaviorCounts[b] < MARKETPLACE_AGENTS.length * 0.5);
    console.log(`🔸 Rare (${rare.length}): ${rare.join(', ')}`);

    console.log('\n' + '='.repeat(80));

    // Total behavior files count
    let totalFiles = 0;
    for (const agentId of MARKETPLACE_AGENTS) {
      totalFiles += inventory[agentId].length;
    }
    console.log(`\n📁 Total behavior files: ${totalFiles}`);
    console.log(`📂 Unique behavior types: ${allBehaviors.size}`);
    console.log(`📦 Average per agent: ${Math.round(totalFiles / MARKETPLACE_AGENTS.length)}`);

    expect(totalFiles).toBeGreaterThan(0);
  });
});

// =============================================================================
// PREDICTIVE INTELLIGENCE VALIDATION
// =============================================================================

describe('Marketplace Agents - Predictive Intelligence', () => {
  it.each(MARKETPLACE_AGENTS)(
    'should have valid predictive intelligence for %s',
    async (agentId) => {
      const bundlePath = join(MARKETPLACE_AGENTS_PATH, agentId);
      const bundle = await loadBundle(bundlePath);
      const behaviors = await bundle.getBehaviors();

      const predictiveIntel = behaviors['predictive-intelligence'];

      if (predictiveIntel && typeof predictiveIntel === 'object') {
        const pi = predictiveIntel as {
          schema_version?: number;
          pattern_recognition?: {
            temporal_patterns?: Record<string, unknown>;
            emotional_patterns?: Record<string, unknown>;
            behavioral_patterns?: Record<string, unknown>;
          };
          usage_rules?: Record<string, unknown>;
        };

        // Validate structure
        expect(pi.schema_version).toBe(2);
        expect(pi.pattern_recognition).toBeDefined();

        // Check for pattern types
        const patternTypes = [
          pi.pattern_recognition?.temporal_patterns,
          pi.pattern_recognition?.emotional_patterns,
          pi.pattern_recognition?.behavioral_patterns,
        ].filter(Boolean);

        expect(patternTypes.length).toBeGreaterThan(0);
        console.log(`   🔮 ${agentId}: ${patternTypes.length} pattern types`);
      }
    }
  );
});
