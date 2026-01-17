#!/usr/bin/env node
/**
 * i18n Sync Script
 * 
 * Syncs missing keys from en-US.json to other locale files.
 * Keys in target locales that don't exist in en-US are preserved.
 * 
 * Usage:
 *   node scripts/sync-i18n.js          # Preview changes
 *   node scripts/sync-i18n.js --write  # Apply changes
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOCALES_DIR = join(__dirname, '../src/i18n/locales');
const SOURCE_LOCALE = 'en-US.json';

function loadJSON(filepath) {
  return JSON.parse(readFileSync(filepath, 'utf-8'));
}

function getAllKeys(obj, prefix = '') {
  const keys = [];
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys.push(...getAllKeys(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function getNestedValue(obj, path) {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

function setNestedValue(obj, path, value) {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current)) {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

function syncLocale(sourceObj, targetObj, targetLocale) {
  const sourceKeys = getAllKeys(sourceObj);
  const targetKeys = getAllKeys(targetObj);
  
  const missingKeys = sourceKeys.filter(key => !targetKeys.includes(key));
  const extraKeys = targetKeys.filter(key => !sourceKeys.includes(key));
  
  // Add missing keys with English fallback
  for (const key of missingKeys) {
    const sourceValue = getNestedValue(sourceObj, key);
    setNestedValue(targetObj, key, sourceValue);
  }
  
  return { missingKeys, extraKeys };
}

function sortObjectKeys(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return obj;
  }
  
  const sorted = {};
  const keys = Object.keys(obj).sort();
  
  for (const key of keys) {
    sorted[key] = sortObjectKeys(obj[key]);
  }
  
  return sorted;
}

function main() {
  const args = process.argv.slice(2);
  const shouldWrite = args.includes('--write');
  
  console.log('🌍 i18n Sync Tool\n');
  console.log('='.repeat(60));
  
  // Load source locale
  const sourcePath = join(LOCALES_DIR, SOURCE_LOCALE);
  const sourceObj = loadJSON(sourcePath);
  const sourceKeys = getAllKeys(sourceObj);
  
  console.log(`\n📚 Source: ${SOURCE_LOCALE} (${sourceKeys.length} keys)\n`);
  
  // Get all locale files
  const localeFiles = readdirSync(LOCALES_DIR).filter(f => 
    f.endsWith('.json') && f !== SOURCE_LOCALE
  );
  
  const summary = [];
  
  for (const localeFile of localeFiles) {
    const localePath = join(LOCALES_DIR, localeFile);
    const targetObj = loadJSON(localePath);
    
    const { missingKeys, extraKeys } = syncLocale(sourceObj, targetObj, localeFile);
    
    summary.push({
      locale: localeFile,
      missing: missingKeys.length,
      extra: extraKeys.length,
    });
    
    console.log(`\n📁 ${localeFile}`);
    console.log(`   Missing: ${missingKeys.length} keys`);
    console.log(`   Extra: ${extraKeys.length} keys (preserved)`);
    
    if (missingKeys.length > 0) {
      console.log('\n   Missing keys (will use English):');
      for (const key of missingKeys.slice(0, 10)) {
        console.log(`   + ${key}`);
      }
      if (missingKeys.length > 10) {
        console.log(`   ... and ${missingKeys.length - 10} more`);
      }
    }
    
    if (shouldWrite && missingKeys.length > 0) {
      // Sort keys for consistency
      const sortedObj = sortObjectKeys(targetObj);
      writeFileSync(localePath, JSON.stringify(sortedObj, null, 2) + '\n');
      console.log(`   ✅ Updated ${localeFile}`);
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Summary:\n');
  console.log('| Locale | Missing | Extra |');
  console.log('|--------|---------|-------|');
  for (const s of summary) {
    console.log(`| ${s.locale.padEnd(6)} | ${String(s.missing).padEnd(7)} | ${String(s.extra).padEnd(5)} |`);
  }
  
  const totalMissing = summary.reduce((acc, s) => acc + s.missing, 0);
  
  if (totalMissing > 0 && !shouldWrite) {
    console.log('\n💡 Run with --write to apply changes');
    console.log('   node scripts/sync-i18n.js --write\n');
  } else if (totalMissing === 0) {
    console.log('\n✅ All locales are in sync!\n');
  } else {
    console.log(`\n✅ Synced ${totalMissing} keys across ${localeFiles.length} locales\n`);
  }
}

main();

