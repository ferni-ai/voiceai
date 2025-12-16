#!/usr/bin/env npx tsx
/**
 * Module Cohesion Check Script
 *
 * Detects "god modules" that do too many things:
 * - Files exporting too many functions
 * - Directories with too many files
 * - Index files re-exporting too many items
 *
 * Low cohesion suggests:
 * - Module is doing too much
 * - Should be split into smaller modules
 * - Hard to understand and maintain
 *
 * Run: npx tsx scripts/module-cohesion-check.ts
 * Exit codes: 0 = pass, 1 = fail (blocking issues found)
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, basename, dirname } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ROOT_DIR = join(import.meta.dirname, '..', '..', '..', '..', '..');
const SRC_DIR = join(ROOT_DIR, 'src');

const THRESHOLDS = {
  maxExportsPerFile: 15,        // Max exports per file
  maxFilesPerDirectory: 25,     // Max files in a directory
  maxIndexReExports: 40,        // Max re-exports in index.ts
  maxGodModules: 15,            // Max "god modules" allowed
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

// Directories expected to have many files
const ALLOWED_LARGE_DIRECTORIES = [
  'src/tools',           // Many domain tools
  'src/services',        // Many services
  'src/intelligence/context-builders', // Many builders
  'src/personas/bundles', // Many persona bundles
];

// ============================================================================
// TYPES
// ============================================================================

interface FileExportAnalysis {
  file: string;
  exportCount: number;
  exports: string[];
}

interface DirectoryAnalysis {
  directory: string;
  fileCount: number;
  files: string[];
}

interface IndexAnalysis {
  file: string;
  reExportCount: number;
  reExports: string[];
}

interface CohesionReport {
  godFiles: FileExportAnalysis[];
  largeDirectories: DirectoryAnalysis[];
  heavyIndexFiles: IndexAnalysis[];
  totalFiles: number;
  totalDirectories: number;
  averageExportsPerFile: number;
}

// ============================================================================
// FILE SCANNING
// ============================================================================

function shouldIgnore(filePath: string): boolean {
  return IGNORE_PATTERNS.some(pattern => filePath.includes(pattern));
}

function isAllowedLargeDir(dirPath: string): boolean {
  const relativePath = relative(ROOT_DIR, dirPath);
  return ALLOWED_LARGE_DIRECTORIES.some(allowed => relativePath.startsWith(allowed));
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

function getAllDirectories(dir: string, dirs: string[] = []): string[] {
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      if (shouldIgnore(fullPath)) continue;

      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        dirs.push(fullPath);
        getAllDirectories(fullPath, dirs);
      }
    }
  } catch {
    // Ignore errors
  }
  return dirs;
}

// ============================================================================
// EXPORT COUNTING
// ============================================================================

function countExports(filePath: string): FileExportAnalysis {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const exports: string[] = [];

  for (const line of lines) {
    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    // export function/const/class/type/interface
    const directExport = line.match(/^export\s+(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+(\w+)/);
    if (directExport) {
      exports.push(directExport[1]);
      continue;
    }

    // export default
    if (line.match(/^export\s+default/)) {
      exports.push('default');
      continue;
    }

    // export { name1, name2 }
    const namedExport = line.match(/^export\s+\{([^}]+)\}/);
    if (namedExport) {
      const names = namedExport[1].split(',').map(n => n.trim().split(' ')[0]);
      exports.push(...names.filter(n => n && n !== 'type'));
    }
  }

  return {
    file: relative(ROOT_DIR, filePath),
    exportCount: exports.length,
    exports,
  };
}

// ============================================================================
// RE-EXPORT COUNTING
// ============================================================================

function countReExports(filePath: string): IndexAnalysis {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const reExports: string[] = [];

  for (const line of lines) {
    // export * from './module'
    const starReExport = line.match(/export\s+\*\s+from\s+['"]([^'"]+)['"]/);
    if (starReExport) {
      reExports.push(`* from ${starReExport[1]}`);
      continue;
    }

    // export { ... } from './module'
    const namedReExport = line.match(/export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
    if (namedReExport) {
      const names = namedReExport[1].split(',').map(n => n.trim().split(' ')[0]);
      reExports.push(...names.filter(n => n));
    }
  }

  return {
    file: relative(ROOT_DIR, filePath),
    reExportCount: reExports.length,
    reExports,
  };
}

// ============================================================================
// DIRECTORY ANALYSIS
// ============================================================================

function analyzeDirectory(dirPath: string): DirectoryAnalysis {
  const files: string[] = [];

  try {
    const entries = readdirSync(dirPath);
    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      if (shouldIgnore(fullPath)) continue;

      const stat = statSync(fullPath);
      if (stat.isFile() && entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
        files.push(entry);
      }
    }
  } catch {
    // Ignore errors
  }

  return {
    directory: relative(ROOT_DIR, dirPath),
    fileCount: files.length,
    files,
  };
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport(files: string[], directories: string[]): CohesionReport {
  // Analyze file exports
  const fileAnalyses: FileExportAnalysis[] = [];
  let totalExports = 0;

  for (const file of files) {
    const analysis = countExports(file);
    fileAnalyses.push(analysis);
    totalExports += analysis.exportCount;
  }

  // Find god files (too many exports)
  const godFiles = fileAnalyses
    .filter(a => a.exportCount > THRESHOLDS.maxExportsPerFile)
    .sort((a, b) => b.exportCount - a.exportCount);

  // Analyze directories
  const dirAnalyses: DirectoryAnalysis[] = [];
  for (const dir of directories) {
    const analysis = analyzeDirectory(dir);
    if (analysis.fileCount > 0) {
      dirAnalyses.push(analysis);
    }
  }

  // Find large directories
  const largeDirectories = dirAnalyses
    .filter(d => d.fileCount > THRESHOLDS.maxFilesPerDirectory)
    .filter(d => !isAllowedLargeDir(join(ROOT_DIR, d.directory)))
    .sort((a, b) => b.fileCount - a.fileCount);

  // Analyze index files
  const indexFiles = files.filter(f => basename(f) === 'index.ts');
  const indexAnalyses: IndexAnalysis[] = [];
  for (const indexFile of indexFiles) {
    const analysis = countReExports(indexFile);
    indexAnalyses.push(analysis);
  }

  // Find heavy index files
  const heavyIndexFiles = indexAnalyses
    .filter(a => a.reExportCount > THRESHOLDS.maxIndexReExports)
    .sort((a, b) => b.reExportCount - a.reExportCount);

  return {
    godFiles,
    largeDirectories,
    heavyIndexFiles,
    totalFiles: files.length,
    totalDirectories: directories.length,
    averageExportsPerFile: Math.round(totalExports / files.length),
  };
}

// ============================================================================
// REPORTING
// ============================================================================

function printReport(report: CohesionReport): void {
  console.log('\n======================================================================');
  console.log('  MODULE COHESION REPORT');
  console.log('======================================================================\n');

  console.log(`📊 Summary`);
  console.log('----------------------------------------------------------------------');
  console.log(`  Total files: ${report.totalFiles}`);
  console.log(`  Total directories: ${report.totalDirectories}`);
  console.log(`  Average exports per file: ${report.averageExportsPerFile}`);
  console.log(`  "God files" (>${THRESHOLDS.maxExportsPerFile} exports): ${report.godFiles.length}`);
  console.log(`  Large directories (>${THRESHOLDS.maxFilesPerDirectory} files): ${report.largeDirectories.length}`);
  console.log(`  Heavy index files (>${THRESHOLDS.maxIndexReExports} re-exports): ${report.heavyIndexFiles.length}`);
  console.log();

  if (report.godFiles.length > 0) {
    console.log(`⚠️  God Files (>${THRESHOLDS.maxExportsPerFile} exports)`);
    console.log('----------------------------------------------------------------------');
    for (const analysis of report.godFiles.slice(0, 15)) {
      console.log(`  ${analysis.exportCount} exports: ${analysis.file}`);
    }
    if (report.godFiles.length > 15) {
      console.log(`  ... and ${report.godFiles.length - 15} more`);
    }
    console.log();
  }

  if (report.largeDirectories.length > 0) {
    console.log(`📁 Large Directories (>${THRESHOLDS.maxFilesPerDirectory} files)`);
    console.log('----------------------------------------------------------------------');
    for (const analysis of report.largeDirectories.slice(0, 10)) {
      console.log(`  ${analysis.fileCount} files: ${analysis.directory}`);
    }
    if (report.largeDirectories.length > 10) {
      console.log(`  ... and ${report.largeDirectories.length - 10} more`);
    }
    console.log();
  }

  if (report.heavyIndexFiles.length > 0) {
    console.log(`📦 Heavy Index Files (>${THRESHOLDS.maxIndexReExports} re-exports)`);
    console.log('----------------------------------------------------------------------');
    for (const analysis of report.heavyIndexFiles.slice(0, 10)) {
      console.log(`  ${analysis.reExportCount} re-exports: ${analysis.file}`);
    }
    if (report.heavyIndexFiles.length > 10) {
      console.log(`  ... and ${report.heavyIndexFiles.length - 10} more`);
    }
    console.log();
  }

  // Status
  const totalIssues = report.godFiles.length + report.largeDirectories.length;
  const hasBlockingIssues = totalIssues > THRESHOLDS.maxGodModules;

  console.log('======================================================================');
  if (hasBlockingIssues) {
    console.log('  STATUS: FAILED');
    console.log('----------------------------------------------------------------------');
    console.log(`  ✗ Too many low-cohesion modules: ${totalIssues}`);
    console.log(`    Maximum allowed: ${THRESHOLDS.maxGodModules}`);
  } else {
    console.log('  STATUS: PASSED');
  }
  console.log('======================================================================\n');
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  console.log('Analyzing module cohesion...\n');

  const files = getAllTypeScriptFiles(SRC_DIR);
  const directories = getAllDirectories(SRC_DIR);
  const report = generateReport(files, directories);

  printReport(report);

  const totalIssues = report.godFiles.length + report.largeDirectories.length;
  const hasBlockingIssues = totalIssues > THRESHOLDS.maxGodModules;

  process.exit(hasBlockingIssues ? 1 : 0);
}

main();
