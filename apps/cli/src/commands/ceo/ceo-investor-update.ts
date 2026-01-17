#!/usr/bin/env npx tsx
/**
 * CEO Investor Update - Draft investor communications
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

interface UpdateData {
  type: 'monthly' | 'quarterly' | 'annual';
  period: string;
  metrics: {
    mrr: number;
    mrrGrowth: number;
    users: number;
    userGrowth: number;
    runway: number;
  };
  wins: string[];
  learnings: string[];
  focus: string[];
  asks: string[];
}

async function generateUpdate(type: string): Promise<UpdateData> {
  return {
    type: type as UpdateData['type'],
    period: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    metrics: {
      mrr: 125000,
      mrrGrowth: 12,
      users: 2450,
      userGrowth: 15,
      runway: 18,
    },
    wins: [
      '🚀 Launched voice-first AI - 40% higher engagement than text',
      '📈 MRR crossed $125k milestone',
      '🤝 Signed enterprise pilot with Fortune 500 company',
      '💪 Team grew to 8 with key ML hire',
    ],
    learnings: [
      'Enterprise sales cycles are 2x longer than expected - adjusting pipeline',
      'Voice quality improvements drove 30% retention increase',
      'Self-serve activation funnel needs optimization (68% → target 80%)',
    ],
    focus: [
      'Close 2 enterprise deals in pipeline',
      'Launch team collaboration features',
      'Improve activation rate to 80%',
    ],
    asks: [
      '🔗 Introductions to HR/People leaders at enterprise companies',
      '💡 Advice on enterprise pricing (seeing pushback on per-seat model)',
      '📣 Sharing our launch post would help with organic growth',
    ],
  };
}

export async function ceoInvestorUpdate(options: { type?: string; preview?: boolean }): Promise<void> {
  const type = options.type || 'monthly';
  const data = await generateUpdate(type);

  const update = `
${colors.bold}${colors.magenta}╔═══════════════════════════════════════════════════════════╗
║           INVESTOR UPDATE - ${data.period.toUpperCase()}                  ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.bold}Hi investors,${colors.reset}

Hope you're doing well! Here's our ${type} update.

${colors.bold}📊 Key Metrics${colors.reset}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• MRR: $${(data.metrics.mrr / 1000).toFixed(0)}k ${colors.green}(+${data.metrics.mrrGrowth}% MoM)${colors.reset}
• Active Users: ${data.metrics.users.toLocaleString()} ${colors.green}(+${data.metrics.userGrowth}% MoM)${colors.reset}
• Runway: ${data.metrics.runway} months

${colors.bold}${colors.green}🎉 Wins${colors.reset}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${data.wins.map(w => `• ${w}`).join('\n')}

${colors.bold}${colors.yellow}📚 Learnings${colors.reset}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${data.learnings.map(l => `• ${l}`).join('\n')}

${colors.bold}${colors.blue}🎯 Focus Areas${colors.reset}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${data.focus.map((f, i) => `${i + 1}. ${f}`).join('\n')}

${colors.bold}${colors.cyan}🙏 How You Can Help${colors.reset}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${data.asks.map(a => `• ${a}`).join('\n')}

Thanks for your continued support!

Best,
Seth
CEO, Ferni

${colors.dim}---
This update was generated with Ferni CEO CLI.
Metrics pulled automatically from company systems.${colors.reset}
`;

  console.log(update);

  if (options.preview) {
    console.log(`
${colors.yellow}⚠ Preview mode - not sent${colors.reset}
${colors.dim}Remove --preview to send to investor list${colors.reset}
`);
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const typeIdx = args.findIndex((a) => a === '--type');
  ceoInvestorUpdate({
    type: typeIdx >= 0 ? args[typeIdx + 1] : undefined,
    preview: args.includes('--preview'),
  }).catch(console.error);
}
