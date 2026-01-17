#!/usr/bin/env npx tsx
/**
 * CEO OKRs - OKR tracking and scoring
 */

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

interface OKR {
  id: string;
  objective: string;
  owner: string;
  keyResults: Array<{
    id: string;
    description: string;
    target: number;
    current: number;
    unit: string;
    score?: number;
  }>;
}

async function fetchOKRs(quarter: string): Promise<OKR[]> {
  return [
    {
      id: 'O1',
      objective: 'Achieve Product-Market Fit in Voice AI',
      owner: 'CEO',
      keyResults: [
        { id: 'KR1.1', description: 'Reach $150k MRR', target: 150000, current: 125000, unit: '$' },
        { id: 'KR1.2', description: 'Achieve 80% Day-30 retention', target: 80, current: 72, unit: '%' },
        { id: 'KR1.3', description: 'NPS score above 70', target: 70, current: 72, unit: 'pts', score: 1.0 },
      ],
    },
    {
      id: 'O2',
      objective: 'Build World-Class Engineering Team',
      owner: 'CTO',
      keyResults: [
        { id: 'KR2.1', description: 'Hire 3 senior engineers', target: 3, current: 2, unit: 'hires' },
        { id: 'KR2.2', description: 'Reduce deploy time to <5 min', target: 5, current: 4, unit: 'min', score: 1.0 },
        { id: 'KR2.3', description: 'Zero critical incidents', target: 0, current: 1, unit: 'incidents' },
      ],
    },
    {
      id: 'O3',
      objective: 'Launch Enterprise Product',
      owner: 'CPO',
      keyResults: [
        { id: 'KR3.1', description: 'Ship team collaboration', target: 100, current: 60, unit: '%' },
        { id: 'KR3.2', description: 'Sign 3 enterprise pilots', target: 3, current: 2, unit: 'pilots' },
        { id: 'KR3.3', description: 'Enterprise demo pipeline', target: 20, current: 15, unit: 'demos' },
      ],
    },
  ];
}

function calculateScore(current: number, target: number): number {
  const ratio = current / target;
  if (ratio >= 1) return 1.0;
  if (ratio >= 0.7) return 0.7;
  if (ratio >= 0.3) return 0.3;
  return 0;
}

function renderScore(score: number): string {
  if (score >= 0.7) return `${colors.green}${score.toFixed(1)}${colors.reset}`;
  if (score >= 0.3) return `${colors.yellow}${score.toFixed(1)}${colors.reset}`;
  return `${colors.red}${score.toFixed(1)}${colors.reset}`;
}

function renderProgress(current: number, target: number): string {
  const pct = Math.min(100, (current / target) * 100);
  const filled = Math.floor(pct / 5);
  const bar = `${colors.green}${'█'.repeat(filled)}${colors.dim}${'░'.repeat(20 - filled)}${colors.reset}`;
  return `${bar} ${pct.toFixed(0)}%`;
}

export async function ceoOkrs(options: { quarter?: string; score?: string; add?: boolean }): Promise<void> {
  const quarter = options.quarter || `Q${Math.ceil((new Date().getMonth() + 1) / 3)}`;
  const okrs = await fetchOKRs(quarter);

  console.log(`
${colors.bold}${colors.magenta}╔═══════════════════════════════════════════════════════════╗
║           COMPANY OKRs - ${quarter} 2025                         ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  for (const okr of okrs) {
    const avgScore = okr.keyResults.reduce((sum, kr) => {
      return sum + (kr.score ?? calculateScore(kr.current, kr.target));
    }, 0) / okr.keyResults.length;

    console.log(`${colors.bold}${okr.id}: ${okr.objective}${colors.reset}
${colors.dim}Owner: ${okr.owner} | Avg Score: ${renderScore(avgScore)}${colors.reset}
`);

    for (const kr of okr.keyResults) {
      const score = kr.score ?? calculateScore(kr.current, kr.target);
      console.log(`  ${colors.cyan}${kr.id}${colors.reset} ${kr.description}
    ${renderProgress(kr.current, kr.target)}
    Current: ${kr.current}${kr.unit === '$' ? '' : kr.unit} | Target: ${kr.unit === '$' ? '$' : ''}${kr.target}${kr.unit === '$' ? '' : kr.unit} | Score: ${renderScore(score)}
`);
    }
  }

  const overallScore = okrs.reduce((sum, okr) => {
    const avgScore = okr.keyResults.reduce((s, kr) => {
      return s + (kr.score ?? calculateScore(kr.current, kr.target));
    }, 0) / okr.keyResults.length;
    return sum + avgScore;
  }, 0) / okrs.length;

  console.log(`
${colors.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}
${colors.bold}Overall Company Score: ${renderScore(overallScore)}${colors.reset}
${colors.dim}Target: 0.7 (70% achievement is success)${colors.reset}

${colors.dim}Commands:${colors.reset}
  ferni ceo okrs --score KR1.1    # Score a specific key result
  ferni ceo okrs --add            # Add new OKR (interactive)
  ferni ceo okrs --quarter Q2     # View different quarter
`);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const quarterIdx = args.findIndex((a) => a === '--quarter');
  const scoreIdx = args.findIndex((a) => a === '--score');
  ceoOkrs({
    quarter: quarterIdx >= 0 ? args[quarterIdx + 1] : undefined,
    score: scoreIdx >= 0 ? args[scoreIdx + 1] : undefined,
    add: args.includes('--add'),
  }).catch(console.error);
}
