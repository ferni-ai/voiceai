#!/usr/bin/env npx tsx
/**
 * CTO Tech Debt - Tech debt inventory + prioritization
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
};

interface TechDebtItem {
  id: string;
  title: string;
  category: 'architecture' | 'code' | 'infrastructure' | 'testing' | 'documentation';
  severity: 'critical' | 'high' | 'medium' | 'low';
  effort: 'small' | 'medium' | 'large';
  impact: number;
  age: number;
  file?: string;
}

async function fetchTechDebt(): Promise<TechDebtItem[]> {
  return [
    {
      id: 'TD-001',
      title: 'index.ts is 10k+ lines - needs splitting',
      category: 'architecture',
      severity: 'high',
      effort: 'large',
      impact: 8,
      age: 45,
      file: 'apps/cli/src/index.ts',
    },
    {
      id: 'TD-002',
      title: 'Circular dependencies in memory module',
      category: 'architecture',
      severity: 'medium',
      effort: 'medium',
      impact: 6,
      age: 30,
    },
    {
      id: 'TD-003',
      title: '30+ `as any` type assertions',
      category: 'code',
      severity: 'medium',
      effort: 'medium',
      impact: 5,
      age: 60,
    },
    {
      id: 'TD-004',
      title: 'Missing integration tests for voice agent',
      category: 'testing',
      severity: 'high',
      effort: 'large',
      impact: 9,
      age: 90,
    },
    {
      id: 'TD-005',
      title: 'Outdated dependency versions',
      category: 'infrastructure',
      severity: 'low',
      effort: 'small',
      impact: 3,
      age: 15,
    },
  ];
}

function renderSeverity(severity: TechDebtItem['severity']): string {
  switch (severity) {
    case 'critical': return `${colors.red}● CRITICAL${colors.reset}`;
    case 'high': return `${colors.yellow}● HIGH${colors.reset}`;
    case 'medium': return `${colors.blue}● MEDIUM${colors.reset}`;
    case 'low': return `${colors.dim}● LOW${colors.reset}`;
  }
}

function renderEffort(effort: TechDebtItem['effort']): string {
  switch (effort) {
    case 'small': return `${colors.green}S${colors.reset}`;
    case 'medium': return `${colors.yellow}M${colors.reset}`;
    case 'large': return `${colors.red}L${colors.reset}`;
  }
}

function priorityScore(item: TechDebtItem): number {
  const severityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
  const effortWeight = { small: 3, medium: 2, large: 1 };
  return (severityWeight[item.severity] * item.impact * effortWeight[item.effort]) + (item.age / 10);
}

export async function ctoDebt(options: { add?: string; priority?: boolean; category?: string }): Promise<void> {
  if (options.add) {
    console.log(`
${colors.green}✓ Tech Debt Item Added${colors.reset}

Title: ${options.add}
ID: TD-${String(Date.now()).slice(-3)}
Status: New
Created: ${new Date().toISOString().split('T')[0]}

${colors.dim}Use 'ferni cto debt' to view all items${colors.reset}
`);
    return;
  }

  let items = await fetchTechDebt();

  if (options.category) {
    items = items.filter(i => i.category === options.category);
  }

  if (options.priority) {
    items.sort((a, b) => priorityScore(b) - priorityScore(a));
  }

  const totalDebt = items.length;
  const criticalCount = items.filter(i => i.severity === 'critical' || i.severity === 'high').length;

  console.log(`
${colors.bold}${colors.blue}╔═══════════════════════════════════════════════════════════╗
║           CTO TECH DEBT - INVENTORY                        ║
╚═══════════════════════════════════════════════════════════╝${colors.reset}

${colors.bold}Summary:${colors.reset} ${totalDebt} items | ${colors.red}${criticalCount} high priority${colors.reset}
${options.priority ? `${colors.dim}Sorted by priority score${colors.reset}` : ''}

`);

  for (const item of items) {
    const score = priorityScore(item);
    console.log(`${colors.bold}${item.id}${colors.reset} ${item.title}
  ${renderSeverity(item.severity)} | Effort: ${renderEffort(item.effort)} | Impact: ${item.impact}/10 | Age: ${item.age}d
  ${colors.dim}Category: ${item.category}${item.file ? ` | File: ${item.file}` : ''}${colors.reset}
  ${colors.cyan}Priority Score: ${score.toFixed(1)}${colors.reset}
`);
  }

  console.log(`
${colors.dim}Commands:${colors.reset}
  ferni cto debt --priority          # Sort by priority
  ferni cto debt --category code     # Filter by category
  ferni cto debt --add "New item"    # Add new item
`);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const addIdx = args.findIndex((a) => a === '--add');
  const categoryIdx = args.findIndex((a) => a === '--category');
  ctoDebt({
    add: addIdx >= 0 ? args[addIdx + 1] : undefined,
    priority: args.includes('--priority'),
    category: categoryIdx >= 0 ? args[categoryIdx + 1] : undefined,
  }).catch(console.error);
}
