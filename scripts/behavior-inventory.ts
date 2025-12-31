#!/usr/bin/env npx tsx
/**
 * Behavior File Inventory Script
 *
 * Generates a comprehensive report of all behavior files across personas and marketplace agents.
 *
 * Usage:
 *   npx tsx scripts/behavior-inventory.ts           # Full report
 *   npx tsx scripts/behavior-inventory.ts --json    # JSON output
 *   npx tsx scripts/behavior-inventory.ts --gaps    # Show only gaps
 */

import { readdir, stat } from 'fs/promises';
import { join, basename } from 'path';

// =============================================================================
// CONFIGURATION
// =============================================================================

const CORE_PERSONAS_PATH = join(process.cwd(), 'src/personas/bundles');
const MARKETPLACE_AGENTS_PATH = join(process.cwd(), 'apps/marketplace-agents/agents');

// Core personas (the 6 main personas)
const CORE_PERSONAS = ['ferni', 'maya', 'peter', 'jordan', 'alex', 'nayan'];

// Superhuman behaviors that every persona should ideally have
const SUPERHUMAN_BEHAVIORS = [
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
  'callbacks',
  'energy-matching',
  'emotional-range',
];

// Core behaviors every persona must have
const CORE_BEHAVIORS = [
  'greetings',
  'backchannels',
  'thinking-sounds',
  'entrances',
  'goodbyes',
];

// =============================================================================
// TYPES
// =============================================================================

interface PersonaInventory {
  id: string;
  type: 'core' | 'marketplace';
  behaviorCount: number;
  behaviors: string[];
  missingCore: string[];
  missingSuperhuman: string[];
  superhumanCoverage: number;
}

interface InventoryReport {
  timestamp: string;
  totalPersonas: number;
  corePersonas: PersonaInventory[];
  marketplaceAgents: PersonaInventory[];
  stats: {
    totalBehaviorFiles: number;
    uniqueBehaviorTypes: number;
    avgBehaviorsPerPersona: number;
    universalBehaviors: string[];
    commonBehaviors: string[];
    rareBehaviors: string[];
  };
  gaps: {
    persona: string;
    type: 'core' | 'superhuman';
    missing: string[];
  }[];
}

// =============================================================================
// FUNCTIONS
// =============================================================================

async function getBehaviorFiles(personaPath: string): Promise<string[]> {
  const behaviorsPath = join(personaPath, 'content/behaviors');
  try {
    const files = await readdir(behaviorsPath);
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));
  } catch {
    return [];
  }
}

async function getPersonaInventory(
  personaPath: string,
  type: 'core' | 'marketplace'
): Promise<PersonaInventory> {
  const id = basename(personaPath);
  const behaviors = await getBehaviorFiles(personaPath);

  const missingCore = CORE_BEHAVIORS.filter((b) => !behaviors.includes(b));
  const missingSuperhuman = SUPERHUMAN_BEHAVIORS.filter((b) => !behaviors.includes(b));
  const presentSuperhuman = SUPERHUMAN_BEHAVIORS.filter((b) => behaviors.includes(b));
  const superhumanCoverage = Math.round(
    (presentSuperhuman.length / SUPERHUMAN_BEHAVIORS.length) * 100
  );

  return {
    id,
    type,
    behaviorCount: behaviors.length,
    behaviors: behaviors.sort(),
    missingCore,
    missingSuperhuman,
    superhumanCoverage,
  };
}

async function getPersonaPaths(basePath: string): Promise<string[]> {
  try {
    const entries = await readdir(basePath);
    const paths: string[] = [];

    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const fullPath = join(basePath, entry);
      const stats = await stat(fullPath);
      if (stats.isDirectory()) {
        // Check if it has a persona.manifest.json
        try {
          await stat(join(fullPath, 'persona.manifest.json'));
          paths.push(fullPath);
        } catch {
          // Not a persona bundle
        }
      }
    }

    return paths;
  } catch {
    return [];
  }
}

async function generateReport(): Promise<InventoryReport> {
  // Get all persona paths
  const corePersonaPaths = await getPersonaPaths(CORE_PERSONAS_PATH);
  const marketplaceAgentPaths = await getPersonaPaths(MARKETPLACE_AGENTS_PATH);

  // Get inventories
  const corePersonas = await Promise.all(
    corePersonaPaths.map((p) => getPersonaInventory(p, 'core'))
  );
  const marketplaceAgents = await Promise.all(
    marketplaceAgentPaths.map((p) => getPersonaInventory(p, 'marketplace'))
  );

  // Combine all personas
  const allPersonas = [...corePersonas, ...marketplaceAgents];
  const allBehaviors = new Set<string>();
  let totalFiles = 0;

  for (const persona of allPersonas) {
    totalFiles += persona.behaviorCount;
    persona.behaviors.forEach((b) => allBehaviors.add(b));
  }

  // Calculate behavior frequency
  const behaviorCounts: Record<string, number> = {};
  for (const behavior of allBehaviors) {
    behaviorCounts[behavior] = allPersonas.filter((p) =>
      p.behaviors.includes(behavior)
    ).length;
  }

  // Categorize behaviors by frequency
  const sortedBehaviors = [...allBehaviors].sort(
    (a, b) => behaviorCounts[b] - behaviorCounts[a]
  );

  const universalBehaviors = sortedBehaviors.filter(
    (b) => behaviorCounts[b] === allPersonas.length
  );
  const commonBehaviors = sortedBehaviors.filter(
    (b) =>
      behaviorCounts[b] >= allPersonas.length * 0.8 &&
      !universalBehaviors.includes(b)
  );
  const rareBehaviors = sortedBehaviors.filter(
    (b) => behaviorCounts[b] < allPersonas.length * 0.5
  );

  // Find gaps
  const gaps: InventoryReport['gaps'] = [];
  for (const persona of allPersonas) {
    if (persona.missingCore.length > 0) {
      gaps.push({
        persona: persona.id,
        type: 'core',
        missing: persona.missingCore,
      });
    }
    if (persona.missingSuperhuman.length > 0) {
      gaps.push({
        persona: persona.id,
        type: 'superhuman',
        missing: persona.missingSuperhuman,
      });
    }
  }

  return {
    timestamp: new Date().toISOString(),
    totalPersonas: allPersonas.length,
    corePersonas,
    marketplaceAgents,
    stats: {
      totalBehaviorFiles: totalFiles,
      uniqueBehaviorTypes: allBehaviors.size,
      avgBehaviorsPerPersona: Math.round(totalFiles / allPersonas.length),
      universalBehaviors,
      commonBehaviors,
      rareBehaviors,
    },
    gaps,
  };
}

function printReport(report: InventoryReport, showGapsOnly = false): void {
  console.log('\n' + '='.repeat(80));
  console.log('  BEHAVIOR FILE INVENTORY REPORT');
  console.log('  Generated: ' + report.timestamp);
  console.log('='.repeat(80) + '\n');

  if (!showGapsOnly) {
    // Summary
    console.log('📊 SUMMARY');
    console.log('-'.repeat(40));
    console.log(`Total Personas:        ${report.totalPersonas}`);
    console.log(`  Core Personas:       ${report.corePersonas.length}`);
    console.log(`  Marketplace Agents:  ${report.marketplaceAgents.length}`);
    console.log(`Total Behavior Files:  ${report.stats.totalBehaviorFiles}`);
    console.log(`Unique Behavior Types: ${report.stats.uniqueBehaviorTypes}`);
    console.log(`Avg per Persona:       ${report.stats.avgBehaviorsPerPersona}`);
    console.log('');

    // Behavior frequency
    console.log('📦 BEHAVIOR FREQUENCY');
    console.log('-'.repeat(40));
    console.log(`Universal (all personas): ${report.stats.universalBehaviors.length}`);
    if (report.stats.universalBehaviors.length > 0) {
      console.log(`   ${report.stats.universalBehaviors.join(', ')}`);
    }
    console.log(`\nCommon (80%+ personas): ${report.stats.commonBehaviors.length}`);
    if (report.stats.commonBehaviors.length > 0) {
      console.log(`   ${report.stats.commonBehaviors.join(', ')}`);
    }
    console.log(`\nRare (<50% personas): ${report.stats.rareBehaviors.length}`);
    if (report.stats.rareBehaviors.length <= 20) {
      console.log(`   ${report.stats.rareBehaviors.join(', ')}`);
    } else {
      console.log(`   (${report.stats.rareBehaviors.length} behaviors - too many to list)`);
    }
    console.log('');

    // Core personas
    console.log('🎭 CORE PERSONAS');
    console.log('-'.repeat(40));
    for (const persona of report.corePersonas.sort((a, b) => b.behaviorCount - a.behaviorCount)) {
      const status = persona.superhumanCoverage >= 70 ? '✅' : persona.superhumanCoverage >= 50 ? '🟡' : '🔴';
      console.log(`${status} ${persona.id.padEnd(15)} ${persona.behaviorCount} behaviors (${persona.superhumanCoverage}% superhuman)`);
    }
    console.log('');

    // Marketplace agents
    console.log('🏪 MARKETPLACE AGENTS');
    console.log('-'.repeat(40));
    for (const agent of report.marketplaceAgents.sort((a, b) => b.behaviorCount - a.behaviorCount)) {
      const status = agent.superhumanCoverage >= 70 ? '✅' : agent.superhumanCoverage >= 50 ? '🟡' : '🔴';
      console.log(`${status} ${agent.id.padEnd(25)} ${agent.behaviorCount} behaviors (${agent.superhumanCoverage}% superhuman)`);
    }
    console.log('');
  }

  // Gaps
  console.log('⚠️  GAPS (Missing Behaviors)');
  console.log('-'.repeat(40));

  const coreGaps = report.gaps.filter((g) => g.type === 'core');
  const superhumanGaps = report.gaps.filter((g) => g.type === 'superhuman');

  if (coreGaps.length > 0) {
    console.log('\nMissing CORE behaviors (critical):');
    for (const gap of coreGaps) {
      console.log(`   ${gap.persona}: ${gap.missing.join(', ')}`);
    }
  } else {
    console.log('\n✅ All personas have all core behaviors!');
  }

  if (superhumanGaps.length > 0) {
    console.log('\nMissing SUPERHUMAN behaviors (recommended):');
    // Group by missing behavior
    const byBehavior: Record<string, string[]> = {};
    for (const gap of superhumanGaps) {
      for (const behavior of gap.missing) {
        byBehavior[behavior] = byBehavior[behavior] || [];
        byBehavior[behavior].push(gap.persona);
      }
    }

    // Sort by most missing
    const sortedBehaviors = Object.entries(byBehavior).sort(
      (a, b) => b[1].length - a[1].length
    );

    for (const [behavior, personas] of sortedBehaviors.slice(0, 10)) {
      console.log(`   ${behavior}: missing in ${personas.length} personas`);
    }
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const gapsOnly = args.includes('--gaps');

  const report = await generateReport();

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report, gapsOnly);
  }
}

main().catch(console.error);
