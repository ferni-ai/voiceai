#!/usr/bin/env npx tsx
/**
 * CTO Command - Technical Leadership for Autonomous Company
 *
 * Usage:
 *   ferni cto health            # Architecture health score
 *   ferni cto debt              # Tech debt inventory + prioritization
 *   ferni cto incidents         # Incident tracking, postmortems
 *   ferni cto security          # Security scan, vulnerability report
 *   ferni cto dependencies      # Dependency health, update roadmap
 *   ferni cto performance       # System performance trends
 */

import { ctoHealth } from './cto-health.js';
import { ctoDebt } from './cto-debt.js';
import { ctoIncidents } from './cto-incidents.js';
import { ctoSecurity } from './cto-security.js';
import { ctoDependencies } from './cto-dependencies.js';
import { ctoPerformance } from './cto-performance.js';

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
${colors.bold}${colors.blue}╔═══════════════════════════════════════════════════════════╗
║           FERNI CTO - TECHNICAL LEADERSHIP                 ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.cyan}USAGE${colors.reset}
  ferni cto <command> [options]

${colors.cyan}COMMANDS${colors.reset}
  ${colors.bold}health${colors.reset}              Architecture health score
    --json              Output as JSON
    --detailed          Show detailed breakdown

  ${colors.bold}debt${colors.reset}                Tech debt inventory + prioritization
    --add <item>        Add new tech debt item
    --priority          Sort by priority score
    --category <cat>    Filter by category

  ${colors.bold}incidents${colors.reset}           Incident tracking, postmortems
    --active            Show active incidents only
    --create            Create new incident
    --postmortem <id>   Generate postmortem for incident

  ${colors.bold}security${colors.reset}            Security scan, vulnerability report
    --scan              Run security scan now
    --cve               Show CVE vulnerabilities
    --audit             Full security audit

  ${colors.bold}dependencies${colors.reset}        Dependency health, update roadmap
    --outdated          Show outdated packages
    --update-plan       Generate update plan
    --breaking          Show breaking changes

  ${colors.bold}performance${colors.reset}         System performance trends
    --period <period>   Time period (hour, day, week)
    --service <name>    Filter by service
    --alerts            Show performance alerts

${colors.cyan}EXAMPLES${colors.reset}
  ferni cto health --detailed
  ferni cto debt --priority
  ferni cto incidents --active
  ferni cto security --scan
  ferni cto dependencies --outdated
  ferni cto performance --period week

${colors.cyan}AUTONOMOUS CAPABILITIES${colors.reset}
  The CTO module provides technical oversight:
  - Monitors architecture health and complexity
  - Tracks and prioritizes technical debt
  - Manages incidents and generates postmortems
  - Scans for security vulnerabilities
  - Monitors dependency health and updates
`);
}

export async function cto(command: string, options: Record<string, unknown> = {}): Promise<void> {
  switch (command) {
    case 'health':
      await ctoHealth({
        json: options.json as boolean,
        detailed: options.detailed as boolean,
      });
      break;
    case 'debt':
      await ctoDebt({
        add: options.add as string,
        priority: options.priority as boolean,
        category: options.category as string,
      });
      break;
    case 'incidents':
      await ctoIncidents({
        active: options.active as boolean,
        create: options.create as boolean,
        postmortem: options.postmortem as string,
      });
      break;
    case 'security':
      await ctoSecurity({
        scan: options.scan as boolean,
        cve: options.cve as boolean,
        audit: options.audit as boolean,
      });
      break;
    case 'dependencies':
      await ctoDependencies({
        outdated: options.outdated as boolean,
        updatePlan: options.updatePlan as boolean,
        breaking: options.breaking as boolean,
      });
      break;
    case 'performance':
      await ctoPerformance({
        period: options.period as string,
        service: options.service as string,
        alerts: options.alerts as boolean,
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
  if (args.includes('--detailed')) options.detailed = true;
  if (args.includes('--priority')) options.priority = true;
  if (args.includes('--active')) options.active = true;
  if (args.includes('--create')) options.create = true;
  if (args.includes('--scan')) options.scan = true;
  if (args.includes('--cve')) options.cve = true;
  if (args.includes('--audit')) options.audit = true;
  if (args.includes('--outdated')) options.outdated = true;
  if (args.includes('--update-plan')) options.updatePlan = true;
  if (args.includes('--breaking')) options.breaking = true;
  if (args.includes('--alerts')) options.alerts = true;

  const addIdx = args.findIndex((a) => a === '--add');
  if (addIdx >= 0) options.add = args[addIdx + 1];

  const categoryIdx = args.findIndex((a) => a === '--category');
  if (categoryIdx >= 0) options.category = args[categoryIdx + 1];

  const postmortemIdx = args.findIndex((a) => a === '--postmortem');
  if (postmortemIdx >= 0) options.postmortem = args[postmortemIdx + 1];

  const periodIdx = args.findIndex((a) => a === '--period');
  if (periodIdx >= 0) options.period = args[periodIdx + 1];

  const serviceIdx = args.findIndex((a) => a === '--service');
  if (serviceIdx >= 0) options.service = args[serviceIdx + 1];

  cto(command, options).catch(console.error);
}
