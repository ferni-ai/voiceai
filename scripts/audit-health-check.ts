#!/usr/bin/env npx ts-node
/**
 * Audit Health Check Script
 *
 * Runs automated checks against the codebase to track remediation progress.
 * Use this script to measure improvement over time.
 *
 * Usage:
 *   npx ts-node scripts/audit-health-check.ts
 *   npm run audit:health
 *
 * Output:
 *   - Console summary of all metrics
 *   - JSON report at .audit-reports/health-check-{date}.json
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// CONFIGURATION
// ============================================================================

// ES module compatibility - get __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.join(__dirname, '..', 'src');
const REPORT_DIR = path.join(__dirname, '..', '.audit-reports');

interface AuditResults {
  timestamp: string;
  metrics: {
    anyUsages: number;
    consoleViolations: number;
    todoFixmeCount: number;
    skippedTests: number;
    typeErrors: number;
    lintErrors: number;
  };
  targets: {
    anyUsages: number;
    consoleViolations: number;
    todoFixmeCount: number;
    skippedTests: number;
  };
  status: 'passing' | 'failing';
  details: Record<string, unknown>;
}

// Target metrics from remediation plan
const TARGETS = {
  anyUsages: 100, // Down from 1,118
  consoleViolations: 0, // Down from 1,086
  todoFixmeCount: 50, // Down from 308
  skippedTests: 10, // Down from 134
};

// ============================================================================
// METRIC COLLECTORS
// ============================================================================

function countPattern(pattern: string, glob: string): number {
  try {
    const result = execSync(
      `rg "${pattern}" --glob "${glob}" --count-matches ${SRC_DIR} 2>/dev/null | awk -F: '{sum += $2} END {print sum}'`,
      { encoding: 'utf-8' }
    );
    return parseInt(result.trim()) || 0;
  } catch {
    return 0;
  }
}

function countFiles(pattern: string, glob: string): number {
  try {
    const result = execSync(`rg -l "${pattern}" --glob "${glob}" ${SRC_DIR} 2>/dev/null | wc -l`, {
      encoding: 'utf-8',
    });
    return parseInt(result.trim()) || 0;
  } catch {
    return 0;
  }
}

function getAnyUsages(): { count: number; topFiles: Array<{ file: string; count: number }> } {
  try {
    const pattern = ': any|as any|<any>';
    const result = execSync(
      `rg "${pattern}" --glob "*.ts" -c ${SRC_DIR} 2>/dev/null | sort -t: -k2 -nr | head -20`,
      { encoding: 'utf-8' }
    );

    const lines = result.trim().split('\n').filter(Boolean);
    const topFiles = lines.map((line) => {
      const [file, count] = line.split(':');
      return { file: file.replace(SRC_DIR + '/', ''), count: parseInt(count) || 0 };
    });

    const totalCount = topFiles.reduce((sum, f) => sum + f.count, 0);

    // Get full count
    const fullResult = execSync(
      `rg "${pattern}" --glob "*.ts" -c ${SRC_DIR} 2>/dev/null | awk -F: '{sum += $2} END {print sum}'`,
      { encoding: 'utf-8' }
    );

    return {
      count: parseInt(fullResult.trim()) || totalCount,
      topFiles: topFiles.slice(0, 10),
    };
  } catch {
    return { count: 0, topFiles: [] };
  }
}

function getConsoleViolations(): {
  count: number;
  topFiles: Array<{ file: string; count: number }>;
} {
  try {
    const pattern = 'console\\.(log|warn|error|debug|info)';
    const result = execSync(
      `rg "${pattern}" --glob "*.ts" -c ${SRC_DIR} 2>/dev/null | sort -t: -k2 -nr | head -20`,
      { encoding: 'utf-8' }
    );

    const lines = result.trim().split('\n').filter(Boolean);
    const topFiles = lines.map((line) => {
      const [file, count] = line.split(':');
      return { file: file.replace(SRC_DIR + '/', ''), count: parseInt(count) || 0 };
    });

    const fullResult = execSync(
      `rg "${pattern}" --glob "*.ts" -c ${SRC_DIR} 2>/dev/null | awk -F: '{sum += $2} END {print sum}'`,
      { encoding: 'utf-8' }
    );

    return {
      count: parseInt(fullResult.trim()) || 0,
      topFiles: topFiles.slice(0, 10),
    };
  } catch {
    return { count: 0, topFiles: [] };
  }
}

function getTodoFixmeCount(): { count: number; breakdown: Record<string, number> } {
  const patterns = ['TODO', 'FIXME', 'HACK', 'XXX', 'BUG'];
  const breakdown: Record<string, number> = {};

  for (const pattern of patterns) {
    try {
      const result = execSync(
        `rg "${pattern}" --glob "*.ts" -c ${SRC_DIR} 2>/dev/null | awk -F: '{sum += $2} END {print sum}'`,
        { encoding: 'utf-8' }
      );
      breakdown[pattern] = parseInt(result.trim()) || 0;
    } catch {
      breakdown[pattern] = 0;
    }
  }

  const total = Object.values(breakdown).reduce((sum, count) => sum + count, 0);
  return { count: total, breakdown };
}

function getSkippedTests(): { count: number; files: string[] } {
  try {
    const pattern = '\\.skip\\(|describe\\.skip|it\\.skip|test\\.skip';
    const result = execSync(`rg -l "${pattern}" --glob "*.test.ts" ${SRC_DIR} 2>/dev/null`, {
      encoding: 'utf-8',
    });

    const files = result.trim().split('\n').filter(Boolean);

    const countResult = execSync(
      `rg "${pattern}" --glob "*.test.ts" -c ${SRC_DIR} 2>/dev/null | awk -F: '{sum += $2} END {print sum}'`,
      { encoding: 'utf-8' }
    );

    return {
      count: parseInt(countResult.trim()) || 0,
      files: files.map((f) => f.replace(SRC_DIR + '/', '')),
    };
  } catch {
    return { count: 0, files: [] };
  }
}

function runTypeCheck(): { errors: number; output: string } {
  try {
    execSync('npx tsc --noEmit 2>&1', { encoding: 'utf-8', cwd: path.join(__dirname, '..') });
    return { errors: 0, output: 'No type errors' };
  } catch (error) {
    const output = (error as { stdout?: string }).stdout || '';
    const errorCount = (output.match(/error TS\d+/g) || []).length;
    return { errors: errorCount, output: output.slice(0, 1000) };
  }
}

function runLint(): { errors: number; warnings: number } {
  try {
    const result = execSync('npx eslint src/ --format json 2>/dev/null', {
      encoding: 'utf-8',
      cwd: path.join(__dirname, '..'),
    });
    const data = JSON.parse(result);
    let errors = 0;
    let warnings = 0;
    for (const file of data) {
      errors += file.errorCount || 0;
      warnings += file.warningCount || 0;
    }
    return { errors, warnings };
  } catch {
    return { errors: -1, warnings: -1 };
  }
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport(): AuditResults {
  console.log('🔍 Running Ferni Voice AI Health Check...\n');

  console.log('  Checking `any` usages...');
  const anyData = getAnyUsages();

  console.log('  Checking console violations...');
  const consoleData = getConsoleViolations();

  console.log('  Checking TODO/FIXME markers...');
  const todoData = getTodoFixmeCount();

  console.log('  Checking skipped tests...');
  const skippedData = getSkippedTests();

  console.log('  Running type check...');
  const typeData = runTypeCheck();

  console.log('  Running lint check...');
  const lintData = runLint();

  const results: AuditResults = {
    timestamp: new Date().toISOString(),
    metrics: {
      anyUsages: anyData.count,
      consoleViolations: consoleData.count,
      todoFixmeCount: todoData.count,
      skippedTests: skippedData.count,
      typeErrors: typeData.errors,
      lintErrors: lintData.errors,
    },
    targets: TARGETS,
    status: 'passing',
    details: {
      anyTopFiles: anyData.topFiles,
      consoleTopFiles: consoleData.topFiles,
      todoBreakdown: todoData.breakdown,
      skippedTestFiles: skippedData.files.slice(0, 10),
    },
  };

  // Determine overall status
  if (
    results.metrics.anyUsages > TARGETS.anyUsages ||
    results.metrics.consoleViolations > TARGETS.consoleViolations ||
    results.metrics.todoFixmeCount > TARGETS.todoFixmeCount ||
    results.metrics.skippedTests > TARGETS.skippedTests
  ) {
    results.status = 'failing';
  }

  return results;
}

function printReport(results: AuditResults): void {
  console.log('\n' + '='.repeat(60));
  console.log('📊 FERNI VOICE AI - HEALTH CHECK REPORT');
  console.log('='.repeat(60));
  console.log(`Timestamp: ${results.timestamp}`);
  console.log(`Status: ${results.status === 'passing' ? '✅ PASSING' : '❌ FAILING'}`);
  console.log('='.repeat(60));

  console.log('\n📈 METRICS vs TARGETS:\n');

  const metrics = [
    { name: 'any usages', current: results.metrics.anyUsages, target: TARGETS.anyUsages },
    {
      name: 'console violations',
      current: results.metrics.consoleViolations,
      target: TARGETS.consoleViolations,
    },
    {
      name: 'TODO/FIXME markers',
      current: results.metrics.todoFixmeCount,
      target: TARGETS.todoFixmeCount,
    },
    { name: 'skipped tests', current: results.metrics.skippedTests, target: TARGETS.skippedTests },
  ];

  for (const metric of metrics) {
    const status = metric.current <= metric.target ? '✅' : '❌';
    const progress = Math.min(100, Math.round((metric.target / metric.current || 0) * 100));
    const bar = '█'.repeat(Math.floor(progress / 5)) + '░'.repeat(20 - Math.floor(progress / 5));
    console.log(
      `  ${status} ${metric.name.padEnd(20)} ${String(metric.current).padStart(6)} / ${metric.target} target`
    );
    console.log(`     [${bar}] ${progress}% to target\n`);
  }

  console.log('\n🔧 TOP FILES NEEDING ATTENTION:\n');

  console.log('  `any` usages:');
  const anyFiles = results.details.anyTopFiles as Array<{ file: string; count: number }>;
  for (const file of anyFiles.slice(0, 5)) {
    console.log(`    - ${file.file}: ${file.count}`);
  }

  console.log('\n  console violations:');
  const consoleFiles = results.details.consoleTopFiles as Array<{ file: string; count: number }>;
  for (const file of consoleFiles.slice(0, 5)) {
    console.log(`    - ${file.file}: ${file.count}`);
  }

  console.log('\n  TODO/FIXME breakdown:');
  const todoBreakdown = results.details.todoBreakdown as Record<string, number>;
  for (const [type, count] of Object.entries(todoBreakdown)) {
    console.log(`    - ${type}: ${count}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Run `npm run audit:health` regularly to track progress.');
  console.log('='.repeat(60) + '\n');
}

function saveReport(results: AuditResults): void {
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  const date = new Date().toISOString().split('T')[0];
  const filename = `health-check-${date}.json`;
  const filepath = path.join(REPORT_DIR, filename);

  fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
  console.log(`📁 Report saved to: ${filepath}`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const results = generateReport();
  printReport(results);
  saveReport(results);

  // Exit with error code if failing
  if (results.status === 'failing') {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error running health check:', error);
  process.exit(1);
});
