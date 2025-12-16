#!/usr/bin/env npx tsx
/**
 * Technical Debt Tracker
 *
 * Scans codebase for TODOs, FIXMEs, HACKs, and other markers.
 * Generates a report with prioritized technical debt items.
 *
 * Usage:
 *   npx tsx scripts/tech-debt.ts                # Generate report
 *   npx tsx scripts/tech-debt.ts --json         # Output as JSON
 *   npx tsx scripts/tech-debt.ts --markdown     # Output as markdown
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync, statSync } from 'fs';
import { dirname, join, relative, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..", "..", "..", "..");

// ============================================================================
// CONFIGURATION
// ============================================================================

const MARKERS = [
  { pattern: 'TODO:', priority: 'medium', icon: '📝' },
  { pattern: 'FIXME:', priority: 'high', icon: '🔧' },
  { pattern: 'HACK:', priority: 'high', icon: '⚠️' },
  { pattern: 'XXX:', priority: 'high', icon: '🚨' },
  { pattern: '// BUG:', priority: 'critical', icon: '🐛' },
  { pattern: 'OPTIMIZE:', priority: 'low', icon: '⚡' },
  { pattern: '@deprecated', priority: 'medium', icon: '📦' },
  { pattern: 'REFACTOR:', priority: 'low', icon: '♻️' },
];

const IGNORE_PATHS = [
  'node_modules',
  'dist',
  'build',
  '.git',
  'coverage',
  '.next',
  'package-lock.json',
  '*.log',
  'TECH-DEBT.md', // Don't scan our own output
];

// ============================================================================
// TYPES
// ============================================================================

interface DebtItem {
  file: string;
  line: number;
  marker: string;
  priority: string;
  message: string;
  context: string;
  age?: number; // days since file was modified
}

interface DebtReport {
  generated: string;
  totalItems: number;
  byPriority: Record<string, number>;
  byMarker: Record<string, number>;
  byFile: Record<string, number>;
  items: DebtItem[];
}

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

function colorForPriority(priority: string): string {
  switch (priority) {
    case 'critical': return colors.red;
    case 'high': return colors.yellow;
    case 'medium': return colors.cyan;
    case 'low': return colors.dim;
    default: return colors.reset;
  }
}

// ============================================================================
// SCANNER
// ============================================================================

function scanForDebt(): DebtItem[] {
  const items: DebtItem[] = [];
  
  for (const marker of MARKERS) {
    try {
      // Use grep with context
      const ignoreArgs = IGNORE_PATHS.map(p => p.includes('.') ? `--exclude=${p}` : `--exclude-dir=${p}`).join(' ');
      const cmd = `grep -rn --include="*.ts" --include="*.tsx" --include="*.js" --include="*.md" ${ignoreArgs} --exclude="tech-debt.ts" "${marker.pattern}" src scripts apps/web/src docs 2>/dev/null || true`;
      
      const output = execSync(cmd, { 
        cwd: PROJECT_ROOT, 
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });
      
      for (const line of output.split('\n')) {
        if (!line.trim()) continue;
        
        // Parse: file:line:content
        const match = line.match(/^([^:]+):(\d+):(.+)$/);
        if (!match) continue;
        
        const [, file, lineNum, content] = match;
        
        // Skip if in test file
        if (file.includes('.test.') || file.includes('__tests__')) continue;
        
        // Extract message after marker
        const markerMatch = content.match(new RegExp(`${marker.pattern}[:\\s]*(.*)`, 'i'));
        const message = markerMatch?.[1]?.trim() || content.trim();
        
        // Get file age
        let age: number | undefined;
        try {
          const filePath = join(PROJECT_ROOT, file);
          if (existsSync(filePath)) {
            const stats = statSync(filePath);
            age = Math.floor((Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24));
          }
        } catch {
          // Ignore
        }
        
        items.push({
          file: relative(PROJECT_ROOT, file),
          line: parseInt(lineNum, 10),
          marker: marker.pattern,
          priority: marker.priority,
          message,
          context: content.trim(),
          age,
        });
      }
    } catch {
      // Grep may fail if nothing found
    }
  }
  
  return items;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport(items: DebtItem[]): DebtReport {
  const byPriority: Record<string, number> = {};
  const byMarker: Record<string, number> = {};
  const byFile: Record<string, number> = {};
  
  for (const item of items) {
    byPriority[item.priority] = (byPriority[item.priority] || 0) + 1;
    byMarker[item.marker] = (byMarker[item.marker] || 0) + 1;
    byFile[item.file] = (byFile[item.file] || 0) + 1;
  }
  
  // Sort items by priority
  const priorityOrder = ['critical', 'high', 'medium', 'low', 'info'];
  items.sort((a, b) => {
    const aPriority = priorityOrder.indexOf(a.priority);
    const bPriority = priorityOrder.indexOf(b.priority);
    return aPriority - bPriority;
  });
  
  return {
    generated: new Date().toISOString(),
    totalItems: items.length,
    byPriority,
    byMarker,
    byFile,
    items,
  };
}

// ============================================================================
// OUTPUT FORMATTERS
// ============================================================================

function printConsoleReport(report: DebtReport): void {
  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════════╗${colors.reset}
${colors.cyan}║${colors.reset}  ${colors.bold}TECHNICAL DEBT REPORT${colors.reset}                                     ${colors.cyan}║${colors.reset}
${colors.cyan}╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);

  // Summary
  console.log(`${colors.bold}Summary${colors.reset}`);
  console.log(`  Total items: ${colors.yellow}${report.totalItems}${colors.reset}`);
  console.log();
  
  // By Priority
  console.log(`${colors.bold}By Priority${colors.reset}`);
  for (const [priority, count] of Object.entries(report.byPriority)) {
    const color = colorForPriority(priority);
    console.log(`  ${color}${priority.padEnd(10)}${colors.reset} ${count}`);
  }
  console.log();
  
  // By Marker
  console.log(`${colors.bold}By Marker${colors.reset}`);
  for (const marker of MARKERS) {
    const count = report.byMarker[marker.pattern] || 0;
    if (count > 0) {
      console.log(`  ${marker.icon} ${marker.pattern.padEnd(12)} ${count}`);
    }
  }
  console.log();
  
  // Top files with debt
  console.log(`${colors.bold}Top Files by Debt${colors.reset}`);
  const topFiles = Object.entries(report.byFile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [file, count] of topFiles) {
    console.log(`  ${colors.dim}${count.toString().padStart(3)}${colors.reset} ${basename(file)}`);
  }
  console.log();
  
  // Critical/High items
  const urgent = report.items.filter(i => i.priority === 'critical' || i.priority === 'high');
  if (urgent.length > 0) {
    console.log(`${colors.bold}${colors.red}⚠️  High Priority Items${colors.reset}`);
    console.log();
    for (const item of urgent.slice(0, 15)) {
      const marker = MARKERS.find(m => m.pattern === item.marker);
      const icon = marker?.icon || '•';
      console.log(`  ${icon} ${colors.dim}${item.file}:${item.line}${colors.reset}`);
      console.log(`    ${item.message.slice(0, 80)}${item.message.length > 80 ? '...' : ''}`);
    }
    if (urgent.length > 15) {
      console.log(`  ${colors.dim}...and ${urgent.length - 15} more${colors.reset}`);
    }
    console.log();
  }
  
  // Recommendations
  console.log(`${colors.bold}Recommendations${colors.reset}`);
  if (report.byPriority['critical'] > 0) {
    console.log(`  ${colors.red}•${colors.reset} Address ${report.byPriority['critical']} critical items immediately`);
  }
  if (report.byPriority['high'] > 5) {
    console.log(`  ${colors.yellow}•${colors.reset} Schedule time to reduce high-priority debt`);
  }
  const largestFile = topFiles[0];
  if (largestFile && largestFile[1] > 5) {
    console.log(`  ${colors.cyan}•${colors.reset} Consider refactoring ${basename(largestFile[0])} (${largestFile[1]} items)`);
  }
  console.log();
}

function generateMarkdown(report: DebtReport): string {
  let md = `# Technical Debt Report

> Generated: ${report.generated}

## Summary

| Metric | Count |
|--------|-------|
| Total Items | ${report.totalItems} |
| Critical | ${report.byPriority['critical'] || 0} |
| High | ${report.byPriority['high'] || 0} |
| Medium | ${report.byPriority['medium'] || 0} |
| Low | ${report.byPriority['low'] || 0} |

## By Marker

| Marker | Count |
|--------|-------|
`;

  for (const marker of MARKERS) {
    const count = report.byMarker[marker.pattern] || 0;
    if (count > 0) {
      md += `| ${marker.icon} ${marker.pattern} | ${count} |\n`;
    }
  }

  md += `
## High Priority Items

`;

  const urgent = report.items.filter(i => i.priority === 'critical' || i.priority === 'high');
  for (const item of urgent) {
    const marker = MARKERS.find(m => m.pattern === item.marker);
    md += `### ${marker?.icon || '•'} ${item.marker}: ${item.message.slice(0, 60)}\n\n`;
    md += `- **File:** \`${item.file}:${item.line}\`\n`;
    md += `- **Priority:** ${item.priority}\n`;
    if (item.age !== undefined) {
      md += `- **Age:** ${item.age} days\n`;
    }
    md += `\n`;
  }

  md += `
## All Items

`;

  for (const item of report.items) {
    const marker = MARKERS.find(m => m.pattern === item.marker);
    md += `- ${marker?.icon || '•'} \`${item.file}:${item.line}\` - ${item.message.slice(0, 60)}\n`;
  }

  return md;
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isJson = args.includes('--json');
  const isMarkdown = args.includes('--markdown');
  const outputFile = args.find(a => a.startsWith('--output='))?.split('=')[1];
  
  console.log(`${colors.cyan}Scanning codebase for technical debt...${colors.reset}\n`);
  
  const items = scanForDebt();
  const report = generateReport(items);
  
  if (isJson) {
    const output = JSON.stringify(report, null, 2);
    if (outputFile) {
      writeFileSync(join(PROJECT_ROOT, outputFile), output);
      console.log(`✓ Written to ${outputFile}`);
    } else {
      console.log(output);
    }
  } else if (isMarkdown) {
    const output = generateMarkdown(report);
    if (outputFile) {
      writeFileSync(join(PROJECT_ROOT, outputFile), output);
      console.log(`✓ Written to ${outputFile}`);
    } else {
      console.log(output);
    }
  } else {
    printConsoleReport(report);
    
    // Always write the markdown file
    const mdPath = join(PROJECT_ROOT, 'docs', 'TECH-DEBT.md');
    writeFileSync(mdPath, generateMarkdown(report));
    console.log(`${colors.dim}Report saved to docs/TECH-DEBT.md${colors.reset}\n`);
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});

