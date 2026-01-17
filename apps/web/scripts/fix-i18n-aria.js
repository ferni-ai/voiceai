#!/usr/bin/env node
/**
 * Automated i18n Aria-Label Fixer
 * 
 * Automatically replaces hardcoded aria-label values with t() calls
 * 
 * Usage:
 *   node scripts/fix-i18n-aria.js --dry-run   # Preview changes
 *   node scripts/fix-i18n-aria.js             # Apply changes
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const UI_DIR = join(__dirname, '../src/ui');
const EN_US_PATH = join(__dirname, '../src/i18n/locales/en-US.json');

const isDryRun = process.argv.includes('--dry-run');
const isVerbose = process.argv.includes('--verbose');

// Files to skip
const SKIP_FILES = [
  'dev-panel.ui.ts',
  'admin.ui.ts',
  'evalops-dashboard.ui.ts',
];

// Load existing accessibility keys
const enUS = JSON.parse(readFileSync(EN_US_PATH, 'utf-8'));
const a11yKeys = enUS.accessibility || {};

// Create reverse lookup: value -> key
const valuesToKeys = {};
for (const [key, value] of Object.entries(a11yKeys)) {
  valuesToKeys[value] = key;
}

function getAllFiles(dir, files = []) {
  try {
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
  } catch (e) {}
  return files;
}

function shouldSkip(filePath) {
  return SKIP_FILES.some(skip => filePath.endsWith(skip));
}

function camelCase(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^./, (chr) => chr.toLowerCase())
    .replace(/[^a-zA-Z0-9]/g, '');
}

function getImportPath(filePath) {
  const relPath = relative(join(__dirname, '../src'), filePath);
  const depth = relPath.split('/').length - 1;
  return '../'.repeat(depth) + 'i18n/index.js';
}

function processFile(filePath) {
  let content = readFileSync(filePath, 'utf-8');
  const originalContent = content;
  const relPath = relative(process.cwd(), filePath);
  
  // Check if file already imports from i18n
  let hasI18nImport = /import\s*{[^}]*\bt\b[^}]*}\s*from\s*['"][^'"]*i18n/.test(content);
  
  // Pattern: aria-label="Text" (in template literals)
  const ariaRegex = /aria-label="([^"]+)"/g;
  
  let replacements = [];
  let match;
  
  while ((match = ariaRegex.exec(content)) !== null) {
    const [fullMatch, label] = match;
    
    // Skip dynamic labels or non-capitalized
    if (label.includes('${') || !/^[A-Z]/.test(label)) continue;
    
    // Look up the key
    const key = valuesToKeys[label] || camelCase(label);
    
    if (key) {
      replacements.push({
        original: fullMatch,
        replacement: `aria-label="\${t('accessibility.${key}')}"`,
        label,
        key: `accessibility.${key}`,
      });
    }
  }
  
  if (replacements.length === 0) {
    return { file: relPath, changes: 0 };
  }
  
  // Apply replacements
  for (const r of replacements) {
    content = content.replace(r.original, r.replacement);
  }
  
  // Add i18n import if needed
  if (!hasI18nImport && replacements.length > 0) {
    const importPath = getImportPath(filePath);
    const importLine = `import { t } from '${importPath}';\n`;
    
    const importMatch = content.match(/^(import\s+.*;\n)+/m);
    if (importMatch) {
      const insertPos = importMatch.index + importMatch[0].length;
      content = content.slice(0, insertPos) + importLine + content.slice(insertPos);
    } else {
      content = importLine + content;
    }
  }
  
  return {
    file: relPath,
    changes: replacements.length,
    content: content !== originalContent ? content : null,
    replacements,
  };
}

function main() {
  console.log('🌍 Automated i18n Aria-Label Fixer\n');
  console.log(isDryRun ? '📋 DRY RUN - No files will be modified\n' : '🔧 APPLYING CHANGES\n');
  console.log('='.repeat(60));
  
  const allFiles = getAllFiles(UI_DIR);
  
  let totalChanges = 0;
  const modifiedFiles = [];
  
  for (const file of allFiles) {
    if (shouldSkip(file)) continue;
    
    const result = processFile(file);
    
    if (result.changes > 0) {
      totalChanges += result.changes;
      modifiedFiles.push(result);
      
      console.log(`\n📁 ${result.file} (${result.changes} changes)`);
      if (isVerbose && result.replacements) {
        for (const r of result.replacements.slice(0, 5)) {
          console.log(`   "${r.label.slice(0, 25)}..." → t('${r.key}')`);
        }
        if (result.replacements.length > 5) {
          console.log(`   ... and ${result.replacements.length - 5} more`);
        }
      }
      
      if (!isDryRun && result.content) {
        writeFileSync(file, result.content, 'utf-8');
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Summary:`);
  console.log(`   Files modified: ${modifiedFiles.length}`);
  console.log(`   Aria-labels fixed: ${totalChanges}`);
  
  if (isDryRun) {
    console.log(`\n💡 Run without --dry-run to apply changes`);
  } else {
    console.log(`\n✅ Changes applied!`);
    console.log(`\n⚠️  Remember to run: npm run i18n:sync-missing`);
  }
}

main();
