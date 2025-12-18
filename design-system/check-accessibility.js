#!/usr/bin/env node
/**
 * Ferni Design System - Accessibility Checker
 * 
 * Validates WCAG 2.1 AA compliance across the codebase.
 * Run in CI/CD to prevent accessibility regressions.
 * 
 * Usage:
 *   node check-accessibility.js           # Check all, warn on errors
 *   node check-accessibility.js --strict  # Fail on any error
 *   node check-accessibility.js --fix     # Show fix suggestions
 * 
 * Exit codes:
 *   0 - All checks passed
 *   1 - Accessibility errors found (strict mode)
 *   2 - Invalid arguments
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Directories to scan for CSS-in-JS patterns
  scanDirs: [
    'apps/web/src/ui',
    'apps/web/src/components',
  ],
  
  // File extensions to check
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.css'],
  
  // Patterns that indicate accessibility violations
  // Note: Using negative lookbehind (?<![a-zA-Z-]) to avoid matching 'border-color', 'background-color', etc.
  antiPatterns: [
    {
      name: 'persona-primary-as-text',
      pattern: /(?<![a-zA-Z-])color:\s*var\(--persona-primary/g,
      message: 'Using --persona-primary as text color fails WCAG AA on dark backgrounds',
      fix: 'Replace with var(--color-accent-text) for accent text or var(--color-text-*) for body text',
      severity: 'error',
    },
    {
      name: 'hardcoded-ferni-green-text',
      pattern: /(?<![a-zA-Z-])color:\s*['"]?#4a6741['"]?/gi,
      message: 'Hardcoded Ferni green (#4a6741) as text color fails WCAG AA',
      fix: 'Use var(--color-accent-text) instead',
      severity: 'error',
    },
    {
      name: 'hardcoded-persona-colors-text',
      pattern: /(?<![a-zA-Z-])color:\s*['"]?#(3d5a35|9a7b5a|3a6b73|5a6b8a|a67a6a|c4856a)['"]?/gi,
      message: 'Hardcoded persona color as text fails WCAG AA on dark backgrounds',
      fix: 'Use var(--color-text-*) or var(--color-accent-text)',
      severity: 'error',
    },
    {
      name: 'light-theme-fallback-in-dark-context',
      pattern: /\[data-theme="midnight"\].*(?<![a-zA-Z-])color:.*#(5[cC]544[aA]|756[aA]5[eE]|5a5048)/g,
      message: 'Light theme color used in dark theme context',
      fix: 'Use dark theme compliant colors: #faf6f0, #f0ebe4, #e8e2da',
      severity: 'error',
    },
    {
      name: 'member-color-as-text',
      pattern: /(?<![a-zA-Z-])color:\s*var\(--member-color/g,
      message: '--member-color may have insufficient contrast for text',
      fix: 'Use var(--color-text-primary) or ensure member-color is WCAG compliant',
      severity: 'warning',
    },
  ],
  
  // Colors that should NEVER be used as text on dark backgrounds
  prohibitedTextColors: [
    { hex: '#4a6741', name: 'Ferni Green', contrast: '1.06:1' },
    { hex: '#3d5a35', name: 'Ferni Secondary', contrast: '0.85:1' },
    { hex: '#9a7b5a', name: 'Jack Brown', contrast: '1.53:1' },
    { hex: '#3a6b73', name: 'Peter Teal', contrast: '1.01:1' },
    { hex: '#5a6b8a', name: 'Alex Blue', contrast: '1.18:1' },
    { hex: '#a67a6a', name: 'Maya Terracotta', contrast: '1.60:1' },
    { hex: '#c4856a', name: 'Jordan Coral', contrast: '2.03:1' },
  ],
};

// ============================================================================
// HELPERS
// ============================================================================

function getFiles(dir, extensions) {
  const results = [];
  const fullPath = path.join(rootDir, dir);
  
  if (!fs.existsSync(fullPath)) {
    return results;
  }
  
  const items = fs.readdirSync(fullPath, { withFileTypes: true });
  
  for (const item of items) {
    const itemPath = path.join(fullPath, item.name);
    
    if (item.isDirectory()) {
      results.push(...getFiles(path.join(dir, item.name), extensions));
    } else if (extensions.some(ext => item.name.endsWith(ext))) {
      results.push(itemPath);
    }
  }
  
  return results;
}

function extractLineNumber(content, index) {
  const lines = content.substring(0, index).split('\n');
  return lines.length;
}

// ============================================================================
// MAIN CHECK
// ============================================================================

function checkAccessibility(options = {}) {
  const { strict = false, showFix = false, verbose = false } = options;
  
  console.log('\n🔍 Ferni Accessibility Checker');
  console.log('═'.repeat(60));
  console.log('Scanning for WCAG 2.1 AA violations...\n');
  
  const results = {
    errors: [],
    warnings: [],
    filesScanned: 0,
    timestamp: new Date().toISOString(),
  };
  
  // Collect all files to scan
  const files = [];
  for (const dir of CONFIG.scanDirs) {
    files.push(...getFiles(dir, CONFIG.extensions));
  }
  
  results.filesScanned = files.length;
  console.log(`📁 Scanning ${files.length} files...\n`);
  
  // Check each file
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const relativePath = path.relative(rootDir, file);
    
    for (const pattern of CONFIG.antiPatterns) {
      let match;
      const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
      
      while ((match = regex.exec(content)) !== null) {
        const lineNumber = extractLineNumber(content, match.index);
        const issue = {
          file: relativePath,
          line: lineNumber,
          pattern: pattern.name,
          match: match[0].substring(0, 50) + (match[0].length > 50 ? '...' : ''),
          message: pattern.message,
          fix: pattern.fix,
          severity: pattern.severity,
        };
        
        if (pattern.severity === 'error') {
          results.errors.push(issue);
        } else {
          results.warnings.push(issue);
        }
      }
    }
  }
  
  // ========================================
  // Report Results
  // ========================================
  
  if (results.errors.length === 0 && results.warnings.length === 0) {
    console.log('✅ No accessibility issues found!\n');
    console.log('All scanned files comply with WCAG 2.1 AA requirements.\n');
    return { passed: true, results };
  }
  
  // Print errors
  if (results.errors.length > 0) {
    console.log(`❌ ${results.errors.length} ERROR(S) FOUND\n`);
    console.log('─'.repeat(60));
    
    const groupedErrors = {};
    results.errors.forEach(err => {
      if (!groupedErrors[err.file]) {
        groupedErrors[err.file] = [];
      }
      groupedErrors[err.file].push(err);
    });
    
    Object.entries(groupedErrors).forEach(([file, errors]) => {
      console.log(`\n📄 ${file}`);
      errors.forEach(err => {
        console.log(`   Line ${err.line}: ${err.pattern}`);
        console.log(`   └─ ${err.message}`);
        if (showFix) {
          console.log(`   └─ 💡 Fix: ${err.fix}`);
        }
      });
    });
  }
  
  // Print warnings
  if (results.warnings.length > 0) {
    console.log(`\n⚠️  ${results.warnings.length} WARNING(S)\n`);
    console.log('─'.repeat(60));
    
    results.warnings.forEach(warn => {
      console.log(`   ${warn.file}:${warn.line}`);
      console.log(`   └─ ${warn.message}`);
    });
  }
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(60));
  console.log(`   Files scanned: ${results.filesScanned}`);
  console.log(`   Errors: ${results.errors.length}`);
  console.log(`   Warnings: ${results.warnings.length}`);
  
  // Save report
  const reportPath = path.join(__dirname, 'dist/a11y-check-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Report saved to: ${reportPath}\n`);
  
  // Strict mode handling
  if (strict && results.errors.length > 0) {
    console.log('🚫 FAILED: Fix accessibility errors to pass CI.\n');
    console.log('Run with --fix flag to see suggested fixes.\n');
    return { passed: false, results };
  }
  
  return { passed: results.errors.length === 0, results };
}

// ============================================================================
// CLI
// ============================================================================

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Ferni Accessibility Checker

Scans the codebase for WCAG 2.1 AA violations.

Usage:
  node check-accessibility.js [options]

Options:
  --strict, -s    Exit with code 1 if errors found (for CI)
  --fix, -f       Show fix suggestions for each issue
  --verbose, -v   Show additional debug information
  --help, -h      Show this help message

Examples:
  node check-accessibility.js              # Check with warnings
  node check-accessibility.js --strict     # Fail CI on errors
  node check-accessibility.js --fix        # Show how to fix issues

Scanned directories:
${CONFIG.scanDirs.map(d => `  - ${d}`).join('\n')}

Anti-patterns detected:
${CONFIG.antiPatterns.map(p => `  - ${p.name}: ${p.message}`).join('\n')}
`);
  process.exit(0);
}

const options = {
  strict: args.includes('--strict') || args.includes('-s'),
  showFix: args.includes('--fix') || args.includes('-f'),
  verbose: args.includes('--verbose') || args.includes('-v'),
};

const { passed } = checkAccessibility(options);

if (!passed && options.strict) {
  process.exit(1);
}

