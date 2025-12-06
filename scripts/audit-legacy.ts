#!/usr/bin/env npx ts-node
/**
 * Legacy Code Audit Script
 * 
 * Scans the codebase to identify and categorize legacy code.
 * Run with: npx ts-node scripts/audit-legacy.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface LegacyItem {
  file: string;
  line: number;
  type: LegacyType;
  content: string;
  priority: Priority;
}

type LegacyType = 
  | 'deprecated_function'
  | 'deprecated_file'
  | 'backward_compat'
  | 'hardcoded_fallback'
  | 'todo'
  | 'legacy_import';

type Priority = 'high' | 'medium' | 'low';

// Files that are safe to ignore (test files, docs, etc.)
const IGNORE_PATTERNS = [
  '/tests/',
  '/test/',
  '/__tests__/',
  '.test.ts',
  '.spec.ts',
  '/node_modules/',
  '/dist/',
  '.md',
];

function shouldIgnore(file: string): boolean {
  return IGNORE_PATTERNS.some(pattern => file.includes(pattern));
}

function runGrep(pattern: string, path: string = 'src'): string[] {
  try {
    const result = execSync(
      `grep -rn "${pattern}" ${path} --include="*.ts" --include="*.tsx" 2>/dev/null || true`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
    return result.split('\n').filter(line => line.trim() && !shouldIgnore(line));
  } catch {
    return [];
  }
}

function categorizeAndPrioritize(line: string): { type: LegacyType; priority: Priority } {
  const lowerLine = line.toLowerCase();
  
  // High priority: deprecated files or backward compat that blocks progress
  if (lowerLine.includes('@deprecated') && lowerLine.includes('file')) {
    return { type: 'deprecated_file', priority: 'high' };
  }
  
  // Medium priority: deprecated functions
  if (lowerLine.includes('@deprecated')) {
    return { type: 'deprecated_function', priority: 'medium' };
  }
  
  // Medium priority: backward compatibility code
  if (lowerLine.includes('backward') && lowerLine.includes('compat')) {
    return { type: 'backward_compat', priority: 'medium' };
  }
  
  // Low priority: hardcoded fallbacks
  if (lowerLine.includes('fallback') || lowerLine.includes('hardcoded')) {
    return { type: 'hardcoded_fallback', priority: 'low' };
  }
  
  // Low priority: legacy imports
  if (lowerLine.includes('legacy') && lowerLine.includes('import')) {
    return { type: 'legacy_import', priority: 'low' };
  }
  
  return { type: 'todo', priority: 'low' };
}

function parseLine(line: string): { file: string; lineNum: number; content: string } | null {
  const match = line.match(/^([^:]+):(\d+):(.*)$/);
  if (!match) return null;
  return {
    file: match[1],
    lineNum: parseInt(match[2], 10),
    content: match[3].trim(),
  };
}

async function main() {
  console.log('🔍 Scanning for legacy code...\n');
  
  const items: LegacyItem[] = [];
  
  // Scan for @deprecated
  const deprecatedLines = runGrep('@deprecated');
  for (const line of deprecatedLines) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    const { type, priority } = categorizeAndPrioritize(line);
    items.push({
      file: parsed.file,
      line: parsed.lineNum,
      type,
      content: parsed.content,
      priority,
    });
  }
  
  // Scan for backward compatibility
  const backwardCompatLines = runGrep('backward.*compat\\|backwards.*compat');
  for (const line of backwardCompatLines) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    items.push({
      file: parsed.file,
      line: parsed.lineNum,
      type: 'backward_compat',
      content: parsed.content,
      priority: 'medium',
    });
  }
  
  // Group by file
  const byFile = new Map<string, LegacyItem[]>();
  for (const item of items) {
    const existing = byFile.get(item.file) || [];
    existing.push(item);
    byFile.set(item.file, existing);
  }
  
  // Sort by priority
  const highPriority = items.filter(i => i.priority === 'high');
  const mediumPriority = items.filter(i => i.priority === 'medium');
  const lowPriority = items.filter(i => i.priority === 'low');
  
  // Generate report
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    LEGACY CODE AUDIT REPORT                    ');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log('📊 SUMMARY');
  console.log('─────────────────────────────────────────────────────────────────');
  console.log(`  Total legacy items:     ${items.length}`);
  console.log(`  Files affected:         ${byFile.size}`);
  console.log(`  High priority:          ${highPriority.length}`);
  console.log(`  Medium priority:        ${mediumPriority.length}`);
  console.log(`  Low priority:           ${lowPriority.length}`);
  console.log('');
  
  if (highPriority.length > 0) {
    console.log('🔴 HIGH PRIORITY (Address First)');
    console.log('─────────────────────────────────────────────────────────────────');
    for (const item of highPriority.slice(0, 10)) {
      console.log(`  ${item.file}:${item.line}`);
      console.log(`    ${item.content.slice(0, 80)}...`);
    }
    console.log('');
  }
  
  if (mediumPriority.length > 0) {
    console.log('🟡 MEDIUM PRIORITY (Plan Migration)');
    console.log('─────────────────────────────────────────────────────────────────');
    // Group by file and show count
    const mediumByFile = new Map<string, number>();
    for (const item of mediumPriority) {
      mediumByFile.set(item.file, (mediumByFile.get(item.file) || 0) + 1);
    }
    const sortedFiles = Array.from(mediumByFile.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
    for (const [file, count] of sortedFiles) {
      console.log(`  ${file}: ${count} items`);
    }
    console.log('');
  }
  
  console.log('💡 RECOMMENDED ACTIONS');
  console.log('─────────────────────────────────────────────────────────────────');
  console.log('  1. Create migration tickets for high-priority deprecated files');
  console.log('  2. Set a deprecation sunset date (e.g., 30 days)');
  console.log('  3. Update imports to use central personas/index.ts');
  console.log('  4. Remove backward compatibility code after migration');
  console.log('  5. Run this audit weekly to track progress');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Write JSON report for tracking
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: items.length,
      files: byFile.size,
      high: highPriority.length,
      medium: mediumPriority.length,
      low: lowPriority.length,
    },
    items,
  };
  
  fs.writeFileSync('legacy-audit-report.json', JSON.stringify(report, null, 2));
  console.log('📝 Detailed report saved to: legacy-audit-report.json');
}

main().catch(console.error);

