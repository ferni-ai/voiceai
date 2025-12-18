#!/usr/bin/env node
/**
 * i18n Validation Script
 *
 * Validates translation integrity across all locales.
 * Run this in CI to catch i18n issues before deploy.
 *
 * Usage:
 *   node design-system/check-i18n.js
 *   npm run i18n:check
 *
 * Exit codes:
 *   0 - All translations valid
 *   1 - Validation errors (missing keys, mismatched placeholders, etc.)
 *
 * Checks:
 *   1. Missing keys - keys used in code but not in locale files
 *   2. Locale consistency - all locales have same keys as en-US
 *   3. Placeholder consistency - interpolation vars match across locales
 *   4. Import path validation - i18n imports use correct paths
 */

import fs from 'fs';
import { globSync } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(__dirname);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Backend i18n (voice agent)
  backend: {
    localeDir: 'src/i18n/locales',
    sourceLocale: 'en-US.json',
    sourcePatterns: ['src/**/*.ts'],
    // Regex patterns to extract translation keys
    keyPatterns: [
      /(?:^|[\s,(=])t\(\s*['"]([^'"]+)['"]/gm, // t('key') - standalone t function
    ],
  },
  // Frontend app i18n
  frontend: {
    localeDir: 'apps/web/src/i18n/locales',
    sourceLocale: 'en-US.json',
    sourcePatterns: [
      'apps/web/src/ui/**/*.ts',
      'apps/web/src/app.ts',
      'apps/web/src/services/**/*.ts',
    ],
    // Regex patterns to extract translation keys
    // Using word boundary to ensure 't' is a standalone function, not part of another word
    keyPatterns: [
      /(?:^|[\s,(=])t\(\s*['"]([^'"]+)['"]/gm, // t('key') - standalone t function
    ],
  },
  // Landing page i18n
  landing: {
    localeDir: 'apps/website/ferni-website/src/_data/i18n',
    sourceLocale: 'en.json',
    sourcePatterns: ['apps/website/ferni-website/src/**/*.njk', 'apps/website/ferni-website/src/**/*.html'],
    keyPatterns: [
      /\{\{\s*['"]([^'"]+)['"]\s*\|\s*t\s*\}\}/g, // {{ 'key' | t }}
    ],
  },
};

// Patterns that indicate a string is NOT a translation key
const NON_TRANSLATION_PATTERNS = [
  /^\/api\//, // API paths
  /^\.\//, // Relative imports
  /^\.{2}\//, // Parent imports
  /^\./, // CSS selectors starting with .
  /^#/, // CSS selectors starting with #
  /^\[/, // Attribute selectors
  /^ferni:/, // Custom events
  /^@/, // Package names
  /^https?:/, // URLs
  /^data-/, // Data attributes
  /^<[a-z]/i, // HTML tags
  /^[a-z]+$/, // Single lowercase word (HTML elements)
  /\s/, // Contains spaces (likely prose, not key)
  /^[A-Z][A-Z\s]+$/, // ALL CAPS (likely labels, not keys)
  /[<>{}[\]]/, // Contains HTML/template brackets
  /\.(ts|js|json|css|svg|png|jpg)$/i, // File extensions
];

// Supported locales (must exist in both systems)
const REQUIRED_LOCALES = [
  'en-US',
  'en-GB',
  'es',
  'fr',
  'de',
  'ja',
  'ko',
  'zh-Hans',
  'zh-Hant',
  'ar',
  'he',
];

// ============================================================================
// HELPERS
// ============================================================================

function readJsonFile(filepath) {
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
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

function extractPlaceholders(str) {
  if (typeof str !== 'string') return [];
  const matches = str.match(/\{(\w+)\}/g) || [];
  return matches.map((m) => m.slice(1, -1)).sort();
}

function readSourceFiles(patterns) {
  const files = [];
  for (const pattern of patterns) {
    const fullPattern = path.join(PROJECT_ROOT, pattern);
    const matches = globSync(fullPattern, { nodir: true });
    files.push(...matches);
  }
  return files;
}

function isLikelyTranslationKey(key) {
  // Translation keys look like: "menu.title", "settings.theme", "button.save"
  // They don't look like: "div", "/api/foo", ".className", "ferni:event"

  // Must have at least one dot (nested key) to be a valid i18n key
  if (!key.includes('.')) {
    return false;
  }

  // Check against known non-translation patterns
  for (const pattern of NON_TRANSLATION_PATTERNS) {
    if (pattern.test(key)) {
      return false;
    }
  }

  return true;
}

function extractKeysFromFile(filepath, keyPatterns) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const keys = new Set();

  for (const pattern of keyPatterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (match[1]) {
        const key = match[1];
        // Skip dynamic keys with variables
        if (key.includes('${') || key.includes('`')) {
          continue;
        }
        // Only add if it looks like a translation key
        if (isLikelyTranslationKey(key)) {
          keys.add(key);
        }
      }
    }
  }

  return Array.from(keys);
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

function checkLocaleFilesExist(config, system) {
  const issues = [];
  const localeDir = path.join(PROJECT_ROOT, config.localeDir);

  if (!fs.existsSync(localeDir)) {
    issues.push(`Locale directory not found: ${config.localeDir}`);
    return { issues, locales: [] };
  }

  const files = fs.readdirSync(localeDir).filter((f) => f.endsWith('.json'));
  const locales = files.map((f) => f.replace('.json', ''));

  // Check source locale exists
  const sourceLocalePath = path.join(localeDir, config.sourceLocale);
  if (!fs.existsSync(sourceLocalePath)) {
    issues.push(`Source locale not found: ${config.sourceLocale}`);
  }

  return { issues, locales, localeDir };
}

function checkMissingKeys(config, system) {
  const issues = [];
  const warnings = [];

  // Extract keys from source code
  const sourceFiles = readSourceFiles(config.sourcePatterns);
  const usedKeys = new Set();

  for (const file of sourceFiles) {
    const keys = extractKeysFromFile(file, config.keyPatterns);
    keys.forEach((k) => usedKeys.add(k));
  }

  if (usedKeys.size === 0) {
    warnings.push(`No translation keys found in ${system} source files`);
    return { issues, warnings, usedKeys: Array.from(usedKeys) };
  }

  // Load source locale
  const sourceLocalePath = path.join(PROJECT_ROOT, config.localeDir, config.sourceLocale);
  const sourceLocale = readJsonFile(sourceLocalePath);

  if (!sourceLocale) {
    issues.push(`Cannot read source locale: ${config.sourceLocale}`);
    return { issues, warnings, usedKeys: Array.from(usedKeys) };
  }

  const availableKeys = new Set(getAllKeys(sourceLocale));

  // Find missing keys
  for (const key of usedKeys) {
    // Skip meta keys and dynamic patterns
    if (key === 'meta' || key.startsWith('meta.')) continue;

    if (!availableKeys.has(key)) {
      issues.push(`Missing key in ${config.sourceLocale}: "${key}"`);
    }
  }

  return {
    issues,
    warnings,
    usedKeys: Array.from(usedKeys),
    availableKeys: Array.from(availableKeys),
  };
}

function checkLocaleConsistency(config, system) {
  const issues = [];
  const warnings = [];

  const localeDir = path.join(PROJECT_ROOT, config.localeDir);
  const sourceLocalePath = path.join(localeDir, config.sourceLocale);
  const sourceLocale = readJsonFile(sourceLocalePath);

  if (!sourceLocale) {
    return { issues: [`Cannot read source locale: ${config.sourceLocale}`], warnings };
  }

  const sourceKeys = new Set(getAllKeys(sourceLocale));

  // Check each locale file
  const files = fs
    .readdirSync(localeDir)
    .filter((f) => f.endsWith('.json') && f !== config.sourceLocale);

  for (const file of files) {
    const localePath = path.join(localeDir, file);
    const locale = readJsonFile(localePath);

    if (!locale) {
      issues.push(`Cannot read locale: ${file}`);
      continue;
    }

    const localeKeys = new Set(getAllKeys(locale));

    // Find keys missing from this locale
    const missing = [];
    for (const key of sourceKeys) {
      // Skip meta section
      if (key === 'meta' || key.startsWith('meta.')) continue;

      if (!localeKeys.has(key)) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      issues.push(`${file}: Missing ${missing.length} keys from source locale`);
      // Show first 5 missing keys
      missing.slice(0, 5).forEach((k) => {
        issues.push(`  - ${k}`);
      });
      if (missing.length > 5) {
        issues.push(`  ... and ${missing.length - 5} more`);
      }
    }

    // Find extra keys (warning only)
    const extra = [];
    for (const key of localeKeys) {
      if (key === 'meta' || key.startsWith('meta.')) continue;
      if (!sourceKeys.has(key)) {
        extra.push(key);
      }
    }

    if (extra.length > 0) {
      warnings.push(`${file}: Has ${extra.length} extra keys not in source locale`);
    }
  }

  return { issues, warnings };
}

function checkPlaceholderConsistency(config, system) {
  const issues = [];

  const localeDir = path.join(PROJECT_ROOT, config.localeDir);
  const sourceLocalePath = path.join(localeDir, config.sourceLocale);
  const sourceLocale = readJsonFile(sourceLocalePath);

  if (!sourceLocale) {
    return { issues: [`Cannot read source locale: ${config.sourceLocale}`] };
  }

  const sourceKeys = getAllKeys(sourceLocale);

  // Build map of placeholders per key in source
  const sourcePlaceholders = {};
  for (const key of sourceKeys) {
    const value = getNestedValue(sourceLocale, key);
    if (typeof value === 'string') {
      sourcePlaceholders[key] = extractPlaceholders(value);
    }
  }

  // Check each locale
  const files = fs
    .readdirSync(localeDir)
    .filter((f) => f.endsWith('.json') && f !== config.sourceLocale);

  for (const file of files) {
    const localePath = path.join(localeDir, file);
    const locale = readJsonFile(localePath);

    if (!locale) continue;

    for (const key of sourceKeys) {
      const sourceValue = getNestedValue(sourceLocale, key);
      const localeValue = getNestedValue(locale, key);

      if (typeof sourceValue !== 'string' || typeof localeValue !== 'string') continue;

      const sourcePH = extractPlaceholders(sourceValue);
      const localePH = extractPlaceholders(localeValue);

      // Compare sorted placeholder arrays
      if (JSON.stringify(sourcePH) !== JSON.stringify(localePH)) {
        issues.push(
          `Placeholder mismatch in "${key}":\n` +
            `  ${config.sourceLocale}: {${sourcePH.join(', ')}}\n` +
            `  ${file}: {${localePH.join(', ')}}`
        );
      }
    }
  }

  return { issues };
}

function checkImportPaths() {
  const issues = [];

  // Check frontend i18n index.ts for correct import paths
  const indexPath = path.join(PROJECT_ROOT, 'apps/web/src/i18n/index.ts');

  if (fs.existsSync(indexPath)) {
    const content = fs.readFileSync(indexPath, 'utf-8');

    // Check for incorrect paths that go up too many directories
    const badPatterns = [
      /import.*['"]\.\.\/\.\.\/\.\.\/.*i18n.*locales/,
      /await import\(['"]\.\.\/\.\.\/\.\.\/.*locales/,
    ];

    for (const pattern of badPatterns) {
      if (pattern.test(content)) {
        issues.push(
          `Invalid import path in i18n/index.ts - paths should be relative to i18n directory (./locales/...)`
        );
        break;
      }
    }

    // Verify correct pattern exists
    if (!content.includes('./locales/')) {
      issues.push(
        `i18n/index.ts may have incorrect import paths - should use ./locales/ for locale JSON files`
      );
    }
  }

  return { issues };
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  console.log('🌐 Checking i18n integrity...\n');

  const allIssues = [];
  const allWarnings = [];

  // Check import paths first
  console.log('📁 Checking import paths...');
  const importCheck = checkImportPaths();
  if (importCheck.issues.length > 0) {
    allIssues.push(...importCheck.issues);
    console.log('❌ Invalid import paths found');
  } else {
    console.log('✅ Import paths valid');
  }

  // Check each i18n system
  for (const [system, config] of Object.entries(CONFIG)) {
    console.log(`\n📦 Checking ${system}...`);

    // Check locale files exist
    const existCheck = checkLocaleFilesExist(config, system);
    if (existCheck.issues.length > 0) {
      allIssues.push(...existCheck.issues.map((i) => `[${system}] ${i}`));
      continue;
    }
    console.log(`  ✅ Found ${existCheck.locales.length} locale files`);

    // Check missing keys
    const missingCheck = checkMissingKeys(config, system);
    if (missingCheck.issues.length > 0) {
      allIssues.push(...missingCheck.issues.map((i) => `[${system}] ${i}`));
      console.log(`  ❌ ${missingCheck.issues.length} missing key issues`);
    } else {
      console.log(`  ✅ All used keys found in source locale`);
    }
    if (missingCheck.warnings) {
      allWarnings.push(...missingCheck.warnings.map((w) => `[${system}] ${w}`));
    }

    // Check locale consistency
    const consistencyCheck = checkLocaleConsistency(config, system);
    if (consistencyCheck.issues.length > 0) {
      allIssues.push(...consistencyCheck.issues.map((i) => `[${system}] ${i}`));
      console.log(`  ❌ Locale consistency issues`);
    } else {
      console.log(`  ✅ All locales have consistent keys`);
    }
    if (consistencyCheck.warnings) {
      allWarnings.push(...consistencyCheck.warnings.map((w) => `[${system}] ${w}`));
    }

    // Check placeholder consistency
    const placeholderCheck = checkPlaceholderConsistency(config, system);
    if (placeholderCheck.issues.length > 0) {
      allIssues.push(...placeholderCheck.issues.map((i) => `[${system}] ${i}`));
      console.log(`  ❌ Placeholder consistency issues`);
    } else {
      console.log(`  ✅ Placeholder consistency verified`);
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(60));

  if (allWarnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    allWarnings.forEach((w) => console.log(`   ${w}`));
  }

  if (allIssues.length > 0) {
    console.log('\n❌ VALIDATION ERRORS:');
    allIssues.forEach((i) => console.log(`   ${i}`));
    console.log('\n❌ i18n validation FAILED');
    console.log('   Run: npm run i18n:sync');
    process.exit(1);
  } else {
    console.log('\n✅ i18n validation passed!');
    process.exit(0);
  }
}

main();
