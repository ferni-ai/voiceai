#!/usr/bin/env node
/**
 * i18n String Extraction Script
 * 
 * Extracts hardcoded strings from UI files and generates translation keys.
 * Output can be imported into translation platforms (Phrase, Lokalise, Crowdin).
 * 
 * Usage:
 *   node scripts/extract-i18n-strings.js                    # All files
 *   node scripts/extract-i18n-strings.js --file toast.ui.ts # Single file
 *   node scripts/extract-i18n-strings.js --output json      # JSON output
 *   node scripts/extract-i18n-strings.js --output csv       # CSV for spreadsheets
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const UI_DIR = join(__dirname, '../src/ui');
const OUTPUT_DIR = join(__dirname, '../src/i18n/extracted');

// Extraction patterns
const PATTERNS = [
  {
    name: 'toast',
    regex: /toast\.(success|error|info|warning)\(['"]([^'"]+)['"]\)/g,
    keyPrefix: 'toasts',
    extractValue: (match) => match[2]
  },
  {
    name: 'textContent',
    regex: /\.textContent\s*=\s*['"]([^'"]+)['"]/g,
    keyPrefix: 'ui',
    extractValue: (match) => match[1]
  },
  {
    name: 'innerHTML_text',
    regex: /\.innerHTML\s*=\s*['"]([A-Z][^'"<]*)['"]/g,
    keyPrefix: 'ui',
    extractValue: (match) => match[1]
  },
  {
    name: 'aria_label',
    regex: /aria-label=["']([^"']+)["']/g,
    keyPrefix: 'accessibility',
    extractValue: (match) => match[1]
  },
  {
    name: 'placeholder',
    regex: /placeholder=["']([^"']+)["']/g,
    keyPrefix: 'placeholders',
    extractValue: (match) => match[1]
  },
  {
    name: 'title_prop',
    regex: /title:\s*['"]([A-Z][^'"]+)['"]/g,
    keyPrefix: 'titles',
    extractValue: (match) => match[1]
  },
  {
    name: 'description_prop',
    regex: /description:\s*['"]([A-Z][^'"]+)['"]/g,
    keyPrefix: 'descriptions',
    extractValue: (match) => match[1]
  }
];

// Skip patterns
const SKIP_FILES = [
  /\.test\.ts$/,
  /\.d\.ts$/,
  /index\.ts$/,
  /\.styles\.ts$/
];

function getAllFiles(dir, files = []) {
  const items = readdirSync(dir);
  
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      getAllFiles(fullPath, files);
    } else if (item.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function shouldSkip(filePath) {
  return SKIP_FILES.some(pattern => pattern.test(filePath));
}

function generateKey(prefix, value, fileName) {
  // Create a key from the value
  const cleanValue = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join('_');
  
  const fileBase = basename(fileName, '.ui.ts').replace(/-/g, '_');
  
  return `${prefix}.${fileBase}.${cleanValue || 'text'}`;
}

function extractFromFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const fileName = basename(filePath);
  const extracted = [];
  
  for (const pattern of PATTERNS) {
    let match;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    
    while ((match = regex.exec(content)) !== null) {
      const value = pattern.extractValue(match);
      
      if (value && value.length > 1) {
        // Find line number
        const beforeMatch = content.slice(0, match.index);
        const lineNum = (beforeMatch.match(/\n/g) || []).length + 1;
        
        extracted.push({
          file: relative(process.cwd(), filePath),
          line: lineNum,
          type: pattern.name,
          key: generateKey(pattern.keyPrefix, value, fileName),
          value: value,
          original: match[0].slice(0, 80)
        });
      }
    }
  }
  
  return extracted;
}

function deduplicateByValue(strings) {
  const seen = new Map();
  
  for (const str of strings) {
    const existing = seen.get(str.value);
    if (!existing) {
      seen.set(str.value, str);
    } else {
      // Keep the shorter key
      if (str.key.length < existing.key.length) {
        seen.set(str.value, str);
      }
    }
  }
  
  return Array.from(seen.values());
}

function groupByPrefix(strings) {
  const groups = {};
  
  for (const str of strings) {
    const prefix = str.key.split('.')[0];
    if (!groups[prefix]) {
      groups[prefix] = [];
    }
    groups[prefix].push(str);
  }
  
  return groups;
}

function generateJSON(strings) {
  const result = {};
  
  for (const str of strings) {
    const parts = str.key.split('.');
    let current = result;
    
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    
    current[parts[parts.length - 1]] = str.value;
  }
  
  return result;
}

function generateCSV(strings) {
  const header = 'key,value,file,line,type\n';
  const rows = strings.map(s => 
    `"${s.key}","${s.value.replace(/"/g, '""')}","${s.file}",${s.line},"${s.type}"`
  ).join('\n');
  
  return header + rows;
}

function main() {
  const args = process.argv.slice(2);
  const outputFormat = args.includes('--output') 
    ? args[args.indexOf('--output') + 1] 
    : 'console';
  const specificFile = args.includes('--file')
    ? args[args.indexOf('--file') + 1]
    : null;
  
  console.log('🌍 i18n String Extraction\n');
  console.log('='.repeat(60));
  
  let files;
  if (specificFile) {
    files = [join(UI_DIR, specificFile)];
  } else {
    files = getAllFiles(UI_DIR);
  }
  
  let allStrings = [];
  
  for (const file of files) {
    if (shouldSkip(file)) continue;
    
    const extracted = extractFromFile(file);
    allStrings.push(...extracted);
  }
  
  // Deduplicate
  const uniqueStrings = deduplicateByValue(allStrings);
  
  console.log(`\n📊 Extraction Summary`);
  console.log(`   Files scanned: ${files.length}`);
  console.log(`   Total strings found: ${allStrings.length}`);
  console.log(`   Unique strings: ${uniqueStrings.length}`);
  
  // Group by type
  const groups = groupByPrefix(uniqueStrings);
  console.log(`\n📁 By Category:`);
  for (const [prefix, items] of Object.entries(groups)) {
    console.log(`   ${prefix}: ${items.length}`);
  }
  
  // Output
  if (outputFormat === 'json') {
    const json = generateJSON(uniqueStrings);
    const outputPath = join(OUTPUT_DIR, 'extracted-strings.json');
    
    try {
      const { mkdirSync } = await import('fs');
      mkdirSync(OUTPUT_DIR, { recursive: true });
    } catch (e) {}
    
    writeFileSync(outputPath, JSON.stringify(json, null, 2));
    console.log(`\n✅ JSON saved to: ${relative(process.cwd(), outputPath)}`);
  } else if (outputFormat === 'csv') {
    const csv = generateCSV(uniqueStrings);
    const outputPath = join(OUTPUT_DIR, 'extracted-strings.csv');
    
    try {
      const { mkdirSync } = await import('fs');
      mkdirSync(OUTPUT_DIR, { recursive: true });
    } catch (e) {}
    
    writeFileSync(outputPath, csv);
    console.log(`\n✅ CSV saved to: ${relative(process.cwd(), outputPath)}`);
  } else {
    // Console output
    console.log(`\n🔍 Extracted Strings:\n`);
    
    for (const [prefix, items] of Object.entries(groups)) {
      console.log(`\n[${prefix}]`);
      for (const item of items.slice(0, 15)) {
        console.log(`  "${item.key}": "${item.value}"`);
      }
      if (items.length > 15) {
        console.log(`  ... and ${items.length - 15} more`);
      }
    }
  }
  
  // Generate suggested additions to en-US.json
  console.log(`\n📝 Suggested additions to en-US.json:\n`);
  const suggestions = generateJSON(uniqueStrings.slice(0, 30));
  console.log(JSON.stringify(suggestions, null, 2));
  
  console.log('\n' + '='.repeat(60));
  console.log('\n💡 Next steps:');
  console.log('   1. Review extracted strings');
  console.log('   2. Add to apps/web/src/i18n/locales/en-US.json');
  console.log('   3. Run: pnpm i18n:sync to sync to other locales');
  console.log('   4. Replace hardcoded strings with t() calls\n');
}

main();

