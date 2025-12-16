#!/usr/bin/env node
/**
 * Quality Check Script
 *
 * Comprehensive quality gate with thresholds.
 * Run: node scripts/quality-check.js
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - One or more checks failed
 */

import { execSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// THRESHOLDS
// ============================================================================

const THRESHOLDS = {
  // Blocking thresholds (fail if exceeded)
  typescriptErrors: 0,
  eslintErrors: 0,
  tokenViolations: 0,
  testFailures: 0,
  uiAuditErrors: 0,

  // Warning thresholds (warn if exceeded, don't fail)
  uiAuditWarnings: 500,
  largeFiles: 5,           // Files over 500 lines
  maxFileLines: 500,
};

// ============================================================================
// CHECK FUNCTIONS
// ============================================================================

function runCommand(command, description) {
  console.log(`\n  Checking ${description}...`);
  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: join(__dirname, '..')
    });
    return { success: true, output };
  } catch (error) {
    return {
      success: false,
      output: error.stdout || '',
      error: error.stderr || error.message
    };
  }
}

function countLargeFiles() {
  const uiDir = join(__dirname, '..', 'src', 'ui');
  let largeFiles = [];

  function scanDir(dir) {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
          const content = require('fs').readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n').length;
          if (lines > THRESHOLDS.maxFileLines) {
            largeFiles.push({ file: entry, lines });
          }
        }
      }
    } catch (e) {
      // Ignore errors
    }
  }

  scanDir(uiDir);
  return largeFiles;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('');
  console.log('='.repeat(60));
  console.log('  QUALITY CHECK');
  console.log('='.repeat(60));

  const results = {
    passed: [],
    warnings: [],
    failed: []
  };

  // TypeScript
  const tsResult = runCommand('npm run typecheck 2>&1', 'TypeScript');
  if (tsResult.success) {
    results.passed.push('TypeScript: 0 errors');
  } else {
    results.failed.push('TypeScript: Has errors');
  }

  // ESLint
  const lintResult = runCommand('npm run lint 2>&1', 'ESLint');
  if (lintResult.success) {
    results.passed.push('ESLint: 0 errors');
  } else {
    results.failed.push('ESLint: Has errors');
  }

  // Design Tokens
  const tokenResult = runCommand('npm run lint:tokens 2>&1', 'Design Tokens');
  if (tokenResult.success && tokenResult.output.includes('All files comply')) {
    results.passed.push('Design Tokens: 0 violations');
  } else {
    results.failed.push('Design Tokens: Has violations');
  }

  // Tests
  const testResult = runCommand('npm test -- --run 2>&1', 'Tests');
  if (testResult.success) {
    results.passed.push('Tests: All passing');
  } else {
    results.failed.push('Tests: Some failing');
  }

  // UI Audit
  const auditResult = runCommand('npm run audit:ui 2>&1', 'UI Audit');
  const errorMatch = auditResult.output.match(/Errors:\s*(\d+)/);
  const warningMatch = auditResult.output.match(/Warnings:\s*(\d+)/);
  const errors = errorMatch ? parseInt(errorMatch[1]) : 0;
  const warnings = warningMatch ? parseInt(warningMatch[1]) : 0;

  if (errors === 0) {
    results.passed.push(`UI Audit Errors: ${errors}`);
  } else {
    results.failed.push(`UI Audit Errors: ${errors}`);
  }

  if (warnings <= THRESHOLDS.uiAuditWarnings) {
    results.passed.push(`UI Audit Warnings: ${warnings}`);
  } else {
    results.warnings.push(`UI Audit Warnings: ${warnings} (threshold: ${THRESHOLDS.uiAuditWarnings})`);
  }

  // Large Files
  const largeFiles = countLargeFiles();
  if (largeFiles.length <= THRESHOLDS.largeFiles) {
    results.passed.push(`Large Files: ${largeFiles.length}`);
  } else {
    results.warnings.push(`Large Files: ${largeFiles.length} (threshold: ${THRESHOLDS.largeFiles})`);
    for (const f of largeFiles.slice(0, 5)) {
      results.warnings.push(`  - ${f.file}: ${f.lines} lines`);
    }
  }

  // Print Results
  console.log('\n' + '='.repeat(60));
  console.log('  RESULTS');
  console.log('='.repeat(60));

  if (results.passed.length > 0) {
    console.log('\n  PASSED:');
    for (const p of results.passed) {
      console.log(`    [PASS] ${p}`);
    }
  }

  if (results.warnings.length > 0) {
    console.log('\n  WARNINGS:');
    for (const w of results.warnings) {
      console.log(`    [WARN] ${w}`);
    }
  }

  if (results.failed.length > 0) {
    console.log('\n  FAILED:');
    for (const f of results.failed) {
      console.log(`    [FAIL] ${f}`);
    }
  }

  console.log('\n' + '='.repeat(60));

  if (results.failed.length > 0) {
    console.log(`  STATUS: FAILED (${results.failed.length} blocking issues)`);
    console.log('='.repeat(60) + '\n');
    process.exit(1);
  } else if (results.warnings.length > 0) {
    console.log(`  STATUS: PASSED with ${results.warnings.length} warnings`);
    console.log('='.repeat(60) + '\n');
    process.exit(0);
  } else {
    console.log('  STATUS: ALL CHECKS PASSED');
    console.log('='.repeat(60) + '\n');
    process.exit(0);
  }
}

main().catch(console.error);
