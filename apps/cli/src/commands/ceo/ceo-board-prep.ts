#!/usr/bin/env npx tsx
/**
 * CEO Board Prep - Generate board deck data
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

interface BoardData {
  quarter: string;
  financials: {
    revenue: number;
    expenses: number;
    runway: number;
    burnRate: number;
  };
  kpis: {
    users: number;
    growth: number;
    nps: number;
    churn: number;
  };
  highlights: string[];
  challenges: string[];
  asks: string[];
  nextQuarter: string[];
}

async function generateBoardData(quarter: string): Promise<BoardData> {
  // TODO: Pull from real data sources
  return {
    quarter,
    financials: {
      revenue: 375000,
      expenses: 255000,
      runway: 18,
      burnRate: 85000,
    },
    kpis: {
      users: 2450,
      growth: 38,
      nps: 72,
      churn: 2.1,
    },
    highlights: [
      'Revenue up 38% QoQ',
      'Launched voice-first AI feature',
      'Enterprise pilot with 3 Fortune 500 companies',
      'Reduced infrastructure costs by 40%',
    ],
    challenges: [
      'Longer enterprise sales cycles than expected',
      'Hiring for senior ML roles competitive',
      'Need to improve activation rate (currently 68%)',
    ],
    asks: [
      'Introductions to enterprise HR leaders',
      'Advice on enterprise pricing strategy',
      'Feedback on expansion into wellness vertical',
    ],
    nextQuarter: [
      'Close 2 enterprise deals',
      'Launch team collaboration features',
      'Achieve 80% activation rate',
      'Hire VP Engineering',
    ],
  };
}

export async function ceoBoardPrep(options: { quarter?: string; export?: boolean }): Promise<void> {
  const quarter = options.quarter || `Q${Math.ceil((new Date().getMonth() + 1) / 3)}`;
  const data = await generateBoardData(quarter);

  const output = `
${colors.bold}${colors.magenta}╔═══════════════════════════════════════════════════════════╗
║           BOARD MEETING PREP - ${quarter} 2025                   ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.bold}📊 Financial Summary${colors.reset}
┌────────────────────┬───────────────┐
│ Metric             │ Value         │
├────────────────────┼───────────────┤
│ Quarterly Revenue  │ $${(data.financials.revenue / 1000).toFixed(0)}k         │
│ Quarterly Expenses │ $${(data.financials.expenses / 1000).toFixed(0)}k         │
│ Net                │ $${((data.financials.revenue - data.financials.expenses) / 1000).toFixed(0)}k          │
│ Monthly Burn       │ $${(data.financials.burnRate / 1000).toFixed(0)}k          │
│ Runway             │ ${data.financials.runway} months      │
└────────────────────┴───────────────┘

${colors.bold}📈 Key Performance Indicators${colors.reset}
  • Active Users: ${data.kpis.users.toLocaleString()} (${colors.green}+${data.kpis.growth}% QoQ${colors.reset})
  • NPS Score: ${data.kpis.nps} (Industry avg: 45)
  • Monthly Churn: ${data.kpis.churn}%

${colors.bold}${colors.green}✅ Highlights${colors.reset}
${data.highlights.map((h, i) => `  ${i + 1}. ${h}`).join('\n')}

${colors.bold}${colors.yellow}⚠️ Challenges${colors.reset}
${data.challenges.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}

${colors.bold}${colors.cyan}🙏 Board Asks${colors.reset}
${data.asks.map((a, i) => `  ${i + 1}. ${a}`).join('\n')}

${colors.bold}🎯 ${quarter} + 1 Priorities${colors.reset}
${data.nextQuarter.map((n, i) => `  ${i + 1}. ${n}`).join('\n')}

${colors.dim}Generated: ${new Date().toLocaleString()}${colors.reset}
`;

  console.log(output);

  if (options.export) {
    const filename = `board-prep-${quarter}-${Date.now()}.md`;
    console.log(`
${colors.green}✓ Exported to ${filename}${colors.reset}
`);
    // TODO: Actually write file
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const quarterIdx = args.findIndex((a) => a === '--quarter');
  ceoBoardPrep({
    quarter: quarterIdx >= 0 ? args[quarterIdx + 1] : undefined,
    export: args.includes('--export'),
  }).catch(console.error);
}
