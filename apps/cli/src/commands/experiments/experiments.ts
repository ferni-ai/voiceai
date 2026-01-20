/**
 * Experiment CLI Commands
 *
 * Manage A/B tests, bandits, and auto-rollouts from the command line.
 *
 * Commands:
 *   ferni experiments list      - List all experiments
 *   ferni experiments status    - Show experiment summary
 *   ferni experiments create    - Create new experiment
 *   ferni experiments show <id> - Show experiment details
 *   ferni experiments start <id> - Start an experiment
 *   ferni experiments pause <id> - Pause an experiment
 *   ferni experiments resume <id> - Resume an experiment
 *   ferni experiments complete <id> - Complete an experiment
 *   ferni experiments delete <id> - Delete an experiment
 *   ferni experiments health <id> - Show experiment health
 *
 * @module cli/commands/experiments/experiments
 */

import { Command } from 'commander';
import chalk from 'chalk';

const program = new Command();

// ============================================================================
// EXPERIMENTS LIST
// ============================================================================

program
  .command('list')
  .description('List all experiments')
  .option('--json', 'Output as JSON')
  .option('--status <status>', 'Filter by status (running, paused, completed)')
  .option('--type <type>', 'Filter by type (ab, bandit, rollout)')
  .action(async (options) => {
    try {
      const response = await fetch('http://localhost:3002/api/experiments', {
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        console.error(chalk.red(`Error: ${response.statusText}`));
        return;
      }

      const data = await response.json();

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      console.log(chalk.bold('\n Experiments\n'));
      console.log(chalk.gray('─'.repeat(80)));

      let experiments = data.experiments;

      // Apply filters
      if (options.status) {
        experiments = experiments.filter((e: { status: string }) => e.status === options.status);
      }
      if (options.type) {
        experiments = experiments.filter((e: { type: string }) => e.type === options.type);
      }

      if (experiments.length === 0) {
        console.log(chalk.yellow('No experiments found.'));
        return;
      }

      for (const exp of experiments) {
        const statusIcon = getStatusIcon(exp.status);
        const typeIcon = getTypeIcon(exp.type);
        console.log(
          `${statusIcon} ${chalk.cyan(exp.id)} ${typeIcon} ${exp.name}` +
            chalk.gray(` (${exp.variants} variants)`)
        );
        if (exp.winner) {
          console.log(chalk.green(`   Winner: ${exp.winner}`));
        }
      }

      console.log(chalk.gray('\n─'.repeat(80)));
      console.log(chalk.gray(`Total: ${experiments.length} experiments`));
    } catch (error) {
      console.error(chalk.red('Failed to connect to API. Is the UI server running?'));
      console.error(chalk.gray('Run: pnpm ui-server'));
    }
  });

// ============================================================================
// EXPERIMENTS STATUS
// ============================================================================

program
  .command('status')
  .alias('summary')
  .description('Show experiment summary')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const response = await fetch('http://localhost:3002/api/experiments/summary', {
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        console.error(chalk.red(`Error: ${response.statusText}`));
        return;
      }

      const data = await response.json();

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      console.log(chalk.bold('\n Experiment Summary\n'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log(`Total:     ${chalk.cyan(data.total)}`);
      console.log(`Running:   ${chalk.green(data.running)}`);
      console.log(`Paused:    ${chalk.yellow(data.paused)}`);
      console.log(`Completed: ${chalk.gray(data.completed)}`);
      console.log(chalk.gray('─'.repeat(40)));
      console.log(`A/B:       ${data.byType.ab}`);
      console.log(`Bandit:    ${data.byType.bandit}`);
      console.log(`Rollout:   ${data.byType.rollout}`);
    } catch (error) {
      console.error(chalk.red('Failed to connect to API. Is the UI server running?'));
    }
  });

// ============================================================================
// EXPERIMENTS CREATE
// ============================================================================

program
  .command('create')
  .description('Create a new experiment')
  .requiredOption('-i, --id <id>', 'Experiment ID')
  .requiredOption('-n, --name <name>', 'Experiment name')
  .requiredOption('-t, --type <type>', 'Type: ab, bandit, or rollout')
  .option('-v, --variants <variants>', 'Comma-separated variant names', 'control,treatment')
  .option('-m, --metric <metric>', 'Primary metric', 'success_rate')
  .option('--auto-promote', 'Enable auto-promotion')
  .option('--auto-rollback', 'Enable auto-rollback (default)')
  .option('--dry-run', 'Preview without creating')
  .action(async (options) => {
    const variantNames = options.variants.split(',').map((v: string) => v.trim());
    const variants = variantNames.map((name: string, i: number) => ({
      id: name.toLowerCase().replace(/\s+/g, '_'),
      name,
      trafficPercent: 100 / variantNames.length,
    }));

    const config = {
      id: options.id,
      name: options.name,
      type: options.type,
      variants,
      primaryMetric: options.metric,
      autoPromote: options.autoPromote || false,
      autoRollback: options.autoRollback !== false,
    };

    if (options.dryRun) {
      console.log(chalk.yellow('\n[DRY RUN] Would create experiment:\n'));
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    try {
      const response = await fetch('http://localhost:3002/api/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error(chalk.red(`Error: ${error.error || response.statusText}`));
        return;
      }

      const data = await response.json();
      console.log(chalk.green(`\n Experiment created: ${data.experiment.config.id}`));
      console.log(chalk.gray(`Status: ${data.experiment.status}`));
    } catch (error) {
      console.error(chalk.red('Failed to connect to API. Is the UI server running?'));
    }
  });

// ============================================================================
// EXPERIMENTS SHOW
// ============================================================================

program
  .command('show <id>')
  .description('Show experiment details')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      const response = await fetch(`http://localhost:3002/api/experiments/${id}`, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        console.error(chalk.red(`Error: ${response.statusText}`));
        return;
      }

      const data = await response.json();

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      const exp = data.experiment;
      console.log(chalk.bold(`\n ${exp.config.name}\n`));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`ID:          ${chalk.cyan(exp.config.id)}`);
      console.log(`Type:        ${getTypeIcon(exp.config.type)} ${exp.config.type}`);
      console.log(`Status:      ${getStatusIcon(exp.status)} ${exp.status}`);
      console.log(`Created:     ${new Date(exp.createdAt).toLocaleString()}`);
      if (exp.startedAt) {
        console.log(`Started:     ${new Date(exp.startedAt).toLocaleString()}`);
      }
      if (exp.winner) {
        console.log(`Winner:      ${chalk.green(exp.winner)}`);
      }
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.bold('Variants:'));
      for (const v of exp.config.variants) {
        console.log(`  - ${v.name} (${v.trafficPercent}%)`);
      }
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`Primary Metric: ${exp.config.primaryMetric}`);
      console.log(`Auto-Promote:   ${exp.config.autoPromote ? 'Yes' : 'No'}`);
      console.log(`Auto-Rollback:  ${exp.config.autoRollback ? 'Yes' : 'No'}`);
    } catch (error) {
      console.error(chalk.red('Failed to connect to API. Is the UI server running?'));
    }
  });

// ============================================================================
// EXPERIMENTS HEALTH
// ============================================================================

program
  .command('health <id>')
  .description('Show experiment health')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    try {
      const response = await fetch(`http://localhost:3002/api/experiments/${id}/health`, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        console.error(chalk.red(`Error: ${response.statusText}`));
        return;
      }

      const data = await response.json();

      if (options.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      const health = data.health;
      console.log(chalk.bold(`\n Health: ${id}\n`));
      console.log(chalk.gray('─'.repeat(50)));

      const statusColor =
        health.status === 'healthy'
          ? chalk.green
          : health.status === 'warning'
            ? chalk.yellow
            : chalk.red;
      console.log(`Status: ${statusColor(health.status.toUpperCase())}`);
      console.log(`Last Check: ${new Date(health.lastCheck).toLocaleString()}`);

      if (health.recommendations.length > 0) {
        console.log(chalk.bold('\nRecommendations:'));
        for (const rec of health.recommendations) {
          console.log(`  ${rec}`);
        }
      }

      if (health.typeStatus.ab) {
        console.log(chalk.bold('\nA/B Test Results:'));
        console.log(`  Recommendation: ${health.typeStatus.ab.recommendation}`);
        if (health.typeStatus.ab.pValue) {
          console.log(`  P-Value: ${health.typeStatus.ab.pValue.toFixed(4)}`);
        }
      }

      if (health.typeStatus.bandit) {
        console.log(chalk.bold('\nBandit Stats:'));
        console.log(`  Best Variant: ${health.typeStatus.bandit.estimatedBest}`);
        console.log(`  Confidence: ${(health.typeStatus.bandit.bestConfidence * 100).toFixed(1)}%`);
      }

      if (health.typeStatus.rollout) {
        console.log(chalk.bold('\nRollout Status:'));
        console.log(`  Stage: ${health.typeStatus.rollout.currentStage}`);
        console.log(`  Traffic: ${health.typeStatus.rollout.percentage}%`);
        console.log(`  Confidence: ${(health.typeStatus.rollout.confidence * 100).toFixed(1)}%`);
      }

      if (health.typeStatus.sequential) {
        console.log(chalk.bold('\nSequential Test:'));
        console.log(`  Decision: ${health.typeStatus.sequential.decision}`);
        console.log(`  Samples: ${health.typeStatus.sequential.samplesUsed}`);
      }
    } catch (error) {
      console.error(chalk.red('Failed to connect to API. Is the UI server running?'));
    }
  });

// ============================================================================
// EXPERIMENTS START
// ============================================================================

program
  .command('start <id>')
  .description('Start an experiment')
  .action(async (id) => {
    try {
      const response = await fetch(`http://localhost:3002/api/experiments/${id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        console.error(chalk.red(`Error: ${error.error || response.statusText}`));
        return;
      }

      console.log(chalk.green(` Experiment ${id} started`));
    } catch (error) {
      console.error(chalk.red('Failed to connect to API. Is the UI server running?'));
    }
  });

// ============================================================================
// EXPERIMENTS PAUSE
// ============================================================================

program
  .command('pause <id>')
  .description('Pause an experiment')
  .option('-r, --reason <reason>', 'Pause reason')
  .action(async (id, options) => {
    try {
      const response = await fetch(`http://localhost:3002/api/experiments/${id}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: options.reason }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error(chalk.red(`Error: ${error.error || response.statusText}`));
        return;
      }

      console.log(chalk.yellow(` Experiment ${id} paused`));
    } catch (error) {
      console.error(chalk.red('Failed to connect to API. Is the UI server running?'));
    }
  });

// ============================================================================
// EXPERIMENTS RESUME
// ============================================================================

program
  .command('resume <id>')
  .description('Resume an experiment')
  .action(async (id) => {
    try {
      const response = await fetch(`http://localhost:3002/api/experiments/${id}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        console.error(chalk.red(`Error: ${error.error || response.statusText}`));
        return;
      }

      console.log(chalk.green(` Experiment ${id} resumed`));
    } catch (error) {
      console.error(chalk.red('Failed to connect to API. Is the UI server running?'));
    }
  });

// ============================================================================
// EXPERIMENTS COMPLETE
// ============================================================================

program
  .command('complete <id>')
  .description('Complete an experiment')
  .option('-w, --winner <variant>', 'Winner variant ID')
  .action(async (id, options) => {
    try {
      const response = await fetch(`http://localhost:3002/api/experiments/${id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winner: options.winner }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error(chalk.red(`Error: ${error.error || response.statusText}`));
        return;
      }

      console.log(chalk.green(` Experiment ${id} completed`));
      if (options.winner) {
        console.log(chalk.green(`Winner: ${options.winner}`));
      }
    } catch (error) {
      console.error(chalk.red('Failed to connect to API. Is the UI server running?'));
    }
  });

// ============================================================================
// EXPERIMENTS PROMOTE
// ============================================================================

program
  .command('promote <id>')
  .description('Check and promote experiment winner')
  .action(async (id) => {
    try {
      const response = await fetch(`http://localhost:3002/api/experiments/${id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        console.error(chalk.red(`Error: ${error.error || response.statusText}`));
        return;
      }

      const data = await response.json();
      if (data.success) {
        console.log(chalk.green(` Winner promoted: ${data.promotion.winner}`));
      } else {
        console.log(chalk.yellow(' Not ready to promote'));
        console.log(chalk.gray(`Reason: ${data.promotion.reason}`));
        if (data.promotion.blockingIssues.length > 0) {
          console.log(chalk.gray('Blocking issues:'));
          for (const issue of data.promotion.blockingIssues) {
            console.log(chalk.gray(`  - ${issue}`));
          }
        }
      }
    } catch (error) {
      console.error(chalk.red('Failed to connect to API. Is the UI server running?'));
    }
  });

// ============================================================================
// EXPERIMENTS DELETE
// ============================================================================

program
  .command('delete <id>')
  .description('Delete an experiment')
  .option('-f, --force', 'Skip confirmation')
  .action(async (id, options) => {
    if (!options.force) {
      console.log(chalk.yellow(`\nThis will permanently delete experiment: ${id}`));
      console.log(chalk.gray('Use --force to skip this confirmation.\n'));
      return;
    }

    try {
      const response = await fetch(`http://localhost:3002/api/experiments/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json();
        console.error(chalk.red(`Error: ${error.error || response.statusText}`));
        return;
      }

      console.log(chalk.green(` Experiment ${id} deleted`));
    } catch (error) {
      console.error(chalk.red('Failed to connect to API. Is the UI server running?'));
    }
  });

// ============================================================================
// HELPERS
// ============================================================================

function getStatusIcon(status: string): string {
  switch (status) {
    case 'running':
      return chalk.green('');
    case 'paused':
      return chalk.yellow('');
    case 'completed':
      return chalk.gray('');
    case 'promoted':
      return chalk.green('');
    case 'rolled_back':
      return chalk.red('');
    case 'pending':
      return chalk.gray('');
    default:
      return chalk.gray('');
  }
}

function getTypeIcon(type: string): string {
  switch (type) {
    case 'ab':
      return chalk.blue('[A/B]');
    case 'bandit':
      return chalk.magenta('[MAB]');
    case 'rollout':
      return chalk.cyan('[ROL]');
    default:
      return chalk.gray('[???]');
  }
}

// ============================================================================
// MAIN
// ============================================================================

export { program as experimentsCommand };

// Direct execution
if (process.argv[1]?.includes('experiments.ts') || process.argv[1]?.includes('experiments.js')) {
  program.parse(process.argv);
}
