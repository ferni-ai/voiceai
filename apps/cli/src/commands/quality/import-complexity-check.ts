#!/usr/bin/env npx tsx
/**
 * Import Complexity Check Script
 *
 * Detects files with excessive imports (coupling indicator):
 * - Too many imports per file
 * - Too many cross-layer imports
 * - Deep relative imports (../../../)
 *
 * High import complexity suggests:
 * - File is doing too much
 * - Module boundaries are unclear
 * - Refactoring opportunity
 *
 * Run: npx tsx scripts/import-complexity-check.ts
 * Exit codes: 0 = pass, 1 = fail (blocking issues found)
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ROOT_DIR = join(import.meta.dirname, '..', '..', '..', '..', '..');
const SRC_DIR = join(ROOT_DIR, 'src');

const THRESHOLDS = {
  maxImportsPerFile: 25,       // Warning if > 25 imports
  maxCrossLayerImports: 8,     // Max imports from other layers
  maxDeepImports: 4,           // Max ../../../ depth
  maxFilesExceedingImports: 20, // Max files that can exceed import threshold
};

// Layer definitions (from architecture-validator)
const LAYERS: Record<string, string[]> = {
  application: ['agents', 'api', 'cli'],
  domain: ['personas', 'intelligence', 'conversation', 'tools', 'speech', 'ssml'],
  service: ['services'],
  infrastructure: ['memory', 'config', 'utils', 'types'],
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
];

// ============================================================================
// TYPES
// ============================================================================

interface ImportAnalysis {
  file: string;
  totalImports: number;
  localImports: number;
  externalImports: number;
  crossLayerImports: number;
  maxImportDepth: number;
  imports: ImportDetail[];
}

interface ImportDetail {
  path: string;
  isLocal: boolean;
  isExternal: boolean;
  isCrossLayer: boolean;
  depth: number;
  targetLayer?: string;
}

interface ComplexityReport {
  highImportFiles: ImportAnalysis[];
  deepImportFiles: ImportAnalysis[];
  crossLayerHeavyFiles: ImportAnalysis[];
  averageImports: number;
  maxImports: number;
  totalFiles: number;
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

// ============================================================================
// LAYER DETECTION
// ============================================================================

function getLayer(filePath: string): string | null {
  const relativePath = relative(SRC_DIR, filePath);
  const topDir = relativePath.split('/')[0];

  for (const [layer, dirs] of Object.entries(LAYERS)) {
    if (dirs.includes(topDir)) {
      return layer;
    }
  }
  return null;
}

function getTopDir(filePath: string): string {
  const relativePath = relative(SRC_DIR, filePath);
  return relativePath.split('/')[0];
}

// ============================================================================
// IMPORT ANALYSIS
// ============================================================================

function countImportDepth(importPath: string): number {
  const matches = importPath.match(/\.\.\//g);
  return matches ? matches.length : 0;
}

function analyzeImports(filePath: string): ImportAnalysis {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const imports: ImportDetail[] = [];

  const fileLayer = getLayer(filePath);
  const fileTopDir = getTopDir(filePath);

  for (const line of lines) {
    // Match import statements
    const importMatch = line.match(/import\s+.*from\s+['"]([^'"]+)['"]/);
    if (!importMatch) continue;

    const importPath = importMatch[1];
    const isLocal = importPath.startsWith('.') || importPath.startsWith('/');
    const isExternal = !isLocal;
    const depth = countImportDepth(importPath);

    let targetLayer: string | undefined;
    let isCrossLayer = false;

    if (isLocal && depth > 0) {
      // Try to determine target layer from path
      const fromDir = dirname(filePath);
      const pathParts = importPath.split('/');

      // Count how many directories up we go
      let currentDir = fromDir;
      for (const part of pathParts) {
        if (part === '..') {
          currentDir = dirname(currentDir);
        } else if (part !== '.') {
          // This is the first actual directory name
          const targetTopDir = relative(SRC_DIR, currentDir).split('/')[0] || part;
          for (const [layer, dirs] of Object.entries(LAYERS)) {
            if (dirs.includes(targetTopDir) || dirs.includes(part)) {
              targetLayer = layer;
              break;
            }
          }
          break;
        }
      }

      // Check if crossing layer boundary
      if (targetLayer && fileLayer && targetLayer !== fileLayer) {
        isCrossLayer = true;
      }

      // Also check if crossing top-level directory
      for (const part of pathParts) {
        if (part !== '.' && part !== '..') {
          if (part !== fileTopDir && LAYERS.domain.includes(part)) {
            isCrossLayer = true;
          }
          break;
        }
      }
    }

    imports.push({
      path: importPath,
      isLocal,
      isExternal,
      isCrossLayer,
      depth,
      targetLayer,
    });
  }

  return {
    file: relative(ROOT_DIR, filePath),
    totalImports: imports.length,
    localImports: imports.filter(i => i.isLocal).length,
    externalImports: imports.filter(i => i.isExternal).length,
    crossLayerImports: imports.filter(i => i.isCrossLayer).length,
    maxImportDepth: Math.max(0, ...imports.map(i => i.depth)),
    imports,
  };
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport(files: string[]): ComplexityReport {
  const analyses: ImportAnalysis[] = [];

  for (const file of files) {
    const analysis = analyzeImports(file);
    analyses.push(analysis);
  }

  const totalImports = analyses.reduce((sum, a) => sum + a.totalImports, 0);

  return {
    highImportFiles: analyses
      .filter(a => a.totalImports > THRESHOLDS.maxImportsPerFile)
      .sort((a, b) => b.totalImports - a.totalImports),
    deepImportFiles: analyses
      .filter(a => a.maxImportDepth > THRESHOLDS.maxDeepImports)
      .sort((a, b) => b.maxImportDepth - a.maxImportDepth),
    crossLayerHeavyFiles: analyses
      .filter(a => a.crossLayerImports > THRESHOLDS.maxCrossLayerImports)
      .sort((a, b) => b.crossLayerImports - a.crossLayerImports),
    averageImports: Math.round(totalImports / analyses.length),
    maxImports: Math.max(...analyses.map(a => a.totalImports)),
    totalFiles: analyses.length,
  };
}

// ============================================================================
// REPORTING
// ============================================================================

function printReport(report: ComplexityReport): void {
  console.log('\n======================================================================');
  console.log('  IMPORT COMPLEXITY REPORT');
  console.log('======================================================================\n');

  console.log(`📊 Summary`);
  console.log('----------------------------------------------------------------------');
  console.log(`  Total files scanned: ${report.totalFiles}`);
  console.log(`  Average imports per file: ${report.averageImports}`);
  console.log(`  Maximum imports in a file: ${report.maxImports}`);
  console.log(`  Files with high imports (>${THRESHOLDS.maxImportsPerFile}): ${report.highImportFiles.length}`);
  console.log(`  Files with deep imports (>${THRESHOLDS.maxDeepImports} levels): ${report.deepImportFiles.length}`);
  console.log(`  Files with heavy cross-layer imports (>${THRESHOLDS.maxCrossLayerImports}): ${report.crossLayerHeavyFiles.length}`);
  console.log();

  if (report.highImportFiles.length > 0) {
    console.log(`⚠️  High Import Count Files (>${THRESHOLDS.maxImportsPerFile} imports)`);
    console.log('----------------------------------------------------------------------');
    for (const analysis of report.highImportFiles.slice(0, 15)) {
      console.log(`  ${analysis.totalImports} imports: ${analysis.file}`);
      console.log(`    Local: ${analysis.localImports}, External: ${analysis.externalImports}, Cross-layer: ${analysis.crossLayerImports}`);
    }
    if (report.highImportFiles.length > 15) {
      console.log(`  ... and ${report.highImportFiles.length - 15} more`);
    }
    console.log();
  }

  if (report.deepImportFiles.length > 0) {
    console.log(`📁 Deep Import Files (>${THRESHOLDS.maxDeepImports} levels of ../)`);
    console.log('----------------------------------------------------------------------');
    for (const analysis of report.deepImportFiles.slice(0, 10)) {
      console.log(`  ${analysis.maxImportDepth} levels deep: ${analysis.file}`);
    }
    if (report.deepImportFiles.length > 10) {
      console.log(`  ... and ${report.deepImportFiles.length - 10} more`);
    }
    console.log();
  }

  if (report.crossLayerHeavyFiles.length > 0) {
    console.log(`🔗 Heavy Cross-Layer Import Files (>${THRESHOLDS.maxCrossLayerImports})`);
    console.log('----------------------------------------------------------------------');
    for (const analysis of report.crossLayerHeavyFiles.slice(0, 10)) {
      console.log(`  ${analysis.crossLayerImports} cross-layer: ${analysis.file}`);
    }
    if (report.crossLayerHeavyFiles.length > 10) {
      console.log(`  ... and ${report.crossLayerHeavyFiles.length - 10} more`);
    }
    console.log();
  }

  // Status
  const hasBlockingIssues =
    report.highImportFiles.length > THRESHOLDS.maxFilesExceedingImports;

  console.log('======================================================================');
  if (hasBlockingIssues) {
    console.log('  STATUS: FAILED');
    console.log('----------------------------------------------------------------------');
    console.log(`  ✗ Too many files (${report.highImportFiles.length}) exceed import threshold`);
    console.log(`    Maximum allowed: ${THRESHOLDS.maxFilesExceedingImports}`);
  } else {
    console.log('  STATUS: PASSED');
  }
  console.log('======================================================================\n');
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  console.log('Analyzing import complexity...\n');

  const files = getAllTypeScriptFiles(SRC_DIR);
  const report = generateReport(files);

  printReport(report);

  const hasBlockingIssues =
    report.highImportFiles.length > THRESHOLDS.maxFilesExceedingImports;

  process.exit(hasBlockingIssues ? 1 : 0);
}

main();
