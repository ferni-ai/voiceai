#!/usr/bin/env node

/**
 * Lint Script: Detect Inline Result Patterns
 *
 * Flags code that uses inline `{ success: boolean; error?: string }` patterns
 * instead of the standardized OperationResult types.
 *
 * Usage:
 *   node scripts/lint-result-types.js           # Check all files
 *   node scripts/lint-result-types.js --fix     # Show what to use instead
 *
 * Patterns detected:
 *   - { success: boolean } inline type annotations
 *   - { success: boolean; error?: string } return types
 *   - Promise<{ success: boolean; ... }> async returns
 *
 * Should use instead:
 *   - OperationResult
 *   - OperationResultWith<T>
 *   - Result<T, E>
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Patterns to detect inline result types
const PATTERNS = [
  // Promise<{ success: boolean... }>
  {
    regex: /Promise<\s*\{\s*success:\s*boolean[^}]*\}>/g,
    message: 'Use AsyncResult<T> or Promise<OperationResult> instead of inline Promise<{ success: boolean }>',
    replacement: 'Promise<OperationResult>',
  },
  // ): { success: boolean... } (return type)
  {
    regex: /\):\s*\{\s*success:\s*boolean[^}]*\}/g,
    message: 'Use OperationResult or Result<T, E> instead of inline { success: boolean } return type',
    replacement: '): OperationResult',
  },
  // : { success: boolean... } (variable/param type)
  {
    regex: /:\s*\{\s*success:\s*boolean[^}]*\}/g,
    message: 'Use OperationResult type instead of inline { success: boolean }',
    replacement: ': OperationResult',
  },
  // { ok: boolean; data?: ... } (should use Result<T, E>)
  {
    regex: /:\s*\{\s*ok:\s*boolean;\s*data\?:[^}]*\}/g,
    message: 'Use Result<T, E> type from types/result.ts instead of inline ok/data pattern',
    replacement: ': Result<T>',
  },
];

// Files/directories to skip
const SKIP_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/*.d.ts',
  '**/types/results.ts', // The definition file itself
  '**/types/result.ts', // The definition file itself
  '**/*.test.ts',
  '**/*.spec.ts',
];

async function lintFile(filePath, showFix = false) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const issues = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    for (const pattern of PATTERNS) {
      const matches = line.matchAll(pattern.regex);
      for (const match of matches) {
        issues.push({
          file: filePath,
          line: lineNum,
          column: match.index + 1,
          matched: match[0],
          message: pattern.message,
          replacement: pattern.replacement,
        });
      }
    }
  }

  return issues;
}

async function main() {
  const args = process.argv.slice(2);
  const showFix = args.includes('--fix');
  const srcDir = path.resolve(__dirname, '../src');

  console.log('🔍 Scanning for inline result type patterns...\n');

  // Find all TypeScript files
  const files = await glob('**/*.ts', {
    cwd: srcDir,
    ignore: SKIP_PATTERNS,
    absolute: true,
  });

  let totalIssues = 0;
  const fileIssues = [];

  for (const file of files) {
    const issues = await lintFile(file, showFix);
    if (issues.length > 0) {
      totalIssues += issues.length;
      fileIssues.push({ file, issues });
    }
  }

  if (totalIssues === 0) {
    console.log('✅ No inline result type patterns found!\n');
    console.log('   All code uses standardized types:');
    console.log('   - OperationResult, SyncResult, etc. (from types/results.ts)');
    console.log('   - Result<T, E> (from types/result.ts)');
    process.exit(0);
  }

  console.log(`⚠️  Found ${totalIssues} inline result type pattern(s):\n`);

  for (const { file, issues } of fileIssues) {
    const relativePath = path.relative(srcDir, file);
    console.log(`📄 ${relativePath}`);

    for (const issue of issues) {
      console.log(`   Line ${issue.line}: ${issue.message}`);
      console.log(`   Found: ${issue.matched.substring(0, 60)}${issue.matched.length > 60 ? '...' : ''}`);
      if (showFix) {
        console.log(`   → Use: ${issue.replacement}`);
      }
      console.log('');
    }
  }

  console.log('─'.repeat(60));
  console.log(`\n📚 Import standardized types from '@/types':`);
  console.log(`   import { OperationResult, success, failure } from '../types/index.js';`);
  console.log(`   import { Result, ok, err, isOk } from '../types/index.js';`);
  console.log('');

  if (!showFix) {
    console.log('💡 Run with --fix to see suggested replacements');
  }

  // Exit with error code if issues found (for CI)
  process.exit(1);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
