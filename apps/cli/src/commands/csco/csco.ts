#!/usr/bin/env npx tsx
/**
 * CSCO Command - Operations & Supply Chain for Autonomous Company
 *
 * Usage:
 *   ferni csco costs            # Cost optimization opportunities
 *   ferni csco vendors          # Vendor performance, renegotiation
 *   ferni csco slas             # SLA monitoring, breach alerts
 *   ferni csco capacity         # Capacity planning
 *   ferni csco automation       # Process automation opportunities
 */

import { cscoCosts } from './csco-costs.js';
import { cscoVendors } from './csco-vendors.js';
import { cscoSlas } from './csco-slas.js';
import { cscoCapacity } from './csco-capacity.js';
import { cscoAutomation } from './csco-automation.js';

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
${colors.bold}${colors.cyan}╔═══════════════════════════════════════════════════════════╗
║           FERNI CSCO - OPERATIONS & SUPPLY CHAIN           ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.cyan}USAGE${colors.reset}
  ferni csco <command> [options]

${colors.cyan}COMMANDS${colors.reset}
  ${colors.bold}costs${colors.reset}               Cost optimization opportunities
    --breakdown         Show cost breakdown by category
    --optimize          AI optimization recommendations
    --forecast          Cost forecast for next quarter

  ${colors.bold}vendors${colors.reset}             Vendor performance, renegotiation
    --audit             Full vendor audit
    --renewals          Upcoming contract renewals
    --risks             Vendor dependency risks

  ${colors.bold}slas${colors.reset}                SLA monitoring, breach alerts
    --status            Current SLA status (default)
    --breaches          Show SLA breaches
    --alerts            Active alerts and warnings

  ${colors.bold}capacity${colors.reset}            Capacity planning
    --status            Current capacity utilization (default)
    --forecast          90-day capacity forecast
    --plan              Scaling recommendations

  ${colors.bold}automation${colors.reset}          Process automation opportunities
    --status            Active automation status (default)
    --opportunities     New automation opportunities
    --metrics           Metrics by category

${colors.cyan}EXAMPLES${colors.reset}
  ferni csco costs --breakdown
  ferni csco vendors --audit
  ferni csco slas --breaches
  ferni csco capacity --forecast
  ferni csco automation --opportunities

${colors.cyan}AUTONOMOUS CAPABILITIES${colors.reset}
  The CSCO module provides operational optimization:
  - Identifies cost reduction opportunities
  - Monitors vendor performance and contracts
  - Tracks SLA compliance and predicts breaches
  - Plans capacity and scaling decisions
  - Identifies automation opportunities
`);
}

export async function csco(command: string, options: Record<string, unknown> = {}): Promise<void> {
  switch (command) {
    case 'costs':
      await cscoCosts({
        breakdown: options.breakdown as boolean,
        optimize: options.optimize as boolean,
        forecast: options.forecast as boolean,
      });
      break;
    case 'vendors':
      await cscoVendors({
        audit: options.audit as boolean,
        renewals: options.renewals as boolean,
        risks: options.risks as boolean,
      });
      break;
    case 'slas':
      await cscoSlas({
        status: options.status as boolean,
        breaches: options.breaches as boolean,
        alerts: options.alerts as boolean,
      });
      break;
    case 'capacity':
      await cscoCapacity({
        status: options.status as boolean,
        forecast: options.forecast as boolean,
        plan: options.plan as boolean,
      });
      break;
    case 'automation':
      await cscoAutomation({
        status: options.status as boolean,
        opportunities: options.opportunities as boolean,
        metrics: options.metrics as boolean,
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
  // costs options
  if (args.includes('--breakdown')) options.breakdown = true;
  if (args.includes('--optimize')) options.optimize = true;
  if (args.includes('--forecast')) options.forecast = true;
  // vendors options
  if (args.includes('--audit')) options.audit = true;
  if (args.includes('--renewals')) options.renewals = true;
  if (args.includes('--risks')) options.risks = true;
  // slas options
  if (args.includes('--status')) options.status = true;
  if (args.includes('--breaches')) options.breaches = true;
  if (args.includes('--alerts')) options.alerts = true;
  // capacity options (status, forecast, plan already covered)
  if (args.includes('--plan')) options.plan = true;
  // automation options
  if (args.includes('--opportunities')) options.opportunities = true;
  if (args.includes('--metrics')) options.metrics = true;

  csco(command, options).catch(console.error);
}
