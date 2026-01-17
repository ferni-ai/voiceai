#!/usr/bin/env npx tsx
/**
 * CIO Risk - Risk register, mitigation tracking
 */

const colors = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m' };

interface Risk {
  id: string;
  title: string;
  category: 'security' | 'compliance' | 'operational' | 'financial';
  likelihood: 'high' | 'medium' | 'low';
  impact: 'high' | 'medium' | 'low';
  status: 'open' | 'mitigating' | 'accepted' | 'closed';
  mitigation?: string;
}

async function fetchRisks(): Promise<Risk[]> {
  return [
    { id: 'R-001', title: 'Data breach via third-party vendor', category: 'security', likelihood: 'low', impact: 'high', status: 'mitigating', mitigation: 'Vendor security assessments in progress' },
    { id: 'R-002', title: 'SOC2 audit findings', category: 'compliance', likelihood: 'medium', impact: 'medium', status: 'open' },
    { id: 'R-003', title: 'Key person dependency', category: 'operational', likelihood: 'medium', impact: 'high', status: 'accepted', mitigation: 'Documentation initiative started' },
  ];
}

function riskScore(r: Risk): number {
  const l = { high: 3, medium: 2, low: 1 };
  const i = { high: 3, medium: 2, low: 1 };
  return l[r.likelihood] * i[r.impact];
}

export async function cioRisk(options: { add?: string; assess?: string; high?: boolean }): Promise<void> {
  let risks = await fetchRisks();
  if (options.high) risks = risks.filter(r => riskScore(r) >= 6);

  console.log(`
${colors.bold}${colors.green}╔═══════════════════════════════════════════════════════════╗
║           CIO RISK REGISTER                                ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  for (const risk of risks.sort((a, b) => riskScore(b) - riskScore(a))) {
    const score = riskScore(risk);
    const scoreColor = score >= 6 ? colors.red : score >= 4 ? colors.yellow : colors.green;
    console.log(`${colors.bold}${risk.id}${colors.reset} ${risk.title}
  ${risk.category} | L:${risk.likelihood} I:${risk.impact} | Score: ${scoreColor}${score}${colors.reset}
  Status: ${risk.status}${risk.mitigation ? ` - ${risk.mitigation}` : ''}
`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  cioRisk({ add: args.find((_, i, a) => a[i - 1] === '--add'), assess: args.find((_, i, a) => a[i - 1] === '--assess'), high: args.includes('--high') }).catch(console.error);
}
