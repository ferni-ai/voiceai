#!/usr/bin/env npx tsx
/**
 * Naming Convention Check Script
 *
 * Validates naming conventions across the codebase:
 * - File naming: kebab-case.ts
 * - Class naming: PascalCase
 * - Function naming: camelCase
 * - Constant naming: SCREAMING_SNAKE_CASE
 * - Boolean naming: is/has/can/should prefix
 *
 * Run: npx tsx scripts/naming-check.ts
 * Exit codes: 0 = pass, 1 = fail (blocking issues found)
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, basename } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ROOT_DIR = join(import.meta.dirname, '..', '..', '..', '..', '..');
const SRC_DIR = join(ROOT_DIR, 'src');

const THRESHOLDS = {
  maxFileNamingViolations: 10,
  maxCodeNamingViolations: 50,
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

// Known exceptions (legacy or external conventions)
const FILE_NAME_EXCEPTIONS = [
  'CLAUDE.md',
  'README.md',
  'Dockerfile',
  '.generated.',
];

const CODE_NAME_EXCEPTIONS = [
  // Common abbreviations
  'ID', 'URL', 'API', 'JSON', 'HTML', 'CSS', 'SQL', 'UUID',
  // Library conventions
  'onClick', 'onChange', 'onSubmit', 'onLoad', 'onError',
];

// ============================================================================
// TYPES
// ============================================================================

interface NamingViolation {
  file: string;
  line?: number;
  name: string;
  expected: string;
  actual: string;
  type: 'file' | 'class' | 'function' | 'constant' | 'boolean' | 'variable';
}

interface NamingReport {
  fileViolations: NamingViolation[];
  codeViolations: NamingViolation[];
  totalFilesScanned: number;
  totalViolations: number;
}

// ============================================================================
// NAMING VALIDATORS
// ============================================================================

function isKebabCase(name: string): boolean {
  // Remove extension
  const baseName = name.replace(/\.[^.]+$/, '');
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(baseName);
}

function isPascalCase(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

function isCamelCase(name: string): boolean {
  return /^[a-z][a-zA-Z0-9]*$/.test(name);
}

function isScreamingSnakeCase(name: string): boolean {
  return /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(name);
}

function hasBooleanPrefix(name: string): boolean {
  return /^(is|has|can|should|will|did|was)[A-Z]/.test(name);
}

function isException(name: string): boolean {
  return CODE_NAME_EXCEPTIONS.some(ex => name.includes(ex));
}

// ============================================================================
// FILE SCANNING
// ============================================================================

function shouldIgnore(filePath: string): boolean {
  return IGNORE_PATTERNS.some(pattern => filePath.includes(pattern));
}

function isFileException(fileName: string): boolean {
  return FILE_NAME_EXCEPTIONS.some(ex => fileName.includes(ex));
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
// CODE ANALYSIS
// ============================================================================

function analyzeFile(filePath: string): NamingViolation[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations: NamingViolation[] = [];
  const relativePath = relative(ROOT_DIR, filePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    // Check class names (should be PascalCase)
    const classMatch = line.match(/class\s+(\w+)/);
    if (classMatch) {
      const name = classMatch[1];
      if (!isPascalCase(name) && !isException(name)) {
        violations.push({
          file: relativePath,
          line: lineNum,
          name,
          expected: 'PascalCase',
          actual: 'invalid',
          type: 'class',
        });
      }
    }

    // Check interface/type names (should be PascalCase)
    const typeMatch = line.match(/(?:interface|type)\s+(\w+)/);
    if (typeMatch) {
      const name = typeMatch[1];
      if (!isPascalCase(name) && !isException(name)) {
        violations.push({
          file: relativePath,
          line: lineNum,
          name,
          expected: 'PascalCase',
          actual: 'invalid',
          type: 'class',
        });
      }
    }

    // Check function names (should be camelCase)
    const funcMatch = line.match(/function\s+(\w+)/);
    if (funcMatch) {
      const name = funcMatch[1];
      if (!isCamelCase(name) && !isException(name)) {
        violations.push({
          file: relativePath,
          line: lineNum,
          name,
          expected: 'camelCase',
          actual: 'invalid',
          type: 'function',
        });
      }
    }

    // Check const at module level that look like constants (ALL_CAPS)
    const constMatch = line.match(/^(?:export\s+)?const\s+([A-Z][A-Z_0-9]*)\s*=/);
    if (constMatch) {
      const name = constMatch[1];
      if (!isScreamingSnakeCase(name) && name.length > 2) {
        // It's trying to be a constant but doesn't follow convention
        violations.push({
          file: relativePath,
          line: lineNum,
          name,
          expected: 'SCREAMING_SNAKE_CASE',
          actual: 'invalid',
          type: 'constant',
        });
      }
    }

    // Check boolean variables/parameters (should have is/has/can/should prefix)
    // Look for explicit boolean type annotations
    const boolVarMatch = line.match(/(?:const|let|var)\s+(\w+)\s*:\s*boolean/);
    if (boolVarMatch) {
      const name = boolVarMatch[1];
      if (!hasBooleanPrefix(name) && !isException(name) && !name.startsWith('_')) {
        violations.push({
          file: relativePath,
          line: lineNum,
          name,
          expected: 'is/has/can/should prefix',
          actual: name,
          type: 'boolean',
        });
      }
    }

    // Check function parameters with boolean type
    const boolParamMatch = line.match(/(\w+)\s*:\s*boolean(?:\s*[,)])/g);
    if (boolParamMatch) {
      for (const match of boolParamMatch) {
        const paramName = match.match(/(\w+)\s*:/)?.[1];
        if (paramName && !hasBooleanPrefix(paramName) && !isException(paramName)) {
          violations.push({
            file: relativePath,
            line: lineNum,
            name: paramName,
            expected: 'is/has/can/should prefix',
            actual: paramName,
            type: 'boolean',
          });
        }
      }
    }
  }

  return violations;
}

function checkFileName(filePath: string): NamingViolation | null {
  const fileName = basename(filePath);
  const relativePath = relative(ROOT_DIR, filePath);

  if (isFileException(fileName)) {
    return null;
  }

  // Check if file is kebab-case
  if (!isKebabCase(fileName)) {
    // Allow PascalCase for class files (single class per file convention)
    const baseName = fileName.replace(/\.ts$/, '');
    if (isPascalCase(baseName)) {
      return null; // PascalCase allowed for class files
    }

    return {
      file: relativePath,
      name: fileName,
      expected: 'kebab-case.ts',
      actual: fileName,
      type: 'file',
    };
  }

  return null;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport(files: string[]): NamingReport {
  const fileViolations: NamingViolation[] = [];
  const codeViolations: NamingViolation[] = [];

  for (const file of files) {
    // Check file name
    const fileViolation = checkFileName(file);
    if (fileViolation) {
      fileViolations.push(fileViolation);
    }

    // Check code naming
    const violations = analyzeFile(file);
    codeViolations.push(...violations);
  }

  return {
    fileViolations,
    codeViolations,
    totalFilesScanned: files.length,
    totalViolations: fileViolations.length + codeViolations.length,
  };
}

// ============================================================================
// REPORTING
// ============================================================================

function printReport(report: NamingReport): void {
  console.log('\n======================================================================');
  console.log('  NAMING CONVENTION REPORT');
  console.log('======================================================================\n');

  console.log(`📊 Summary`);
  console.log('----------------------------------------------------------------------');
  console.log(`  Files scanned: ${report.totalFilesScanned}`);
  console.log(`  File naming violations: ${report.fileViolations.length}`);
  console.log(`  Code naming violations: ${report.codeViolations.length}`);
  console.log(`  Total violations: ${report.totalViolations}`);
  console.log();

  console.log(`📋 Naming Conventions`);
  console.log('----------------------------------------------------------------------');
  console.log('  Files:     kebab-case.ts (or PascalCase.ts for class files)');
  console.log('  Classes:   PascalCase');
  console.log('  Functions: camelCase');
  console.log('  Constants: SCREAMING_SNAKE_CASE');
  console.log('  Booleans:  is/has/can/should prefix');
  console.log();

  if (report.fileViolations.length > 0) {
    console.log(`📁 File Naming Violations (${report.fileViolations.length})`);
    console.log('----------------------------------------------------------------------');
    for (const v of report.fileViolations.slice(0, 15)) {
      console.log(`  ${v.name}`);
      console.log(`    Expected: ${v.expected}`);
    }
    if (report.fileViolations.length > 15) {
      console.log(`  ... and ${report.fileViolations.length - 15} more`);
    }
    console.log();
  }

  if (report.codeViolations.length > 0) {
    console.log(`📝 Code Naming Violations (${report.codeViolations.length})`);
    console.log('----------------------------------------------------------------------');

    // Group by type
    const byType = new Map<string, NamingViolation[]>();
    for (const v of report.codeViolations) {
      if (!byType.has(v.type)) {
        byType.set(v.type, []);
      }
      byType.get(v.type)!.push(v);
    }

    for (const [type, violations] of byType) {
      console.log(`  ${type} (${violations.length}):`);
      for (const v of violations.slice(0, 5)) {
        console.log(`    ${v.name} at ${v.file}:${v.line}`);
        console.log(`      Expected: ${v.expected}`);
      }
      if (violations.length > 5) {
        console.log(`    ... and ${violations.length - 5} more`);
      }
    }
    console.log();
  }

  // Status
  const hasBlockingIssues =
    report.fileViolations.length > THRESHOLDS.maxFileNamingViolations ||
    report.codeViolations.length > THRESHOLDS.maxCodeNamingViolations;

  console.log('======================================================================');
  if (hasBlockingIssues) {
    console.log('  STATUS: FAILED');
    console.log('----------------------------------------------------------------------');
    if (report.fileViolations.length > THRESHOLDS.maxFileNamingViolations) {
      console.log(`  ✗ File naming violations (${report.fileViolations.length}) > ${THRESHOLDS.maxFileNamingViolations}`);
    }
    if (report.codeViolations.length > THRESHOLDS.maxCodeNamingViolations) {
      console.log(`  ✗ Code naming violations (${report.codeViolations.length}) > ${THRESHOLDS.maxCodeNamingViolations}`);
    }
  } else {
    console.log('  STATUS: PASSED');
    if (report.totalViolations > 0) {
      console.log('----------------------------------------------------------------------');
      console.log(`  ⚠ ${report.totalViolations} naming violations found (not blocking)`);
    }
  }
  console.log('======================================================================\n');
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  console.log('Checking naming conventions...\n');

  const files = getAllTypeScriptFiles(SRC_DIR);
  const report = generateReport(files);

  printReport(report);

  const hasBlockingIssues =
    report.fileViolations.length > THRESHOLDS.maxFileNamingViolations ||
    report.codeViolations.length > THRESHOLDS.maxCodeNamingViolations;

  process.exit(hasBlockingIssues ? 1 : 0);
}

main();
