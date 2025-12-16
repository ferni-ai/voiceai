#!/usr/bin/env npx tsx
/**
 * API Surface Check Script
 *
 * Tracks public API growth to catch unintended exports:
 * - Counts exports from index.ts files (public API)
 * - Detects new exports added since baseline
 * - Warns about API surface growth
 *
 * Large API surface suggests:
 * - Too much is exposed publicly
 * - Risk of breaking changes
 * - Consider internal modules
 *
 * Run: npx tsx scripts/api-surface-check.ts
 * Run with --update to update baseline: npx tsx scripts/api-surface-check.ts --update
 * Exit codes: 0 = pass, 1 = fail (blocking issues found)
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, dirname } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ROOT_DIR = join(import.meta.dirname, '..', '..', '..', '..', '..');
const SRC_DIR = join(ROOT_DIR, 'src');
const BASELINE_FILE = join(ROOT_DIR, '.api-surface-baseline.json');

const THRESHOLDS = {
  maxNewExports: 20,          // Max new exports without updating baseline
  maxTotalApiSurface: 800,    // Max total public API exports
  warnOnGrowthPercent: 10,    // Warn if API grows more than 10%
};

// Top-level index files that define public API
const API_INDEX_FILES = [
  'src/index.ts',
  'src/services/index.ts',
  'src/tools/index.ts',
  'src/intelligence/index.ts',
  'src/memory/index.ts',
  'src/config/index.ts',
  'src/types/index.ts',
  'src/utils/index.ts',
  'src/personas/index.ts',
  'src/conversation/index.ts',
  'src/speech/index.ts',
  'src/agents/index.ts',
];

// ============================================================================
// TYPES
// ============================================================================

interface ExportInfo {
  name: string;
  type: 'function' | 'const' | 'class' | 'type' | 'interface' | 'enum' | 'default' | 'namespace';
  file: string;
}

interface ApiSurfaceSnapshot {
  timestamp: string;
  totalExports: number;
  exports: Record<string, string[]>;  // file -> export names
}

interface ApiSurfaceReport {
  currentExports: ExportInfo[];
  totalExports: number;
  exportsByFile: Map<string, ExportInfo[]>;
  newExports: ExportInfo[];
  removedExports: ExportInfo[];
  baseline: ApiSurfaceSnapshot | null;
  growthPercent: number;
}

// ============================================================================
// EXPORT EXTRACTION
// ============================================================================

function extractExportsFromFile(filePath: string): ExportInfo[] {
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const exports: ExportInfo[] = [];
  const relativePath = relative(ROOT_DIR, filePath);

  for (const line of lines) {
    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    // export function/const/class/type/interface/enum
    const directExport = line.match(/^export\s+(?:async\s+)?(?:function|const|let|var)\s+(\w+)/);
    if (directExport) {
      exports.push({ name: directExport[1], type: 'function', file: relativePath });
      continue;
    }

    const classExport = line.match(/^export\s+(?:abstract\s+)?class\s+(\w+)/);
    if (classExport) {
      exports.push({ name: classExport[1], type: 'class', file: relativePath });
      continue;
    }

    const typeExport = line.match(/^export\s+type\s+(\w+)/);
    if (typeExport) {
      exports.push({ name: typeExport[1], type: 'type', file: relativePath });
      continue;
    }

    const interfaceExport = line.match(/^export\s+interface\s+(\w+)/);
    if (interfaceExport) {
      exports.push({ name: interfaceExport[1], type: 'interface', file: relativePath });
      continue;
    }

    const enumExport = line.match(/^export\s+(?:const\s+)?enum\s+(\w+)/);
    if (enumExport) {
      exports.push({ name: enumExport[1], type: 'enum', file: relativePath });
      continue;
    }

    // export default
    if (line.match(/^export\s+default/)) {
      exports.push({ name: 'default', type: 'default', file: relativePath });
      continue;
    }

    // export { name1, name2 } (local exports)
    const namedExportLocal = line.match(/^export\s+\{([^}]+)\}\s*;?\s*$/);
    if (namedExportLocal) {
      const names = namedExportLocal[1].split(',').map(n => {
        const parts = n.trim().split(/\s+as\s+/);
        return parts[parts.length - 1].replace('type ', '');
      });
      for (const name of names.filter(n => n)) {
        exports.push({ name, type: 'const', file: relativePath });
      }
      continue;
    }

    // export { name1, name2 } from './module' (re-exports)
    const namedReExport = line.match(/^export\s+\{([^}]+)\}\s+from\s+['"][^'"]+['"]/);
    if (namedReExport) {
      const names = namedReExport[1].split(',').map(n => {
        const parts = n.trim().split(/\s+as\s+/);
        return parts[parts.length - 1].replace('type ', '');
      });
      for (const name of names.filter(n => n)) {
        exports.push({ name, type: 'const', file: relativePath });
      }
      continue;
    }

    // export * from './module' (namespace re-export)
    const starReExport = line.match(/^export\s+\*\s+from\s+['"]([^'"]+)['"]/);
    if (starReExport) {
      exports.push({ name: `* from ${starReExport[1]}`, type: 'namespace', file: relativePath });
    }
  }

  return exports;
}

// ============================================================================
// BASELINE MANAGEMENT
// ============================================================================

function loadBaseline(): ApiSurfaceSnapshot | null {
  if (!existsSync(BASELINE_FILE)) return null;

  try {
    const content = readFileSync(BASELINE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function saveBaseline(snapshot: ApiSurfaceSnapshot): void {
  writeFileSync(BASELINE_FILE, JSON.stringify(snapshot, null, 2));
  console.log(`✅ Baseline updated: ${BASELINE_FILE}`);
}

// ============================================================================
// ANALYSIS
// ============================================================================

function analyzeApiSurface(): ApiSurfaceReport {
  const allExports: ExportInfo[] = [];
  const exportsByFile = new Map<string, ExportInfo[]>();

  for (const indexFile of API_INDEX_FILES) {
    const fullPath = join(ROOT_DIR, indexFile);
    const exports = extractExportsFromFile(fullPath);
    allExports.push(...exports);
    exportsByFile.set(indexFile, exports);
  }

  const baseline = loadBaseline();

  // Find new and removed exports
  const newExports: ExportInfo[] = [];
  const removedExports: ExportInfo[] = [];

  if (baseline) {
    const baselineNames = new Set<string>();
    for (const [file, names] of Object.entries(baseline.exports)) {
      for (const name of names) {
        baselineNames.add(`${file}:${name}`);
      }
    }

    const currentNames = new Set<string>();
    for (const exp of allExports) {
      currentNames.add(`${exp.file}:${exp.name}`);
    }

    // New exports
    for (const exp of allExports) {
      const key = `${exp.file}:${exp.name}`;
      if (!baselineNames.has(key)) {
        newExports.push(exp);
      }
    }

    // Removed exports
    for (const [file, names] of Object.entries(baseline.exports)) {
      for (const name of names) {
        const key = `${file}:${name}`;
        if (!currentNames.has(key)) {
          removedExports.push({ name, file, type: 'const' });
        }
      }
    }
  }

  const growthPercent = baseline
    ? Math.round(((allExports.length - baseline.totalExports) / baseline.totalExports) * 100)
    : 0;

  return {
    currentExports: allExports,
    totalExports: allExports.length,
    exportsByFile,
    newExports,
    removedExports,
    baseline,
    growthPercent,
  };
}

// ============================================================================
// REPORTING
// ============================================================================

function printReport(report: ApiSurfaceReport): void {
  console.log('\n======================================================================');
  console.log('  API SURFACE REPORT');
  console.log('======================================================================\n');

  console.log(`📊 Summary`);
  console.log('----------------------------------------------------------------------');
  console.log(`  Total public API exports: ${report.totalExports}`);
  if (report.baseline) {
    console.log(`  Baseline exports: ${report.baseline.totalExports}`);
    console.log(`  Growth: ${report.growthPercent >= 0 ? '+' : ''}${report.growthPercent}%`);
  }
  console.log(`  New exports (since baseline): ${report.newExports.length}`);
  console.log(`  Removed exports: ${report.removedExports.length}`);
  console.log();

  console.log(`📦 Exports by Module`);
  console.log('----------------------------------------------------------------------');
  for (const [file, exports] of report.exportsByFile) {
    if (exports.length > 0) {
      console.log(`  ${exports.length} exports: ${file}`);
    }
  }
  console.log();

  if (report.newExports.length > 0) {
    console.log(`✨ New Exports (${report.newExports.length})`);
    console.log('----------------------------------------------------------------------');
    for (const exp of report.newExports.slice(0, 20)) {
      console.log(`  + ${exp.name} (${exp.type}) in ${exp.file}`);
    }
    if (report.newExports.length > 20) {
      console.log(`  ... and ${report.newExports.length - 20} more`);
    }
    console.log();
  }

  if (report.removedExports.length > 0) {
    console.log(`🗑️  Removed Exports (${report.removedExports.length})`);
    console.log('----------------------------------------------------------------------');
    for (const exp of report.removedExports.slice(0, 10)) {
      console.log(`  - ${exp.name} from ${exp.file}`);
    }
    if (report.removedExports.length > 10) {
      console.log(`  ... and ${report.removedExports.length - 10} more`);
    }
    console.log();
  }

  // Status
  const hasBlockingIssues =
    report.totalExports > THRESHOLDS.maxTotalApiSurface ||
    (report.baseline && report.newExports.length > THRESHOLDS.maxNewExports);

  const hasWarnings =
    report.growthPercent > THRESHOLDS.warnOnGrowthPercent;

  console.log('======================================================================');
  if (hasBlockingIssues) {
    console.log('  STATUS: FAILED');
    console.log('----------------------------------------------------------------------');
    if (report.totalExports > THRESHOLDS.maxTotalApiSurface) {
      console.log(`  ✗ API surface (${report.totalExports}) exceeds maximum (${THRESHOLDS.maxTotalApiSurface})`);
    }
    if (report.baseline && report.newExports.length > THRESHOLDS.maxNewExports) {
      console.log(`  ✗ New exports (${report.newExports.length}) exceeds threshold (${THRESHOLDS.maxNewExports})`);
      console.log(`    Run with --update to accept these changes`);
    }
  } else if (hasWarnings) {
    console.log('  STATUS: PASSED (with warnings)');
    console.log('----------------------------------------------------------------------');
    console.log(`  ⚠ API surface grew ${report.growthPercent}% (threshold: ${THRESHOLDS.warnOnGrowthPercent}%)`);
  } else {
    console.log('  STATUS: PASSED');
  }
  console.log('======================================================================\n');
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  const shouldUpdate = process.argv.includes('--update');

  console.log('Analyzing API surface...\n');

  const report = analyzeApiSurface();

  if (shouldUpdate) {
    const snapshot: ApiSurfaceSnapshot = {
      timestamp: new Date().toISOString(),
      totalExports: report.totalExports,
      exports: {},
    };

    for (const [file, exports] of report.exportsByFile) {
      snapshot.exports[file] = exports.map(e => e.name);
    }

    saveBaseline(snapshot);
  }

  printReport(report);

  const hasBlockingIssues =
    report.totalExports > THRESHOLDS.maxTotalApiSurface ||
    (report.baseline && report.newExports.length > THRESHOLDS.maxNewExports);

  process.exit(hasBlockingIssues ? 1 : 0);
}

main();
