#!/usr/bin/env node
/**
 * Sync Missing i18n Keys
 * 
 * Copies new keys from en-US.json to all other locale files.
 * Missing keys are marked with a [NEEDS_TRANSLATION] prefix.
 * 
 * Run with: node apps/web/scripts/sync-missing-i18n.js
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOCALES_DIR = join(__dirname, '../src/i18n/locales');
const SOURCE_LOCALE = 'en-US.json';

function deepMerge(target, source, markNew = false) {
  const result = { ...target };
  
  for (const key of Object.keys(source)) {
    if (!(key in result)) {
      // New key - copy from source
      if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
        result[key] = deepMerge({}, source[key], markNew);
      } else if (typeof source[key] === 'string' && markNew) {
        result[key] = `[NEEDS_TRANSLATION] ${source[key]}`;
      } else {
        result[key] = source[key];
      }
    } else if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
      // Recurse into objects
      result[key] = deepMerge(result[key] || {}, source[key], markNew);
    }
    // If key exists and is not an object, keep the existing translation
  }
  
  return result;
}

function countKeys(obj, prefix = '') {
  let count = 0;
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      count += countKeys(obj[key], `${prefix}${key}.`);
    } else {
      count++;
    }
  }
  return count;
}

function countNeedsTranslation(obj) {
  let count = 0;
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      count += countNeedsTranslation(obj[key]);
    } else if (typeof obj[key] === 'string' && obj[key].startsWith('[NEEDS_TRANSLATION]')) {
      count++;
    }
  }
  return count;
}

function main() {
  console.log('🌍 Syncing i18n Keys\n');
  console.log('='.repeat(60));
  
  // Read source locale
  const sourcePath = join(LOCALES_DIR, SOURCE_LOCALE);
  const sourceData = JSON.parse(readFileSync(sourcePath, 'utf-8'));
  const sourceKeyCount = countKeys(sourceData);
  
  console.log(`\n📄 Source: ${SOURCE_LOCALE}`);
  console.log(`   Keys: ${sourceKeyCount}\n`);
  
  // Get all locale files
  const localeFiles = readdirSync(LOCALES_DIR)
    .filter(f => f.endsWith('.json') && f !== SOURCE_LOCALE);
  
  const results = [];
  
  for (const localeFile of localeFiles) {
    const localePath = join(LOCALES_DIR, localeFile);
    const localeData = JSON.parse(readFileSync(localePath, 'utf-8'));
    const beforeCount = countKeys(localeData);
    
    // Merge missing keys
    const merged = deepMerge(localeData, sourceData, true);
    const afterCount = countKeys(merged);
    const needsTranslation = countNeedsTranslation(merged);
    
    // Write back
    writeFileSync(localePath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
    
    const added = afterCount - beforeCount;
    results.push({
      locale: localeFile.replace('.json', ''),
      before: beforeCount,
      after: afterCount,
      added,
      needsTranslation,
    });
    
    const icon = added > 0 ? '✨' : '✅';
    console.log(`${icon} ${localeFile.padEnd(15)} ${beforeCount} → ${afterCount} (+${added}) | ${needsTranslation} need translation`);
  }
  
  console.log('\n' + '='.repeat(60));
  
  const totalAdded = results.reduce((sum, r) => sum + r.added, 0);
  const totalNeedsTranslation = results.reduce((sum, r) => sum + r.needsTranslation, 0);
  
  if (totalAdded > 0) {
    console.log(`\n✨ Added ${totalAdded} new keys across ${localeFiles.length} locales`);
    console.log(`📝 ${totalNeedsTranslation} strings need professional translation`);
    console.log(`\n⚠️  Keys marked with [NEEDS_TRANSLATION] need review`);
  } else {
    console.log(`\n✅ All locales are up to date!`);
  }
  
  // Show locales sorted by completion
  console.log('\n📊 Locale Coverage:');
  const sorted = results.sort((a, b) => (b.after / sourceKeyCount) - (a.after / sourceKeyCount));
  for (const r of sorted) {
    const pct = Math.round((r.after / sourceKeyCount) * 100);
    const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
    console.log(`   ${r.locale.padEnd(10)} ${bar} ${pct}%`);
  }
}

main();
