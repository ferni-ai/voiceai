#!/usr/bin/env npx tsx
/**
 * Bundle Size Check Script
 *
 * Tracks build output size to prevent bloat:
 * - Total dist folder size
 * - Individual file sizes
 * - Size changes from baseline
 *
 * Run: npx tsx scripts/bundle-size-check.ts
 * Run with --update to update baseline: npx tsx scripts/bundle-size-check.ts --update
 * Exit codes: 0 = pass, 1 = fail (blocking issues found)
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, extname } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ROOT_DIR = join(import.meta.dirname, '..', '..', '..', '..', '..');
const DIST_DIR = join(ROOT_DIR, 'dist');
const BASELINE_FILE = join(ROOT_DIR, '.bundle-size-baseline.json');

const THRESHOLDS = {
  maxTotalSizeKB: 15000,        // 15MB max total
  maxFileSizeKB: 500,           // 500KB max per file
  warnOnGrowthPercent: 20,      // Warn if size grows 20%
  maxNewFilesWithoutUpdate: 50, // Max new files without baseline update
};

// File extensions to track
const TRACK_EXTENSIONS = ['.js', '.mjs', '.cjs', '.json', '.d.ts'];

// ============================================================================
// TYPES
// ============================================================================

interface FileSize {
  path: string;
  sizeBytes: number;
  sizeKB: number;
}

interface BundleSizeSnapshot {
  timestamp: string;
  totalSizeBytes: number;
  totalSizeKB: number;
  fileCount: number;
  files: Record<string, number>;  // path -> size in bytes
}

interface BundleSizeReport {
  current: {
    totalSizeBytes: number;
    totalSizeKB: number;
    fileCount: number;
    files: FileSize[];
  };
  baseline: BundleSizeSnapshot | null;
  newFiles: FileSize[];
  removedFiles: string[];
  largeFiles: FileSize[];
  growthPercent: number;
  growthKB: number;
}

// ============================================================================
// FILE SCANNING
// ============================================================================

function getAllDistFiles(dir: string, files: FileSize[] = []): FileSize[] {
  if (!existsSync(dir)) {
    return files;
  }

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        getAllDistFiles(fullPath, files);
      } else {
        const ext = extname(entry);
        if (TRACK_EXTENSIONS.includes(ext)) {
          const sizeBytes = stat.size;
          files.push({
            path: relative(DIST_DIR, fullPath),
            sizeBytes,
            sizeKB: Math.round(sizeBytes / 1024 * 10) / 10,
          });
        }
      }
    }
  } catch {
    // Ignore errors
  }
  return files;
}

// ============================================================================
// BASELINE MANAGEMENT
// ============================================================================

function loadBaseline(): BundleSizeSnapshot | null {
  if (!existsSync(BASELINE_FILE)) return null;

  try {
    const content = readFileSync(BASELINE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function saveBaseline(snapshot: BundleSizeSnapshot): void {
  writeFileSync(BASELINE_FILE, JSON.stringify(snapshot, null, 2));
  console.log(`✅ Baseline updated: ${BASELINE_FILE}`);
}

// ============================================================================
// ANALYSIS
// ============================================================================

function analyzeBundle(): BundleSizeReport {
  const files = getAllDistFiles(DIST_DIR);
  const baseline = loadBaseline();

  const totalSizeBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0);
  const totalSizeKB = Math.round(totalSizeBytes / 1024);

  // Find large files
  const largeFiles = files
    .filter(f => f.sizeKB > THRESHOLDS.maxFileSizeKB)
    .sort((a, b) => b.sizeBytes - a.sizeBytes);

  // Compare with baseline
  let newFiles: FileSize[] = [];
  let removedFiles: string[] = [];
  let growthPercent = 0;
  let growthKB = 0;

  if (baseline) {
    const baselineFiles = new Set(Object.keys(baseline.files));
    const currentFiles = new Set(files.map(f => f.path));

    // New files
    newFiles = files.filter(f => !baselineFiles.has(f.path));

    // Removed files
    removedFiles = [...baselineFiles].filter(f => !currentFiles.has(f));

    // Growth
    growthKB = totalSizeKB - baseline.totalSizeKB;
    growthPercent = baseline.totalSizeKB > 0
      ? Math.round((growthKB / baseline.totalSizeKB) * 100)
      : 0;
  }

  return {
    current: {
      totalSizeBytes,
      totalSizeKB,
      fileCount: files.length,
      files: files.sort((a, b) => b.sizeBytes - a.sizeBytes),
    },
    baseline,
    newFiles,
    removedFiles,
    largeFiles,
    growthPercent,
    growthKB,
  };
}

// ============================================================================
// REPORTING
// ============================================================================

function formatSize(kb: number): string {
  if (kb >= 1024) {
    return `${(kb / 1024).toFixed(1)} MB`;
  }
  return `${kb} KB`;
}

function printReport(report: BundleSizeReport): void {
  console.log('\n======================================================================');
  console.log('  BUNDLE SIZE REPORT');
  console.log('======================================================================\n');

  if (!existsSync(DIST_DIR)) {
    console.log('⚠️  No dist folder found. Run build first: pnpm build:fast');
    console.log('\n======================================================================');
    console.log('  STATUS: SKIPPED');
    console.log('======================================================================\n');
    return;
  }

  console.log(`📊 Summary`);
  console.log('----------------------------------------------------------------------');
  console.log(`  Total size: ${formatSize(report.current.totalSizeKB)}`);
  console.log(`  File count: ${report.current.fileCount}`);
  if (report.baseline) {
    console.log(`  Baseline size: ${formatSize(report.baseline.totalSizeKB)}`);
    const sign = report.growthKB >= 0 ? '+' : '';
    console.log(`  Change: ${sign}${formatSize(report.growthKB)} (${sign}${report.growthPercent}%)`);
  }
  console.log();

  // Top 10 largest files
  console.log(`📦 Largest Files`);
  console.log('----------------------------------------------------------------------');
  for (const file of report.current.files.slice(0, 10)) {
    const warning = file.sizeKB > THRESHOLDS.maxFileSizeKB ? ' ⚠️' : '';
    console.log(`  ${formatSize(file.sizeKB).padStart(10)}  ${file.path}${warning}`);
  }
  if (report.current.files.length > 10) {
    console.log(`  ... and ${report.current.files.length - 10} more files`);
  }
  console.log();

  if (report.largeFiles.length > 0) {
    console.log(`⚠️  Files Exceeding ${THRESHOLDS.maxFileSizeKB} KB`);
    console.log('----------------------------------------------------------------------');
    for (const file of report.largeFiles) {
      console.log(`  ${formatSize(file.sizeKB).padStart(10)}  ${file.path}`);
    }
    console.log();
  }

  if (report.newFiles.length > 0) {
    console.log(`✨ New Files (${report.newFiles.length})`);
    console.log('----------------------------------------------------------------------');
    const newFilesSize = report.newFiles.reduce((sum, f) => sum + f.sizeKB, 0);
    console.log(`  Total new: ${formatSize(newFilesSize)}`);
    for (const file of report.newFiles.slice(0, 10)) {
      console.log(`  + ${file.path} (${formatSize(file.sizeKB)})`);
    }
    if (report.newFiles.length > 10) {
      console.log(`  ... and ${report.newFiles.length - 10} more`);
    }
    console.log();
  }

  if (report.removedFiles.length > 0) {
    console.log(`🗑️  Removed Files (${report.removedFiles.length})`);
    console.log('----------------------------------------------------------------------');
    for (const file of report.removedFiles.slice(0, 5)) {
      console.log(`  - ${file}`);
    }
    if (report.removedFiles.length > 5) {
      console.log(`  ... and ${report.removedFiles.length - 5} more`);
    }
    console.log();
  }

  // Status
  const hasBlockingIssues =
    report.current.totalSizeKB > THRESHOLDS.maxTotalSizeKB ||
    (report.baseline && report.newFiles.length > THRESHOLDS.maxNewFilesWithoutUpdate && report.growthPercent > THRESHOLDS.warnOnGrowthPercent);

  const hasWarnings =
    report.largeFiles.length > 0 ||
    report.growthPercent > THRESHOLDS.warnOnGrowthPercent;

  console.log('======================================================================');
  if (hasBlockingIssues) {
    console.log('  STATUS: FAILED');
    console.log('----------------------------------------------------------------------');
    if (report.current.totalSizeKB > THRESHOLDS.maxTotalSizeKB) {
      console.log(`  ✗ Bundle size ${formatSize(report.current.totalSizeKB)} exceeds max ${formatSize(THRESHOLDS.maxTotalSizeKB)}`);
    }
    if (report.baseline && report.newFiles.length > THRESHOLDS.maxNewFilesWithoutUpdate) {
      console.log(`  ✗ Too many new files (${report.newFiles.length}) without baseline update`);
      console.log('    Run with --update to accept these changes');
    }
  } else if (hasWarnings) {
    console.log('  STATUS: PASSED (with warnings)');
    console.log('----------------------------------------------------------------------');
    if (report.largeFiles.length > 0) {
      console.log(`  ⚠ ${report.largeFiles.length} files exceed size threshold`);
    }
    if (report.growthPercent > THRESHOLDS.warnOnGrowthPercent) {
      console.log(`  ⚠ Bundle grew ${report.growthPercent}% (threshold: ${THRESHOLDS.warnOnGrowthPercent}%)`);
    }
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

  console.log('Analyzing bundle size...\n');

  const report = analyzeBundle();

  if (shouldUpdate && existsSync(DIST_DIR)) {
    const snapshot: BundleSizeSnapshot = {
      timestamp: new Date().toISOString(),
      totalSizeBytes: report.current.totalSizeBytes,
      totalSizeKB: report.current.totalSizeKB,
      fileCount: report.current.fileCount,
      files: {},
    };

    for (const file of report.current.files) {
      snapshot.files[file.path] = file.sizeBytes;
    }

    saveBaseline(snapshot);
  }

  printReport(report);

  if (!existsSync(DIST_DIR)) {
    process.exit(0); // Skip if no dist
  }

  const hasBlockingIssues =
    report.current.totalSizeKB > THRESHOLDS.maxTotalSizeKB ||
    (report.baseline && report.newFiles.length > THRESHOLDS.maxNewFilesWithoutUpdate && report.growthPercent > THRESHOLDS.warnOnGrowthPercent);

  process.exit(hasBlockingIssues ? 1 : 0);
}

main();
