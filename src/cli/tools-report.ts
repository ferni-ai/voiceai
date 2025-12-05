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

import { toolUsageAnalytics } from '../services/tool-usage-analytics.js';
import { toolRegistry } from '../tools/registry/index.js';
import { initializeToolRegistry } from '../tools/registry/loader.js';
import { deprecationService } from '../tools/deprecation.js';
import { versioningService } from '../tools/versioning.js';
import { abTestingService } from '../tools/ab-testing.js';
import { semanticRouter } from '../tools/semantic-router.js';

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
  console.log(`  Active Domains:  ${color(String(Object.keys(registryStats.byDomain).length), 'blue')}`);
  console.log(`  Categories:      ${color(String(Object.keys(registryStats.byCategory).length), 'blue')}`);

  // By domain
  console.log(color('\n  Tools by Domain:', 'dim'));
  const sortedDomains = Object.entries(registryStats.byDomain)
    .sort(([, a], [, b]) => b - a);

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
      console.log(`    ${rank}. ${toolId.padEnd(30)} ${color(String(calls), 'green')} ${color(bar, 'green')}`);
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
        const indicator = avgLatencyMs > 5000 ? color('⚠️  SLOW', 'red') : avgLatencyMs > 2000 ? color('⚡ MEDIUM', 'yellow') : '';
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
      recommendations.push(`🔧 Domain "${domain}" has ${count} tools. Consider consolidating to ~10.`);
    }
  }

  // Unused tools
  const unusedTools = toolUsageAnalytics.getUnusedTools();
  if (unusedTools.length > 10) {
    recommendations.push(`🗑️  ${unusedTools.length} tools have never been used. Review for removal.`);
  }

  // Error-prone tools
  const errorTools = toolUsageAnalytics.getErrorProneTools();
  if (errorTools.length > 0) {
    recommendations.push(`❌ ${errorTools.length} tools have >10% error rate. Investigate and fix.`);
  }

  // Slow tools
  const slowTools = toolUsageAnalytics.getSlowestTools(5);
  const verySlowTools = slowTools.filter(t => t.avgLatencyMs > 5000);
  if (verySlowTools.length > 0) {
    recommendations.push(`🐢 ${verySlowTools.length} tools have >5s avg latency. Optimize for speed.`);
  }

  // Target tool count
  const domainCount = Object.keys(registryStats.byDomain).length;
  const avgToolsPerDomain = registryStats.totalTools / domainCount;
  if (avgToolsPerDomain > 10) {
    recommendations.push(`📊 Average ${avgToolsPerDomain.toFixed(1)} tools/domain. Target ~8-10 for optimal LLM performance.`);
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
    console.log(`    Variants: ${[exp.control, ...exp.variants].map(v => v.name).join(', ')}`);
    console.log(`    Metrics: ${exp.metrics.map(m => m.name).join(', ')}`);

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
      console.log(`      Match:  ${color(similarity + '%', 'green')} ${color(bar, 'green')}`);
      console.log(`      ${match.description.slice(0, 60)}...`);
      console.log('');
    }
  }

  // Show domains
  const domains = semanticRouter.getDomainsForQuery(query);
  console.log(color('\n📦 DOMAINS TO LOAD', 'bright'));
  console.log(color('─'.repeat(40), 'dim'));
  console.log(`  ${domains.join(', ') || 'None'}`);

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
    
    case 'route':
      const query = args.slice(1).join(' ') || 'I need help managing my schedule and tasks';
      await demonstrateSemanticRouting(query);
      break;
    
    case 'report':
    default:
      await generateReport();
      break;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(color('\n❌ Error:', 'red'), error);
    process.exit(1);
  });
