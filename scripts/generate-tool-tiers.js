#!/usr/bin/env node
/**
 * Build-Time Code Generator for Tool Tiers
 *
 * STATE OF THE ART 2026:
 * - JSON config is for HUMANS to edit
 * - TypeScript is for MACHINES to execute
 * - This script bridges them at BUILD TIME, not runtime
 *
 * Run: `node scripts/generate-tool-tiers.js`
 * Result: Zero-latency configuration - just TypeScript imports
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// EMBEDDING GENERATION
// ============================================================================

/**
 * Pre-compute trigger embeddings at build time.
 * Simple but effective: character n-gram frequency vector
 * Runs in microseconds, not milliseconds
 */
function computeTriggerSignature(triggers) {
  const charFreq = new Map();

  for (const trigger of triggers) {
    const lower = trigger.toLowerCase();
    // Unigrams
    for (const char of lower) {
      charFreq.set(char, (charFreq.get(char) || 0) + 1);
    }
    // Bigrams
    for (let i = 0; i < lower.length - 1; i++) {
      const bigram = lower.slice(i, i + 2);
      charFreq.set(bigram, (charFreq.get(bigram) || 0) + 1);
    }
  }

  // Convert to fixed-size vector (26 letters + 50 common bigrams)
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const vector = [];

  // Letter frequencies
  for (const char of alphabet) {
    vector.push(charFreq.get(char) || 0);
  }

  // Common bigrams (most predictive for English)
  const commonBigrams = [
    'th', 'he', 'in', 'er', 'an', 'on', 'or', 're', 'ed', 'nd',
    'es', 'en', 'at', 'to', 'nt', 'is', 'it', 'ou', 'ea', 'st',
    'ar', 'ng', 'al', 'te', 'co', 'de', 'ra', 'et', 'ti', 'sa',
    'ne', 'ri', 'se', 'le', 'of', 'as', 'me', 've', 'io', 'be',
    'om', 'ce', 'li', 'ha', 'ma', 'lo', 'ur', 'el', 'la', 'no',
  ];
  for (const bigram of commonBigrams) {
    vector.push(charFreq.get(bigram) || 0);
  }

  // Normalize to unit vector
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    return vector.map((v) => v / magnitude);
  }
  return vector;
}

// ============================================================================
// CODE GENERATION
// ============================================================================

function generateTypeScript(config) {
  const lines = [];

  lines.push(`/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 *
 * Generated from: tool-tiers.json
 * Generated at: ${new Date().toISOString()}
 * Generator: scripts/generate-tool-tiers.js
 *
 * This file is imported directly - NO JSON parsing at runtime!
 * Edit tool-tiers.json and run: pnpm build:tool-tiers
 */

import type { ToolDomain } from '../registry/types.js';

// ============================================================================
// CONFIGURATION VERSION
// ============================================================================

export const TOOL_TIERS_VERSION = '${config.version}' as const;

// ============================================================================
// TIER 0: INSTANT (Always in memory, 0ms latency)
// ============================================================================

/** Domains that are ALWAYS loaded at process start */
export const TIER_0_DOMAINS: readonly ToolDomain[] = [
${config.tiers.instant.domains.map((d) => `  '${d}',`).join('\n')}
] as const;

/** Critical tools that MUST be available instantly */
export const TIER_0_CRITICAL_TOOLS: readonly string[] = [
${config.tiers.instant.criticalTools.map((t) => `  '${t}',`).join('\n')}
] as const;

/** Fast lookup set for Tier 0 domains */
export const TIER_0_DOMAIN_SET: ReadonlySet<ToolDomain> = new Set(TIER_0_DOMAINS);

/** Fast lookup set for critical tools */
export const CRITICAL_TOOLS_SET: ReadonlySet<string> = new Set(TIER_0_CRITICAL_TOOLS);

// ============================================================================
// TIER 1: PRELOADED (Loaded at session start, <100ms)
// ============================================================================

/** Domains loaded at session start for all users */
export const TIER_1_DOMAINS: readonly ToolDomain[] = [
${config.tiers.preloaded.domains.map((d) => `  '${d}',`).join('\n')}
] as const;

/** Conditional domains based on user profile */
export const TIER_1_CONDITIONAL: Readonly<Record<string, readonly ToolDomain[]>> = {
${Object.entries(config.tiers.preloaded.conditionalDomains)
  .map(([key, domains]) => `  ${key}: [${domains.map((d) => `'${d}'`).join(', ')}],`)
  .join('\n')}
} as const;

/** Fast lookup set for Tier 1 domains */
export const TIER_1_DOMAIN_SET: ReadonlySet<ToolDomain> = new Set(TIER_1_DOMAINS);

// ============================================================================
// TIER 2: PREDICTIVE (Context-based prefetch, <500ms)
// ============================================================================

export interface PredictiveRule {
  readonly id: string;
  readonly triggers: readonly string[];
  readonly triggerSet: ReadonlySet<string>;
  readonly timeCondition?: { readonly hours: readonly number[] };
  readonly domains: readonly ToolDomain[];
  readonly priority: 'high' | 'medium' | 'low';
  /** Pre-computed embedding for fast similarity matching */
  readonly embedding: readonly number[];
}

/** Predictive loading rules with pre-computed data */
export const PREDICTIVE_RULES: readonly PredictiveRule[] = [`);

  // Generate predictive rules with embeddings
  for (const rule of config.tiers.predictive.rules) {
    const embedding = computeTriggerSignature(rule.triggers);
    const timeConditionStr = rule.timeCondition
      ? `timeCondition: { hours: [${rule.timeCondition.hours.join(', ')}] },\n    `
      : '';
    // Escape apostrophes in trigger words
    const escapeTrigger = (t) => t.replace(/'/g, "\\'");
    lines.push(`  {
    id: '${rule.id}',
    triggers: [${rule.triggers.map((t) => `'${escapeTrigger(t)}'`).join(', ')}],
    triggerSet: new Set([${rule.triggers.map((t) => `'${escapeTrigger(t.toLowerCase())}'`).join(', ')}]),
    ${timeConditionStr}domains: [${rule.domains.map((d) => `'${d}'`).join(', ')}] as const,
    priority: '${rule.priority}',
    embedding: [${embedding.map((e) => e.toFixed(6)).join(', ')}],
  },`);
  }

  // Build trigger-to-rules map
  const triggerMap = new Map();
  for (const rule of config.tiers.predictive.rules) {
    for (const trigger of rule.triggers) {
      const lower = trigger.toLowerCase();
      if (!triggerMap.has(lower)) {
        triggerMap.set(lower, []);
      }
      triggerMap.get(lower).push(rule.id);
    }
  }

  const allTriggers = [...new Set(config.tiers.predictive.rules.flatMap((r) => r.triggers.map((t) => t.toLowerCase())))];
  
  // Helper to escape apostrophes in strings
  const escapeTrigger = (t) => t.replace(/'/g, "\\'");

  lines.push(`] as const;

/** Map from trigger word to rules (for O(1) lookup) */
export const TRIGGER_TO_RULES: ReadonlyMap<string, readonly PredictiveRule[]> = new Map([
${Array.from(triggerMap.entries())
  .map(([trigger, ruleIds]) => {
    return `  ['${escapeTrigger(trigger)}', PREDICTIVE_RULES.filter(r => [${ruleIds.map((id) => `'${id}'`).join(', ')}].includes(r.id))],`;
  })
  .join('\n')}
]);

/** All trigger words as a Set for fast contains() checks */
export const ALL_TRIGGER_WORDS: ReadonlySet<string> = new Set([
${allTriggers.map((t) => `  '${escapeTrigger(t)}',`).join('\n')}
]);

// ============================================================================
// TIER 3: ON-DEMAND (Load only when explicitly needed)
// ============================================================================

/** Domains that are only loaded when explicitly requested */
export const TIER_3_DOMAINS: readonly ToolDomain[] = [
${config.tiers.onDemand.domains.map((d) => `  '${d}',`).join('\n')}
] as const;

/** Fast lookup set for on-demand domains */
export const TIER_3_DOMAIN_SET: ReadonlySet<ToolDomain> = new Set(TIER_3_DOMAINS);

// ============================================================================
// METRICS TARGETS
// ============================================================================

export const LOAD_TIME_TARGETS = {
  tier0: ${config.metrics.targetTier0LoadTime},
  tier1: ${config.metrics.targetTier1LoadTime},
  tier2: ${config.metrics.targetTier2LoadTime},
  tier3: ${config.metrics.targetTier3LoadTime},
} as const;

// ============================================================================
// UTILITY FUNCTIONS (pre-compiled for speed)
// ============================================================================

/** Pre-computed session start domains (Tier 0 + Tier 1) */
export const SESSION_START_DOMAINS: readonly ToolDomain[] = [
  ...TIER_0_DOMAINS,
  ...TIER_1_DOMAINS,
] as const;

/**
 * Check if a domain is in a specific tier.
 * O(1) lookup using pre-built Sets.
 */
export function getDomainTier(domain: ToolDomain): 0 | 1 | 2 | 3 | -1 {
  if (TIER_0_DOMAIN_SET.has(domain)) return 0;
  if (TIER_1_DOMAIN_SET.has(domain)) return 1;
  if (TIER_3_DOMAIN_SET.has(domain)) return 3;
  return 2; // Default to predictive tier
}

/**
 * Check if a tool is critical (must be instantly available).
 * O(1) lookup.
 */
export function isCriticalTool(toolId: string): boolean {
  return CRITICAL_TOOLS_SET.has(toolId);
}

/**
 * Get all Tier 0 + Tier 1 domains (for session start).
 * Pre-computed, just returns array reference.
 */
export function getSessionStartDomains(): readonly ToolDomain[] {
  return SESSION_START_DOMAINS;
}

// ============================================================================
// FAST PREDICTION (No API calls, microsecond latency)
// ============================================================================

/**
 * Fast keyword-based prediction.
 * Checks if any trigger words are present.
 *
 * @param words - Pre-tokenized words from transcript
 * @returns Matched rules sorted by priority
 */
export function predictFromWords(words: readonly string[]): PredictiveRule[] {
  const matched = new Set<PredictiveRule>();

  for (const word of words) {
    const rules = TRIGGER_TO_RULES.get(word);
    if (rules) {
      for (const rule of rules) {
        matched.add(rule);
      }
    }
  }

  // Sort by priority: high > medium > low
  return Array.from(matched).sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

/**
 * Compute embedding for input text.
 * Uses same algorithm as build-time embedding generation.
 * Runs in microseconds.
 */
export function computeTextEmbedding(text: string): number[] {
  const charFreq = new Map<string, number>();
  const lower = text.toLowerCase();

  // Unigrams
  for (const char of lower) {
    if (char >= 'a' && char <= 'z') {
      charFreq.set(char, (charFreq.get(char) || 0) + 1);
    }
  }

  // Bigrams
  for (let i = 0; i < lower.length - 1; i++) {
    const c1 = lower[i];
    const c2 = lower[i + 1];
    if (c1 >= 'a' && c1 <= 'z' && c2 >= 'a' && c2 <= 'z') {
      const bigram = c1 + c2;
      charFreq.set(bigram, (charFreq.get(bigram) || 0) + 1);
    }
  }

  // Convert to vector (must match build-time algorithm!)
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const commonBigrams = [
    'th', 'he', 'in', 'er', 'an', 'on', 'or', 're', 'ed', 'nd',
    'es', 'en', 'at', 'to', 'nt', 'is', 'it', 'ou', 'ea', 'st',
    'ar', 'ng', 'al', 'te', 'co', 'de', 'ra', 'et', 'ti', 'sa',
    'ne', 'ri', 'se', 'le', 'of', 'as', 'me', 've', 'io', 'be',
    'om', 'ce', 'li', 'ha', 'ma', 'lo', 'ur', 'el', 'la', 'no',
  ];

  const vector: number[] = [];
  for (const char of alphabet) {
    vector.push(charFreq.get(char) || 0);
  }
  for (const bigram of commonBigrams) {
    vector.push(charFreq.get(bigram) || 0);
  }

  // Normalize
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude > 0) {
    return vector.map((v) => v / magnitude);
  }
  return vector;
}

/**
 * Cosine similarity between two vectors.
 * Runs in microseconds.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    dot += a[i] * b[i];
  }
  return dot; // Already normalized, so dot product = cosine similarity
}

/**
 * Semantic prediction using pre-computed embeddings.
 * Finds rules with similar trigger patterns.
 *
 * @param text - Input text
 * @param threshold - Minimum similarity (0-1)
 * @returns Rules above threshold, sorted by similarity
 */
export function predictSemantic(text: string, threshold = 0.3): Array<{ rule: PredictiveRule; similarity: number }> {
  const inputEmbedding = computeTextEmbedding(text);
  const matches: Array<{ rule: PredictiveRule; similarity: number }> = [];

  for (const rule of PREDICTIVE_RULES) {
    const similarity = cosineSimilarity(inputEmbedding, rule.embedding);
    if (similarity >= threshold) {
      matches.push({ rule, similarity });
    }
  }

  return matches.sort((a, b) => b.similarity - a.similarity);
}
`);

  return lines.join('\n');
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  const configPath = join(__dirname, '..', 'src', 'tools', 'gateway', 'tool-tiers.json');
  const outputPath = join(__dirname, '..', 'src', 'tools', 'gateway', 'tool-tiers.generated.ts');

  console.log('🔧 Tool Tiers Code Generator');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Check if config exists
  if (!existsSync(configPath)) {
    console.error(`❌ Config not found: ${configPath}`);
    process.exit(1);
  }

  // Read config
  console.log(`📖 Reading: ${configPath}`);
  const configText = readFileSync(configPath, 'utf-8');
  const config = JSON.parse(configText);

  // Generate TypeScript
  console.log(`⚙️  Generating TypeScript...`);
  const typescript = generateTypeScript(config);

  // Write output
  console.log(`📝 Writing: ${outputPath}`);
  writeFileSync(outputPath, typescript, 'utf-8');

  // Stats
  const ruleCount = config.tiers.predictive.rules.length;
  const triggerCount = config.tiers.predictive.rules.reduce(
    (sum, r) => sum + r.triggers.length,
    0
  );
  const totalDomains =
    config.tiers.instant.domains.length +
    config.tiers.preloaded.domains.length +
    config.tiers.onDemand.domains.length;

  console.log('');
  console.log('✅ Generated successfully!');
  console.log(`   • ${totalDomains} domains configured`);
  console.log(`   • ${ruleCount} predictive rules`);
  console.log(`   • ${triggerCount} trigger words`);
  console.log(`   • ${config.tiers.instant.criticalTools.length} critical tools`);
  console.log('');
  console.log('💡 Import with:');
  console.log("   import { TIER_0_DOMAINS, predictFromWords } from './tool-tiers.generated.js'");
}

main();
