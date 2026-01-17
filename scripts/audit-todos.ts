#!/usr/bin/env npx tsx
/**
 * TODO Tracking and Aging System
 *
 * Scans the codebase for TODO/FIXME/HACK comments and tracks their age.
 * Helps identify stale technical debt.
 *
 * Usage:
 *   npx tsx scripts/audit-todos.ts              # Full report
 *   npx tsx scripts/audit-todos.ts --stale      # Only stale TODOs (>30 days)
 *   npx tsx scripts/audit-todos.ts --critical   # Only critical/high priority
 *   npx tsx scripts/audit-todos.ts --json       # JSON output
 *
 * @module scripts/audit-todos
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const STALE_THRESHOLD_DAYS = 30;
const ANCIENT_THRESHOLD_DAYS = 90;

const TODO_PATTERNS = [
  /\/\/\s*(TODO|FIXME|HACK|XXX|BUG|OPTIMIZE|REFACTOR|REVIEW|NOTE)[\s:]+(.+)/gi,
  /\/\*\s*(TODO|FIXME|HACK|XXX|BUG|OPTIMIZE|REFACTOR|REVIEW|NOTE)[\s:]+(.+)\*\//gi,
];

const PRIORITY_KEYWORDS: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
  FIXME: 'critical',
  BUG: 'critical',
  HACK: 'high',
  XXX: 'high',
  OPTIMIZE: 'medium',
  REFACTOR: 'medium',
  TODO: 'medium',
  REVIEW: 'low',
  NOTE: 'low',
};

const EXCLUDE_PATTERNS = [
  'node_modules',
  'dist',
  'build',
  '.git',
  '__snapshots__',
  'coverage',
  '*.d.ts',
  'pnpm-lock.yaml',
  'package-lock.json',
];

// ============================================================================
// COLORS
// ============================================================================

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

// ============================================================================
// TYPES
// ============================================================================

interface TodoItem {
  file: string;
  line: number;
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  text: string;
  author: string;
  date: Date;
  ageDays: number;
  isStale: boolean;
  isAncient: boolean;
}

interface TodoReport {
  totalCount: number;
  staleCount: number;
  ancientCount: number;
  byPriority: Record<string, number>;
  byType: Record<string, number>;
  byAuthor: Record<string, number>;
  byAge: {
    fresh: number; // < 30 days
    stale: number; // 30-90 days
    ancient: number; // > 90 days
  };
  items: TodoItem[];
}

// ============================================================================
// GIT UTILITIES
// ============================================================================

/**
 * Get git blame info for a specific line.
 * Uses execFileSync which is safe from shell injection since args are passed as array.
 */
function getGitBlame(file: string, lineNumber: number): { author: string; date: Date } | null {
  try {
    // execFileSync is safe - no shell interpretation, args passed as array
    const output = execFileSync('git', [
      'blame',
      '-L', `${lineNumber},${lineNumber}`,
      '--porcelain',
      file,
    ], { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });

    const authorMatch = output.match(/^author (.+)$/m);
    const dateMatch = output.match(/^author-time (\d+)$/m);

    if (authorMatch && dateMatch) {
      return {
        author: authorMatch[1],
        date: new Date(parseInt(dateMatch[1], 10) * 1000),
      };
    }
  } catch {
    // File not tracked or git blame failed
  }
  return null;
}

// ============================================================================
// FILE SCANNING
// ============================================================================

function* walkDirectory(dir: string): Generator<string> {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Check exclusions
    if (EXCLUDE_PATTERNS.some((pattern) => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(entry.name);
      }
      return entry.name === pattern || fullPath.includes(pattern);
    })) {
      continue;
    }

    if (entry.isDirectory()) {
      yield* walkDirectory(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.js'))) {
      yield fullPath;
    }
  }
}

function findTodosInFile(filePath: string): TodoItem[] {
  const items: TodoItem[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const pattern of TODO_PATTERNS) {
      pattern.lastIndex = 0; // Reset regex
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const type = match[1].toUpperCase();
        const text = match[2].trim();
        const lineNumber = i + 1;

        const blameInfo = getGitBlame(filePath, lineNumber);
        const date = blameInfo?.date || new Date();
        const author = blameInfo?.author || 'Unknown';
        const ageDays = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));

        items.push({
          file: filePath,
          line: lineNumber,
          type,
          priority: PRIORITY_KEYWORDS[type] || 'medium',
          text: text.slice(0, 100) + (text.length > 100 ? '...' : ''),
          author,
          date,
          ageDays,
          isStale: ageDays >= STALE_THRESHOLD_DAYS,
          isAncient: ageDays >= ANCIENT_THRESHOLD_DAYS,
        });
      }
    }
  }

  return items;
}

// ============================================================================
// REPORTING
// ============================================================================

function generateReport(items: TodoItem[]): TodoReport {
  const report: TodoReport = {
    totalCount: items.length,
    staleCount: items.filter((i) => i.isStale).length,
    ancientCount: items.filter((i) => i.isAncient).length,
    byPriority: {},
    byType: {},
    byAuthor: {},
    byAge: { fresh: 0, stale: 0, ancient: 0 },
    items,
  };

  for (const item of items) {
    // By priority
    report.byPriority[item.priority] = (report.byPriority[item.priority] || 0) + 1;

    // By type
    report.byType[item.type] = (report.byType[item.type] || 0) + 1;

    // By author
    report.byAuthor[item.author] = (report.byAuthor[item.author] || 0) + 1;

    // By age
    if (item.isAncient) {
      report.byAge.ancient++;
    } else if (item.isStale) {
      report.byAge.stale++;
    } else {
      report.byAge.fresh++;
    }
  }

  return report;
}

function printReport(report: TodoReport, options: { staleOnly: boolean; criticalOnly: boolean }): void {
  process.stdout.write('\n' + colors.bold + colors.cyan + '═══════════════════════════════════════════════════════════════\n' + colors.reset);
  process.stdout.write(colors.bold + colors.cyan + '                     TODO TRACKING REPORT                         \n' + colors.reset);
  process.stdout.write(colors.bold + colors.cyan + '═══════════════════════════════════════════════════════════════\n' + colors.reset + '\n');

  // Summary
  process.stdout.write(colors.bold + 'Summary:\n' + colors.reset);
  process.stdout.write(`  Total TODOs:   ${report.totalCount}\n`);
  process.stdout.write(`  Fresh (<30d):  ${colors.green}${report.byAge.fresh}${colors.reset}\n`);
  process.stdout.write(`  Stale (30-90d): ${colors.yellow}${report.byAge.stale}${colors.reset}\n`);
  process.stdout.write(`  Ancient (>90d): ${colors.red}${report.byAge.ancient}${colors.reset}\n`);

  // By Priority
  process.stdout.write('\n' + colors.bold + 'By Priority:\n' + colors.reset);
  const priorityColors: Record<string, string> = {
    critical: colors.red,
    high: colors.yellow,
    medium: colors.blue,
    low: colors.dim,
  };
  for (const [priority, count] of Object.entries(report.byPriority).sort((a, b) => {
    const order = ['critical', 'high', 'medium', 'low'];
    return order.indexOf(a[0]) - order.indexOf(b[0]);
  })) {
    process.stdout.write(`  ${priorityColors[priority] || ''}${priority.padEnd(10)}${colors.reset} ${count}\n`);
  }

  // By Type
  process.stdout.write('\n' + colors.bold + 'By Type:\n' + colors.reset);
  for (const [type, count] of Object.entries(report.byType).sort((a, b) => b[1] - a[1])) {
    process.stdout.write(`  ${type.padEnd(10)} ${count}\n`);
  }

  // Top Authors
  process.stdout.write('\n' + colors.bold + 'Top Authors:\n' + colors.reset);
  const topAuthors = Object.entries(report.byAuthor)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  for (const [author, count] of topAuthors) {
    process.stdout.write(`  ${author.padEnd(25)} ${count}\n`);
  }

  // Filter items based on options
  let itemsToShow = report.items;
  if (options.staleOnly) {
    itemsToShow = itemsToShow.filter((i) => i.isStale);
  }
  if (options.criticalOnly) {
    itemsToShow = itemsToShow.filter((i) => i.priority === 'critical' || i.priority === 'high');
  }

  // Sort by age (oldest first)
  itemsToShow = itemsToShow.sort((a, b) => b.ageDays - a.ageDays);

  // Show items
  if (itemsToShow.length > 0) {
    process.stdout.write('\n' + colors.bold + '─────────────────────────────────────────────────────────────────\n' + colors.reset);
    process.stdout.write(colors.bold + (options.staleOnly ? 'Stale TODOs' : options.criticalOnly ? 'Critical TODOs' : 'All TODOs') + ':\n' + colors.reset);
    process.stdout.write(colors.bold + '─────────────────────────────────────────────────────────────────\n' + colors.reset);

    for (const item of itemsToShow.slice(0, 50)) {
      const ageColor = item.isAncient ? colors.red : item.isStale ? colors.yellow : colors.green;
      const priorityColor = priorityColors[item.priority] || '';
      const relPath = item.file.replace(process.cwd() + '/', '');

      process.stdout.write(
        `\n${priorityColor}[${item.type}]${colors.reset} ${colors.dim}${relPath}:${item.line}${colors.reset}\n`
      );
      process.stdout.write(`  ${item.text}\n`);
      process.stdout.write(`  ${colors.dim}by ${item.author} • ${ageColor}${item.ageDays} days ago${colors.reset}\n`);
    }

    if (itemsToShow.length > 50) {
      process.stdout.write(`\n${colors.dim}... and ${itemsToShow.length - 50} more${colors.reset}\n`);
    }
  }

  // Recommendations
  process.stdout.write('\n' + colors.bold + '─────────────────────────────────────────────────────────────────\n' + colors.reset);
  process.stdout.write(colors.bold + 'Recommendations:\n' + colors.reset);
  process.stdout.write('─────────────────────────────────────────────────────────────────\n');

  if (report.byAge.ancient > 0) {
    process.stdout.write(`${colors.red}⚠${colors.reset}  ${report.byAge.ancient} ancient TODOs (>90 days) should be addressed or removed\n`);
  }
  if (report.byPriority['critical'] > 0) {
    process.stdout.write(`${colors.red}⚠${colors.reset}  ${report.byPriority['critical']} critical items (FIXME/BUG) need immediate attention\n`);
  }
  if (report.byPriority['high'] > 0) {
    process.stdout.write(`${colors.yellow}!${colors.reset}  ${report.byPriority['high']} high priority items (HACK/XXX) should be planned\n`);
  }

  process.stdout.write('\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const staleOnly = args.includes('--stale');
  const criticalOnly = args.includes('--critical');
  const jsonOutput = args.includes('--json');

  process.stdout.write(colors.dim + 'Scanning codebase for TODOs...\n' + colors.reset);

  const allItems: TodoItem[] = [];
  const srcDir = path.join(process.cwd(), 'src');
  const appsDir = path.join(process.cwd(), 'apps');

  // Scan src/
  if (fs.existsSync(srcDir)) {
    for (const file of walkDirectory(srcDir)) {
      const items = findTodosInFile(file);
      allItems.push(...items);
    }
  }

  // Scan apps/
  if (fs.existsSync(appsDir)) {
    for (const file of walkDirectory(appsDir)) {
      const items = findTodosInFile(file);
      allItems.push(...items);
    }
  }

  const report = generateReport(allItems);

  if (jsonOutput) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    printReport(report, { staleOnly, criticalOnly });
  }

  // Exit with error if there are critical or ancient items
  if (report.byPriority['critical'] > 0 || report.byAge.ancient > 10) {
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(colors.red + 'Error: ' + colors.reset + String(err) + '\n');
  process.exit(1);
});
