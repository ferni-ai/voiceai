#!/usr/bin/env npx tsx
/**
 * Dead Code Detection Script
 *
 * Finds unused exports, functions, and types that bloat the codebase:
 * - Exported functions never imported elsewhere
 * - Types defined but never used
 * - Files not imported by any other file
 *
 * Run: npx tsx scripts/dead-code-check.ts
 * Exit codes: 0 = pass, 1 = fail (blocking issues found)
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, basename, dirname } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ROOT_DIR = join(import.meta.dirname, '..', '..', '..', '..', '..');
const SRC_DIR = join(ROOT_DIR, 'src');

const THRESHOLDS = {
  maxUnusedExports: 50,      // Allow some unused exports (public API)
  maxOrphanFiles: 10,        // Files not imported anywhere
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
  'index.ts',              // Index files are entry points
  'types.ts',              // Type files may be used externally
  '/cli/',                 // CLI entry points
  '/api/',                 // API route handlers
];

// Files that are entry points (not expected to be imported)
const ENTRY_POINTS = [
  'src/agents/realtime/index.ts',
  'src/agents/voice-agent/index.ts',
  'src/index.ts',
  'token-server.js',
  'ui-server.js',
];

// Exports that are intentionally public API (may not be used internally)
const PUBLIC_API_PATTERNS = [
  /^export (type|interface) /,  // Type exports
  /^export default/,            // Default exports
];

// ============================================================================
// TYPES
// ============================================================================

interface ExportInfo {
  name: string;
  file: string;
  line: number;
  type: 'function' | 'const' | 'class' | 'type' | 'interface' | 'default';
}

interface ImportInfo {
  imported: string[];
  fromFile: string;
  toFile: string;
}

interface DeadCodeReport {
  unusedExports: ExportInfo[];
  orphanFiles: string[];
  totalExports: number;
  totalFiles: number;
}

// ============================================================================
// FILE SCANNING
// ============================================================================

function shouldIgnore(filePath: string): boolean {
  return IGNORE_PATTERNS.some(pattern => filePath.includes(pattern));
}

function isEntryPoint(filePath: string): boolean {
  const relativePath = relative(ROOT_DIR, filePath);
  return ENTRY_POINTS.some(entry => relativePath.includes(entry));
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
// EXPORT DETECTION
// ============================================================================

function extractExports(filePath: string): ExportInfo[] {
  const exports: ExportInfo[] = [];
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    // export function name
    const funcMatch = line.match(/^export\s+(?:async\s+)?function\s+(\w+)/);
    if (funcMatch) {
      exports.push({ name: funcMatch[1], file: filePath, line: lineNum, type: 'function' });
      continue;
    }

    // export const name
    const constMatch = line.match(/^export\s+const\s+(\w+)/);
    if (constMatch) {
      exports.push({ name: constMatch[1], file: filePath, line: lineNum, type: 'const' });
      continue;
    }

    // export class name
    const classMatch = line.match(/^export\s+class\s+(\w+)/);
    if (classMatch) {
      exports.push({ name: classMatch[1], file: filePath, line: lineNum, type: 'class' });
      continue;
    }

    // export type name or export interface name
    const typeMatch = line.match(/^export\s+(?:type|interface)\s+(\w+)/);
    if (typeMatch) {
      exports.push({ name: typeMatch[1], file: filePath, line: lineNum, type: 'type' });
      continue;
    }

    // export default
    if (line.match(/^export\s+default/)) {
      exports.push({ name: 'default', file: filePath, line: lineNum, type: 'default' });
      continue;
    }

    // export { name1, name2 }
    const namedExportMatch = line.match(/^export\s+\{([^}]+)\}/);
    if (namedExportMatch) {
      const names = namedExportMatch[1].split(',').map(n => n.trim().split(' ')[0]);
      for (const name of names) {
        if (name && !name.startsWith('type ')) {
          exports.push({ name, file: filePath, line: lineNum, type: 'const' });
        }
      }
    }
  }

  return exports;
}

// ============================================================================
// IMPORT DETECTION
// ============================================================================

function extractImports(filePath: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (const line of lines) {
    // import { x, y } from './module'
    const namedImportMatch = line.match(/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
    if (namedImportMatch) {
      const names = namedImportMatch[1]
        .split(',')
        .map(n => n.trim().split(' as ')[0].replace('type ', ''))
        .filter(n => n);
      const fromModule = namedImportMatch[2];
      imports.push({ imported: names, fromFile: filePath, toFile: fromModule });
      continue;
    }

    // import name from './module'
    const defaultImportMatch = line.match(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
    if (defaultImportMatch) {
      imports.push({
        imported: [defaultImportMatch[1], 'default'],
        fromFile: filePath,
        toFile: defaultImportMatch[2],
      });
      continue;
    }

    // import * as name from './module'
    const namespaceImportMatch = line.match(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
    if (namespaceImportMatch) {
      imports.push({
        imported: ['*'],  // Namespace import uses all exports
        fromFile: filePath,
        toFile: namespaceImportMatch[2],
      });
      continue;
    }

    // Dynamic import: import('./module')
    const dynamicImportMatch = line.match(/import\(['"]([^'"]+)['"]\)/);
    if (dynamicImportMatch) {
      imports.push({
        imported: ['*'],  // Dynamic import potentially uses all exports
        fromFile: filePath,
        toFile: dynamicImportMatch[1],
      });
    }
  }

  return imports;
}

// ============================================================================
// ANALYSIS
// ============================================================================

function resolveImportPath(fromFile: string, importPath: string): string | null {
  // Skip external packages
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return null;
  }

  const fromDir = dirname(fromFile);
  let resolved = join(fromDir, importPath);

  // Handle .js extension (TypeScript imports)
  if (resolved.endsWith('.js')) {
    resolved = resolved.replace(/\.js$/, '.ts');
  }

  // Try adding .ts extension
  if (!resolved.endsWith('.ts')) {
    if (existsSync(resolved + '.ts')) {
      resolved = resolved + '.ts';
    } else if (existsSync(join(resolved, 'index.ts'))) {
      resolved = join(resolved, 'index.ts');
    }
  }

  return existsSync(resolved) ? resolved : null;
}

function analyzeDeadCode(files: string[]): DeadCodeReport {
  // Collect all exports
  const allExports: ExportInfo[] = [];
  for (const file of files) {
    const exports = extractExports(file);
    allExports.push(...exports);
  }

  // Collect all imports
  const allImports: ImportInfo[] = [];
  const importedFiles = new Set<string>();

  for (const file of files) {
    const imports = extractImports(file);
    allImports.push(...imports);

    // Track which files are imported
    for (const imp of imports) {
      const resolved = resolveImportPath(file, imp.toFile);
      if (resolved) {
        importedFiles.add(resolved);
      }
    }
  }

  // Build a set of all imported names per file
  const importedNames = new Map<string, Set<string>>();
  for (const imp of allImports) {
    const resolved = resolveImportPath(imp.fromFile, imp.toFile);
    if (resolved) {
      if (!importedNames.has(resolved)) {
        importedNames.set(resolved, new Set());
      }
      const names = importedNames.get(resolved)!;
      for (const name of imp.imported) {
        names.add(name);
      }
    }
  }

  // Find unused exports
  const unusedExports: ExportInfo[] = [];
  for (const exp of allExports) {
    const fileImports = importedNames.get(exp.file);

    // Skip if file has namespace import (uses all exports)
    if (fileImports?.has('*')) continue;

    // Skip default exports (often used externally)
    if (exp.type === 'default') continue;

    // Skip type exports (hard to track usage)
    if (exp.type === 'type' || exp.type === 'interface') continue;

    // Check if this export is imported anywhere
    if (!fileImports?.has(exp.name)) {
      unusedExports.push(exp);
    }
  }

  // Find orphan files (not imported anywhere)
  const orphanFiles: string[] = [];
  for (const file of files) {
    if (isEntryPoint(file)) continue;
    if (file.includes('index.ts')) continue;  // Index files are entry points

    if (!importedFiles.has(file)) {
      orphanFiles.push(relative(ROOT_DIR, file));
    }
  }

  return {
    unusedExports,
    orphanFiles,
    totalExports: allExports.length,
    totalFiles: files.length,
  };
}

// ============================================================================
// REPORTING
// ============================================================================

function printReport(report: DeadCodeReport): void {
  console.log('\n======================================================================');
  console.log('  DEAD CODE DETECTION REPORT');
  console.log('======================================================================\n');

  console.log(`📊 Summary`);
  console.log('----------------------------------------------------------------------');
  console.log(`  Total files scanned: ${report.totalFiles}`);
  console.log(`  Total exports found: ${report.totalExports}`);
  console.log(`  Potentially unused exports: ${report.unusedExports.length}`);
  console.log(`  Orphan files (not imported): ${report.orphanFiles.length}`);
  console.log();

  if (report.unusedExports.length > 0) {
    console.log(`⚠️  Potentially Unused Exports (${report.unusedExports.length})`);
    console.log('----------------------------------------------------------------------');

    // Group by file
    const byFile = new Map<string, ExportInfo[]>();
    for (const exp of report.unusedExports) {
      const relPath = relative(ROOT_DIR, exp.file);
      if (!byFile.has(relPath)) {
        byFile.set(relPath, []);
      }
      byFile.get(relPath)!.push(exp);
    }

    // Show top 20
    let shown = 0;
    for (const [file, exports] of byFile) {
      if (shown >= 20) {
        console.log(`  ... and ${report.unusedExports.length - shown} more`);
        break;
      }
      console.log(`  ${file}:`);
      for (const exp of exports.slice(0, 5)) {
        console.log(`    - ${exp.name} (${exp.type}, line ${exp.line})`);
        shown++;
      }
      if (exports.length > 5) {
        console.log(`    ... and ${exports.length - 5} more in this file`);
        shown += exports.length - 5;
      }
    }
    console.log();
  }

  if (report.orphanFiles.length > 0) {
    console.log(`📁 Orphan Files (${report.orphanFiles.length})`);
    console.log('----------------------------------------------------------------------');
    for (const file of report.orphanFiles.slice(0, 15)) {
      console.log(`  - ${file}`);
    }
    if (report.orphanFiles.length > 15) {
      console.log(`  ... and ${report.orphanFiles.length - 15} more`);
    }
    console.log();
  }

  // Status
  const hasBlockingIssues =
    report.unusedExports.length > THRESHOLDS.maxUnusedExports ||
    report.orphanFiles.length > THRESHOLDS.maxOrphanFiles;

  console.log('======================================================================');
  if (hasBlockingIssues) {
    console.log('  STATUS: FAILED');
    console.log('----------------------------------------------------------------------');
    if (report.unusedExports.length > THRESHOLDS.maxUnusedExports) {
      console.log(`  ✗ Unused exports (${report.unusedExports.length}) exceeds threshold (${THRESHOLDS.maxUnusedExports})`);
    }
    if (report.orphanFiles.length > THRESHOLDS.maxOrphanFiles) {
      console.log(`  ✗ Orphan files (${report.orphanFiles.length}) exceeds threshold (${THRESHOLDS.maxOrphanFiles})`);
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
  console.log('Scanning for dead code...\n');

  const files = getAllTypeScriptFiles(SRC_DIR);
  const report = analyzeDeadCode(files);

  printReport(report);

  const hasBlockingIssues =
    report.unusedExports.length > THRESHOLDS.maxUnusedExports ||
    report.orphanFiles.length > THRESHOLDS.maxOrphanFiles;

  process.exit(hasBlockingIssues ? 1 : 0);
}

main();
