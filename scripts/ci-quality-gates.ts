#!/usr/bin/env npx tsx
/**
 * CI Quality Gates - Strict enforcement for CI/CD pipelines
 *
 * This script enforces hard thresholds that FAIL the build if exceeded.
 * Unlike local development checks, these are blocking.
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - One or more checks failed
 *
 * Usage:
 *   npx tsx scripts/ci-quality-gates.ts          # Run all checks
 *   npx tsx scripts/ci-quality-gates.ts --todos  # Only TODO check
 *   npx tsx scripts/ci-quality-gates.ts --strict # Extra strict mode
 *
 * @module scripts/ci-quality-gates
 */

import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONFIGURATION - These are the HARD LIMITS that fail CI
// ============================================================================

const THRESHOLDS = {
  // TODO tracking
  maxCriticalTodos: 20, // FIXME/BUG - fail if more than this
  // All TODO/NOTE/BUG markers. Not ">90 days old": that count rises with the
  // calendar, so a ratchet on it failed main with no change (2026-10-09).
  maxTodos: 1000,

  // Code quality
  maxAsAny: 30, // `as any` assertions
  maxConsoleUsage: 100, // console.* usage (excluding logger wrappers)
  maxFileLines: 2000, // Lines per file; files over 500 lines are the ratchet's job
  maxHugeFiles: 0, // Files over maxFileLines allowed

  // Architecture
  maxLayerViolations: 0, // Architecture layer violations
};

// The limits above are replaced by today's numbers, so a check fails only when a change makes
// it worse (every gate used to fail on main, behind continue-on-error). --update lowers them.
const BASELINE_FILE = path.join(process.cwd(), 'scripts', 'ci-quality-gates.baseline.json');
Object.assign(
  THRESHOLDS,
  JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) as Record<string, number>
);

// Extra strict mode thresholds
const STRICT_THRESHOLDS = {
  maxCriticalTodos: 10,
  maxTodos: 500,
  maxAsAny: 20,
  maxConsoleUsage: 50,
  maxFileLines: 1500,
  maxHugeFiles: 0,
  maxLayerViolations: 0,
};

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
};

// ============================================================================
// TYPES
// ============================================================================

interface CheckResult {
  name: string;
  passed: boolean;
  value: number;
  threshold: number;
  message: string;
}

interface GateResults {
  passed: boolean;
  checks: CheckResult[];
  summary: string;
}

// ============================================================================
// SAFE FILE SEARCH UTILITIES
// ============================================================================

/**
 * Recursively find files matching a pattern.
 * No shell execution - pure Node.js file walking.
 */
function* walkFiles(dir: string, extensions: string[] = ['.ts', '.tsx']): Generator<string> {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Skip excluded directories
    if (
      ['node_modules', 'dist', 'build', '.git', 'coverage', '__snapshots__'].includes(entry.name)
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      yield* walkFiles(fullPath, extensions);
    } else if (
      entry.isFile() &&
      extensions.some((ext) => entry.name.endsWith(ext)) &&
      !entry.name.endsWith('.d.ts')
    ) {
      yield fullPath;
    }
  }
}

/**
 * Count pattern occurrences in files using Node.js (no shell).
 */
function countPatternInFiles(
  directories: string[],
  pattern: RegExp,
  excludePatterns: RegExp[] = []
): number {
  let count = 0;

  for (const dir of directories) {
    for (const file of walkFiles(dir)) {
      // Check exclusions
      if (excludePatterns.some((p) => p.test(file))) {
        continue;
      }

      try {
        const content = fs.readFileSync(file, 'utf-8');
        const matches = content.match(pattern);
        if (matches) {
          count += matches.length;
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  return count;
}

// ============================================================================
// CHECK FUNCTIONS
// ============================================================================

/**
 * Count TODO items by category using the audit-todos script
 */
function checkTodos(limits: typeof THRESHOLDS): CheckResult[] {
  const results: CheckResult[] = [];

  try {
    // execFileSync is safe - no shell interpretation, args passed as array
    const output = execFileSync('npx', ['tsx', 'scripts/audit-todos.ts', '--json'], {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Extract JSON from output (skip any non-JSON prefix like "Scanning...")
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in TODO audit output');
    }
    const report = JSON.parse(jsonMatch[0]);
    const criticalCount = report.byPriority?.critical || 0;
    const totalCount = report.totalCount || 0;
    const ancientCount = report.byAge?.ancient || 0;

    results.push({
      name: 'Critical TODOs (FIXME/BUG)',
      passed: criticalCount <= limits.maxCriticalTodos,
      value: criticalCount,
      threshold: limits.maxCriticalTodos,
      message:
        criticalCount <= limits.maxCriticalTodos
          ? `${criticalCount} critical items (within limit)`
          : `${criticalCount} critical items exceeds limit of ${limits.maxCriticalTodos}`,
    });

    results.push({
      name: 'TODOs',
      passed: totalCount <= limits.maxTodos,
      value: totalCount,
      threshold: limits.maxTodos,
      message:
        totalCount <= limits.maxTodos
          ? `${totalCount} items, ${ancientCount} over 90 days old (within limit)`
          : `${totalCount} items exceeds limit of ${limits.maxTodos}`,
    });
  } catch (error) {
    results.push({
      name: 'TODO Audit',
      passed: false,
      value: -1,
      threshold: 0,
      message: `Failed to run TODO audit: ${String(error)}`,
    });
  }

  return results;
}

/**
 * Count `as any` usage in source files (pure Node.js, no shell)
 */
function checkAsAny(limits: typeof THRESHOLDS): CheckResult {
  const count = countPatternInFiles(
    [path.join(process.cwd(), 'src'), path.join(process.cwd(), 'apps')],
    /\bas\s+any\b/g,
    [/\.test\.ts$/, /\.spec\.ts$/] // Exclude test files
  );

  return {
    name: '`as any` Assertions',
    passed: count <= limits.maxAsAny,
    value: count,
    threshold: limits.maxAsAny,
    message:
      count <= limits.maxAsAny
        ? `${count} assertions (within limit of ${limits.maxAsAny})`
        : `${count} assertions exceeds limit of ${limits.maxAsAny}`,
  };
}

/**
 * Count console.* usage (excluding legitimate uses) - pure Node.js
 * Only counts actual console method calls at start of line or after whitespace/semicolon
 */
function checkConsoleUsage(limits: typeof THRESHOLDS): CheckResult {
  let count = 0;

  for (const dir of ['src', 'apps']) {
    const fullDir = path.join(process.cwd(), dir);
    for (const file of walkFiles(fullDir)) {
      // Exclude legitimate files
      if (
        /safe-logger\.ts$/.test(file) ||
        /early-logger\.ts$/.test(file) ||
        /\.test\.ts$/.test(file) ||
        /\.spec\.ts$/.test(file) ||
        /experiments-cli\.ts$/.test(file) ||
        /tool-helpers\.ts$/.test(file)
      ) {
        continue;
      }

      try {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');

        for (const line of lines) {
          // Skip comments, strings containing console, and eslint-disable lines
          const trimmed = line.trim();
          if (
            trimmed.startsWith('//') ||
            trimmed.startsWith('*') ||
            trimmed.includes('eslint-disable') ||
            trimmed.includes('JSDoc') ||
            trimmed.includes('@example')
          ) {
            continue;
          }

          // Match actual console method calls
          if (/^\s*console\.(log|warn|error|info|debug)\s*\(/.test(line)) {
            count++;
          }
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  return {
    name: 'console.* Usage',
    passed: count <= limits.maxConsoleUsage,
    value: count,
    threshold: limits.maxConsoleUsage,
    message:
      count <= limits.maxConsoleUsage
        ? `${count} usages (within limit of ${limits.maxConsoleUsage})`
        : `${count} usages exceeds limit of ${limits.maxConsoleUsage}`,
  };
}

/**
 * Check for oversized files (pure Node.js)
 */
function checkFileSizes(limits: typeof THRESHOLDS): CheckResult {
  const largeFiles: { file: string; lines: number }[] = [];

  for (const dir of ['src', 'apps']) {
    const fullDir = path.join(process.cwd(), dir);
    for (const file of walkFiles(fullDir)) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n').length;
        if (lines > 500) {
          largeFiles.push({ file: file.replace(process.cwd() + '/', ''), lines });
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  const hugeFiles = largeFiles.filter((f) => f.lines > limits.maxFileLines);
  const count = hugeFiles.length;

  return {
    name: `Huge Files (>${limits.maxFileLines} lines)`,
    passed: count <= limits.maxHugeFiles,
    value: count,
    threshold: limits.maxHugeFiles,
    message:
      count <= limits.maxHugeFiles
        ? `${count} files over ${limits.maxFileLines} lines (baseline ${limits.maxHugeFiles})`
        : `${count} files over ${limits.maxFileLines} lines, up from ${limits.maxHugeFiles}`,
  };
}

/**
 * Check architecture layer violations using spawnSync (safe)
 */
function checkArchitecture(limits: typeof THRESHOLDS): CheckResult {
  // Use spawnSync which is safe - no shell interpretation
  const result = spawnSync('pnpm', ['quality:arch'], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.status === 0) {
    return {
      name: 'Architecture Layer Violations',
      passed: true,
      value: 0,
      threshold: limits.maxLayerViolations,
      message: 'No architecture violations found',
    };
  }

  // Count violations from output
  const output = result.stdout + result.stderr;
  const violationMatches = output.match(/violation/gi) || [];
  const count = violationMatches.length;

  return {
    name: 'Architecture Layer Violations',
    passed: count <= limits.maxLayerViolations,
    value: count,
    threshold: limits.maxLayerViolations,
    message: count === 0 ? 'No violations found' : `${count} layer violation(s) detected`,
  };
}

// ============================================================================
// MAIN
// ============================================================================

function runAllChecks(strict: boolean): GateResults {
  const limits = strict ? STRICT_THRESHOLDS : THRESHOLDS;
  const checks: CheckResult[] = [];

  process.stdout.write(
    '\n' +
      colors.bold +
      colors.cyan +
      '═══════════════════════════════════════════════════════════════\n'
  );
  process.stdout.write('                    CI QUALITY GATES                              \n');
  process.stdout.write(
    '═══════════════════════════════════════════════════════════════\n' + colors.reset
  );
  process.stdout.write(
    colors.dim + (strict ? '(STRICT MODE)\n' : '(STANDARD MODE)\n') + colors.reset + '\n'
  );

  // Run each check
  process.stdout.write(colors.dim + 'Running TODO audit...\n' + colors.reset);
  checks.push(...checkTodos(limits));

  process.stdout.write(colors.dim + 'Checking `as any` usage...\n' + colors.reset);
  checks.push(checkAsAny(limits));

  process.stdout.write(colors.dim + 'Checking console.* usage...\n' + colors.reset);
  checks.push(checkConsoleUsage(limits));

  process.stdout.write(colors.dim + 'Checking file sizes...\n' + colors.reset);
  checks.push(checkFileSizes(limits));

  process.stdout.write(colors.dim + 'Checking architecture layers...\n' + colors.reset);
  checks.push(checkArchitecture(limits));

  // Print results
  process.stdout.write(
    '\n' + colors.bold + '─────────────────────────────────────────────────────────────────\n'
  );
  process.stdout.write('Results:\n' + colors.reset);
  process.stdout.write('─────────────────────────────────────────────────────────────────\n');

  let allPassed = true;
  for (const check of checks) {
    const icon = check.passed ? colors.green + '✓' : colors.red + '✗';
    const color = check.passed ? colors.green : colors.red;
    process.stdout.write(
      `${icon}${colors.reset} ${check.name}: ${color}${check.message}${colors.reset}\n`
    );
    if (!check.passed) allPassed = false;
  }

  // Summary
  process.stdout.write(
    '\n' +
      colors.bold +
      '─────────────────────────────────────────────────────────────────\n' +
      colors.reset
  );

  const passedCount = checks.filter((c) => c.passed).length;
  const totalCount = checks.length;
  const summary = allPassed
    ? `${colors.green}${colors.bold}✓ All ${totalCount} checks passed${colors.reset}`
    : `${colors.red}${colors.bold}✗ ${totalCount - passedCount}/${totalCount} checks failed${colors.reset}`;

  process.stdout.write(summary + '\n\n');

  return { passed: allPassed, checks, summary };
}

// CLI handling
const args = process.argv.slice(2);
const strictMode = args.includes('--strict');
const todosOnly = args.includes('--todos');

if (todosOnly) {
  // Just run TODO check
  const limits = strictMode ? STRICT_THRESHOLDS : THRESHOLDS;
  const todoResults = checkTodos(limits);
  const passed = todoResults.every((r) => r.passed);

  for (const check of todoResults) {
    const icon = check.passed ? '✓' : '✗';
    process.stdout.write(`${icon} ${check.name}: ${check.message}\n`);
  }

  process.exit(passed ? 0 : 1);
} else {
  const results = runAllChecks(strictMode);
  if (args.includes('--update')) {
    const key: Record<string, string> = {
      'Critical TODOs (FIXME/BUG)': 'maxCriticalTodos',
      TODOs: 'maxTodos',
      '`as any` Assertions': 'maxAsAny',
      'console.* Usage': 'maxConsoleUsage',
    };
    const base = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) as Record<string, number>;
    for (const c of results.checks) {
      const k = key[c.name] ?? (c.name.startsWith('Huge Files') ? 'maxHugeFiles' : undefined);
      if (k) base[k] = Math.min(base[k] ?? c.value, c.value);
    }
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(base, null, 2) + '\n');
  }
  process.exit(results.passed ? 0 : 1);
}
