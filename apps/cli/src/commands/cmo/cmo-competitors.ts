#!/usr/bin/env npx tsx
/**
 * CMO Competitors - Competitive intelligence
 */

const colors = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m' };

interface Competitor {
  name: string;
  category: string;
  funding: string;
  users: string;
  strengths: string[];
  weaknesses: string[];
  recentNews: string;
}

async function fetchCompetitors(): Promise<Competitor[]> {
  return [
    { name: 'Replika', category: 'AI Companion', funding: '$30M', users: '10M+', strengths: ['Large user base', 'Brand recognition'], weaknesses: ['Not voice-first', 'Privacy concerns'], recentNews: 'Launched new avatar customization' },
    { name: 'Character.AI', category: 'AI Chat', funding: '$150M', users: '20M+', strengths: ['Character variety', 'Engagement'], weaknesses: ['No voice', 'No wellness focus'], recentNews: 'Acquired by Google' },
    { name: 'Pi', category: 'AI Assistant', funding: '$1.3B', users: '1M+', strengths: ['Great voice', 'Conversational'], weaknesses: ['Limited features', 'No personas'], recentNews: 'Added memory features' },
  ];
}

export async function cmoCompetitors(options: { track?: string; report?: boolean; alerts?: boolean }): Promise<void> {
  const competitors = await fetchCompetitors();

  console.log(`
${colors.bold}${colors.red}╔═══════════════════════════════════════════════════════════╗
║           CMO COMPETITORS - INTELLIGENCE                   ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  for (const c of competitors) {
    console.log(`${colors.bold}${c.name}${colors.reset} (${c.category})
  Funding: ${c.funding} | Users: ${c.users}
  ${colors.green}Strengths:${colors.reset} ${c.strengths.join(', ')}
  ${colors.red}Weaknesses:${colors.reset} ${c.weaknesses.join(', ')}
  ${colors.cyan}Recent:${colors.reset} ${c.recentNews}
`);
  }

  if (options.report) {
    console.log(`${colors.bold}Competitive Positioning${colors.reset}

  ${colors.green}Our Differentiators:${colors.reset}
  • Voice-first experience (vs text-first competitors)
  • Wellness-focused personas (vs generic chat)
  • Team/enterprise features (vs consumer-only)
  • Privacy-first (no data selling)

  ${colors.yellow}Areas to Watch:${colors.reset}
  • Character.AI voice features (rumored)
  • Pi enterprise expansion
`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  cmoCompetitors({ track: args.find((_, i, a) => a[i - 1] === '--track'), report: args.includes('--report'), alerts: args.includes('--alerts') }).catch(console.error);
}
