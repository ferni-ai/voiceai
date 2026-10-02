/**
 * Ferni Brand Compliance Linter
 * Run with: npx tsx apps/cli/src/commands/quality/lint-brand.ts
 */

import { pathToFileURL } from 'url';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

import { LINT_RULES, type LintError, type LintRule } from './lint-brand-rules.js';

export { LINT_RULES, isEmojiInLoggingCall, logCallRanges } from './lint-brand-rules.js';
export type { LintError, LintRule } from './lint-brand-rules.js';

// TYPES

export interface LintResults {
  errors: LintError[];
  warnings: LintError[];
  filesChecked: number;
  passed: boolean;
}

// CONFIGURATION

const ROOT_DIR = process.cwd();

export const INCLUDE_PATTERNS = [
  'apps/web/src/**/*.ts',
  'src/**/*.ts',
  'design-system/**/*.ts',
  'apps/web/src/**/*.css',
  'apps/website/ferni-website/src/**/*.{ts,js,njk,css}',
];

export const EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/*.d.ts',
  '**/*.test.ts',
  '**/*.spec.ts',
  'src/tests/**',
  '**/__tests__/**',
];

// LINTING ENGINE

async function getFilesToLint(): Promise<string[]> {
  const files: string[] = [];
  
  for (const pattern of INCLUDE_PATTERNS) {
    const matches = await glob(pattern, {
      cwd: ROOT_DIR,
      ignore: EXCLUDE_PATTERNS,
      absolute: true,
    });
    files.push(...matches);
  }
  
  return [...new Set(files)];
}

/**
 * Converts an exclude glob to a regex anchored at a path-segment boundary, so
 * `scripts/**` matches `scripts/x.ts` and `apps/web/scripts/x.ts` but not
 * `src/memory/transcripts/x.ts`.
 */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') {
        i++;
        re += '(?:.*/)?';
      } else {
        re += '.*';
      }
    } else if (c === '*') {
      re += '[^/]*';
    } else {
      re += /[.+?^${}()|[\]\\]/.test(c) ? `\\${c}` : c;
    }
  }
  return new RegExp(`(?:^|/)${re}$`);
}

export function shouldCheckFile(file: string, rule: LintRule): boolean {
  const ext = path.extname(file);
  
  // Check file type
  if (rule.fileTypes && !rule.fileTypes.includes(ext)) {
    return false;
  }
  
  // Check exclusions
  if (rule.exclude) {
    const normalized = file.replace(/\\/g, '/');
    if (rule.exclude.some((pattern) => globToRegExp(pattern).test(normalized))) return false;
  }
  
  return true;
}

export function lintFile(filePath: string, content: string): LintError[] {
  const errors: LintError[] = [];
  
  for (const rule of LINT_RULES) {
    if (!shouldCheckFile(filePath, rule)) continue;
    
    if (rule.check) {
      // Custom check function
      errors.push(...rule.check(content, filePath));
    } else if (rule.pattern) {
      // Simple pattern match
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        let match;
        const pattern = new RegExp(rule.pattern!.source, rule.pattern!.flags);
        while ((match = pattern.exec(line)) !== null) {
          errors.push({
            file: filePath,
            line: index + 1,
            column: match.index,
            rule: rule.id,
            message: rule.description,
            severity: rule.severity,
          });
        }
      });
    }
  }
  
  return errors;
}

export async function runLinter(): Promise<LintResults> {
  const files = await getFilesToLint();
  const allErrors: LintError[] = [];
  
  console.log(`\n🔍 Checking ${files.length} files for brand compliance...\n`);
  
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const errors = lintFile(file, content);
      allErrors.push(...errors);
    } catch (e) {
      console.error(`Error reading ${file}:`, e);
    }
  }
  
  const errors = allErrors.filter(e => e.severity === 'error');
  const warnings = allErrors.filter(e => e.severity === 'warning');
  
  return {
    errors,
    warnings,
    filesChecked: files.length,
    passed: errors.length === 0,
  };
}

function formatError(error: LintError): string {
  const location = error.line ? `:${error.line}${error.column ? `:${error.column}` : ''}` : '';
  const severity = error.severity === 'error' ? '❌' : '⚠️';
  const relativePath = path.relative(ROOT_DIR, error.file);
  
  let output = `${severity} ${relativePath}${location}\n`;
  output += `   ${error.rule}: ${error.message}\n`;
  if (error.suggestion) {
    output += `   💡 ${error.suggestion}\n`;
  }
  
  return output;
}

function printResults(results: LintResults): void {
  if (results.errors.length === 0 && results.warnings.length === 0) {
    console.log('✅ All brand compliance checks passed!\n');
    return;
  }
  
  if (results.errors.length > 0) {
    console.log('❌ ERRORS:\n');
    results.errors.forEach(e => console.log(formatError(e)));
  }
  
  if (results.warnings.length > 0) {
    console.log('⚠️ WARNINGS:\n');
    results.warnings.forEach(e => console.log(formatError(e)));
  }
  
  console.log('\n📊 Summary:');
  console.log(`   Files checked: ${results.filesChecked}`);
  console.log(`   Errors: ${results.errors.length}`);
  console.log(`   Warnings: ${results.warnings.length}`);
  console.log('');
}

// MAIN

async function main(): Promise<void> {
  console.log('🎨 Ferni Brand Compliance Linter\n');
  
  const results = await runLinter();
  printResults(results);
  
  // Exit with error code if errors found
  if (!results.passed) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => {
    console.error('Linter error:', e);
    process.exit(1);
  });
}
