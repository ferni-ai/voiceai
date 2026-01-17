#!/usr/bin/env npx tsx
/**
 * CPO Churn - Churn prediction, intervention
 */

const colors = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m' };

interface AtRiskUser {
  id: string;
  name: string;
  plan: string;
  riskScore: number;
  signals: string[];
  lastActive: string;
  suggestedIntervention: string;
}

async function fetchAtRiskUsers(): Promise<AtRiskUser[]> {
  return [
    { id: 'U-1234', name: 'Alex M.', plan: 'Premium', riskScore: 85, signals: ['No sessions in 7 days', 'Opened cancel page'], lastActive: '2025-01-10', suggestedIntervention: 'Personal outreach' },
    { id: 'U-2345', name: 'Jamie L.', plan: 'Premium', riskScore: 72, signals: ['Session length declining', 'Negative feedback'], lastActive: '2025-01-14', suggestedIntervention: 'Feature education' },
    { id: 'U-3456', name: 'Sam K.', plan: 'Free', riskScore: 60, signals: ['Trial expiring', 'Low engagement'], lastActive: '2025-01-16', suggestedIntervention: 'Upgrade incentive' },
  ];
}

export async function cpoChurn(options: { risk?: boolean; intervene?: string; analysis?: boolean }): Promise<void> {
  const users = await fetchAtRiskUsers();

  console.log(`
${colors.bold}${colors.yellow}╔═══════════════════════════════════════════════════════════╗
║           CPO CHURN - PREDICTION & INTERVENTION            ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  if (options.analysis) {
    console.log(`${colors.bold}Churn Driver Analysis${colors.reset}
  1. ${colors.red}Inactivity (45%)${colors.reset} - Users who don't engage in first 7 days
  2. ${colors.yellow}Feature confusion (25%)${colors.reset} - Users who don't discover key features
  3. ${colors.dim}Price sensitivity (20%)${colors.reset} - Trial users who don't convert
  4. ${colors.dim}Technical issues (10%)${colors.reset} - Connection/quality problems
`);
    return;
  }

  console.log(`${colors.bold}At-Risk Users${colors.reset} (${users.length} total)
`);

  for (const user of users.sort((a, b) => b.riskScore - a.riskScore)) {
    const riskColor = user.riskScore >= 80 ? colors.red : user.riskScore >= 60 ? colors.yellow : colors.dim;
    console.log(`${colors.bold}${user.id}${colors.reset} ${user.name} (${user.plan})
  Risk: ${riskColor}${user.riskScore}%${colors.reset} | Last Active: ${user.lastActive}
  Signals: ${user.signals.join(', ')}
  ${colors.green}→ Intervention: ${user.suggestedIntervention}${colors.reset}
`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  cpoChurn({ risk: args.includes('--risk'), intervene: args.find((_, i, a) => a[i - 1] === '--intervene'), analysis: args.includes('--analysis') }).catch(console.error);
}
