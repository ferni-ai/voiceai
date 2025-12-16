#!/usr/bin/env npx tsx
/**
 * Layer Coverage Check Script
 *
 * Analyzes test coverage by architectural layer to ensure
 * critical layers have adequate testing:
 * - Infrastructure layers need highest coverage (they're shared)
 * - Domain layers need good coverage (business logic)
 * - Application layers can have lower coverage (integration)
 *
 * Run: npx tsx scripts/layer-coverage-check.ts
 * Exit codes: 0 = pass, 1 = fail (blocking issues found)
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, basename } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ROOT_DIR = join(import.meta.dirname, '..', '..', '..', '..', '..');
const SRC_DIR = join(ROOT_DIR, 'src');
const COVERAGE_FILE = join(ROOT_DIR, 'coverage', 'coverage-summary.json');

// Layer definitions with coverage requirements
const LAYERS: Record<string, { dirs: string[]; minCoverage: number; priority: string }> = {
  infrastructure: {
    dirs: ['memory', 'config', 'utils', 'types'],
    minCoverage: 70,  // High - shared by everything
    priority: 'critical',
  },
  service: {
    dirs: ['services'],
    minCoverage: 60,  // High - business logic
    priority: 'high',
  },
  domain: {
    dirs: ['personas', 'intelligence', 'conversation', 'tools', 'speech', 'ssml'],
    minCoverage: 50,  // Medium - domain logic
    priority: 'medium',
  },
  application: {
    dirs: ['agents', 'api', 'cli'],
    minCoverage: 40,  // Lower - integration code
    priority: 'low',
  },
};

// Patterns to ignore
const IGNORE_PATTERNS = [
  'node_modules',
  'dist/',
  'coverage/',
  '__tests__',
  '__mocks__',
  '.test.ts',
  '.spec.ts',
  'index.ts',
];

// ============================================================================
// TYPES
// ============================================================================

interface CoverageData {
  lines: { total: number; covered: number; pct: number };
  statements: { total: number; covered: number; pct: number };
  functions: { total: number; covered: number; pct: number };
  branches: { total: number; covered: number; pct: number };
}

interface FileCoverage {
  file: string;
  layer: string;
  coverage: CoverageData;
}

interface LayerCoverageReport {
  layer: string;
  priority: string;
  minRequired: number;
  actualCoverage: number;
  totalFiles: number;
  coveredFiles: number;
  uncoveredFiles: string[];
  status: 'pass' | 'fail' | 'warn';
}

interface CoverageReport {
  layers: LayerCoverageReport[];
  overallCoverage: number;
  totalFiles: number;
  hasBlockingIssues: boolean;
}

// ============================================================================
// FILE SCANNING
// ============================================================================

function shouldIgnore(filePath: string): boolean {
  return IGNORE_PATTERNS.some(pattern => filePath.includes(pattern));
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
    // Ignore errors
  }
  return files;
}

function getFileLayer(filePath: string): string | null {
  const relativePath = relative(SRC_DIR, filePath);
  const topDir = relativePath.split('/')[0];

  for (const [layer, config] of Object.entries(LAYERS)) {
    if (config.dirs.includes(topDir)) {
      return layer;
    }
  }
  return null;
}

// ============================================================================
// COVERAGE ANALYSIS
// ============================================================================

function loadCoverageData(): Record<string, CoverageData> | null {
  if (!existsSync(COVERAGE_FILE)) {
    return null;
  }

  try {
    const content = readFileSync(COVERAGE_FILE, 'utf-8');
    const data = JSON.parse(content);

    // Remove the 'total' entry and convert paths
    const result: Record<string, CoverageData> = {};
    for (const [path, coverage] of Object.entries(data)) {
      if (path !== 'total') {
        result[path] = coverage as CoverageData;
      }
    }
    return result;
  } catch {
    return null;
  }
}

function hasTestFile(srcFile: string): boolean {
  const testPatterns = [
    srcFile.replace('.ts', '.test.ts'),
    srcFile.replace('.ts', '.spec.ts'),
    srcFile.replace('/src/', '/src/__tests__/').replace('.ts', '.test.ts'),
    srcFile.replace('/src/', '/tests/').replace('.ts', '.test.ts'),
  ];

  return testPatterns.some(pattern => existsSync(pattern));
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport(files: string[]): CoverageReport {
  const coverageData = loadCoverageData();
  const layerReports: LayerCoverageReport[] = [];
  let totalCoverage = 0;
  let totalCoveredFiles = 0;
  let hasBlockingIssues = false;

  for (const [layerName, config] of Object.entries(LAYERS)) {
    const layerFiles = files.filter(f => getFileLayer(f) === layerName);
    const uncoveredFiles: string[] = [];
    let layerCoverageSum = 0;
    let coveredFileCount = 0;

    for (const file of layerFiles) {
      // Check if file has coverage data or a test file
      const relativePath = relative(ROOT_DIR, file);
      const absolutePath = file;

      let fileCoverage = 0;
      let hasCoverage = false;

      if (coverageData) {
        // Try to find this file in coverage data
        for (const [covPath, cov] of Object.entries(coverageData)) {
          if (covPath.includes(relativePath) || covPath === absolutePath) {
            fileCoverage = cov.lines.pct;
            hasCoverage = true;
            break;
          }
        }
      }

      if (!hasCoverage) {
        // Check for test file existence as proxy for coverage
        if (hasTestFile(file)) {
          hasCoverage = true;
          fileCoverage = 50; // Assume 50% if test exists but no coverage data
        }
      }

      if (hasCoverage && fileCoverage > 0) {
        layerCoverageSum += fileCoverage;
        coveredFileCount++;
        totalCoveredFiles++;
      } else {
        uncoveredFiles.push(relativePath);
      }
    }

    const actualCoverage = coveredFileCount > 0
      ? Math.round(layerCoverageSum / coveredFileCount)
      : 0;

    const coverageFromFileCount = layerFiles.length > 0
      ? Math.round((coveredFileCount / layerFiles.length) * 100)
      : 0;

    // Use file coverage percentage if no actual coverage data
    const effectiveCoverage = coverageData ? actualCoverage : coverageFromFileCount;

    let status: 'pass' | 'fail' | 'warn' = 'pass';
    if (effectiveCoverage < config.minCoverage) {
      if (config.priority === 'critical') {
        status = 'fail';
        hasBlockingIssues = true;
      } else {
        status = 'warn';
      }
    }

    totalCoverage += effectiveCoverage;

    layerReports.push({
      layer: layerName,
      priority: config.priority,
      minRequired: config.minCoverage,
      actualCoverage: effectiveCoverage,
      totalFiles: layerFiles.length,
      coveredFiles: coveredFileCount,
      uncoveredFiles: uncoveredFiles.slice(0, 10), // Top 10 uncovered
      status,
    });
  }

  return {
    layers: layerReports,
    overallCoverage: Math.round(totalCoverage / Object.keys(LAYERS).length),
    totalFiles: files.length,
    hasBlockingIssues,
  };
}

// ============================================================================
// REPORTING
// ============================================================================

function printReport(report: CoverageReport): void {
  console.log('\n======================================================================');
  console.log('  LAYER COVERAGE REPORT');
  console.log('======================================================================\n');

  console.log(`📊 Summary`);
  console.log('----------------------------------------------------------------------');
  console.log(`  Total source files: ${report.totalFiles}`);
  console.log(`  Overall coverage estimate: ${report.overallCoverage}%`);
  console.log();

  console.log(`📦 Coverage by Layer`);
  console.log('----------------------------------------------------------------------');

  for (const layer of report.layers) {
    const statusIcon = layer.status === 'pass' ? '✓' : layer.status === 'warn' ? '⚠' : '✗';
    const statusColor = layer.status === 'pass' ? '' : layer.status === 'warn' ? ' (WARN)' : ' (FAIL)';

    console.log(`  ${statusIcon} ${layer.layer} [${layer.priority}]${statusColor}`);
    console.log(`    Coverage: ${layer.actualCoverage}% (min: ${layer.minRequired}%)`);
    console.log(`    Files: ${layer.coveredFiles}/${layer.totalFiles} have tests`);

    if (layer.uncoveredFiles.length > 0 && layer.status !== 'pass') {
      console.log(`    Missing tests:`);
      for (const file of layer.uncoveredFiles.slice(0, 5)) {
        console.log(`      - ${file}`);
      }
      if (layer.uncoveredFiles.length > 5) {
        console.log(`      ... and ${layer.uncoveredFiles.length - 5} more`);
      }
    }
    console.log();
  }

  // Coverage requirements
  console.log(`📋 Coverage Requirements`);
  console.log('----------------------------------------------------------------------');
  for (const [layer, config] of Object.entries(LAYERS)) {
    console.log(`  ${layer}: ${config.minCoverage}% minimum (${config.priority} priority)`);
  }
  console.log();

  // Status
  console.log('======================================================================');
  if (report.hasBlockingIssues) {
    console.log('  STATUS: FAILED');
    console.log('----------------------------------------------------------------------');
    console.log('  ✗ Critical layers below minimum coverage');
    console.log('  Run: pnpm test --coverage to generate coverage report');
  } else {
    const hasWarnings = report.layers.some(l => l.status === 'warn');
    if (hasWarnings) {
      console.log('  STATUS: PASSED (with warnings)');
      console.log('----------------------------------------------------------------------');
      console.log('  ⚠ Some layers below recommended coverage');
    } else {
      console.log('  STATUS: PASSED');
    }
  }
  console.log('======================================================================\n');
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  console.log('Analyzing test coverage by layer...\n');

  const files = getAllTypeScriptFiles(SRC_DIR);
  const report = generateReport(files);

  printReport(report);

  process.exit(report.hasBlockingIssues ? 1 : 0);
}

main();
