#!/usr/bin/env npx tsx
/**
 * CPO Roadmap - AI-generated roadmap from signals
 */

const colors = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m' };

interface RoadmapItem {
  id: string;
  title: string;
  theme: string;
  quarter: string;
  status: 'planned' | 'in-progress' | 'shipped';
  confidence: number;
  signals: string[];
}

async function generateRoadmap(quarter?: string): Promise<RoadmapItem[]> {
  const items: RoadmapItem[] = [
    { id: 'F-001', title: 'Team Collaboration', theme: 'Enterprise', quarter: 'Q1', status: 'in-progress', confidence: 90, signals: ['Enterprise pilots requesting', 'Competitor has it'] },
    { id: 'F-002', title: 'Voice Cloning', theme: 'Personalization', quarter: 'Q1', status: 'planned', confidence: 75, signals: ['High NPS request', 'Cartesia supports it'] },
    { id: 'F-003', title: 'Mobile Widget', theme: 'Distribution', quarter: 'Q2', status: 'planned', confidence: 60, signals: ['Retention data shows mobile gap'] },
    { id: 'F-004', title: 'API for Developers', theme: 'Platform', quarter: 'Q2', status: 'planned', confidence: 85, signals: ['Developer waitlist growing', 'Integration requests'] },
  ];
  return quarter ? items.filter(i => i.quarter === quarter) : items;
}

export async function cpoRoadmap(options: { quarter?: string; themes?: boolean; export?: boolean }): Promise<void> {
  const items = await generateRoadmap(options.quarter);

  console.log(`
${colors.bold}${colors.yellow}╔═══════════════════════════════════════════════════════════╗
║           CPO ROADMAP - PRODUCT STRATEGY                   ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}
`);

  if (options.themes) {
    const byTheme = items.reduce((acc, i) => ({ ...acc, [i.theme]: [...(acc[i.theme] || []), i] }), {} as Record<string, RoadmapItem[]>);
    for (const [theme, themeItems] of Object.entries(byTheme)) {
      console.log(`${colors.bold}${theme}${colors.reset}`);
      themeItems.forEach(i => console.log(`  ${i.quarter} | ${i.title} (${i.confidence}% confidence)`));
      console.log('');
    }
  } else {
    for (const item of items) {
      const statusIcon = item.status === 'shipped' ? '✓' : item.status === 'in-progress' ? '◐' : '○';
      console.log(`${colors.bold}${item.id}${colors.reset} ${item.title}
  ${statusIcon} ${item.status} | ${item.quarter} | Theme: ${item.theme}
  Confidence: ${item.confidence}% | Signals: ${item.signals.join(', ')}
`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  cpoRoadmap({ quarter: args.find((_, i, a) => a[i - 1] === '--quarter'), themes: args.includes('--themes'), export: args.includes('--export') }).catch(console.error);
}
