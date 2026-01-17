#!/usr/bin/env node
/**
 * i18n Linting Script
 * 
 * Scans UI files for hardcoded strings that should be localized.
 * 
 * Usage:
 *   node apps/web/scripts/lint-i18n.js           # Scan all files
 *   node apps/web/scripts/lint-i18n.js --staged  # Only show errors (for pre-commit)
 *   node apps/web/scripts/lint-i18n.js --fix     # Show suggested fixes
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const UI_DIR = join(__dirname, '../src/ui');
const SERVICES_DIR = join(__dirname, '../src/services');

// Parse CLI args
const args = process.argv.slice(2);
const isStaged = args.includes('--staged');
const showFix = args.includes('--fix');

// Patterns that indicate hardcoded strings needing i18n
const PATTERNS = [
  { 
    name: 'textContent assignment',
    regex: /textContent\s*=\s*['"`][A-Z][^'"`]*['"`]/g,
    severity: 'error'
  },
  {
    name: 'innerHTML with text',
    regex: /innerHTML\s*=\s*['"`](?![<])[A-Z][^'"`]*['"`]/g,
    severity: 'error'
  },
  {
    name: 'aria-label hardcoded',
    regex: /aria-label=["'][A-Z][^"']*["']/g,
    severity: 'warning'
  },
  {
    name: 'placeholder hardcoded',
    regex: /placeholder=["'][A-Z][^"']*["']/g,
    severity: 'warning'
  },
  {
    name: 'title property',
    regex: /title:\s*['"][A-Z][^'"]*['"]/g,
    severity: 'warning'
  },
  {
    name: 'toast message',
    regex: /toast\.(success|error|info|warning)\(['"][A-Z][^'"]*['"]\)/g,
    severity: 'error'
  }
];

// Files/patterns to skip
const SKIP_PATTERNS = [
  /\.test\.ts$/,
  /dev-panel/,
  /debug-panel/,
  /admin\.ui/,
  /evalops/,
  /\.styles\.ts$/,
  /index\.ts$/
];

function getAllFiles(dir, files = []) {
  const items = readdirSync(dir);
  
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      getAllFiles(fullPath, files);
    } else if (item.endsWith('.ts') && !item.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function shouldSkip(filePath) {
  return SKIP_PATTERNS.some(pattern => pattern.test(filePath));
}

function checkFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const hasI18nImport = /from\s+['"].*i18n/.test(content);
  const relPath = relative(process.cwd(), filePath);
  
  const issues = [];
  
  // Check if file has any user-facing strings but no i18n import
  if (!hasI18nImport) {
    for (const pattern of PATTERNS) {
      const matches = content.match(pattern.regex);
      if (matches) {
        for (const match of matches) {
          // Find line number
          const lines = content.split('\n');
          let lineNum = 0;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(match.slice(0, 30))) {
              lineNum = i + 1;
              break;
            }
          }
          
          issues.push({
            file: relPath,
            line: lineNum,
            pattern: pattern.name,
            match: match.length > 60 ? match.slice(0, 60) + '...' : match,
            severity: pattern.severity
          });
        }
      }
    }
  }
  
  return { 
    file: relPath, 
    hasI18n: hasI18nImport, 
    issues 
  };
}

function main() {
  if (!isStaged) {
    console.log('🌍 i18n Lint Report\n');
    console.log('='.repeat(60));
  }
  
  const uiFiles = getAllFiles(UI_DIR);
  const serviceFiles = getAllFiles(SERVICES_DIR);
  const allFiles = [...uiFiles, ...serviceFiles];
  
  let totalIssues = 0;
  let errorCount = 0;
  let warningCount = 0;
  const filesWithIssues = [];
  const filesWithoutI18n = [];
  
  for (const file of allFiles) {
    if (shouldSkip(file)) continue;
    
    const result = checkFile(file);
    
    if (!result.hasI18n && result.issues.length === 0) {
      // Check if file has any text at all
      const content = readFileSync(file, 'utf-8');
      if (/['"][A-Z][a-z]/.test(content)) {
        filesWithoutI18n.push(result.file);
      }
    }
    
    if (result.issues.length > 0) {
      filesWithIssues.push(result);
      totalIssues += result.issues.length;
      errorCount += result.issues.filter(i => i.severity === 'error').length;
      warningCount += result.issues.filter(i => i.severity === 'warning').length;
    }
  }
  
  // For staged mode, only print errors and exit
  if (isStaged) {
    if (errorCount > 0) {
      console.log(`🌍 i18n: ${errorCount} hardcoded strings found`);
      for (const result of filesWithIssues) {
        const errors = result.issues.filter(i => i.severity === 'error');
        if (errors.length > 0) {
          console.log(`   ${result.file}: ${errors.length} error(s)`);
          for (const err of errors.slice(0, 3)) {
            console.log(`      L${err.line}: ${err.match.slice(0, 50)}...`);
          }
        }
      }
      console.log(`\n   Use t('key') from i18n/index.js for user-facing strings`);
      // Don't exit 1 for now - too many existing issues
      // process.exit(1);
    }
    return;
  }
  
  // Print full summary
  console.log(`\n📊 Summary`);
  console.log(`   Total files scanned: ${allFiles.length}`);
  console.log(`   Files with issues: ${filesWithIssues.length}`);
  console.log(`   Total issues: ${totalIssues}`);
  console.log(`   🔴 Errors: ${errorCount}`);
  console.log(`   🟡 Warnings: ${warningCount}`);
  
  if (filesWithIssues.length > 0) {
    console.log(`\n🔍 Issues Found\n`);
    
    for (const result of filesWithIssues.slice(0, 20)) {
      console.log(`\n📁 ${result.file}`);
      for (const issue of result.issues) {
        const icon = issue.severity === 'error' ? '🔴' : '🟡';
        console.log(`   ${icon} L${issue.line}: ${issue.pattern}`);
        console.log(`      ${issue.match}`);
        if (showFix) {
          // Suggest fix
          const suggestedKey = suggestKey(issue.match, issue.pattern);
          console.log(`      💡 Use: t('${suggestedKey}')`);
        }
      }
    }
    
    if (filesWithIssues.length > 20) {
      console.log(`\n   ... and ${filesWithIssues.length - 20} more files`);
    }
  }
  
  if (filesWithoutI18n.length > 0 && !isStaged) {
    console.log(`\n⚠️  Files without i18n import (may need localization):`);
    for (const file of filesWithoutI18n.slice(0, 10)) {
      console.log(`   - ${file}`);
    }
    if (filesWithoutI18n.length > 10) {
      console.log(`   ... and ${filesWithoutI18n.length - 10} more`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  
  // Exit with error code if there are errors
  if (errorCount > 0) {
    console.log(`\n❌ ${errorCount} errors found. Please localize these strings.\n`);
    console.log(`   Run with --fix to see suggested translation keys.\n`);
    // Don't exit 1 for now - too many existing issues to block
    // process.exit(1);
  } else if (warningCount > 0) {
    console.log(`\n⚠️  ${warningCount} warnings. Consider localizing these strings.\n`);
  } else {
    console.log(`\n✅ No i18n issues found!\n`);
  }
}

/**
 * Suggest a translation key based on the hardcoded string
 */
function suggestKey(match, patternName) {
  // Extract the string value
  const stringMatch = match.match(/['"`]([^'"`]+)['"`]/);
  if (!stringMatch) return 'common.yourKey';
  
  const text = stringMatch[1];
  
  // Suggest based on pattern
  if (patternName === 'toast message') {
    if (text.toLowerCase().includes('error') || text.toLowerCase().includes("couldn't")) {
      return `toasts.${camelCase(text.slice(0, 30))}`;
    }
    if (text.toLowerCase().includes('saved') || text.toLowerCase().includes('success')) {
      return `toasts.${camelCase(text.slice(0, 30))}`;
    }
    return `toasts.${camelCase(text.slice(0, 30))}`;
  }
  
  if (patternName === 'aria-label hardcoded') {
    return `accessibility.${camelCase(text.slice(0, 30))}`;
  }
  
  if (patternName === 'placeholder hardcoded') {
    return `placeholders.${camelCase(text.slice(0, 30))}`;
  }
  
  return `common.${camelCase(text.slice(0, 30))}`;
}

function camelCase(str) {
  return str
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^./, (chr) => chr.toLowerCase())
    .slice(0, 40);
}

main();

