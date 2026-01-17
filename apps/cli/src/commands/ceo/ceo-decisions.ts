#!/usr/bin/env npx tsx
/**
 * CEO Decisions - Decision log with outcomes
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

interface Decision {
  id: string;
  title: string;
  date: string;
  category: 'strategy' | 'product' | 'people' | 'finance' | 'tech';
  status: 'pending' | 'implemented' | 'deferred' | 'reversed';
  outcome?: 'positive' | 'negative' | 'neutral';
  description: string;
  stakeholders: string[];
}

async function fetchDecisions(): Promise<Decision[]> {
  // TODO: Pull from Firestore
  return [
    {
      id: 'DEC-001',
      title: 'Pivot to Voice-First AI',
      date: '2024-09-15',
      category: 'strategy',
      status: 'implemented',
      outcome: 'positive',
      description: 'Shift focus from text chat to voice-first interaction',
      stakeholders: ['CEO', 'CTO', 'CPO'],
    },
    {
      id: 'DEC-002',
      title: 'Self-Hosted CI/CD Runner',
      date: '2025-01-17',
      category: 'tech',
      status: 'implemented',
      outcome: 'positive',
      description: 'Move from GitHub Actions billing to self-hosted GCE runner',
      stakeholders: ['CTO'],
    },
    {
      id: 'DEC-003',
      title: 'Enterprise Tier Launch',
      date: '2025-02-01',
      category: 'product',
      status: 'pending',
      description: 'Launch enterprise tier with team features',
      stakeholders: ['CEO', 'CPO', 'CMO'],
    },
  ];
}

function renderStatus(status: Decision['status']): string {
  switch (status) {
    case 'implemented': return `${colors.green}● Implemented${colors.reset}`;
    case 'pending': return `${colors.yellow}○ Pending${colors.reset}`;
    case 'deferred': return `${colors.dim}◐ Deferred${colors.reset}`;
    case 'reversed': return `${colors.red}✗ Reversed${colors.reset}`;
  }
}

function renderOutcome(outcome?: Decision['outcome']): string {
  if (!outcome) return `${colors.dim}—${colors.reset}`;
  switch (outcome) {
    case 'positive': return `${colors.green}↑ Positive${colors.reset}`;
    case 'negative': return `${colors.red}↓ Negative${colors.reset}`;
    case 'neutral': return `${colors.dim}→ Neutral${colors.reset}`;
  }
}

function renderCategory(category: Decision['category']): string {
  const categoryColors: Record<Decision['category'], string> = {
    strategy: colors.magenta,
    product: colors.yellow,
    people: colors.cyan,
    finance: colors.green,
    tech: colors.blue,
  };
  return `${categoryColors[category]}${category}${colors.reset}`;
}

export async function ceoDecisions(options: { add?: string; outcome?: string; pending?: boolean }): Promise<void> {
  if (options.add) {
    console.log(`
${colors.bold}${colors.green}✓ Decision Added${colors.reset}

Title: ${options.add}
ID: DEC-${String(Date.now()).slice(-3)}
Status: Pending
Date: ${new Date().toISOString().split('T')[0]}

${colors.dim}Use 'ferni ceo decisions --outcome <id>' to record the outcome later.${colors.reset}
`);
    return;
  }

  const decisions = await fetchDecisions();
  const filtered = options.pending ? decisions.filter(d => d.status === 'pending') : decisions;

  console.log(`
${colors.bold}${colors.magenta}╔═══════════════════════════════════════════════════════════╗
║           CEO DECISIONS - DECISION LOG                     ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.dim}${options.pending ? 'Showing pending decisions only' : 'All decisions'}${colors.reset}

`);

  for (const decision of filtered) {
    console.log(`${colors.bold}${decision.id}${colors.reset} ${decision.title}
  ${colors.dim}Date:${colors.reset} ${decision.date}  ${colors.dim}Category:${colors.reset} ${renderCategory(decision.category)}
  ${colors.dim}Status:${colors.reset} ${renderStatus(decision.status)}  ${colors.dim}Outcome:${colors.reset} ${renderOutcome(decision.outcome)}
  ${colors.dim}Description:${colors.reset} ${decision.description}
  ${colors.dim}Stakeholders:${colors.reset} ${decision.stakeholders.join(', ')}
`);
  }

  console.log(`
${colors.dim}Commands:${colors.reset}
  ferni ceo decisions --add "New Decision Title"
  ferni ceo decisions --outcome DEC-001
  ferni ceo decisions --pending
`);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const addIdx = args.findIndex((a) => a === '--add');
  const outcomeIdx = args.findIndex((a) => a === '--outcome');
  ceoDecisions({
    add: addIdx >= 0 ? args[addIdx + 1] : undefined,
    outcome: outcomeIdx >= 0 ? args[outcomeIdx + 1] : undefined,
    pending: args.includes('--pending'),
  }).catch(console.error);
}
