#!/usr/bin/env npx tsx
/**
 * GTM (Go-To-Market) CLI Commands
 *
 * Comprehensive commands for managing autonomous content strategy.
 * Part of the Ferni CEO CLI for brand management.
 *
 * Usage:
 *   ferni brand gtm status          # View GTM dashboard
 *   ferni brand gtm verify          # Verify brand account configuration
 *   ferni brand gtm calendar        # View content calendar
 *   ferni brand gtm generate        # Generate content on demand
 *   ferni brand gtm publish         # Manually trigger publishing
 *   ferni brand gtm approve <id>    # Approve content for publishing
 *   ferni brand gtm preview <id>    # Preview content before publishing
 *
 * @module cli/commands/brand/gtm
 */

import chalk from 'chalk';
import {
  gtmStatus,
  gtmCalendar,
  gtmGenerate,
  gtmPublish,
  gtmApprove,
  gtmPreview,
  gtmTest,
  gtmVerify,
} from './gtm-handlers.js';

// ============================================================================
// COMMAND ROUTER
// ============================================================================

export async function gtmCommand(
  subcommand: string,
  args: string[],
  options: Record<string, unknown>
): Promise<void> {
  switch (subcommand) {
    case 'status':
      await gtmStatus();
      break;

    case 'verify':
      await gtmVerify();
      break;

    case 'calendar':
      await gtmCalendar(Number(options.days) || 7);
      break;

    case 'generate':
      await gtmGenerate({
        category: options.category as string,
        topic: options.topic as string,
        week: options.week as boolean,
      });
      break;

    case 'publish':
      await gtmPublish({
        contentId: options.contentId as string,
        all: options.all as boolean,
      });
      break;

    case 'approve':
      if (args[0]) {
        await gtmApprove(args[0]);
      } else {
        console.log(chalk.red('Please provide a content ID: ferni brand gtm approve <content-id>'));
      }
      break;

    case 'preview':
      if (args[0]) {
        await gtmPreview(args[0]);
      } else {
        console.log(chalk.red('Please provide a content ID: ferni brand gtm preview <content-id>'));
      }
      break;

    case 'test':
      await gtmTest();
      break;

    default:
      printGtmHelp();
  }
}

// ============================================================================
// HELP
// ============================================================================

function printGtmHelp(): void {
  console.log(chalk.bold('\n📣 GTM (Go-To-Market) Commands\n'));
  console.log(chalk.gray('Autonomous content strategy and publishing.\n'));

  console.log(chalk.bold('Status & Verification:'));
  console.log('  ' + chalk.cyan('ferni brand gtm status') + '              View GTM dashboard');
  console.log('  ' + chalk.cyan('ferni brand gtm verify') + '              Verify brand account config');
  console.log('  ' + chalk.cyan('ferni brand gtm calendar') + '            View content calendar');
  console.log('  ' + chalk.cyan('ferni brand gtm calendar --days 14') + '  View 14-day calendar');
  console.log();

  console.log(chalk.bold('Content Generation:'));
  console.log('  ' + chalk.cyan('ferni brand gtm generate --week') + '     Generate week\'s content');
  console.log(
    '  ' +
      chalk.cyan('ferni brand gtm generate --category tutorial --topic "X"') +
      ' Generate specific'
  );
  console.log();

  console.log(chalk.bold('Publishing:'));
  console.log('  ' + chalk.cyan('ferni brand gtm publish --all') + '       Run publishing job');
  console.log(
    '  ' + chalk.cyan('ferni brand gtm publish --content-id <id>') + '  Publish specific content'
  );
  console.log();

  console.log(chalk.bold('Content Management:'));
  console.log('  ' + chalk.cyan('ferni brand gtm approve <id>') + '        Approve content');
  console.log('  ' + chalk.cyan('ferni brand gtm preview <id>') + '        Preview content');
  console.log();

  console.log(chalk.bold('Testing:'));
  console.log('  ' + chalk.cyan('ferni brand gtm test') + '                Test GTM system');
  console.log();

  console.log(chalk.gray('═'.repeat(60)));
  console.log(chalk.gray('Scheduled Jobs:'));
  console.log(chalk.gray('  • gtm-daily-publishing    - Daily at 9 AM (auto-publish)'));
  console.log(chalk.gray('  • gtm-weekly-content      - Sunday at 8 AM (generate week)'));
  console.log(chalk.gray('═'.repeat(60)));
}

// Re-export handlers for direct use
export {
  gtmStatus,
  gtmCalendar,
  gtmGenerate,
  gtmPublish,
  gtmApprove,
  gtmPreview,
  gtmTest,
  gtmVerify,
} from './gtm-handlers.js';
