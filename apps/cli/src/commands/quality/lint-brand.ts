/**
 * Ferni Brand Compliance Linter
 * 
 * Enforces brand guidelines automatically.
 * Run with: npx tsx scripts/lint-brand.ts
 * 
 * @module @ferni/lint-brand
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

// ============================================================================
// TYPES
// ============================================================================

interface LintError {
  file: string;
  line?: number;
  column?: number;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

interface LintRule {
  id: string;
  name: string;
  description: string;
  severity: 'error' | 'warning';
  pattern?: RegExp;
  check?: (content: string, file: string) => LintError[];
  fileTypes?: string[];
  exclude?: string[];
}

interface LintResults {
  errors: LintError[];
  warnings: LintError[];
  filesChecked: number;
  passed: boolean;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const ROOT_DIR = process.cwd();

const INCLUDE_PATTERNS = [
  'apps/web/src/**/*.ts',
  'src/**/*.ts',
  'design-system/**/*.ts',
  'apps/web/src/**/*.css',
];

const EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/*.d.ts',
  '**/*.test.ts',
  '**/*.spec.ts',
];

// ============================================================================
// LINT RULES
// ============================================================================

const LINT_RULES: LintRule[] = [
  // ==========================================================================
  // LOGGING RULES
  // ==========================================================================
  {
    id: 'no-console-log',
    name: 'No Console Log',
    description: 'Use createLogger() instead of console.log',
    severity: 'error',
    pattern: /console\.(log|warn|error|debug|info)\s*\(/g,
    fileTypes: ['.ts', '.js'],
    exclude: ['**/logger.ts', '**/logger.js'],
  },
  
  // ==========================================================================
  // COLOR RULES
  // ==========================================================================
  {
    id: 'no-hardcoded-hex-colors',
    name: 'No Hardcoded Hex Colors',
    description: 'Use CSS variables instead of hardcoded hex colors',
    severity: 'error',
    check: (content, file) => {
      const errors: LintError[] = [];
      const lines = content.split('\n');
      
      // Pattern for hex colors not in CSS variable fallback
      const hexPattern = /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})(?!\s*\))/g;
      
      lines.forEach((line, index) => {
        // Skip comments
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
        
        // Skip CSS variable definitions
        if (line.includes('--') && line.includes(':')) return;
        
        // Skip lines that are CSS var fallbacks
        if (line.includes('var(') && line.includes(',')) return;
        
        let match;
        while ((match = hexPattern.exec(line)) !== null) {
          errors.push({
            file,
            line: index + 1,
            column: match.index,
            rule: 'no-hardcoded-hex-colors',
            message: `Hardcoded color ${match[0]} found`,
            severity: 'error',
            suggestion: 'Use CSS variable: var(--color-*)',
          });
        }
      });
      
      return errors;
    },
    fileTypes: ['.ts', '.js'],
    exclude: ['**/tokens.ts', '**/tokens.css', '**/design-tokens.css'],
  },
  
  {
    id: 'no-purple-colors',
    name: 'No Purple Colors',
    description: 'Purple is not a Ferni brand color',
    severity: 'error',
    check: (content, file) => {
      const errors: LintError[] = [];
      const lines = content.split('\n');
      
      // Purple color patterns
      const purplePatterns = [
        /#(800080|9b59b6|8b5cf6|a855f7|7c3aed|6d28d9|5b21b6|4c1d95)/gi,
        /purple/gi,
        /violet/gi,
      ];
      
      lines.forEach((line, index) => {
        // Skip comments and strings that might be documentation
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
        
        for (const pattern of purplePatterns) {
          let match;
          while ((match = pattern.exec(line)) !== null) {
            // Skip if it's in a "don't use" comment
            if (line.toLowerCase().includes("don't") || line.toLowerCase().includes('never')) continue;
            
            errors.push({
              file,
              line: index + 1,
              column: match.index,
              rule: 'no-purple-colors',
              message: `Purple color "${match[0]}" is not a Ferni brand color`,
              severity: 'error',
              suggestion: 'Use persona colors: --persona-primary or earthy tones',
            });
          }
        }
      });
      
      return errors;
    },
    fileTypes: ['.ts', '.js', '.css'],
  },
  
  // ==========================================================================
  // ANIMATION RULES
  // ==========================================================================
  {
    id: 'no-hardcoded-durations',
    name: 'No Hardcoded Animation Durations',
    description: 'Use DURATION constants instead of hardcoded values',
    severity: 'warning',
    check: (content, file) => {
      const errors: LintError[] = [];
      const lines = content.split('\n');
      
      // Pattern for duration: <number>
      const durationPattern = /duration:\s*(\d+)(?!\s*\*\s*DURATION)/g;
      
      lines.forEach((line, index) => {
        // Skip if line imports or uses DURATION
        if (line.includes('DURATION') || line.includes('import')) return;
        
        let match;
        while ((match = durationPattern.exec(line)) !== null) {
          errors.push({
            file,
            line: index + 1,
            column: match.index,
            rule: 'no-hardcoded-durations',
            message: `Hardcoded duration ${match[1]}ms found`,
            severity: 'warning',
            suggestion: 'Use DURATION constant from animation-constants.ts',
          });
        }
      });
      
      return errors;
    },
    fileTypes: ['.ts', '.js'],
    exclude: ['**/animation-constants.ts', '**/choreography/**'],
  },
  
  {
    id: 'no-hardcoded-easings',
    name: 'No Hardcoded Easings',
    description: 'Use EASING constants instead of cubic-bezier strings',
    severity: 'warning',
    pattern: /easing:\s*['"`]cubic-bezier\([^)]+\)['"`]/g,
    fileTypes: ['.ts', '.js'],
    exclude: ['**/animation-constants.ts', '**/choreography/**'],
  },
  
  // ==========================================================================
  // EMOJI RULES
  // ==========================================================================
  {
    id: 'no-emoji-in-ui',
    name: 'No Emoji in UI Code',
    description: 'Use Lucide icons instead of emoji',
    severity: 'warning',
    check: (content, file) => {
      const errors: LintError[] = [];
      const lines = content.split('\n');
      
      // Emoji unicode ranges
      const emojiPattern = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
      
      lines.forEach((line, index) => {
        // Skip comments
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
        
        let match;
        while ((match = emojiPattern.exec(line)) !== null) {
          errors.push({
            file,
            line: index + 1,
            column: match.index,
            rule: 'no-emoji-in-ui',
            message: `Emoji "${match[0]}" found in UI code`,
            severity: 'warning',
            suggestion: 'Use Lucide SVG icons instead',
          });
        }
      });
      
      return errors;
    },
    fileTypes: ['.ts', '.js'],
    exclude: ['**/*.md', '**/*.txt', '**/test/**'],
  },
  
  // ==========================================================================
  // HMR PROTECTION
  // ==========================================================================
  {
    id: 'hmr-cleanup-required',
    name: 'HMR Cleanup Required',
    description: 'UI classes must clean up orphaned elements',
    severity: 'warning',
    check: (content, file) => {
      const errors: LintError[] = [];
      
      // Only check UI files
      if (!file.includes('/ui/') && !file.includes('\\ui\\')) return errors;
      
      // Check if file creates DOM elements but lacks cleanup
      const createsElements = content.includes('document.createElement') || 
                             content.includes('innerHTML');
      const hasCleanup = content.includes('cleanupOrphaned') || 
                        content.includes('querySelectorAll') && content.includes('.remove()');
      
      if (createsElements && !hasCleanup) {
        errors.push({
          file,
          line: 1,
          rule: 'hmr-cleanup-required',
          message: 'UI class creates elements but may lack HMR cleanup',
          severity: 'warning',
          suggestion: 'Add cleanupOrphanedElements() method to constructor',
        });
      }
      
      return errors;
    },
    fileTypes: ['.ts'],
  },
  
  // ==========================================================================
  // ACCESSIBILITY
  // ==========================================================================
  {
    id: 'button-needs-aria-label',
    name: 'Button Needs Aria Label',
    description: 'Buttons require aria-label for accessibility',
    severity: 'warning',
    check: (content, file) => {
      const errors: LintError[] = [];
      const lines = content.split('\n');
      
      // Pattern for button without aria-label
      const buttonPattern = /<button(?![^>]*aria-label)/gi;
      
      lines.forEach((line, index) => {
        let match;
        while ((match = buttonPattern.exec(line)) !== null) {
          errors.push({
            file,
            line: index + 1,
            column: match.index,
            rule: 'button-needs-aria-label',
            message: 'Button element missing aria-label',
            severity: 'warning',
            suggestion: 'Add aria-label="descriptive text"',
          });
        }
      });
      
      return errors;
    },
    fileTypes: ['.ts', '.js', '.html'],
  },
];

// ============================================================================
// LINTING ENGINE
// ============================================================================

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

function shouldCheckFile(file: string, rule: LintRule): boolean {
  const ext = path.extname(file);
  
  // Check file type
  if (rule.fileTypes && !rule.fileTypes.includes(ext)) {
    return false;
  }
  
  // Check exclusions
  if (rule.exclude) {
    for (const pattern of rule.exclude) {
      const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
      if (regex.test(file)) {
        return false;
      }
    }
  }
  
  return true;
}

function lintFile(filePath: string, content: string): LintError[] {
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

async function runLinter(): Promise<LintResults> {
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

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('🎨 Ferni Brand Compliance Linter\n');
  
  const results = await runLinter();
  printResults(results);
  
  // Exit with error code if errors found
  if (!results.passed) {
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Linter error:', e);
  process.exit(1);
});

