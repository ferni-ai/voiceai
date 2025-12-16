#!/usr/bin/env node
/**
 * Ferni Accessibility Color Checker
 * 
 * Scans UI files for WCAG 2.1 AA color accessibility violations.
 * Prevents using persona colors as text colors (fails on dark backgrounds).
 * 
 * Usage:
 *   node scripts/check-a11y-colors.js           # Warn mode
 *   node scripts/check-a11y-colors.js --strict  # Fail on errors
 *   node scripts/check-a11y-colors.js --fix     # Show fix suggestions
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  scanDirs: ['src/ui', 'src/components'],
  extensions: ['.ts', '.tsx'],
  
  // Error patterns - these MUST be fixed
  // Note: We use (?<![\w-]) negative lookbehind to avoid matching 'border-color', 'background-color', etc.
  errorPatterns: [
    {
      name: 'persona-primary-as-text',
      regex: /(?<![a-zA-Z-])color:\s*var\(--persona-primary/g,
      message: '--persona-primary as text color fails WCAG AA (1.06:1 contrast on dark bg)',
      fix: 'Use var(--color-accent-text) for accent text or var(--color-text-*) for body text',
    },
    {
      name: 'hardcoded-ferni-green-text',
      regex: /(?<![a-zA-Z-])color:\s*['"]?#4a6741['"]?/gi,
      message: 'Hardcoded #4a6741 (Ferni green) as text fails WCAG AA',
      fix: 'Use var(--color-accent-text)',
    },
    {
      name: 'hardcoded-persona-secondary-text',
      regex: /(?<![a-zA-Z-])color:\s*['"]?#3d5a35['"]?/gi,
      message: 'Hardcoded #3d5a35 (Ferni secondary) as text fails WCAG AA',
      fix: 'Use var(--color-accent-text)',
    },
  ],
  
  // Warning patterns - should be reviewed
  // Note: Using negative lookbehind to only match 'color:' not 'border-color', etc.
  warningPatterns: [
    {
      name: 'member-color-as-text',
      regex: /(?<![a-zA-Z-])color:\s*var\(--member-color/g,
      message: '--member-color may fail WCAG AA depending on the persona',
      fix: 'Consider using var(--color-text-primary) for guaranteed accessibility',
    },
    {
      name: 'light-fallback-in-text',
      regex: /(?<![a-zA-Z-])color:\s*var\([^)]+,\s*#(5[cC]544[aA]|756[aA]5[eE]|5a5048)\)/g,
      message: 'Light theme fallback color may fail on dark backgrounds',
      fix: 'Remove fallback or use theme-appropriate values',
    },
  ],
};

// ============================================================================
// HELPERS
// ============================================================================

function getFiles(dir) {
  const results = [];
  const fullPath = path.join(rootDir, dir);
  
  if (!fs.existsSync(fullPath)) return results;
  
  const items = fs.readdirSync(fullPath, { withFileTypes: true });
  
  for (const item of items) {
    const itemPath = path.join(fullPath, item.name);
    
    if (item.isDirectory()) {
      results.push(...getFiles(path.join(dir, item.name)));
    } else if (CONFIG.extensions.some(ext => item.name.endsWith(ext))) {
      results.push(itemPath);
    }
  }
  
  return results;
}

function getLineNumber(content, index) {
  return content.substring(0, index).split('\n').length;
}

function getLineContent(content, lineNum) {
  const lines = content.split('\n');
  return lines[lineNum - 1]?.trim() || '';
}

function isCommentLine(line) {
  const trimmed = line.trim();
  // Skip JSDoc, single-line comments, and multi-line comment content
  return (
    trimmed.startsWith('*') ||      // JSDoc or multi-line comment
    trimmed.startsWith('//') ||     // Single-line comment
    trimmed.startsWith('/*') ||     // Start of multi-line comment
    trimmed.startsWith('@example')  // JSDoc example tag
  );
}

// ============================================================================
// MAIN CHECK
// ============================================================================

function checkFiles(options = {}) {
  const { strict = false, showFix = false } = options;
  
  console.log('\n🎨 Ferni A11y Color Checker');
  console.log('═'.repeat(60));
  console.log('Checking for WCAG 2.1 AA color accessibility violations...\n');
  
  const errors = [];
  const warnings = [];
  let filesScanned = 0;
  
  // Collect files
  const files = [];
  for (const dir of CONFIG.scanDirs) {
    files.push(...getFiles(dir));
  }
  
  filesScanned = files.length;
  
  // Check each file
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const relativePath = path.relative(rootDir, file);
    
    // Check error patterns
    for (const pattern of CONFIG.errorPatterns) {
      let match;
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      
      while ((match = regex.exec(content)) !== null) {
        const lineNum = getLineNumber(content, match.index);
        const lineContent = getLineContent(content, lineNum);
        
        // Skip comment lines (JSDoc, //, /*, etc.)
        if (isCommentLine(lineContent)) continue;
        
        errors.push({
          file: relativePath,
          line: lineNum,
          column: match.index - content.lastIndexOf('\n', match.index),
          pattern: pattern.name,
          message: pattern.message,
          fix: pattern.fix,
          code: lineContent,
        });
      }
    }
    
    // Check warning patterns
    for (const pattern of CONFIG.warningPatterns) {
      let match;
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      
      while ((match = regex.exec(content)) !== null) {
        const lineNum = getLineNumber(content, match.index);
        const lineContent = getLineContent(content, lineNum);
        
        // Skip comment lines
        if (isCommentLine(lineContent)) continue;
        
        warnings.push({
          file: relativePath,
          line: lineNum,
          pattern: pattern.name,
          message: pattern.message,
          fix: pattern.fix,
        });
      }
    }
  }
  
  // ========================================
  // Report Results
  // ========================================
  
  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ No accessibility color issues found!\n');
    console.log(`   Scanned ${filesScanned} files.`);
    console.log('   All text colors comply with WCAG 2.1 AA.\n');
    return { passed: true, errors: 0, warnings: 0 };
  }
  
  // Print errors
  if (errors.length > 0) {
    console.log(`❌ ${errors.length} ERROR(S) - Must fix before commit\n`);
    console.log('─'.repeat(60));
    
    // Group by file
    const grouped = {};
    errors.forEach(err => {
      if (!grouped[err.file]) grouped[err.file] = [];
      grouped[err.file].push(err);
    });
    
    Object.entries(grouped).forEach(([file, fileErrors]) => {
      console.log(`\n📄 ${file}`);
      fileErrors.forEach(err => {
        console.log(`   ${err.line}:${err.column} │ ${err.pattern}`);
        console.log(`            │ ${err.message}`);
        if (showFix) {
          console.log(`            │ 💡 ${err.fix}`);
        }
        console.log(`            │ Code: ${err.code.substring(0, 60)}...`);
      });
    });
  }
  
  // Print warnings
  if (warnings.length > 0) {
    console.log(`\n⚠️  ${warnings.length} WARNING(S)\n`);
    console.log('─'.repeat(60));
    
    warnings.slice(0, 10).forEach(warn => {
      console.log(`   ${warn.file}:${warn.line} - ${warn.pattern}`);
    });
    
    if (warnings.length > 10) {
      console.log(`   ... and ${warnings.length - 10} more warnings`);
    }
  }
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(60));
  console.log(`   Files scanned:  ${filesScanned}`);
  console.log(`   Errors:         ${errors.length}`);
  console.log(`   Warnings:       ${warnings.length}`);
  
  if (errors.length > 0) {
    console.log('\n📝 Quick Reference - Accessible Text Colors (Dark Theme):');
    console.log('   --color-text-primary    │ Headings, important text');
    console.log('   --color-text-secondary  │ Body text, descriptions');
    console.log('   --color-text-muted      │ Labels, hints');
    console.log('   --color-accent-text     │ Accent text (gold, large only)');
    console.log('\n🚫 NEVER use for text: --persona-primary, #4a6741\n');
  }
  
  // Exit handling
  if (strict && errors.length > 0) {
    console.log('🚫 FAILED: Fix errors to pass CI/pre-commit hook.\n');
    process.exit(1);
  }
  
  return { passed: errors.length === 0, errors: errors.length, warnings: warnings.length };
}

// ============================================================================
// CLI
// ============================================================================

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Ferni A11y Color Checker

Validates text color accessibility for WCAG 2.1 AA compliance.

Usage:
  node scripts/check-a11y-colors.js [options]

Options:
  --strict, -s    Exit with code 1 if errors found
  --fix, -f       Show fix suggestions
  --help, -h      Show this help

What it checks:
  ❌ ERROR: --persona-primary as text color (1.06:1 contrast)
  ❌ ERROR: Hardcoded #4a6741 as text color
  ⚠️  WARN: --member-color as text (may fail)
  ⚠️  WARN: Light theme fallbacks in text colors
`);
  process.exit(0);
}

checkFiles({
  strict: args.includes('--strict') || args.includes('-s'),
  showFix: args.includes('--fix') || args.includes('-f'),
});

