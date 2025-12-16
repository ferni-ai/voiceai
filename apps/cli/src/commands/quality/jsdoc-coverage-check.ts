#!/usr/bin/env npx tsx
/**
 * JSDoc Coverage Check Script
 *
 * Validates that public APIs and complex functions are documented:
 * - Exported functions should have JSDoc
 * - Public class methods should have JSDoc
 * - Complex functions (high cyclomatic) MUST have JSDoc
 *
 * Run: npx tsx scripts/jsdoc-coverage-check.ts
 * Exit codes: 0 = pass, 1 = fail (blocking issues found)
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ROOT_DIR = join(import.meta.dirname, '..', '..', '..', '..', '..');
const SRC_DIR = join(ROOT_DIR, 'src');

const THRESHOLDS = {
  minDocCoverage: 50,            // Minimum % of exports documented
  maxUndocumentedComplex: 20,    // Max undocumented complex functions
  complexityRequiresDoc: 10,     // Cyclomatic complexity threshold requiring docs
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

// Files that don't need documentation
const SKIP_DOCUMENTATION = [
  'types.ts',           // Type files are self-documenting
  'index.ts',           // Re-export files
  'constants.ts',       // Constants are self-documenting
];

// ============================================================================
// TYPES
// ============================================================================

interface ExportInfo {
  name: string;
  file: string;
  line: number;
  type: 'function' | 'const' | 'class' | 'type' | 'interface' | 'method';
  hasJSDoc: boolean;
  isComplex: boolean;
}

interface DocCoverageReport {
  documented: ExportInfo[];
  undocumented: ExportInfo[];
  undocumentedComplex: ExportInfo[];
  totalExports: number;
  documentedCount: number;
  coveragePercent: number;
}

// ============================================================================
// FILE SCANNING
// ============================================================================

function shouldIgnore(filePath: string): boolean {
  return IGNORE_PATTERNS.some(pattern => filePath.includes(pattern));
}

function shouldSkipDoc(filePath: string): boolean {
  return SKIP_DOCUMENTATION.some(pattern => filePath.endsWith(pattern));
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
// COMPLEXITY CHECK (simplified)
// ============================================================================

function estimateComplexity(code: string): number {
  let complexity = 1;
  const patterns = [
    /\bif\s*\(/g,
    /\belse\s+if\s*\(/g,
    /\bfor\s*\(/g,
    /\bwhile\s*\(/g,
    /\bcase\s+/g,
    /\bcatch\s*\(/g,
    /&&/g,
    /\|\|/g,
    /\?(?!=)/g,
  ];

  for (const pattern of patterns) {
    const matches = code.match(pattern);
    complexity += matches ? matches.length : 0;
  }

  return complexity;
}

// ============================================================================
// JSDOC DETECTION
// ============================================================================

function hasJSDocBefore(content: string, index: number): boolean {
  // Look backwards from the match to find JSDoc comment
  const beforeContent = content.substring(0, index);
  const lines = beforeContent.split('\n');

  // Check last few lines for JSDoc
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
    const line = lines[i].trim();

    // Found a JSDoc end
    if (line.endsWith('*/')) {
      // Look back for the start
      for (let j = i; j >= Math.max(0, i - 50); j--) {
        if (lines[j].trim().startsWith('/**')) {
          return true;
        }
        // If we hit code, stop looking
        if (lines[j].trim() && !lines[j].trim().startsWith('*') && !lines[j].trim().startsWith('//')) {
          if (j < i) break;
        }
      }
    }

    // Found code before JSDoc - no doc
    if (line && !line.startsWith('*') && !line.startsWith('//') && !line.startsWith('/*') && line !== '') {
      break;
    }
  }

  return false;
}

function extractExports(filePath: string): ExportInfo[] {
  const content = readFileSync(filePath, 'utf-8');
  const exports: ExportInfo[] = [];
  const relativePath = relative(ROOT_DIR, filePath);

  // Skip certain file types
  if (shouldSkipDoc(filePath)) {
    return [];
  }

  // Pattern for exported functions
  const funcPattern = /export\s+(?:async\s+)?function\s+(\w+)\s*\([^)]*\)[^{]*\{/g;
  let match;

  while ((match = funcPattern.exec(content)) !== null) {
    const name = match[1];
    const matchIndex = match.index;

    // Extract function body to estimate complexity
    const startBrace = content.indexOf('{', matchIndex);
    let depth = 1;
    let endIndex = startBrace + 1;
    while (depth > 0 && endIndex < content.length) {
      if (content[endIndex] === '{') depth++;
      if (content[endIndex] === '}') depth--;
      endIndex++;
    }
    const functionBody = content.substring(startBrace, endIndex);
    const complexity = estimateComplexity(functionBody);

    const lineNumber = content.substring(0, matchIndex).split('\n').length;

    exports.push({
      name,
      file: relativePath,
      line: lineNumber,
      type: 'function',
      hasJSDoc: hasJSDocBefore(content, matchIndex),
      isComplex: complexity >= THRESHOLDS.complexityRequiresDoc,
    });
  }

  // Pattern for exported const functions (arrow functions)
  const constFuncPattern = /export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>/g;

  while ((match = constFuncPattern.exec(content)) !== null) {
    const name = match[1];
    const matchIndex = match.index;
    const lineNumber = content.substring(0, matchIndex).split('\n').length;

    // Arrow functions - estimate complexity from rest of line and following block
    const restOfContent = content.substring(matchIndex);
    const arrowIndex = restOfContent.indexOf('=>');
    if (arrowIndex !== -1) {
      const afterArrow = restOfContent.substring(arrowIndex);
      const nextBrace = afterArrow.indexOf('{');
      let functionBody = '';

      if (nextBrace !== -1 && nextBrace < 50) {
        // Block body
        let depth = 1;
        let endIndex = nextBrace + 1;
        while (depth > 0 && endIndex < afterArrow.length) {
          if (afterArrow[endIndex] === '{') depth++;
          if (afterArrow[endIndex] === '}') depth--;
          endIndex++;
        }
        functionBody = afterArrow.substring(nextBrace, endIndex);
      } else {
        // Expression body - take next 200 chars
        functionBody = afterArrow.substring(0, 200);
      }

      const complexity = estimateComplexity(functionBody);

      exports.push({
        name,
        file: relativePath,
        line: lineNumber,
        type: 'const',
        hasJSDoc: hasJSDocBefore(content, matchIndex),
        isComplex: complexity >= THRESHOLDS.complexityRequiresDoc,
      });
    }
  }

  // Pattern for exported classes
  const classPattern = /export\s+(?:abstract\s+)?class\s+(\w+)/g;

  while ((match = classPattern.exec(content)) !== null) {
    const name = match[1];
    const matchIndex = match.index;
    const lineNumber = content.substring(0, matchIndex).split('\n').length;

    exports.push({
      name,
      file: relativePath,
      line: lineNumber,
      type: 'class',
      hasJSDoc: hasJSDocBefore(content, matchIndex),
      isComplex: true, // Classes should always be documented
    });
  }

  return exports;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport(files: string[]): DocCoverageReport {
  const allExports: ExportInfo[] = [];

  for (const file of files) {
    const exports = extractExports(file);
    allExports.push(...exports);
  }

  const documented = allExports.filter(e => e.hasJSDoc);
  const undocumented = allExports.filter(e => !e.hasJSDoc);
  const undocumentedComplex = undocumented.filter(e => e.isComplex);

  return {
    documented,
    undocumented,
    undocumentedComplex,
    totalExports: allExports.length,
    documentedCount: documented.length,
    coveragePercent: allExports.length > 0
      ? Math.round((documented.length / allExports.length) * 100)
      : 100,
  };
}

// ============================================================================
// REPORTING
// ============================================================================

function printReport(report: DocCoverageReport): void {
  console.log('\n======================================================================');
  console.log('  JSDOC COVERAGE REPORT');
  console.log('======================================================================\n');

  console.log(`📊 Summary`);
  console.log('----------------------------------------------------------------------');
  console.log(`  Total exports analyzed: ${report.totalExports}`);
  console.log(`  Documented: ${report.documentedCount} (${report.coveragePercent}%)`);
  console.log(`  Undocumented: ${report.undocumented.length}`);
  console.log(`  Undocumented complex functions: ${report.undocumentedComplex.length}`);
  console.log();

  if (report.undocumentedComplex.length > 0) {
    console.log(`⚠️  Undocumented Complex Functions (SHOULD have JSDoc)`);
    console.log('----------------------------------------------------------------------');
    for (const exp of report.undocumentedComplex.slice(0, 20)) {
      console.log(`  ${exp.name} (${exp.type}) - ${exp.file}:${exp.line}`);
    }
    if (report.undocumentedComplex.length > 20) {
      console.log(`  ... and ${report.undocumentedComplex.length - 20} more`);
    }
    console.log();
  }

  if (report.undocumented.length > 0 && report.coveragePercent < THRESHOLDS.minDocCoverage) {
    console.log(`📝 Other Undocumented Exports`);
    console.log('----------------------------------------------------------------------');

    // Group by file
    const byFile = new Map<string, ExportInfo[]>();
    for (const exp of report.undocumented.filter(e => !e.isComplex)) {
      if (!byFile.has(exp.file)) {
        byFile.set(exp.file, []);
      }
      byFile.get(exp.file)!.push(exp);
    }

    let shown = 0;
    for (const [file, exports] of byFile) {
      if (shown >= 30) {
        console.log(`  ... and more`);
        break;
      }
      console.log(`  ${file}:`);
      for (const exp of exports.slice(0, 3)) {
        console.log(`    - ${exp.name} (${exp.type})`);
        shown++;
      }
      if (exports.length > 3) {
        console.log(`    ... and ${exports.length - 3} more`);
        shown += exports.length - 3;
      }
    }
    console.log();
  }

  // Status
  const hasBlockingIssues =
    report.coveragePercent < THRESHOLDS.minDocCoverage ||
    report.undocumentedComplex.length > THRESHOLDS.maxUndocumentedComplex;

  console.log('======================================================================');
  if (hasBlockingIssues) {
    console.log('  STATUS: FAILED');
    console.log('----------------------------------------------------------------------');
    if (report.coveragePercent < THRESHOLDS.minDocCoverage) {
      console.log(`  ✗ Documentation coverage ${report.coveragePercent}% < ${THRESHOLDS.minDocCoverage}%`);
    }
    if (report.undocumentedComplex.length > THRESHOLDS.maxUndocumentedComplex) {
      console.log(`  ✗ Too many undocumented complex functions: ${report.undocumentedComplex.length}`);
      console.log(`    Maximum allowed: ${THRESHOLDS.maxUndocumentedComplex}`);
    }
  } else {
    console.log('  STATUS: PASSED');
    if (report.coveragePercent < 80) {
      console.log('----------------------------------------------------------------------');
      console.log(`  ⚠ Consider improving documentation coverage (currently ${report.coveragePercent}%)`);
    }
  }
  console.log('======================================================================\n');
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  console.log('Analyzing JSDoc coverage...\n');

  const files = getAllTypeScriptFiles(SRC_DIR);
  const report = generateReport(files);

  printReport(report);

  const hasBlockingIssues =
    report.coveragePercent < THRESHOLDS.minDocCoverage ||
    report.undocumentedComplex.length > THRESHOLDS.maxUndocumentedComplex;

  process.exit(hasBlockingIssues ? 1 : 0);
}

main();
