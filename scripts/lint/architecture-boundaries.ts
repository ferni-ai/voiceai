#!/usr/bin/env npx tsx
/**
 * Architecture Boundaries Lint Script
 *
 * Validates that the services layer (L60) does not import from higher layers
 * (L70/L100) without using adapter interfaces. Also checks file size limits
 * and duplicate filenames within services/.
 *
 * Run: npx tsx scripts/lint/architecture-boundaries.ts
 * Or: pnpm lint:boundaries
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, basename } from 'path';

const ROOT_DIR = join(import.meta.dirname, '..', '..');
const SRC_DIR = join(ROOT_DIR, 'src');
const SERVICES_DIR = join(SRC_DIR, 'services');

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Layers that services (L60) should NOT import from directly */
const FORBIDDEN_IMPORTS_FROM_SERVICES = [
  'agents',     // L100 — Application layer
  'api',        // L100 — API routes
];

/** Layers that services CAN import from via adapter pattern (warn, not error) */
const ADAPTER_RECOMMENDED_IMPORTS = [
  'tools',          // L70 — Should use adapter interfaces
  'personas',       // L70 — Should use adapter interfaces
  'intelligence',   // L70 — Should use adapter interfaces
  'conversation',   // L70 — Should use adapter interfaces
  'speech',         // L70 — Should use adapter interfaces
];

/** Known exceptions — existing violations that are documented for future cleanup */
const KNOWN_EXCEPTIONS: Record<string, string[]> = {
  // optimization-alerting.ts uses dynamic imports from tools/
  'optimization-alerting.ts': ['tools/optimization/feedback-collector', 'tools/optimization/recommendation-engine'],
};

/** File size limits */
const FILE_SIZE_WARNING = 500;
const FILE_SIZE_ERROR = 800;

/** Max files per directory */
const DIR_SIZE_WARNING = 30;

// ============================================================================
// TYPES
// ============================================================================

interface Violation {
  file: string;
  line: number;
  severity: 'error' | 'warning';
  rule: string;
  message: string;
}

interface DuplicateFile {
  name: string;
  locations: string[];
}

// ============================================================================
// FILE SCANNING
// ============================================================================

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];

  function scan(currentDir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          if (entry === 'node_modules' || entry === '__tests__' || entry === '__mocks__' || entry === 'dist') {
            continue;
          }
          scan(fullPath);
        } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.d.ts')) {
          files.push(fullPath);
        }
      } catch {
        // Skip files we can't stat
      }
    }
  }

  scan(dir);
  return files;
}

// ============================================================================
// IMPORT ANALYSIS
// ============================================================================

function extractImports(filePath: string): Array<{ line: number; importPath: string }> {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const imports: Array<{ line: number; importPath: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match: import ... from '...'
    const staticMatch = line.match(/import\s+.*from\s+['"]([^'"]+)['"]/);
    if (staticMatch) {
      imports.push({ line: i + 1, importPath: staticMatch[1] });
      continue;
    }

    // Match: import('...')
    const dynamicMatch = line.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (dynamicMatch) {
      imports.push({ line: i + 1, importPath: dynamicMatch[1] });
    }
  }

  return imports;
}

function resolveImportLayer(importPath: string): string | null {
  // Only care about relative imports that go up to other src/ modules
  if (!importPath.startsWith('..')) return null;

  // Normalize: ../agents/foo → agents
  // ../tools/bar → tools
  const parts = importPath.split('/');
  for (const part of parts) {
    if (part !== '..' && part !== '.') {
      return part;
    }
  }
  return null;
}

// ============================================================================
// CHECKS
// ============================================================================

function checkArchitectureBoundaries(files: string[]): Violation[] {
  const violations: Violation[] = [];

  for (const file of files) {
    const relPath = relative(SERVICES_DIR, file);
    const fileName = basename(file);
    const imports = extractImports(file);

    for (const imp of imports) {
      const targetLayer = resolveImportLayer(imp.importPath);
      if (!targetLayer) continue;

      // Check if this is a known exception
      const knownExceptions = KNOWN_EXCEPTIONS[fileName] || [];
      const isKnownException = knownExceptions.some(exc => imp.importPath.includes(exc));
      if (isKnownException) continue;

      // Hard error: services importing from agents/api (L100)
      if (FORBIDDEN_IMPORTS_FROM_SERVICES.includes(targetLayer)) {
        violations.push({
          file: relPath,
          line: imp.line,
          severity: 'error',
          rule: 'no-upward-import',
          message: `Services (L60) cannot import from ${targetLayer}/ (L100). Use dependency injection or adapter interfaces.`,
        });
      }

      // Warning: services importing from domain layers (L70) without adapters
      if (ADAPTER_RECOMMENDED_IMPORTS.includes(targetLayer)) {
        violations.push({
          file: relPath,
          line: imp.line,
          severity: 'warning',
          rule: 'prefer-adapter',
          message: `Services importing from ${targetLayer}/ (L70). Consider using adapter interfaces from core/adapters.ts.`,
        });
      }
    }
  }

  return violations;
}

function checkFileSizes(files: string[]): Violation[] {
  const violations: Violation[] = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    // Count non-blank, non-comment lines
    const codeLines = lines.filter(l => {
      const trimmed = l.trim();
      return trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    }).length;

    const relPath = relative(SERVICES_DIR, file);

    if (codeLines > FILE_SIZE_ERROR) {
      violations.push({
        file: relPath,
        line: 0,
        severity: 'error',
        rule: 'max-file-size',
        message: `File has ${codeLines} code lines (max ${FILE_SIZE_ERROR}). Split into smaller modules.`,
      });
    } else if (codeLines > FILE_SIZE_WARNING) {
      violations.push({
        file: relPath,
        line: 0,
        severity: 'warning',
        rule: 'max-file-size',
        message: `File has ${codeLines} code lines (recommended max ${FILE_SIZE_WARNING}).`,
      });
    }
  }

  return violations;
}

function checkDuplicateFilenames(files: string[]): DuplicateFile[] {
  const nameMap = new Map<string, string[]>();

  for (const file of files) {
    const name = basename(file);
    if (name === 'index.ts' || name === 'types.ts') continue; // Common names, skip

    const locations = nameMap.get(name) || [];
    locations.push(relative(SERVICES_DIR, file));
    nameMap.set(name, locations);
  }

  return Array.from(nameMap.entries())
    .filter(([_, locations]) => locations.length > 1)
    .map(([name, locations]) => ({ name, locations }));
}

function checkDirectorySizes(): Violation[] {
  const violations: Violation[] = [];

  function checkDir(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    const tsFiles = entries.filter(e => e.endsWith('.ts') && !e.endsWith('.test.ts') && !e.endsWith('.d.ts'));
    const relDir = relative(SERVICES_DIR, dir) || '.';

    if (tsFiles.length > DIR_SIZE_WARNING) {
      violations.push({
        file: relDir + '/',
        line: 0,
        severity: 'warning',
        rule: 'max-dir-size',
        message: `Directory has ${tsFiles.length} .ts files (recommended max ${DIR_SIZE_WARNING}).`,
      });
    }

    // Check subdirectories
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        if (statSync(fullPath).isDirectory() && entry !== '__tests__' && entry !== '__mocks__' && entry !== 'node_modules') {
          checkDir(fullPath);
        }
      } catch {
        // Skip
      }
    }
  }

  checkDir(SERVICES_DIR);
  return violations;
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  console.log('🏗️  Architecture Boundaries Check');
  console.log('='.repeat(60));

  const files = getAllTsFiles(SERVICES_DIR);
  console.log(`Scanning ${files.length} TypeScript files in services/\n`);

  // Run checks
  const boundaryViolations = checkArchitectureBoundaries(files);
  const sizeViolations = checkFileSizes(files);
  const dirViolations = checkDirectorySizes();
  const duplicates = checkDuplicateFilenames(files);

  const allViolations = [...boundaryViolations, ...sizeViolations, ...dirViolations];
  const errors = allViolations.filter(v => v.severity === 'error');
  const warnings = allViolations.filter(v => v.severity === 'warning');

  // Report boundary violations
  if (boundaryViolations.length > 0) {
    console.log('📐 Architecture Boundary Violations:');
    for (const v of boundaryViolations) {
      const icon = v.severity === 'error' ? '❌' : '⚠️';
      console.log(`  ${icon} ${v.file}:${v.line} — ${v.message}`);
    }
    console.log();
  }

  // Report size violations (top 10)
  const sizeErrors = sizeViolations.filter(v => v.severity === 'error');
  if (sizeErrors.length > 0) {
    console.log(`📏 God Files (>${FILE_SIZE_ERROR} code lines): ${sizeErrors.length}`);
    for (const v of sizeErrors.slice(0, 10)) {
      console.log(`  ❌ ${v.file} — ${v.message}`);
    }
    if (sizeErrors.length > 10) {
      console.log(`  ... and ${sizeErrors.length - 10} more`);
    }
    console.log();
  }

  // Report duplicates
  if (duplicates.length > 0) {
    console.log(`🔄 Duplicate Filenames: ${duplicates.length}`);
    for (const dup of duplicates.slice(0, 10)) {
      console.log(`  ⚠️ ${dup.name} found in:`);
      for (const loc of dup.locations) {
        console.log(`      ${loc}`);
      }
    }
    if (duplicates.length > 10) {
      console.log(`  ... and ${duplicates.length - 10} more`);
    }
    console.log();
  }

  // Report directory sizes
  if (dirViolations.length > 0) {
    console.log('📁 Oversized Directories:');
    for (const v of dirViolations) {
      console.log(`  ⚠️ ${v.file} — ${v.message}`);
    }
    console.log();
  }

  // Summary
  console.log('='.repeat(60));
  console.log(`Summary: ${errors.length} errors, ${warnings.length} warnings, ${duplicates.length} duplicate filenames`);

  if (errors.length > 0) {
    console.log('\n❌ Architecture boundary check FAILED');
    process.exit(1);
  } else {
    console.log('\n✅ Architecture boundary check passed (with warnings)');
  }
}

main();
