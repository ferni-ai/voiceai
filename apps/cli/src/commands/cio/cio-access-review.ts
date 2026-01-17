#!/usr/bin/env npx tsx
/**
 * CIO Access Review - Permission audits
 */

const colors = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m' };

interface AccessEntry {
  user: string;
  service: string;
  role: string;
  lastUsed: string;
  stale: boolean;
  elevated: boolean;
}

async function fetchAccessData(): Promise<AccessEntry[]> {
  return [
    { user: 'seth@ferni.ai', service: 'GCP', role: 'Owner', lastUsed: '2025-01-17', stale: false, elevated: true },
    { user: 'ci-bot', service: 'GCP', role: 'Editor', lastUsed: '2025-01-17', stale: false, elevated: true },
    { user: 'old-contractor', service: 'GitHub', role: 'Admin', lastUsed: '2024-09-01', stale: true, elevated: true },
    { user: 'monitoring', service: 'Firestore', role: 'Viewer', lastUsed: '2025-01-15', stale: false, elevated: false },
  ];
}

export async function cioAccessReview(options: { stale?: boolean; elevated?: boolean; service?: string }): Promise<void> {
  let entries = await fetchAccessData();
  if (options.stale) entries = entries.filter(e => e.stale);
  if (options.elevated) entries = entries.filter(e => e.elevated);
  if (options.service) entries = entries.filter(e => e.service.toLowerCase() === options.service?.toLowerCase());

  console.log(`
${colors.bold}${colors.green}╔═══════════════════════════════════════════════════════════╗
║           CIO ACCESS REVIEW                                ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${options.stale ? `${colors.yellow}Showing stale permissions only${colors.reset}` : ''}
${options.elevated ? `${colors.yellow}Showing elevated access only${colors.reset}` : ''}

`);

  for (const entry of entries) {
    const flags = [entry.stale ? `${colors.red}STALE${colors.reset}` : '', entry.elevated ? `${colors.yellow}ELEVATED${colors.reset}` : ''].filter(Boolean).join(' ');
    console.log(`  ${colors.bold}${entry.user}${colors.reset}
    ${entry.service} → ${entry.role} | Last used: ${entry.lastUsed} ${flags}
`);
  }

  const staleCount = (await fetchAccessData()).filter(e => e.stale).length;
  if (staleCount > 0) {
    console.log(`${colors.yellow}⚠ ${staleCount} stale permission(s) need review${colors.reset}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  cioAccessReview({ stale: args.includes('--stale'), elevated: args.includes('--elevated'), service: args.find((_, i, a) => a[i - 1] === '--service') }).catch(console.error);
}
