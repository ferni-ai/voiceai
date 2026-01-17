#!/usr/bin/env npx tsx
/**
 * CIO Compliance - SOC2, GDPR, HIPAA status
 */

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

interface ComplianceStatus {
  framework: string;
  status: 'compliant' | 'partial' | 'non-compliant';
  controls: { total: number; compliant: number; partial: number; gaps: number };
  lastAudit: string;
  nextAudit: string;
  gaps: string[];
}

async function fetchCompliance(framework?: string): Promise<ComplianceStatus[]> {
  const all: ComplianceStatus[] = [
    {
      framework: 'SOC2 Type II',
      status: 'partial',
      controls: { total: 64, compliant: 58, partial: 4, gaps: 2 },
      lastAudit: '2024-10-15',
      nextAudit: '2025-04-15',
      gaps: ['Access review automation needed', 'Incident response testing overdue'],
    },
    {
      framework: 'GDPR',
      status: 'compliant',
      controls: { total: 42, compliant: 42, partial: 0, gaps: 0 },
      lastAudit: '2024-11-01',
      nextAudit: '2025-05-01',
      gaps: [],
    },
    {
      framework: 'CCPA',
      status: 'compliant',
      controls: { total: 18, compliant: 18, partial: 0, gaps: 0 },
      lastAudit: '2024-11-01',
      nextAudit: '2025-05-01',
      gaps: [],
    },
  ];
  return framework ? all.filter(c => c.framework.toLowerCase().includes(framework.toLowerCase())) : all;
}

function renderStatus(status: ComplianceStatus['status']): string {
  switch (status) {
    case 'compliant': return `${colors.green}✓ Compliant${colors.reset}`;
    case 'partial': return `${colors.yellow}◐ Partial${colors.reset}`;
    case 'non-compliant': return `${colors.red}✗ Non-Compliant${colors.reset}`;
  }
}

export async function cioCompliance(options: { framework?: string; gaps?: boolean; export?: boolean }): Promise<void> {
  const frameworks = await fetchCompliance(options.framework);

  console.log(`
${colors.bold}${colors.green}╔═══════════════════════════════════════════════════════════╗
║           CIO COMPLIANCE - FRAMEWORK STATUS                ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  for (const fw of frameworks) {
    const pct = Math.round((fw.controls.compliant / fw.controls.total) * 100);
    console.log(`${colors.bold}${fw.framework}${colors.reset} ${renderStatus(fw.status)}
  Controls: ${fw.controls.compliant}/${fw.controls.total} (${pct}%)
  Last Audit: ${fw.lastAudit} | Next: ${fw.nextAudit}
${fw.gaps.length > 0 ? `  ${colors.yellow}Gaps:${colors.reset}\n${fw.gaps.map(g => `    • ${g}`).join('\n')}` : ''}
`);
  }

  if (options.gaps) {
    const allGaps = frameworks.flatMap(f => f.gaps.map(g => ({ framework: f.framework, gap: g })));
    console.log(`
${colors.bold}All Compliance Gaps${colors.reset}
${allGaps.length === 0 ? `${colors.green}No gaps found!${colors.reset}` : allGaps.map(g => `  [${g.framework}] ${g.gap}`).join('\n')}
`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const frameworkIdx = args.findIndex((a) => a === '--framework');
  cioCompliance({
    framework: frameworkIdx >= 0 ? args[frameworkIdx + 1] : undefined,
    gaps: args.includes('--gaps'),
    export: args.includes('--export'),
  }).catch(console.error);
}
