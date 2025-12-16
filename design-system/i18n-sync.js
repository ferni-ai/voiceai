#!/usr/bin/env node
/**
 * i18n Sync Script
 *
 * Syncs missing translation keys across all locales.
 * Uses the source locale (en-US/en) as the source of truth.
 *
 * Usage:
 *   node design-system/i18n-sync.js
 *   npm run i18n:sync
 *
 * Behavior:
 *   - Finds keys in source locale missing from other locales
 *   - Adds missing keys with empty string value (makes missing translations obvious)
 *   - Preserves existing translations
 *   - Reports what was added
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(__dirname);

// ============================================================================
// CONFIGURATION
// ============================================================================

const SYNC_CONFIGS = [
  {
    name: 'Backend (Voice Agent)',
    localeDir: 'src/i18n/locales',
    sourceLocale: 'en-US.json',
  },
  {
    name: 'Frontend App',
    localeDir: 'apps/web/src/i18n/locales',
    sourceLocale: 'en-US.json',
  },
  {
    name: 'Landing Page',
    localeDir: 'promo/ferni-website/src/_data/i18n',
    sourceLocale: 'en.json',
  },
];

// ============================================================================
// HELPERS
// ============================================================================

function readJsonFile(filepath) {
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function writeJsonFile(filepath, data) {
  const content = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(filepath, content, 'utf-8');
}

function getAllKeys(obj, prefix = '') {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...getAllKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function getNestedValue(obj, keyPath) {
  const keys = keyPath.split('.');
  let current = obj;
  for (const key of keys) {
    if (current === null || current === undefined) return undefined;
    current = current[key];
  }
  return current;
}

function setNestedValue(obj, keyPath, value) {
  const keys = keyPath.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
}

function hasNestedKey(obj, keyPath) {
  return getNestedValue(obj, keyPath) !== undefined;
}

// ============================================================================
// SYNC FUNCTION
// ============================================================================

function syncLocale(sourceLocale, targetLocale, targetPath) {
  const sourceKeys = getAllKeys(sourceLocale);
  const added = [];

  for (const key of sourceKeys) {
    // Skip meta section (locale-specific)
    if (key === 'meta' || key.startsWith('meta.')) continue;

    // Check if key exists in target
    if (!hasNestedKey(targetLocale, key)) {
      // Add with empty string (makes missing translations obvious in UI)
      setNestedValue(targetLocale, key, '');
      added.push(key);
    }
  }

  if (added.length > 0) {
    writeJsonFile(targetPath, targetLocale);
  }

  return added;
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  console.log('🔄 Syncing i18n translations...\n');

  let totalAdded = 0;
  let filesModified = 0;

  for (const config of SYNC_CONFIGS) {
    console.log(`📦 ${config.name}`);

    const localeDir = path.join(PROJECT_ROOT, config.localeDir);

    if (!fs.existsSync(localeDir)) {
      console.log(`   ⚠️  Locale directory not found: ${config.localeDir}`);
      continue;
    }

    // Load source locale
    const sourceLocalePath = path.join(localeDir, config.sourceLocale);
    const sourceLocale = readJsonFile(sourceLocalePath);

    if (!sourceLocale) {
      console.log(`   ⚠️  Source locale not found: ${config.sourceLocale}`);
      continue;
    }

    const sourceKeyCount = getAllKeys(sourceLocale).filter((k) => !k.startsWith('meta')).length;
    console.log(`   Source: ${config.sourceLocale} (${sourceKeyCount} keys)`);

    // Process each target locale
    const files = fs
      .readdirSync(localeDir)
      .filter((f) => f.endsWith('.json') && f !== config.sourceLocale);

    for (const file of files) {
      const targetPath = path.join(localeDir, file);
      const targetLocale = readJsonFile(targetPath);

      if (!targetLocale) {
        console.log(`   ⚠️  Cannot read: ${file}`);
        continue;
      }

      const added = syncLocale(sourceLocale, targetLocale, targetPath);

      if (added.length > 0) {
        console.log(`   ✅ ${file}: Added ${added.length} missing keys`);
        totalAdded += added.length;
        filesModified++;

        // Show first few added keys
        if (added.length <= 3) {
          added.forEach((k) => console.log(`      + ${k}`));
        } else {
          added.slice(0, 3).forEach((k) => console.log(`      + ${k}`));
          console.log(`      ... and ${added.length - 3} more`);
        }
      } else {
        console.log(`   ✅ ${file}: Already in sync`);
      }
    }

    console.log('');
  }

  // Summary
  console.log('─'.repeat(60));
  if (totalAdded > 0) {
    console.log(`\n✅ Sync complete: Added ${totalAdded} keys across ${filesModified} files`);
    console.log('   Keys added with empty value - translations needed!');
    console.log('\n   Next steps:');
    console.log('   1. Review added keys in locale files');
    console.log('   2. Add proper translations');
    console.log('   3. Run: npm run i18n:check');
  } else {
    console.log('\n✅ All locales already in sync!');
  }
}

main();
