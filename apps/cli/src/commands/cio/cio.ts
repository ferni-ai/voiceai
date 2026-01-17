#!/usr/bin/env npx tsx
/**
 * CIO Command - Information & Security Governance for Autonomous Company
 *
 * Usage:
 *   ferni cio compliance        # SOC2, GDPR, HIPAA status
 *   ferni cio data-catalog      # Data lineage, PII inventory
 *   ferni cio access-review     # Permission audits
 *   ferni cio risk              # Risk register, mitigation tracking
 *   ferni cio vendors           # Vendor security assessments
 */

import { cioCompliance } from './cio-compliance.js';
import { cioDataCatalog } from './cio-data-catalog.js';
import { cioAccessReview } from './cio-access-review.js';
import { cioRisk } from './cio-risk.js';
import { cioVendors } from './cio-vendors.js';

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
${colors.bold}${colors.green}╔═══════════════════════════════════════════════════════════╗
║           FERNI CIO - INFORMATION & SECURITY               ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.cyan}USAGE${colors.reset}
  ferni cio <command> [options]

${colors.cyan}COMMANDS${colors.reset}
  ${colors.bold}compliance${colors.reset}          SOC2, GDPR, HIPAA status
    --framework <name>  Filter by framework (soc2, gdpr, hipaa)
    --gaps              Show compliance gaps only
    --export            Export compliance report

  ${colors.bold}data-catalog${colors.reset}        Data lineage, PII inventory
    --pii               Show PII data locations
    --lineage <table>   Show data lineage for table
    --scan              Scan for new data sources

  ${colors.bold}access-review${colors.reset}       Permission audits
    --stale             Show stale permissions
    --elevated          Show elevated access
    --service <name>    Filter by service

  ${colors.bold}risk${colors.reset}                Risk register, mitigation tracking
    --add <title>       Add new risk
    --assess <id>       Assess/update risk
    --high              Show high-priority risks only

  ${colors.bold}vendors${colors.reset}             Vendor security assessments
    --pending           Show pending assessments
    --assess <vendor>   Start vendor assessment
    --renew             Show upcoming renewals

${colors.cyan}EXAMPLES${colors.reset}
  ferni cio compliance --framework soc2
  ferni cio data-catalog --pii
  ferni cio access-review --stale
  ferni cio risk --high
  ferni cio vendors --pending

${colors.cyan}AUTONOMOUS CAPABILITIES${colors.reset}
  The CIO module provides governance oversight:
  - Tracks compliance across multiple frameworks
  - Maintains data catalog and PII inventory
  - Audits access permissions automatically
  - Manages enterprise risk register
  - Assesses vendor security posture
`);
}

export async function cio(command: string, options: Record<string, unknown> = {}): Promise<void> {
  switch (command) {
    case 'compliance':
      await cioCompliance({
        framework: options.framework as string,
        gaps: options.gaps as boolean,
        export: options.export as boolean,
      });
      break;
    case 'data-catalog':
      await cioDataCatalog({
        pii: options.pii as boolean,
        lineage: options.lineage as string,
        scan: options.scan as boolean,
      });
      break;
    case 'access-review':
      await cioAccessReview({
        stale: options.stale as boolean,
        elevated: options.elevated as boolean,
        service: options.service as string,
      });
      break;
    case 'risk':
      await cioRisk({
        add: options.add as string,
        assess: options.assess as string,
        high: options.high as boolean,
      });
      break;
    case 'vendors':
      await cioVendors({
        pending: options.pending as boolean,
        assess: options.assess as string,
        renew: options.renew as boolean,
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
  if (args.includes('--gaps')) options.gaps = true;
  if (args.includes('--export')) options.export = true;
  if (args.includes('--pii')) options.pii = true;
  if (args.includes('--scan')) options.scan = true;
  if (args.includes('--stale')) options.stale = true;
  if (args.includes('--elevated')) options.elevated = true;
  if (args.includes('--high')) options.high = true;
  if (args.includes('--pending')) options.pending = true;
  if (args.includes('--renew')) options.renew = true;

  const frameworkIdx = args.findIndex((a) => a === '--framework');
  if (frameworkIdx >= 0) options.framework = args[frameworkIdx + 1];

  const lineageIdx = args.findIndex((a) => a === '--lineage');
  if (lineageIdx >= 0) options.lineage = args[lineageIdx + 1];

  const serviceIdx = args.findIndex((a) => a === '--service');
  if (serviceIdx >= 0) options.service = args[serviceIdx + 1];

  const addIdx = args.findIndex((a) => a === '--add');
  if (addIdx >= 0) options.add = args[addIdx + 1];

  const assessIdx = args.findIndex((a) => a === '--assess');
  if (assessIdx >= 0) options.assess = args[assessIdx + 1];

  cio(command, options).catch(console.error);
}
