#!/usr/bin/env node
/**
 * Tool Management CLI
 *
 * Comprehensive tool management including:
 * - Analytics & usage reports
 * - Deprecation management
 * - Version tracking
 * - A/B testing
 * - Semantic routing demo
 *
 * Usage:
 *   npm run tools:report           # Main analytics report
 *   npm run tools:report -- deprecation   # Deprecation report
 *   npm run tools:report -- versions      # Version changelog
 *   npm run tools:report -- experiments   # A/B testing status
 *   npm run tools:report -- route "query" # Semantic routing demo
 */

import { toolUsageAnalytics } from '../services/analytics/tool-usage-analytics.js';
import { toolRegistry } from '../tools/registry/index.js';
import { initializeToolRegistry } from '../tools/registry/loader.js';
import { deprecationService } from '../tools/deprecation.js';
import { versioningService } from '../tools/versioning.js';
import { abTestingService } from '../tools/ab-testing.js';
import { semanticRouter } from '../tools/semantic-router/compat.js';
import { recommendationEngine } from '../tools/optimization/recommendation-engine.js';
import { autoOptimizer } from '../tools/optimization/auto-optimizer.js';
import { patternAnalyzer } from '../tools/optimization/pattern-analyzer.js';
import { feedbackCollector } from '../tools/optimization/feedback-collector.js';

// ============================================================================
// COLORS FOR CONSOLE OUTPUT
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function color(text: string, c: keyof typeof colors): string {
  return `${colors[c]}${text}${colors.reset}`;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

async function generateReport(): Promise<void> {
  console.log(color('\n🔧 TOOL ANALYTICS REPORT\n', 'bright'));
  console.log(color('═'.repeat(60), 'dim'));

  // Initialize registries
  console.log(color('\n📊 Initializing...', 'cyan'));
  await initializeToolRegistry({ parallel: true });
  await toolUsageAnalytics.initialize();

  // Get registry stats
  const registryStats = toolRegistry.getStats();
  const usageStats = toolUsageAnalytics.getAllStats();

  // =========================================================================
  // SECTION 1: Registry Overview
  // =========================================================================
  console.log(color('\n📦 REGISTRY OVERVIEW', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));
  console.log(`  Total Tools:     ${color(String(registryStats.totalTools), 'green')}`);
  console.log(
    `  Active Domains:  ${color(String(Object.keys(registryStats.byDomain).length), 'blue')}`
  );
  console.log(
    `  Categories:      ${color(String(Object.keys(registryStats.byCategory).length), 'blue')}`
  );

  // By domain
  console.log(color('\n  Tools by Domain:', 'dim'));
  const sortedDomains = Object.entries(registryStats.byDomain).sort(([, a], [, b]) => b - a);

  for (const [domain, count] of sortedDomains.slice(0, 10)) {
    const bar = '█'.repeat(Math.min(count, 20));
    const countStr = String(count).padStart(3);
    console.log(`    ${domain.padEnd(20)} ${color(countStr, 'cyan')} ${color(bar, 'blue')}`);
  }
  if (sortedDomains.length > 10) {
    console.log(color(`    ... and ${sortedDomains.length - 10} more domains`, 'dim'));
  }

  // =========================================================================
  // SECTION 2: Usage Analytics
  // =========================================================================
  console.log(color('\n📈 USAGE ANALYTICS', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));

  if (usageStats.length === 0) {
    console.log(color('  No usage data yet. Start using tools to see analytics.', 'yellow'));
  } else {
    // Top used tools
    const topTools = toolUsageAnalytics.getTopTools(10);
    console.log(color('\n  Top 10 Most Used Tools:', 'dim'));
    for (let i = 0; i < topTools.length; i++) {
      const { toolId, calls } = topTools[i];
      const rank = String(i + 1).padStart(2);
      const bar = '█'.repeat(Math.min(Math.ceil(calls / 10), 20));
      console.log(
        `    ${rank}. ${toolId.padEnd(30)} ${color(String(calls), 'green')} ${color(bar, 'green')}`
      );
    }

    // Unused tools
    const unusedTools = toolUsageAnalytics.getUnusedTools();
    if (unusedTools.length > 0) {
      console.log(color(`\n  ⚠️  Unused Tools (${unusedTools.length}):`, 'yellow'));
      for (const toolId of unusedTools.slice(0, 5)) {
        console.log(`    - ${toolId}`);
      }
      if (unusedTools.length > 5) {
        console.log(color(`    ... and ${unusedTools.length - 5} more`, 'dim'));
      }
    }

    // Slow tools
    const slowTools = toolUsageAnalytics.getSlowestTools(5);
    if (slowTools.length > 0) {
      console.log(color('\n  🐢 Slowest Tools:', 'yellow'));
      for (const { toolId, avgLatencyMs } of slowTools) {
        const latencyStr = `${avgLatencyMs.toFixed(0)}ms`.padStart(8);
        const indicator =
          avgLatencyMs > 5000
            ? color('⚠️  SLOW', 'red')
            : avgLatencyMs > 2000
              ? color('⚡ MEDIUM', 'yellow')
              : '';
        console.log(`    ${toolId.padEnd(30)} ${latencyStr} ${indicator}`);
      }
    }

    // Error-prone tools
    const errorTools = toolUsageAnalytics.getErrorProneTools();
    if (errorTools.length > 0) {
      console.log(color('\n  ❌ Error-Prone Tools:', 'red'));
      for (const { toolId, errorRate } of errorTools) {
        const rateStr = `${(errorRate * 100).toFixed(1)}%`;
        console.log(`    ${toolId.padEnd(30)} ${color(rateStr, 'red')} error rate`);
      }
    }
  }

  // =========================================================================
  // SECTION 3: Recommendations
  // =========================================================================
  console.log(color('\n💡 RECOMMENDATIONS', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));

  const recommendations: string[] = [];

  // Large domains
  for (const [domain, count] of sortedDomains) {
    if (count > 15) {
      recommendations.push(
        `🔧 Domain "${domain}" has ${count} tools. Consider consolidating to ~10.`
      );
    }
  }

  // Unused tools
  const unusedTools = toolUsageAnalytics.getUnusedTools();
  if (unusedTools.length > 10) {
    recommendations.push(
      `🗑️  ${unusedTools.length} tools have never been used. Review for removal.`
    );
  }

  // Error-prone tools
  const errorTools = toolUsageAnalytics.getErrorProneTools();
  if (errorTools.length > 0) {
    recommendations.push(
      `❌ ${errorTools.length} tools have >10% error rate. Investigate and fix.`
    );
  }

  // Slow tools
  const slowTools = toolUsageAnalytics.getSlowestTools(5);
  const verySlowTools = slowTools.filter((t) => t.avgLatencyMs > 5000);
  if (verySlowTools.length > 0) {
    recommendations.push(
      `🐢 ${verySlowTools.length} tools have >5s avg latency. Optimize for speed.`
    );
  }

  // Target tool count
  const domainCount = Object.keys(registryStats.byDomain).length;
  const avgToolsPerDomain = registryStats.totalTools / domainCount;
  if (avgToolsPerDomain > 10) {
    recommendations.push(
      `📊 Average ${avgToolsPerDomain.toFixed(1)} tools/domain. Target ~8-10 for optimal LLM performance.`
    );
  }

  if (recommendations.length === 0) {
    console.log(color('  ✅ No major issues detected!', 'green'));
  } else {
    for (const rec of recommendations) {
      console.log(`  ${rec}`);
    }
  }

  // =========================================================================
  // SECTION 4: Summary
  // =========================================================================
  console.log(color('\n📋 SUMMARY', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));
  const totalDomains = Object.keys(registryStats.byDomain).length;
  console.log(`  Total Tools:       ${registryStats.totalTools}`);
  console.log(`  Total Domains:     ${totalDomains}`);
  console.log(`  Avg Tools/Domain:  ${(registryStats.totalTools / totalDomains).toFixed(1)}`);
  console.log(`  Usage Records:     ${usageStats.length}`);
  console.log(`  Recommendations:   ${recommendations.length}`);

  // Target guidance
  console.log(color('\n  🎯 Target for Gemini: 40-60 tools per agent', 'cyan'));

  console.log(color('\n═'.repeat(60), 'dim'));
  console.log(color('Report generated at: ', 'dim') + new Date().toISOString());
  console.log('');

  // Shutdown
  await toolUsageAnalytics.shutdown();
}

// ============================================================================
// DEPRECATION REPORT
// ============================================================================

async function generateDeprecationReport(): Promise<void> {
  console.log(color('\n🗑️  TOOL DEPRECATION REPORT\n', 'bright'));
  console.log(color('═'.repeat(60), 'dim'));

  // Initialize registry
  await initializeToolRegistry({ parallel: true });

  // Get all tools and run auto-analysis
  const allTools = toolRegistry.getAll();
  const flagged = deprecationService.analyzeForDeprecation(allTools);

  // Show deprecation report
  console.log(deprecationService.generateReport());

  // Summary
  console.log(color('\n📊 ANALYSIS RESULTS', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));
  console.log(`  Tools Analyzed:    ${allTools.length}`);
  console.log(`  Newly Flagged:     ${flagged.length}`);
  console.log(`  Total Deprecated:  ${deprecationService.getDeprecated().length}`);
  console.log(`  Total Sunset:      ${deprecationService.getSunset().length}`);

  console.log(color('\n═'.repeat(60), 'dim'));
}

// ============================================================================
// VERSION REPORT
// ============================================================================

async function generateVersionReport(): Promise<void> {
  console.log(color('\n📦 TOOL VERSION REPORT\n', 'bright'));
  console.log(color('═'.repeat(60), 'dim'));

  // Initialize registry
  await initializeToolRegistry({ parallel: true });

  // Register all tools with versioning service
  const allTools = toolRegistry.getAll();
  for (const tool of allTools) {
    if (!versioningService.getActiveVersion(tool.id)) {
      versioningService.registerTool(tool);
    }
  }

  // Show changelog
  console.log(versioningService.generateChangelog());

  // Recent updates
  const recentUpdates = versioningService.getRecentlyUpdated(7);
  if (recentUpdates.length > 0) {
    console.log(color('\n🆕 RECENT UPDATES (Last 7 Days)', 'bright'));
    console.log(color('─'.repeat(40), 'dim'));
    for (const version of recentUpdates.slice(0, 10)) {
      const breakingTag = version.breaking ? color(' [BREAKING]', 'red') : '';
      console.log(`  ${version.toolId} v${version.version}${breakingTag}`);
      console.log(`    ${version.changelog}`);
    }
  }

  // Summary
  const summary = versioningService.getVersionSummary();
  console.log(color('\n📊 VERSION SUMMARY', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));
  console.log(`  Total Versioned Tools: ${Object.keys(summary).length}`);

  console.log(color('\n═'.repeat(60), 'dim'));
}

// ============================================================================
// A/B TESTING REPORT
// ============================================================================

async function generateExperimentsReport(): Promise<void> {
  console.log(color('\n🧪 A/B TESTING REPORT\n', 'bright'));
  console.log(color('═'.repeat(60), 'dim'));

  const experiments = abTestingService.getExperiments();
  const activeExperiments = abTestingService.getActiveExperiments();

  console.log(color('\n📋 ALL EXPERIMENTS', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));

  for (const exp of experiments) {
    const status = exp.active ? color('ACTIVE', 'green') : color('INACTIVE', 'dim');
    console.log(`\n  ${exp.name} [${status}]`);
    console.log(`    ID: ${exp.id}`);
    console.log(`    ${exp.description}`);
    console.log(`    Variants: ${[exp.control, ...exp.variants].map((v) => v.name).join(', ')}`);
    console.log(`    Metrics: ${exp.metrics.map((m) => m.name).join(', ')}`);

    // Show results if active
    if (exp.active) {
      const results = abTestingService.getResults(exp.id);
      if (results) {
        console.log(color(`\n    📈 Results:`, 'cyan'));
        console.log(`       Participants: ${results.totalParticipants}`);
        for (const rec of results.recommendations) {
          console.log(`       ${rec}`);
        }
      }
    }
  }

  if (experiments.length === 0) {
    console.log(color('  No experiments defined yet.', 'yellow'));
    console.log(color('  See src/tools/ab-testing.ts for predefined experiments.', 'dim'));
  }

  // How to activate
  console.log(color('\n💡 TO ACTIVATE AN EXPERIMENT', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));
  console.log('  abTestingService.activateExperiment("experiment-id")');

  console.log(color('\n═'.repeat(60), 'dim'));
}

// ============================================================================
// SEMANTIC ROUTING DEMO
// ============================================================================

async function demonstrateSemanticRouting(query: string): Promise<void> {
  console.log(color('\n🎯 SEMANTIC ROUTING DEMO\n', 'bright'));
  console.log(color('═'.repeat(60), 'dim'));

  // Initialize
  await initializeToolRegistry({ parallel: true });
  await semanticRouter.initialize();

  console.log(`\nQuery: "${color(query, 'cyan')}"\n`);

  // Find relevant tools
  const matches = semanticRouter.findRelevantTools(query);

  console.log(color('📊 MATCHED TOOLS', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));

  if (matches.length === 0) {
    console.log(color('  No matching tools found.', 'yellow'));
  } else {
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const similarity = (match.similarity * 100).toFixed(1);
      const bar = '█'.repeat(Math.ceil(match.similarity * 20));

      console.log(`  ${String(i + 1).padStart(2)}. ${match.toolId}`);
      console.log(`      Domain: ${color(match.domain, 'blue')}`);
      console.log(`      Match:  ${color(`${similarity}%`, 'green')} ${color(bar, 'green')}`);
      console.log(`      ${match.description.slice(0, 60)}...`);
      console.log('');
    }
  }

  // Show domains (extracted from match results)
  const matchedDomains = [...new Set(matches.map((m) => m.toolId.split('_')[0] || 'general'))];
  console.log(color('\n📦 RELEVANT DOMAINS', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));
  console.log(`  ${matchedDomains.join(', ') || 'None'}`);

  console.log(color('\n═'.repeat(60), 'dim'));
}

// ============================================================================
// ACTIVATE EXPERIMENT
// ============================================================================

async function activateExperiment(experimentId: string): Promise<void> {
  console.log(color('\n🧪 ACTIVATING EXPERIMENT\n', 'bright'));
  console.log(color('═'.repeat(60), 'dim'));

  const experiment = abTestingService.getExperiments().find((e) => e.id === experimentId);

  if (!experiment) {
    console.log(color(`\n❌ Experiment "${experimentId}" not found.`, 'red'));
    console.log(color('\nAvailable experiments:', 'dim'));
    for (const exp of abTestingService.getExperiments()) {
      console.log(`  • ${exp.id} - ${exp.name}`);
    }
    return;
  }

  if (experiment.active) {
    console.log(color(`\n⚠️  Experiment "${experimentId}" is already active.`, 'yellow'));
    return;
  }

  const success = abTestingService.activateExperiment(experimentId);

  if (success) {
    console.log(color(`\n✅ Experiment "${experimentId}" activated!`, 'green'));
    console.log(color('\n📋 EXPERIMENT DETAILS', 'bright'));
    console.log(color('─'.repeat(40), 'dim'));
    console.log(`  Name:        ${experiment.name}`);
    console.log(`  Description: ${experiment.description}`);
    console.log(
      `  Variants:    ${[experiment.control, ...experiment.variants].map((v) => v.name).join(', ')}`
    );
    console.log(`  Metrics:     ${experiment.metrics.map((m) => m.name).join(', ')}`);
    console.log(color('\n💡 Users will now be randomly assigned to variants.', 'cyan'));
  } else {
    console.log(color(`\n❌ Failed to activate experiment.`, 'red'));
  }

  console.log(color('\n═'.repeat(60), 'dim'));
}

// ============================================================================
// DEACTIVATE EXPERIMENT
// ============================================================================

async function deactivateExperiment(experimentId: string): Promise<void> {
  console.log(color('\n🧪 DEACTIVATING EXPERIMENT\n', 'bright'));
  console.log(color('═'.repeat(60), 'dim'));

  const success = abTestingService.deactivateExperiment(experimentId);

  if (success) {
    console.log(color(`\n✅ Experiment "${experimentId}" deactivated.`, 'green'));

    // Show results
    const results = abTestingService.getResults(experimentId);
    if (results && results.totalParticipants > 0) {
      console.log(color('\n📊 FINAL RESULTS', 'bright'));
      console.log(color('─'.repeat(40), 'dim'));
      console.log(`  Total Participants: ${results.totalParticipants}`);
      for (const rec of results.recommendations) {
        console.log(`  ${rec}`);
      }
    }
  } else {
    console.log(color(`\n❌ Experiment "${experimentId}" not found or already inactive.`, 'red'));
  }

  console.log(color('\n═'.repeat(60), 'dim'));
}

// ============================================================================
// BENCHMARK
// ============================================================================

async function runBenchmark(): Promise<void> {
  console.log(color('\n⚡ TOOL SYSTEM BENCHMARK\n', 'bright'));
  console.log(color('═'.repeat(60), 'dim'));

  // Initialize registry
  console.log(color('\n📊 Initializing...', 'cyan'));
  const initStart = Date.now();
  await initializeToolRegistry({ parallel: true });
  const initTime = Date.now() - initStart;

  const registryStats = toolRegistry.getStats();

  console.log(color('\n📦 REGISTRY STATS', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));
  console.log(`  Total Tools:      ${registryStats.totalTools}`);
  console.log(
    `  Init Time:        ${color(`${initTime}ms`, initTime < 1000 ? 'green' : 'yellow')}`
  );

  // Benchmark semantic router
  console.log(color('\n🎯 SEMANTIC ROUTER BENCHMARK', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));

  const routerInitStart = Date.now();
  await semanticRouter.initialize();
  const routerInitTime = Date.now() - routerInitStart;
  console.log(
    `  Router Init:      ${color(`${routerInitTime}ms`, routerInitTime < 500 ? 'green' : 'yellow')}`
  );

  // Test queries
  const testQueries = [
    'I need help with my budget',
    'Play some relaxing music',
    'Schedule a meeting for tomorrow',
    'I am feeling stressed',
    'Tell me about my goals',
  ];

  let totalQueryTime = 0;
  for (const query of testQueries) {
    const queryStart = Date.now();
    semanticRouter.findRelevantTools(query);
    const queryTime = Date.now() - queryStart;
    totalQueryTime += queryTime;
    console.log(
      `  Query "${query.slice(0, 30)}...": ${color(`${queryTime}ms`, queryTime < 10 ? 'green' : 'yellow')}`
    );
  }

  const avgQueryTime = (totalQueryTime / testQueries.length).toFixed(1);
  console.log(
    `  Average Query:    ${color(`${avgQueryTime}ms`, parseFloat(avgQueryTime) < 10 ? 'green' : 'yellow')}`
  );

  // Benchmark dynamic loader topic detection
  console.log(color('\n🔄 DYNAMIC LOADER BENCHMARK', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));

  const { DynamicToolLoader } = await import('../tools/dynamic-loader.js');
  const loader = new DynamicToolLoader();

  let totalDetectionTime = 0;
  for (const query of testQueries) {
    const detectStart = Date.now();
    loader.detectTopics(query);
    const detectTime = Date.now() - detectStart;
    totalDetectionTime += detectTime;
  }

  const avgDetectionTime = (totalDetectionTime / testQueries.length).toFixed(2);
  console.log(
    `  Topic Detection:  ${color(`${avgDetectionTime}ms`, parseFloat(avgDetectionTime) < 1 ? 'green' : 'yellow')} avg`
  );

  // Summary
  console.log(color('\n📋 PERFORMANCE SUMMARY', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));

  const { totalTools } = registryStats;
  const targetToolCount = 50;
  const toolsPerAgent = Math.min(totalTools, targetToolCount);

  console.log(`  Tools Available:     ${totalTools}`);
  console.log(`  Target Per Agent:    ${targetToolCount}`);
  console.log(`  Registry Init:       ${initTime}ms`);
  console.log(`  Router Init:         ${routerInitTime}ms`);
  console.log(`  Avg Query Time:      ${avgQueryTime}ms`);
  console.log(`  Avg Topic Detection: ${avgDetectionTime}ms`);

  // Performance rating
  const rating =
    initTime < 2000 && parseFloat(avgQueryTime) < 20 && parseFloat(avgDetectionTime) < 1
      ? '🟢 EXCELLENT'
      : initTime < 5000 && parseFloat(avgQueryTime) < 50
        ? '🟡 GOOD'
        : '🔴 NEEDS OPTIMIZATION';

  console.log(
    `\n  Overall Rating:      ${color(rating, rating.includes('EXCELLENT') ? 'green' : rating.includes('GOOD') ? 'yellow' : 'red')}`
  );

  console.log(color('\n═'.repeat(60), 'dim'));
}

// ============================================================================
// HELP
// ============================================================================

// ============================================================================
// RECOMMENDATIONS
// ============================================================================

async function generateRecommendations(): Promise<void> {
  console.log(color('\n💡 TOOL RECOMMENDATIONS\n', 'bright'));
  console.log(color('═'.repeat(60), 'dim'));

  // Generate recommendations
  console.log(color('\n📊 Analyzing data...', 'cyan'));
  const recommendations = await recommendationEngine.generateRecommendations();

  if (recommendations.length === 0) {
    console.log(color('\n✅ No recommendations at this time.', 'green'));
    console.log(color('   Need more usage data to generate recommendations.', 'dim'));
    return;
  }

  // Show recommendations by type
  const types = [
    'create_tool',
    'consolidate_tools',
    'deprecate_tool',
    'improve_tool',
    'run_experiment',
  ];

  for (const type of types) {
    const typeRecs = recommendations.filter((r) => r.type === type);
    if (typeRecs.length === 0) continue;

    const icon =
      {
        create_tool: '➕',
        consolidate_tools: '🔗',
        deprecate_tool: '🗑️',
        improve_tool: '⬆️',
        run_experiment: '🧪',
      }[type] || '📋';

    console.log(
      color(`\n${icon} ${type.toUpperCase().replace(/_/g, ' ')} (${typeRecs.length})`, 'bright')
    );
    console.log(color('─'.repeat(40), 'dim'));

    for (const rec of typeRecs.slice(0, 3)) {
      const priorityColor = {
        critical: 'red',
        high: 'yellow',
        medium: 'cyan',
        low: 'dim',
      }[rec.priority] as keyof typeof colors;

      console.log(`  ${color(`[${rec.priority.toUpperCase()}]`, priorityColor)} ${rec.title}`);
      console.log(`    ${rec.description}`);
      console.log(`    Rationale: ${rec.rationale}`);
      console.log('');
    }
  }

  // Summary
  console.log(color('\n📊 SUMMARY', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));
  console.log(`  Total Recommendations: ${recommendations.length}`);
  console.log(`  Critical: ${recommendations.filter((r) => r.priority === 'critical').length}`);
  console.log(`  High:     ${recommendations.filter((r) => r.priority === 'high').length}`);
  console.log(`  Medium:   ${recommendations.filter((r) => r.priority === 'medium').length}`);
  console.log(`  Low:      ${recommendations.filter((r) => r.priority === 'low').length}`);

  console.log(color('\n═'.repeat(60), 'dim'));
}

// ============================================================================
// OPTIMIZER STATUS
// ============================================================================

async function showOptimizerStatus(): Promise<void> {
  console.log(color('\n🤖 AUTO OPTIMIZER STATUS\n', 'bright'));
  console.log(color('═'.repeat(60), 'dim'));

  const status = autoOptimizer.getStatus();
  const report = autoOptimizer.getReport();

  console.log(color('\n⚙️ CONFIGURATION', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));
  console.log(
    `  Running:              ${status.isRunning ? color('✅ Yes', 'green') : color('❌ No', 'red')}`
  );
  console.log(`  Auto Recommendations: ${status.config.enableAutoRecommendations ? '✅' : '❌'}`);
  console.log(`  Auto Experiments:     ${status.config.enableAutoExperiments ? '✅' : '❌'}`);
  console.log(`  Auto Implementation:  ${status.config.enableAutoImplementation ? '✅' : '❌'}`);
  console.log(`  Min Data Points:      ${status.config.minDataPoints}`);
  console.log(`  Analysis Interval:    ${status.config.analysisIntervalMs / 1000}s`);

  console.log(color('\n📊 CURRENT METRICS', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));
  console.log(`  Feedback Collected:   ${report.summary.feedbackCollected}`);
  console.log(`  Patterns Identified:  ${report.summary.patternsIdentified}`);
  console.log(`  Recommendations:      ${report.summary.recommendationsGenerated}`);
  console.log(`  Active Experiments:   ${report.summary.experimentsRunning}`);
  console.log(`  Optimization Cycles:  ${status.cycleCount}`);

  if (report.activeExperiments.length > 0) {
    console.log(color('\n🧪 ACTIVE EXPERIMENTS', 'bright'));
    console.log(color('─'.repeat(40), 'dim'));
    for (const expId of report.activeExperiments) {
      console.log(`  • ${expId}`);
    }
  }

  if (report.recentChanges.length > 0) {
    console.log(color('\n🚀 RECENT CHANGES', 'bright'));
    console.log(color('─'.repeat(40), 'dim'));
    for (const change of report.recentChanges.slice(-5)) {
      console.log(`  • ${change}`);
    }
  }

  console.log(color('\n💡 COMMANDS', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));
  console.log('  npm run tools:optimizer start     Start the optimizer');
  console.log('  npm run tools:optimizer stop      Stop the optimizer');
  console.log('  npm run tools:optimizer run       Run single optimization cycle');

  console.log(color('\n═'.repeat(60), 'dim'));
}

// ============================================================================
// PATTERNS
// ============================================================================

async function showPatterns(): Promise<void> {
  console.log(color('\n🔍 INTERACTION PATTERNS\n', 'bright'));
  console.log(color('═'.repeat(60), 'dim'));

  // Co-occurrences
  const coOccs = patternAnalyzer.getCoOccurrences(3);
  if (coOccs.length > 0) {
    console.log(color('\n🔗 TOOL CO-OCCURRENCES', 'bright'));
    console.log(color('─'.repeat(40), 'dim'));
    for (const co of coOccs.slice(0, 5)) {
      const bar = '█'.repeat(Math.ceil(co.correlation * 10));
      console.log(`  ${co.toolA} ↔ ${co.toolB}`);
      console.log(
        `    Count: ${co.count}, Correlation: ${color(`${(co.correlation * 100).toFixed(0)}%`, 'green')} ${color(bar, 'blue')}`
      );
    }
  }

  // Sequences
  const sequences = patternAnalyzer.discoverSequences(2, 4, 2);
  if (sequences.length > 0) {
    console.log(color('\n📍 COMMON SEQUENCES', 'bright'));
    console.log(color('─'.repeat(40), 'dim'));
    for (const seq of sequences.slice(0, 5)) {
      console.log(`  ${seq.sequence.join(' → ')}`);
      console.log(`    Used ${seq.count} times, ${(seq.successRate * 100).toFixed(0)}% success`);
    }
  }

  // Journeys
  const journeys = patternAnalyzer.identifyJourneys();
  if (journeys.length > 0) {
    console.log(color('\n🚀 USER JOURNEYS', 'bright'));
    console.log(color('─'.repeat(40), 'dim'));
    for (const journey of journeys.slice(0, 3)) {
      console.log(`  ${journey.name}`);
      console.log(`    Tools: ${journey.tools.join(' → ')}`);
      console.log(
        `    Frequency: ${journey.frequency}, Success: ${(journey.avgSuccess * 100).toFixed(0)}%`
      );
    }
  }

  // Consolidation opportunities
  const consolidations = patternAnalyzer.findConsolidationOpportunities();
  if (consolidations.length > 0) {
    console.log(color('\n🔧 CONSOLIDATION OPPORTUNITIES', 'bright'));
    console.log(color('─'.repeat(40), 'dim'));
    for (const opp of consolidations.slice(0, 3)) {
      console.log(`  ${opp.tools.join(' + ')} → ${opp.suggestedName}`);
      console.log(`    ${opp.reason}`);
    }
  }

  if (coOccs.length === 0 && sequences.length === 0) {
    console.log(color('\n⏳ Not enough data yet.', 'yellow'));
    console.log(color('   Start using tools to collect interaction patterns.', 'dim'));
  }

  console.log(color('\n═'.repeat(60), 'dim'));
}

function showHelp(): void {
  console.log(color('\n🔧 TOOL MANAGEMENT CLI\n', 'bright'));
  console.log(color('═'.repeat(60), 'dim'));

  console.log(color('\n📋 ANALYTICS COMMANDS', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));
  console.log('  npm run tools:report              Main analytics report');
  console.log('  npm run tools:deprecation         Deprecation management');
  console.log('  npm run tools:versions            Version changelog');
  console.log('  npm run tools:benchmark           Performance benchmark');

  console.log(color('\n🧪 EXPERIMENTATION', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));
  console.log('  npm run tools:experiments         A/B testing status');
  console.log('  npm run tools:activate <id>       Activate an experiment');
  console.log('  npm run tools:deactivate <id>     Deactivate an experiment');

  console.log(color('\n🤖 AUTO-OPTIMIZATION', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));
  console.log('  npm run tools:recommendations     Get AI-generated recommendations');
  console.log('  npm run tools:patterns            View interaction patterns');
  console.log('  npm run tools:optimizer           Show optimizer status');
  console.log('  npm run tools:optimizer start     Start auto-optimizer');
  console.log('  npm run tools:optimizer run       Run single optimization cycle');

  console.log(color('\n🏥 MONITORING', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));
  console.log('  npm run tools:health              Run health check (errors, latency, feedback)');
  console.log('  npm run tools:alerts              View active alerts & configuration');

  console.log(color('\n🎯 UTILITIES', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));
  console.log('  npm run tools:route "query"       Semantic routing demo');
  console.log('  npm run tools:help                Show this help');

  console.log(color('\n🧪 AVAILABLE EXPERIMENTS', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));
  for (const exp of abTestingService.getExperiments()) {
    const status = exp.active ? color('[ACTIVE]', 'green') : color('[INACTIVE]', 'dim');
    console.log(`  ${exp.id} ${status}`);
    console.log(`    ${exp.description}`);
  }

  console.log(color('\n═'.repeat(60), 'dim'));
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'report';

  switch (command) {
    case 'deprecation':
      await generateDeprecationReport();
      break;

    case 'versions':
      await generateVersionReport();
      break;

    case 'experiments':
      await generateExperimentsReport();
      break;

    case 'route': {
      const query = args.slice(1).join(' ') || 'I need help managing my schedule and tasks';
      await demonstrateSemanticRouting(query);
      break;
    }

    case 'activate': {
      const activateId = args[1];
      if (!activateId) {
        console.log(color('\n❌ Please specify an experiment ID.', 'red'));
        console.log('  Usage: npm run tools:activate <experiment-id>');
        showHelp();
      } else {
        await activateExperiment(activateId);
      }
      break;
    }

    case 'deactivate': {
      const deactivateId = args[1];
      if (!deactivateId) {
        console.log(color('\n❌ Please specify an experiment ID.', 'red'));
        console.log('  Usage: npm run tools:deactivate <experiment-id>');
      } else {
        await deactivateExperiment(deactivateId);
      }
      break;
    }

    case 'benchmark':
      await runBenchmark();
      break;

    case 'recommendations':
    case 'recs':
      await generateRecommendations();
      break;

    case 'patterns':
      await showPatterns();
      break;

    case 'optimizer': {
      const optimizerCmd = args[1];
      if (optimizerCmd === 'start') {
        autoOptimizer.start();
        console.log(color('\n✅ Auto-optimizer started!', 'green'));
        console.log(color('   It will run optimization cycles automatically.', 'dim'));
      } else if (optimizerCmd === 'stop') {
        autoOptimizer.stop();
        console.log(color('\n✅ Auto-optimizer stopped.', 'green'));
      } else if (optimizerCmd === 'run') {
        console.log(color('\n🔄 Running optimization cycle...', 'cyan'));
        const cycle = await autoOptimizer.runOptimizationCycle();
        console.log(
          color(
            `\n✅ Cycle completed in ${cycle.endTime ? ((cycle.endTime.getTime() - cycle.startTime.getTime()) / 1000).toFixed(1) : '?'}s`,
            'green'
          )
        );
        console.log(
          `   Feedback: ${cycle.feedbackProcessed}, Patterns: ${cycle.patternsFound}, Recs: ${cycle.recommendationsCreated}`
        );
      } else {
        await showOptimizerStatus();
      }
      break;
    }

    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;

    case 'health':
      await runHealthCheck();
      break;

    case 'alerts':
      await showAlerts();
      break;

    case 'report':
    default:
      await generateReport();
      break;
  }
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

async function runHealthCheck(): Promise<void> {
  console.log(color('\n🏥 HEALTH CHECK\n', 'bright'));
  console.log(color('═'.repeat(60), 'dim'));

  try {
    const { alertingService } = await import('../services/performance/optimization-alerting.js');

    console.log(color('\n📊 Running health checks...', 'cyan'));
    const result = await alertingService.runHealthCheck();

    console.log(color('\n✅ CHECKS COMPLETED', 'bright'));
    console.log(color('─'.repeat(40), 'dim'));
    console.log(`  Checks Run:      ${result.checked.length}`);
    console.log(`  Alerts Sent:     ${result.alertsSent}`);

    if (result.issues.length > 0) {
      console.log(color('\n⚠️ ISSUES FOUND', 'yellow'));
      console.log(color('─'.repeat(40), 'dim'));
      result.issues.forEach((issue) => {
        console.log(`  • ${issue}`);
      });
    } else {
      console.log(color('\n✅ No issues found!', 'green'));
    }

    console.log(color(`\n${'═'.repeat(60)}`, 'dim'));
  } catch (error) {
    console.error(color('\n❌ Health check failed:', 'red'), error);
  }
}

// ============================================================================
// ALERTS
// ============================================================================

async function showAlerts(): Promise<void> {
  console.log(color('\n🚨 ACTIVE ALERTS\n', 'bright'));
  console.log(color('═'.repeat(60), 'dim'));

  try {
    const { alertingService } = await import('../services/performance/optimization-alerting.js');

    const activeAlerts = alertingService.getActiveAlerts();
    const config = alertingService.getConfig();

    console.log(color('\n⚙️ CONFIGURATION', 'bright'));
    console.log(color('─'.repeat(40), 'dim'));
    console.log(
      `  Enabled:         ${config.config.enabled ? color('✅ Yes', 'green') : color('❌ No', 'red')}`
    );
    console.log(`  Min Severity:    ${config.config.minSeverity}`);
    console.log(`  Channels:        ${config.config.channels.join(', ')}`);
    console.log(
      `  Slack:           ${config.config.slackWebhookUrl ? color('✅ Configured', 'green') : color('❌ Not set', 'yellow')}`
    );

    console.log(color('\n📊 THRESHOLDS', 'bright'));
    console.log(color('─'.repeat(40), 'dim'));
    console.log(`  Error Rate:      ${(config.thresholds.errorRate * 100).toFixed(0)}%`);
    console.log(`  Latency:         ${config.thresholds.latencyMs}ms`);
    console.log(`  Feedback Rate:   ${(config.thresholds.feedbackRate * 100).toFixed(0)}%`);
    console.log(`  Min Calls:       ${config.thresholds.minCalls}`);

    if (activeAlerts.length === 0) {
      console.log(color('\n✅ No active alerts!', 'green'));
    } else {
      console.log(color(`\n⚠️ ${activeAlerts.length} ACTIVE ALERTS`, 'yellow'));
      console.log(color('─'.repeat(40), 'dim'));

      activeAlerts.forEach((alert) => {
        const severityColor =
          alert.severity === 'critical' ? 'red' : alert.severity === 'warning' ? 'yellow' : 'blue';
        console.log(`\n  ${color(alert.severity.toUpperCase(), severityColor)} | ${alert.title}`);
        console.log(`  ${color(alert.message, 'dim')}`);
        console.log(`  Type: ${alert.type} | Time: ${alert.timestamp.toISOString()}`);
      });
    }

    console.log(color(`\n${'═'.repeat(60)}`, 'dim'));
    console.log(color('\n💡 Run health check: npm run tools:health', 'dim'));
  } catch (error) {
    console.error(color('\n❌ Failed to show alerts:', 'red'), error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(color('\n❌ Error:', 'red'), error);
    process.exit(1);
  });
