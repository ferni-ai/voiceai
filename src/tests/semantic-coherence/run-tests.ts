#!/usr/bin/env npx tsx
/**
 * Semantic Coherence Test Runner
 *
 * Run with: pnpm test:semantic
 *
 * Uses LLM reasoning to validate codebase naming, organization,
 * and architectural alignment with our "Better Than Human" philosophy.
 */

import * as fs from 'fs';
import * as path from 'path';
import { extractAllMetadata, generateStructureSummary } from './metadata-extractor.js';
import { generateDomainNamingProbes, allDomainNamingProbes } from './probes/domain-naming.js';
import { allSemanticMemoryProbes } from './probes/semantic-memory.js';
import { allIntegrationWiringProbes } from './probes/integration-wiring.js';
import { allArchitecturalPhilosophyProbes } from './probes/architectural-philosophy.js';
import { evaluateProbes, generateSummary } from './llm-evaluator.js';
import type {
  SemanticProbe,
  SemanticTestConfig,
  ProbeCategory,
  SemanticTestSuiteResult,
} from './types.js';

const SRC_ROOT = path.join(process.cwd(), 'src');

/**
 * Default test configuration
 */
const DEFAULT_CONFIG: SemanticTestConfig = {
  model: 'gemini-2.0-flash',
  passingThreshold: 70,
  categories: [
    'domain-naming',
    'semantic-memory',
    'integration-wiring',
    'architectural-philosophy',
  ],
  generateSuggestions: true,
  verbose: true,
};

/**
 * Get code context for a target path
 */
async function getCodeContext(target: string): Promise<string> {
  // Handle glob patterns
  if (target.includes('*')) {
    return `[Glob pattern: ${target} - would search matching files]`;
  }

  // Handle multiple targets separated by comma
  if (target.includes(',')) {
    const targets = target.split(',').map((t) => t.trim());
    const contexts = await Promise.all(targets.map((t) => getCodeContext(t)));
    return contexts.join('\n\n---\n\n');
  }

  // Try src path first
  const srcPath = path.join(SRC_ROOT, target);
  if (fs.existsSync(srcPath)) {
    const stats = fs.statSync(srcPath);
    if (stats.isDirectory()) {
      const items = fs.readdirSync(srcPath);
      return `Directory: ${target}\nContents: ${items.slice(0, 30).join(', ')}${items.length > 30 ? '...' : ''}`;
    } else {
      const content = fs.readFileSync(srcPath, 'utf-8');
      const lines = content.split('\n').slice(0, 100);
      return lines.join('\n');
    }
  }

  // Try project root path
  const rootPath = path.join(process.cwd(), target);
  if (fs.existsSync(rootPath)) {
    const stats = fs.statSync(rootPath);
    if (stats.isDirectory()) {
      const items = fs.readdirSync(rootPath);
      return `Directory: ${target}\nContents: ${items.slice(0, 30).join(', ')}${items.length > 30 ? '...' : ''}`;
    } else {
      const content = fs.readFileSync(rootPath, 'utf-8');
      const lines = content.split('\n').slice(0, 100);
      return lines.join('\n');
    }
  }

  // Try apps path
  const appsPath = path.join(process.cwd(), 'apps', target);
  if (fs.existsSync(appsPath)) {
    const stats = fs.statSync(appsPath);
    if (stats.isDirectory()) {
      const items = fs.readdirSync(appsPath);
      return `Directory: ${target}\nContents: ${items.slice(0, 30).join(', ')}${items.length > 30 ? '...' : ''}`;
    } else {
      const content = fs.readFileSync(appsPath, 'utf-8');
      const lines = content.split('\n').slice(0, 100);
      return lines.join('\n');
    }
  }

  return `[Target not found: ${target}]`;
}

/**
 * Collect all probes for specified categories
 */
async function collectProbes(categories: ProbeCategory[]): Promise<SemanticProbe[]> {
  const probes: SemanticProbe[] = [];
  const metadata = await extractAllMetadata();

  if (categories.includes('domain-naming')) {
    // Generate dynamic probes from metadata
    probes.push(...generateDomainNamingProbes(metadata.services));
    // Add static probes
    probes.push(...allDomainNamingProbes);
  }

  if (categories.includes('semantic-memory')) {
    probes.push(...allSemanticMemoryProbes);
  }

  if (categories.includes('integration-wiring')) {
    probes.push(...allIntegrationWiringProbes);
  }

  if (categories.includes('architectural-philosophy')) {
    probes.push(...allArchitecturalPhilosophyProbes);
  }

  return probes;
}

/**
 * Run the semantic coherence test suite
 */
async function runTests(config: SemanticTestConfig): Promise<SemanticTestSuiteResult> {
  console.log('\n🧠 Semantic Coherence Test Suite\n');
  console.log('━'.repeat(50));
  console.log(`Model: ${config.model}`);
  console.log(`Passing threshold: ${config.passingThreshold}%`);
  console.log(`Categories: ${config.categories.join(', ')}`);
  console.log('━'.repeat(50));

  // Generate structure summary first
  console.log('\n📊 Analyzing codebase structure...\n');
  const structureSummary = await generateStructureSummary();
  console.log(structureSummary);

  // Collect probes
  console.log('\n📝 Collecting semantic probes...');
  const probes = await collectProbes(config.categories);
  console.log(`Found ${probes.length} probes to evaluate\n`);

  // Group probes by category
  const byCategory = probes.reduce(
    (acc, probe) => {
      if (!acc[probe.category]) {
        acc[probe.category] = [];
      }
      acc[probe.category].push(probe);
      return acc;
    },
    {} as Record<ProbeCategory, SemanticProbe[]>
  );

  // Evaluate each category
  const allResults: Awaited<ReturnType<typeof evaluateProbes>> = [];
  const categoryScores: Record<ProbeCategory, number> = {} as Record<ProbeCategory, number>;

  for (const [category, categoryProbes] of Object.entries(byCategory)) {
    console.log(`\n═══ ${category.toUpperCase()} ═══`);
    console.log(`Evaluating ${categoryProbes.length} probes...\n`);

    const results = await evaluateProbes(categoryProbes, getCodeContext, config);
    allResults.push(...results);

    // Calculate category score
    const totalScore = results.reduce((sum, r) => sum + r.coherenceScore, 0);
    categoryScores[category as ProbeCategory] = Math.round(totalScore / results.length);
  }

  // Generate summary
  const summary = generateSummary(allResults, config);

  // Build result
  const result: SemanticTestSuiteResult = {
    timestamp: new Date().toISOString(),
    config,
    overallScore: summary.overallScore,
    categoryScores,
    results: allResults,
    criticalGaps: summary.criticalGaps,
    summary: generateReadableSummary(summary, categoryScores),
    recommendations: summary.recommendations,
  };

  // Print final report
  printFinalReport(result);

  return result;
}

/**
 * Generate a human-readable summary
 */
function generateReadableSummary(
  summary: ReturnType<typeof generateSummary>,
  categoryScores: Record<ProbeCategory, number>
): string {
  const lines = [
    `Overall semantic coherence: ${summary.overallScore}%`,
    `Pass rate: ${summary.passRate}%`,
    '',
    'Category Breakdown:',
    ...Object.entries(categoryScores).map(([cat, score]) => `  ${cat}: ${score}%`),
  ];

  if (summary.criticalGaps.length > 0) {
    lines.push('', `Critical gaps found: ${summary.criticalGaps.length}`);
  }

  return lines.join('\n');
}

/**
 * Print the final report
 */
function printFinalReport(result: SemanticTestSuiteResult): void {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║          SEMANTIC COHERENCE REPORT                 ║');
  console.log('╠════════════════════════════════════════════════════╣');

  const scoreIcon = result.overallScore >= 80 ? '🟢' : result.overallScore >= 60 ? '🟡' : '🔴';

  console.log(`║  Overall Score: ${scoreIcon} ${result.overallScore}%                           ║`);
  console.log('╠════════════════════════════════════════════════════╣');

  console.log('║  Category Scores:                                  ║');
  for (const [category, score] of Object.entries(result.categoryScores)) {
    const icon = score >= 80 ? '✅' : score >= 60 ? '⚠️' : '❌';
    const paddedCat = category.padEnd(25);
    const paddedScore = `${score}%`.padStart(4);
    console.log(`║    ${icon} ${paddedCat} ${paddedScore}              ║`);
  }

  if (result.criticalGaps.length > 0) {
    console.log('╠════════════════════════════════════════════════════╣');
    console.log('║  Critical Alignment Gaps:                          ║');
    for (const gap of result.criticalGaps.slice(0, 5)) {
      console.log(`║    🚨 ${gap.type}: ${gap.current.slice(0, 30)}...      ║`);
    }
  }

  if (result.recommendations.length > 0) {
    console.log('╠════════════════════════════════════════════════════╣');
    console.log('║  Top Recommendations:                              ║');
    for (const rec of result.recommendations.slice(0, 3)) {
      console.log(`║    → ${rec.slice(0, 44)}...║`);
    }
  }

  console.log('╚════════════════════════════════════════════════════╝');

  // Save detailed report
  const reportPath = path.join(process.cwd(), `semantic-coherence-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
}

/**
 * CLI interface
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  const config = { ...DEFAULT_CONFIG };

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Semantic Coherence Test Suite

Usage: pnpm test:semantic [options]

Options:
  --category <name>    Run only specific category
                       (domain-naming, semantic-memory, integration-wiring, architectural-philosophy)
  --threshold <n>      Set passing threshold (default: 70)
  --model <name>       LLM model (gemini-2.0-flash, gpt-4o)
  --quiet              Less verbose output
  --help               Show this help

Examples:
  pnpm test:semantic
  pnpm test:semantic --category domain-naming
  pnpm test:semantic --threshold 80 --model gpt-4o
`);
    return;
  }

  // Parse category filter
  const categoryIndex = args.indexOf('--category');
  if (categoryIndex !== -1 && args[categoryIndex + 1]) {
    config.categories = [args[categoryIndex + 1] as ProbeCategory];
  }

  // Parse threshold
  const thresholdIndex = args.indexOf('--threshold');
  if (thresholdIndex !== -1 && args[thresholdIndex + 1]) {
    config.passingThreshold = parseInt(args[thresholdIndex + 1], 10);
  }

  // Parse model
  const modelIndex = args.indexOf('--model');
  if (modelIndex !== -1 && args[modelIndex + 1]) {
    config.model = args[modelIndex + 1] as SemanticTestConfig['model'];
  }

  // Parse verbosity
  if (args.includes('--quiet')) {
    config.verbose = false;
  }

  // Run tests
  const result = await runTests(config);

  // Exit with appropriate code
  const passed = result.overallScore >= config.passingThreshold;
  process.exit(passed ? 0 : 1);
}

// Run if called directly
main().catch(console.error);

export { runTests, DEFAULT_CONFIG };
