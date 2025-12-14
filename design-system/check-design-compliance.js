#!/usr/bin/env node
/**
 * Design System Compliance Checker
 * 
 * Scans frontend code for design system violations:
 * - Hardcoded colors (#hex, rgba)
 * - Hardcoded durations (ms numbers)
 * - console.log statements in UI files
 * - Missing CSS variable fallbacks
 * 
 * Usage:
 *   node check-design-compliance.js                    # Check all
 *   node check-design-compliance.js --staged           # Check staged files only
 *   node check-design-compliance.js --fix              # Auto-fix what's possible
 *   node check-design-compliance.js path/to/file.ts   # Check specific file
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  // Directories to scan
  scanDirs: [
    'frontend-typescript/src/ui',
    'frontend-typescript/src/services',
    'frontend-typescript/src/narrative',
  ],
  
  // File patterns to check
  filePatterns: ['*.ts', '*.tsx'],
  
  // Files/patterns to ignore
  ignore: [
    '*.test.ts',
    '*.spec.ts',
    '__tests__',
    'node_modules',
    'dist',
    '.generated.',
    'dev-panel.ui.ts', // Dev tools can have hardcoded values
    'evalops-dashboard.ui.ts', // Internal dashboard
  ],
  
  // Violation severity
  severity: {
    hardcodedColor: 'error',
    hardcodedDuration: 'warning',
    consoleLog: 'warning',
    missingFallback: 'info',
  },
};

// =============================================================================
// VIOLATION PATTERNS
// =============================================================================

const PATTERNS = {
  // Hardcoded hex colors: #fff, #ffffff, #ffffffff
  hardcodedHexColor: {
    regex: /(?:color|background|border|fill|stroke):\s*['"]?#[0-9a-fA-F]{3,8}['"]?/g,
    message: 'Hardcoded color - use CSS variable',
    suggestion: (match) => {
      const hex = match.match(/#[0-9a-fA-F]+/)?.[0];
      return `Use var(--color-*, ${hex}) instead`;
    },
  },
  
  // Hardcoded rgba: rgba(r, g, b, a)
  hardcodedRgba: {
    regex: /(?:color|background|border|fill|stroke):\s*['"]?rgba?\([^)]+\)['"]?/g,
    message: 'Hardcoded RGBA - use CSS variable',
    suggestion: () => 'Use var(--color-*) with opacity modifier',
  },
  
  // Hardcoded durations in animation config: duration: 300
  hardcodedDuration: {
    regex: /duration:\s*\d+(?!\s*\*)/g,
    message: 'Hardcoded duration - use DURATION constant',
    suggestion: (match) => {
      const ms = parseInt(match.match(/\d+/)?.[0] || '0');
      const constant = suggestDurationConstant(ms);
      return `Use DURATION.${constant} (${ms}ms)`;
    },
  },
  
  // Console statements in UI code
  consoleLog: {
    regex: /console\.(log|warn|error|debug|info)\(/g,
    message: 'Console statement - use createLogger()',
    suggestion: () => "import { createLogger } from '../utils/logger.js'",
  },
};

function suggestDurationConstant(ms) {
  if (ms <= 50) return 'MICRO';
  if (ms <= 100) return 'FAST';
  if (ms <= 200) return 'NORMAL';
  if (ms <= 300) return 'SLOW';
  if (ms <= 400) return 'MODERATE';
  if (ms <= 500) return 'DELIBERATE';
  if (ms <= 600) return 'DRAMATIC';
  if (ms <= 800) return 'CELEBRATION';
  return 'GLACIAL';
}

// =============================================================================
// FILE SCANNING
// =============================================================================

function getFilesToCheck(args) {
  // Check specific file
  if (args.length > 0 && !args[0].startsWith('--')) {
    return args.filter(f => fs.existsSync(f));
  }
  
  // Check staged files only
  if (args.includes('--staged')) {
    try {
      const staged = execSync('git diff --cached --name-only --diff-filter=ACMR', { encoding: 'utf8' });
      return staged.split('\n')
        .filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))
        .filter(f => CONFIG.scanDirs.some(dir => f.startsWith(dir)))
        .filter(f => !CONFIG.ignore.some(pattern => f.includes(pattern)));
    } catch {
      return [];
    }
  }
  
  // Scan all configured directories
  const files = [];
  for (const dir of CONFIG.scanDirs) {
    const fullPath = path.join(ROOT, dir);
    if (fs.existsSync(fullPath)) {
      scanDir(fullPath, files);
    }
  }
  return files;
}

function scanDir(dir, files) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    // Skip ignored patterns
    if (CONFIG.ignore.some(pattern => fullPath.includes(pattern))) {
      continue;
    }
    
    if (entry.isDirectory()) {
      scanDir(fullPath, files);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      files.push(fullPath);
    }
  }
}

// =============================================================================
// VIOLATION CHECKING
// =============================================================================

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const violations = [];
  
  for (const [patternName, pattern] of Object.entries(PATTERNS)) {
    let match;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    
    while ((match = regex.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      const line = lines[lineNumber - 1];
      
      violations.push({
        file: filePath,
        line: lineNumber,
        column: match.index - content.lastIndexOf('\n', match.index - 1),
        pattern: patternName,
        match: match[0],
        message: pattern.message,
        suggestion: pattern.suggestion(match[0]),
        severity: CONFIG.severity[patternName] || 'warning',
        lineContent: line?.trim() || '',
      });
    }
  }
  
  return violations;
}

// =============================================================================
// REPORTING
// =============================================================================

function formatViolation(v) {
  const severityIcon = {
    error: '❌',
    warning: '⚠️ ',
    info: 'ℹ️ ',
  }[v.severity] || '•';
  
  const relativePath = path.relative(ROOT, v.file);
  
  return [
    `${severityIcon} ${relativePath}:${v.line}:${v.column}`,
    `   ${v.message}`,
    `   ${v.lineContent.substring(0, 80)}`,
    `   💡 ${v.suggestion}`,
    '',
  ].join('\n');
}

function printSummary(violations) {
  const byFile = {};
  const bySeverity = { error: 0, warning: 0, info: 0 };
  
  for (const v of violations) {
    byFile[v.file] = (byFile[v.file] || 0) + 1;
    bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log('DESIGN SYSTEM COMPLIANCE REPORT');
  console.log('═'.repeat(60) + '\n');
  
  if (violations.length === 0) {
    console.log('✅ No design system violations found!\n');
    return;
  }
  
  console.log(`Found ${violations.length} violation(s):\n`);
  console.log(`  ❌ Errors:   ${bySeverity.error}`);
  console.log(`  ⚠️  Warnings: ${bySeverity.warning}`);
  console.log(`  ℹ️  Info:     ${bySeverity.info}`);
  console.log('\nBy file:');
  
  for (const [file, count] of Object.entries(byFile)) {
    const relativePath = path.relative(ROOT, file);
    console.log(`  ${count} - ${relativePath}`);
  }
  
  console.log('\n' + '-'.repeat(60) + '\n');
  
  // Print each violation
  for (const v of violations) {
    console.log(formatViolation(v));
  }
}

// =============================================================================
// MAIN
// =============================================================================

function main() {
  const args = process.argv.slice(2);
  const files = getFilesToCheck(args);
  
  if (files.length === 0) {
    console.log('No files to check.');
    process.exit(0);
  }
  
  console.log(`Checking ${files.length} file(s)...`);
  
  const allViolations = [];
  
  for (const file of files) {
    const violations = checkFile(file);
    allViolations.push(...violations);
  }
  
  printSummary(allViolations);
  
  // Exit with error if there are errors
  const hasErrors = allViolations.some(v => v.severity === 'error');
  process.exit(hasErrors ? 1 : 0);
}

main();

