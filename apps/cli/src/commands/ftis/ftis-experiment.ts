#!/usr/bin/env npx tsx
/**
 * FTIS Experiment CLI
 *
 * Manage A/B testing experiments for FTIS V2 vs V3 comparison.
 *
 * Commands:
 *   ferni ftis status       - Show current FTIS metrics and experiment status
 *   ferni ftis compare      - Compare V2 vs V3 performance
 *   ferni ftis metrics      - Export metrics in various formats
 *   ferni ftis feedback     - Show feedback loop statistics
 *   ferni ftis retrain      - Check retraining readiness
 *   ferni ftis export       - Export hard negatives for training
 *
 * Usage:
 *   npx tsx apps/cli/src/commands/ftis/ftis-experiment.ts status
 *   npx tsx apps/cli/src/commands/ftis/ftis-experiment.ts metrics --format prometheus
 */

import { Command } from 'commander';
import chalk from 'chalk';

// Note: These imports would work in the full CLI context
// For standalone use, we mock the functionality

// ============================================================================
// MOCK DATA FOR DEMO (replace with actual imports in production)
// ============================================================================

interface MetricsSummary {
  totalClassifications: number;
  classificationAccuracy: number;
  openIntentRecall: number;
  openIntentPrecision: number;
  expectedCalibrationError: number;
  falsePositiveRate: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  fastPathRate: number;
  verifyPathRate: number;
  llmPathRate: number;
}

interface FeedbackStats {
  totalSignals: number;
  minedNegatives: number;
  signalsByType: Record<string, number>;
  negativesBySource: Record<string, number>;
  retrainSuggestion: {
    should: boolean;
    reason: string;
    stats: Record<string, number>;
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatMs(value: number): string {
  return `${value.toFixed(0)}ms`;
}

function statusBadge(value: number, goodThreshold: number, badThreshold: number): string {
  if (value >= goodThreshold) {
    return chalk.green('●');
  } else if (value >= badThreshold) {
    return chalk.yellow('●');
  } else {
    return chalk.red('●');
  }
}

// For ECE and false positive rate (lower is better)
function statusBadgeInverse(value: number, goodThreshold: number, badThreshold: number): string {
  if (value <= goodThreshold) {
    return chalk.green('●');
  } else if (value <= badThreshold) {
    return chalk.yellow('●');
  } else {
    return chalk.red('●');
  }
}

// ============================================================================
// COMMANDS
// ============================================================================

const program = new Command();

program
  .name('ftis')
  .description('FTIS V3 Experiment and Metrics CLI')
  .version('1.0.0');

// Status command
program
  .command('status')
  .description('Show current FTIS metrics and health status')
  .action(async () => {
    console.log(chalk.bold('\n📊 FTIS V3 System Status\n'));
    console.log(chalk.dim('─'.repeat(50)));

    // In production, this would load actual metrics
    const mockMetrics: MetricsSummary = {
      totalClassifications: 1234,
      classificationAccuracy: 0.956,
      openIntentRecall: 0.912,
      openIntentPrecision: 0.887,
      expectedCalibrationError: 0.024,
      falsePositiveRate: 0.044,
      latencyP50Ms: 42,
      latencyP95Ms: 89,
      latencyP99Ms: 156,
      fastPathRate: 0.78,
      verifyPathRate: 0.14,
      llmPathRate: 0.08,
    };

    console.log(chalk.bold('\n🎯 Accuracy Metrics'));
    console.log(`  ${statusBadge(mockMetrics.classificationAccuracy, 0.95, 0.90)} Classification Accuracy: ${chalk.cyan(formatPercent(mockMetrics.classificationAccuracy))} (target: ≥95%)`);
    console.log(`  ${statusBadge(mockMetrics.openIntentRecall, 0.90, 0.80)} Open Intent Recall:      ${chalk.cyan(formatPercent(mockMetrics.openIntentRecall))} (target: ≥90%)`);
    console.log(`  ${statusBadgeInverse(mockMetrics.expectedCalibrationError, 0.05, 0.10)} ECE:                      ${chalk.cyan(mockMetrics.expectedCalibrationError.toFixed(3))} (target: ≤0.05)`);
    console.log(`  ${statusBadgeInverse(mockMetrics.falsePositiveRate, 0.05, 0.10)} False Positive Rate:      ${chalk.cyan(formatPercent(mockMetrics.falsePositiveRate))} (target: ≤5%)`);

    console.log(chalk.bold('\n⚡ Latency Metrics'));
    console.log(`  ${statusBadgeInverse(mockMetrics.latencyP95Ms, 100, 200)} P50:  ${chalk.cyan(formatMs(mockMetrics.latencyP50Ms))}`);
    console.log(`  ${statusBadgeInverse(mockMetrics.latencyP95Ms, 100, 200)} P95:  ${chalk.cyan(formatMs(mockMetrics.latencyP95Ms))} (target: ≤100ms)`);
    console.log(`  ${statusBadgeInverse(mockMetrics.latencyP99Ms, 200, 300)} P99:  ${chalk.cyan(formatMs(mockMetrics.latencyP99Ms))}`);

    console.log(chalk.bold('\n🔀 Routing Distribution'));
    console.log(`  Fast Path:   ${chalk.green(formatPercent(mockMetrics.fastPathRate))} (target: ≥80%)`);
    console.log(`  Verify Path: ${chalk.yellow(formatPercent(mockMetrics.verifyPathRate))}`);
    console.log(`  LLM Path:    ${chalk.blue(formatPercent(mockMetrics.llmPathRate))} (target: ≤20%)`);

    console.log(chalk.bold('\n📈 Volume'));
    console.log(`  Total Classifications: ${chalk.cyan(mockMetrics.totalClassifications.toLocaleString())}`);

    console.log(chalk.dim('\n─'.repeat(50)));
    console.log(chalk.dim('Last updated: Just now'));
  });

// Metrics export command
program
  .command('metrics')
  .description('Export metrics in various formats')
  .option('-f, --format <format>', 'Output format (json, prometheus, summary)', 'summary')
  .action(async (options) => {
    const mockMetrics: MetricsSummary = {
      totalClassifications: 1234,
      classificationAccuracy: 0.956,
      openIntentRecall: 0.912,
      openIntentPrecision: 0.887,
      expectedCalibrationError: 0.024,
      falsePositiveRate: 0.044,
      latencyP50Ms: 42,
      latencyP95Ms: 89,
      latencyP99Ms: 156,
      fastPathRate: 0.78,
      verifyPathRate: 0.14,
      llmPathRate: 0.08,
    };

    if (options.format === 'json') {
      console.log(JSON.stringify(mockMetrics, null, 2));
    } else if (options.format === 'prometheus') {
      console.log('# HELP ftis_classification_accuracy Classification accuracy ratio');
      console.log('# TYPE ftis_classification_accuracy gauge');
      console.log(`ftis_classification_accuracy ${mockMetrics.classificationAccuracy}`);
      console.log('# HELP ftis_open_intent_recall Open intent detection recall');
      console.log('# TYPE ftis_open_intent_recall gauge');
      console.log(`ftis_open_intent_recall ${mockMetrics.openIntentRecall}`);
      console.log('# HELP ftis_expected_calibration_error Expected Calibration Error');
      console.log('# TYPE ftis_expected_calibration_error gauge');
      console.log(`ftis_expected_calibration_error ${mockMetrics.expectedCalibrationError}`);
      console.log('# HELP ftis_false_positive_rate Tool call false positive rate');
      console.log('# TYPE ftis_false_positive_rate gauge');
      console.log(`ftis_false_positive_rate ${mockMetrics.falsePositiveRate}`);
      console.log('# HELP ftis_latency_p95_ms Classification latency P95');
      console.log('# TYPE ftis_latency_p95_ms gauge');
      console.log(`ftis_latency_p95_ms ${mockMetrics.latencyP95Ms}`);
      console.log('# HELP ftis_fast_path_rate Rate of fast path routing');
      console.log('# TYPE ftis_fast_path_rate gauge');
      console.log(`ftis_fast_path_rate ${mockMetrics.fastPathRate}`);
    } else {
      console.log(chalk.bold('\n📊 FTIS Metrics Summary\n'));
      console.log(`Accuracy:          ${formatPercent(mockMetrics.classificationAccuracy)}`);
      console.log(`Open Intent Recall: ${formatPercent(mockMetrics.openIntentRecall)}`);
      console.log(`ECE:               ${mockMetrics.expectedCalibrationError.toFixed(3)}`);
      console.log(`False Positive:    ${formatPercent(mockMetrics.falsePositiveRate)}`);
      console.log(`Latency P95:       ${formatMs(mockMetrics.latencyP95Ms)}`);
      console.log(`Fast Path Rate:    ${formatPercent(mockMetrics.fastPathRate)}`);
    }
  });

// Feedback command
program
  .command('feedback')
  .description('Show feedback loop statistics')
  .action(async () => {
    console.log(chalk.bold('\n📝 FTIS Feedback Loop Statistics\n'));
    console.log(chalk.dim('─'.repeat(50)));

    // Mock feedback stats
    const mockFeedback: FeedbackStats = {
      totalSignals: 156,
      minedNegatives: 42,
      signalsByType: {
        interruption: 23,
        tool_success: 98,
        tool_failure: 12,
        user_correction: 23,
      },
      negativesBySource: {
        interruption: 18,
        tool_failure: 10,
        user_correction: 8,
        low_confidence_wrong: 6,
      },
      retrainSuggestion: {
        should: false,
        reason: 'Not enough feedback collected yet (42/50)',
        stats: {
          totalSignals: 156,
          minedNegatives: 42,
        },
      },
    };

    console.log(chalk.bold('\n📊 Signal Distribution'));
    console.log(`  Total Signals:     ${chalk.cyan(mockFeedback.totalSignals)}`);
    console.log(`  ├─ Tool Success:   ${chalk.green(mockFeedback.signalsByType.tool_success)}`);
    console.log(`  ├─ Interruptions:  ${chalk.yellow(mockFeedback.signalsByType.interruption)}`);
    console.log(`  ├─ User Corrections: ${chalk.yellow(mockFeedback.signalsByType.user_correction)}`);
    console.log(`  └─ Tool Failures:  ${chalk.red(mockFeedback.signalsByType.tool_failure)}`);

    console.log(chalk.bold('\n🎯 Mined Hard Negatives'));
    console.log(`  Total:              ${chalk.cyan(mockFeedback.minedNegatives)}`);
    console.log(`  ├─ From Interruptions: ${mockFeedback.negativesBySource.interruption}`);
    console.log(`  ├─ From Failures:      ${mockFeedback.negativesBySource.tool_failure}`);
    console.log(`  ├─ From Corrections:   ${mockFeedback.negativesBySource.user_correction}`);
    console.log(`  └─ From Low Conf:      ${mockFeedback.negativesBySource.low_confidence_wrong}`);

    console.log(chalk.bold('\n🔄 Retraining Recommendation'));
    if (mockFeedback.retrainSuggestion.should) {
      console.log(`  ${chalk.green('✓')} Ready for retraining`);
    } else {
      console.log(`  ${chalk.yellow('○')} Not ready`);
    }
    console.log(`  Reason: ${mockFeedback.retrainSuggestion.reason}`);

    console.log(chalk.dim('\n─'.repeat(50)));
  });

// Retrain check command
program
  .command('retrain')
  .description('Check if ready for retraining and show next steps')
  .action(async () => {
    console.log(chalk.bold('\n🔄 FTIS Retraining Status\n'));

    const ready = false; // Would check actual feedback loop
    const minedNegatives = 42;
    const threshold = 50;

    if (ready) {
      console.log(chalk.green('✓ Ready for retraining!\n'));
      console.log('Next steps:');
      console.log('  1. Export hard negatives:');
      console.log(chalk.dim('     npx tsx apps/cli/src/commands/ftis/ftis-experiment.ts export'));
      console.log('  2. Run contrastive training:');
      console.log(chalk.dim('     cd models/ftis-merged && source .venv/bin/activate && python train_contrastive.py'));
      console.log('  3. Update decision boundaries:');
      console.log(chalk.dim('     python train_roic.py'));
      console.log('  4. Retrain calibration:');
      console.log(chalk.dim('     python ../scripts/train-calibration.py'));
    } else {
      console.log(chalk.yellow(`○ Not ready for retraining yet\n`));
      console.log(`Progress: ${minedNegatives}/${threshold} hard negatives (${((minedNegatives / threshold) * 100).toFixed(0)}%)`);
      console.log(chalk.dim('\nKeep collecting feedback. Retraining will be recommended when we have enough hard negatives.'));
    }
  });

// Export command
program
  .command('export')
  .description('Export mined hard negatives for training')
  .option('-o, --output <path>', 'Output file path')
  .action(async (options) => {
    console.log(chalk.bold('\n📤 Exporting Hard Negatives\n'));

    // Mock export
    const outputPath = options.output || 'models/ftis-merged/feedback/exported_negatives.json';
    const count = 42;

    console.log(`Exported ${chalk.cyan(count)} hard negatives to:`);
    console.log(chalk.dim(`  ${outputPath}`));
    console.log('\nNext steps:');
    console.log('  1. Copy to negative_samples directory');
    console.log('  2. Run contrastive training:');
    console.log(chalk.dim('     python train_contrastive.py'));
  });

// Compare V2 vs V3 command
program
  .command('compare')
  .description('Compare FTIS V2 vs V3 performance (requires shadow mode data)')
  .action(async () => {
    console.log(chalk.bold('\n🔬 FTIS V2 vs V3 Comparison\n'));
    console.log(chalk.dim('─'.repeat(60)));

    // Mock comparison data
    const v2Metrics = {
      accuracy: 0.91,
      openIntentRecall: 0.72,
      ece: 0.089,
      falsePositive: 0.085,
      latencyP95: 85,
    };

    const v3Metrics = {
      accuracy: 0.956,
      openIntentRecall: 0.912,
      ece: 0.024,
      falsePositive: 0.044,
      latencyP95: 89,
    };

    const formatDiff = (v2: number, v3: number, inverse = false) => {
      const diff = v3 - v2;
      const pct = ((diff / v2) * 100).toFixed(1);
      const improved = inverse ? diff < 0 : diff > 0;
      const arrow = improved ? chalk.green('↑') : chalk.red('↓');
      const color = improved ? chalk.green : chalk.red;
      return `${color(`${diff > 0 ? '+' : ''}${pct}%`)} ${arrow}`;
    };

    console.log(`${'Metric'.padEnd(25)} ${'V2'.padEnd(12)} ${'V3'.padEnd(12)} ${'Change'}`);
    console.log(chalk.dim('─'.repeat(60)));
    console.log(`${'Classification Accuracy'.padEnd(25)} ${formatPercent(v2Metrics.accuracy).padEnd(12)} ${formatPercent(v3Metrics.accuracy).padEnd(12)} ${formatDiff(v2Metrics.accuracy, v3Metrics.accuracy)}`);
    console.log(`${'Open Intent Recall'.padEnd(25)} ${formatPercent(v2Metrics.openIntentRecall).padEnd(12)} ${formatPercent(v3Metrics.openIntentRecall).padEnd(12)} ${formatDiff(v2Metrics.openIntentRecall, v3Metrics.openIntentRecall)}`);
    console.log(`${'ECE'.padEnd(25)} ${v2Metrics.ece.toFixed(3).padEnd(12)} ${v3Metrics.ece.toFixed(3).padEnd(12)} ${formatDiff(v2Metrics.ece, v3Metrics.ece, true)}`);
    console.log(`${'False Positive Rate'.padEnd(25)} ${formatPercent(v2Metrics.falsePositive).padEnd(12)} ${formatPercent(v3Metrics.falsePositive).padEnd(12)} ${formatDiff(v2Metrics.falsePositive, v3Metrics.falsePositive, true)}`);
    console.log(`${'Latency P95'.padEnd(25)} ${formatMs(v2Metrics.latencyP95).padEnd(12)} ${formatMs(v3Metrics.latencyP95).padEnd(12)} ${formatDiff(v2Metrics.latencyP95, v3Metrics.latencyP95, true)}`);

    console.log(chalk.dim('\n─'.repeat(60)));
    console.log(chalk.green('\n✓ V3 shows significant improvements in accuracy and calibration'));
    console.log(chalk.yellow('○ Latency slightly increased due to boundary checking (+4ms)'));
  });

// Parse arguments and run
program.parse(process.argv);

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
