#!/usr/bin/env npx tsx
/**
 * Code Quality Check Script
 *
 * Enforces code quality standards across the codebase:
 * - Detects `as any` type assertions (should be avoided)
 * - Detects improper console.log usage (should use createLogger)
 * - Checks file size limits (max 500 lines)
 * - Counts TODO/FIXME comments
 *
 * Run: npx tsx scripts/code-quality-check.ts
 * Exit codes: 0 = pass, 1 = fail (blocking issues)
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ROOT_DIR = join(import.meta.dirname, '..');
const SRC_DIR = join(ROOT_DIR, 'src');

const THRESHOLDS = {
  // Blocking thresholds (fail if exceeded) - set to current baseline + buffer
  // Ratchet these down over time as tech debt is reduced
  maxAsAny: 30,            // Current: 23 - prevent growth
  maxConsoleLog: 100,      // Current: 96 - prevent growth, then reduce
  maxFileLines: 500,       // Industry standard

  // Warning thresholds (non-blocking, tracked for awareness)
  maxTodos: 50,            // Track technical debt
  maxLargeFiles: 220,      // Current: 216 - prevent growth
};

// Files/patterns to ignore
const IGNORE_PATTERNS = [
  'node_modules',
  'dist/',
  'coverage/',
  '.test.ts',
  '.spec.ts',
  '__tests__',
  '__mocks__',
  'scripts/',           // Scripts can use console.log
  'cli/',               // CLI tools can use console.log
  'token-server.js',    // Standalone server
  'ui-server.js',       // Standalone server
];

// Console methods that indicate direct logging (should use createLogger)
const CONSOLE_METHODS = ['console.log', 'console.info', 'console.warn', 'console.error', 'console.debug'];

// Files where console is acceptable
const CONSOLE_ALLOWED = [
  '/cli/',
  '/scripts/',
  'logger.ts',
  'safe-logger.ts',
  '-debug.ts',        // Debug files
  '/tests/',          // Test files
  'run-e2e.ts',       // E2E runner
  'health-server.ts', // Health endpoints (stdout logging for k8s)
];

// ============================================================================
// TYPES
// ============================================================================

interface FileIssue {
  file: string;
  line: number;
  type: 'as-any' | 'console' | 'todo' | 'fixme' | 'large-file';
  context: string;
}

interface QualityReport {
  asAnyCount: number;
  consoleCount: number;
  todoCount: number;
  fixmeCount: number;
  largeFiles: { file: string; lines: number }[];
  issues: FileIssue[];
}

// ============================================================================
// SCANNING
// ============================================================================

function shouldIgnore(filePath: string): boolean {
  return IGNORE_PATTERNS.some(pattern => filePath.includes(pattern));
}

function isConsoleAllowed(filePath: string): boolean {
  return CONSOLE_ALLOWED.some(pattern => filePath.includes(pattern));
}

function getAllTypeScriptFiles(dir: string, files: string[] = []): string[] {
  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);

      if (shouldIgnore(fullPath)) continue;

      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        getAllTypeScriptFiles(fullPath, files);
      } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist, skip
  }

  return files;
}

function analyzeFile(filePath: string): { issues: FileIssue[]; lines: number } {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const relPath = relative(ROOT_DIR, filePath);
  const issues: FileIssue[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip comments for some checks
    const trimmed = line.trim();
    const isComment = trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');

    // Check for `as any` (excluding comments)
    if (!isComment && line.includes('as any')) {
      issues.push({
        file: relPath,
        line: lineNum,
        type: 'as-any',
        context: trimmed.substring(0, 80),
      });
    }

    // Check for console.* usage (excluding allowed files)
    if (!isComment && !isConsoleAllowed(filePath)) {
      for (const method of CONSOLE_METHODS) {
        if (line.includes(method)) {
          issues.push({
            file: relPath,
            line: lineNum,
            type: 'console',
            context: trimmed.substring(0, 80),
          });
          break;
        }
      }
    }

    // Check for TODO comments
    if (line.toUpperCase().includes('TODO')) {
      issues.push({
        file: relPath,
        line: lineNum,
        type: 'todo',
        context: trimmed.substring(0, 80),
      });
    }

    // Check for FIXME comments
    if (line.toUpperCase().includes('FIXME')) {
      issues.push({
        file: relPath,
        line: lineNum,
        type: 'fixme',
        context: trimmed.substring(0, 80),
      });
    }
  }

  // Check file size
  if (lines.length > THRESHOLDS.maxFileLines) {
    issues.push({
      file: relPath,
      line: 0,
      type: 'large-file',
      context: `${lines.length} lines (max: ${THRESHOLDS.maxFileLines})`,
    });
  }

  return { issues, lines: lines.length };
}

// ============================================================================
// REPORTING
// ============================================================================

function generateReport(): QualityReport {
  const files = getAllTypeScriptFiles(SRC_DIR);
  const report: QualityReport = {
    asAnyCount: 0,
    consoleCount: 0,
    todoCount: 0,
    fixmeCount: 0,
    largeFiles: [],
    issues: [],
  };

  for (const file of files) {
    const { issues, lines } = analyzeFile(file);

    for (const issue of issues) {
      report.issues.push(issue);

      switch (issue.type) {
        case 'as-any':
          report.asAnyCount++;
          break;
        case 'console':
          report.consoleCount++;
          break;
        case 'todo':
          report.todoCount++;
          break;
        case 'fixme':
          report.fixmeCount++;
          break;
        case 'large-file':
          report.largeFiles.push({ file: issue.file, lines });
          break;
      }
    }
  }

  return report;
}

function printReport(report: QualityReport): boolean {
  console.log('');
  console.log('='.repeat(70));
  console.log('  CODE QUALITY REPORT');
  console.log('='.repeat(70));

  let hasBlockingIssues = false;

  // As Any Summary
  console.log('\n📊 Type Safety');
  console.log('-'.repeat(70));
  const asAnyStatus = report.asAnyCount <= THRESHOLDS.maxAsAny ? '✓' : '✗';
  console.log(`  ${asAnyStatus} \`as any\` assertions: ${report.asAnyCount} (threshold: ${THRESHOLDS.maxAsAny})`);

  if (report.asAnyCount > THRESHOLDS.maxAsAny) {
    hasBlockingIssues = true;
    console.log('\n  Top files with `as any`:');
    const asAnyByFile = new Map<string, number>();
    report.issues.filter(i => i.type === 'as-any').forEach(i => {
      asAnyByFile.set(i.file, (asAnyByFile.get(i.file) || 0) + 1);
    });
    const topAsAny = [...asAnyByFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [file, count] of topAsAny) {
      console.log(`    - ${file}: ${count}`);
    }
  }

  // Console.log Summary
  console.log('\n📝 Logging');
  console.log('-'.repeat(70));
  const consoleStatus = report.consoleCount <= THRESHOLDS.maxConsoleLog ? '✓' : '✗';
  console.log(`  ${consoleStatus} console.* usage: ${report.consoleCount} (threshold: ${THRESHOLDS.maxConsoleLog})`);
  console.log('    (Use createLogger() instead of console.*)');

  if (report.consoleCount > THRESHOLDS.maxConsoleLog) {
    hasBlockingIssues = true;
    console.log('\n  Files with console.* usage:');
    const consoleByFile = new Map<string, number>();
    report.issues.filter(i => i.type === 'console').forEach(i => {
      consoleByFile.set(i.file, (consoleByFile.get(i.file) || 0) + 1);
    });
    const topConsole = [...consoleByFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [file, count] of topConsole) {
      console.log(`    - ${file}: ${count}`);
    }
  }

  // File Size Summary
  console.log('\n📏 File Size');
  console.log('-'.repeat(70));
  const fileSizeStatus = report.largeFiles.length <= THRESHOLDS.maxLargeFiles ? '✓' : '⚠';
  console.log(`  ${fileSizeStatus} Files over ${THRESHOLDS.maxFileLines} lines: ${report.largeFiles.length}`);

  if (report.largeFiles.length > 0) {
    console.log('\n  Large files:');
    const sortedLarge = [...report.largeFiles].sort((a, b) => b.lines - a.lines).slice(0, 10);
    for (const { file, lines } of sortedLarge) {
      console.log(`    - ${file}: ${lines} lines`);
    }
  }

  // Technical Debt Summary
  console.log('\n🔧 Technical Debt');
  console.log('-'.repeat(70));
  console.log(`  TODOs: ${report.todoCount}`);
  console.log(`  FIXMEs: ${report.fixmeCount}`);

  // Final Summary
  console.log('\n' + '='.repeat(70));

  if (hasBlockingIssues) {
    console.log('  STATUS: FAILED - Blocking issues found');
    console.log('='.repeat(70));
    console.log('\n⚠️  Fix blocking issues before committing.\n');
    return false;
  } else {
    console.log('  STATUS: PASSED');
    console.log('='.repeat(70));
    console.log('');
    return true;
  }
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  const report = generateReport();
  const passed = printReport(report);

  // Exit with appropriate code
  process.exit(passed ? 0 : 1);
}

main();
