#!/usr/bin/env npx tsx
/**
 * CEO Command - Strategic Operations for Autonomous Company
 *
 * Usage:
 *   ferni ceo dashboard         # Real-time company health
 *   ferni ceo metrics           # KPIs across all functions
 *   ferni ceo decisions         # Decision log with outcomes
 *   ferni ceo board-prep        # Generate board deck data
 *   ferni ceo investor-update   # Draft investor communications
 *   ferni ceo okrs              # OKR tracking and scoring
 */

import { ceoDashboard } from './ceo-dashboard.js';
import { ceoMetrics } from './ceo-metrics.js';
import { ceoDecisions } from './ceo-decisions.js';
import { ceoBoardPrep } from './ceo-board-prep.js';
import { ceoInvestorUpdate } from './ceo-investor-update.js';
import { ceoOkrs } from './ceo-okrs.js';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function printHelp(): void {
  console.log(`
${colors.bold}${colors.magenta}╔═══════════════════════════════════════════════════════════╗
║           FERNI CEO - STRATEGIC OPERATIONS                 ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.cyan}USAGE${colors.reset}
  ferni ceo <command> [options]

${colors.cyan}COMMANDS${colors.reset}
  ${colors.bold}dashboard${colors.reset}           Real-time company health overview
    --json              Output as JSON

  ${colors.bold}metrics${colors.reset}             KPIs across all functions
    --period <period>   Time period (day, week, month, quarter)
    --compare           Compare to previous period

  ${colors.bold}decisions${colors.reset}           Decision log with outcomes
    --add <title>       Add a new decision
    --outcome <id>      Record outcome for a decision
    --pending           Show only pending decisions

  ${colors.bold}board-prep${colors.reset}          Generate board deck data
    --quarter <Q1-Q4>   Quarter for the report
    --export            Export as markdown

  ${colors.bold}investor-update${colors.reset}     Draft investor communications
    --type <type>       Type: monthly, quarterly, annual
    --preview           Preview without sending

  ${colors.bold}okrs${colors.reset}                OKR tracking and scoring
    --quarter <Q1-Q4>   Quarter to view
    --score <id>        Score a key result
    --add               Add new OKR (interactive)

${colors.cyan}EXAMPLES${colors.reset}
  ferni ceo dashboard
  ferni ceo metrics --period quarter --compare
  ferni ceo decisions --pending
  ferni ceo board-prep --quarter Q1 --export
  ferni ceo okrs --quarter Q1

${colors.cyan}AUTONOMOUS CAPABILITIES${colors.reset}
  The CEO module provides strategic oversight:
  - Aggregates data from all other C-suite modules
  - Tracks company-wide OKRs and key decisions
  - Generates board materials and investor updates
  - Monitors overall company health metrics
`);
}

export async function ceo(command: string, options: Record<string, unknown> = {}): Promise<void> {
  switch (command) {
    case 'dashboard':
      await ceoDashboard({ json: options.json as boolean });
      break;
    case 'metrics':
      await ceoMetrics({
        period: options.period as string,
        compare: options.compare as boolean,
      });
      break;
    case 'decisions':
      await ceoDecisions({
        add: options.add as string,
        outcome: options.outcome as string,
        pending: options.pending as boolean,
      });
      break;
    case 'board-prep':
      await ceoBoardPrep({
        quarter: options.quarter as string,
        export: options.export as boolean,
      });
      break;
    case 'investor-update':
      await ceoInvestorUpdate({
        type: options.type as string,
        preview: options.preview as boolean,
      });
      break;
    case 'okrs':
      await ceoOkrs({
        quarter: options.quarter as string,
        score: options.score as string,
        add: options.add as boolean,
      });
      break;
    case 'help':
    default:
      printHelp();
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  const options: Record<string, unknown> = {};
  if (args.includes('--json')) options.json = true;
  if (args.includes('--compare')) options.compare = true;
  if (args.includes('--pending')) options.pending = true;
  if (args.includes('--export')) options.export = true;
  if (args.includes('--preview')) options.preview = true;
  if (args.includes('--add')) options.add = args[args.indexOf('--add') + 1];

  const periodIdx = args.findIndex((a) => a === '--period');
  if (periodIdx >= 0) options.period = args[periodIdx + 1];

  const quarterIdx = args.findIndex((a) => a === '--quarter');
  if (quarterIdx >= 0) options.quarter = args[quarterIdx + 1];

  const typeIdx = args.findIndex((a) => a === '--type');
  if (typeIdx >= 0) options.type = args[typeIdx + 1];

  const outcomeIdx = args.findIndex((a) => a === '--outcome');
  if (outcomeIdx >= 0) options.outcome = args[outcomeIdx + 1];

  const scoreIdx = args.findIndex((a) => a === '--score');
  if (scoreIdx >= 0) options.score = args[scoreIdx + 1];

  ceo(command, options).catch(console.error);
}
