#!/usr/bin/env node
/**
 * Automated i18n Text Content Fixer
 * 
 * Automatically replaces hardcoded textContent assignments with t() calls
 * 
 * Usage:
 *   node scripts/fix-i18n-text.js --dry-run   # Preview changes
 *   node scripts/fix-i18n-text.js             # Apply changes
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const UI_DIR = join(__dirname, '../src/ui');
const LOCALES_DIR = join(__dirname, '../src/i18n/locales');
const EN_US_PATH = join(LOCALES_DIR, 'en-US.json');

const isDryRun = process.argv.includes('--dry-run');
const isVerbose = process.argv.includes('--verbose');

// Files to skip
const SKIP_FILES = [
  'dev-panel.ui.ts',
  'admin.ui.ts',
  'evalops-dashboard.ui.ts',
];

// Mapping of common text to translation keys
const TEXT_KEY_MAP = {
  // Breathing guide
  "Tap to begin": "breathing.tapToBegin",
  "Start": "common.start",
  "Pattern": "breathing.pattern",
  
  // CLI Auth
  "Preparing authentication...": "auth.preparing",
  "Click below to sign in with Google": "auth.clickToSignIn",
  "Authenticating with Google...": "auth.authenticating",
  
  // Onboarding
  "Your Journey": "onboarding.yourJourney",
  
  // Visualizations
  "Your Life Seasons": "visualizations.lifeSeasons",
  "Your Conversation Currents": "visualizations.conversationCurrents",
  "The Mirror": "visualizations.theMirror",
  "What you said": "visualizations.whatYouSaid",
  "What I notice": "visualizations.whatINotice",
  "Current Phase": "visualizations.currentPhase",
  "All Phases": "visualizations.allPhases",
  "Recommendation": "visualizations.recommendation",
  "Now": "common.now",
  "Current Theme": "visualizations.currentTheme",
  "Chapter Progress": "visualizations.chapterProgress",
  "Overview": "common.overview",
  "By Priority": "visualizations.byPriority",
  "Oldest Open Loop": "visualizations.oldestOpenLoop",
  "Primary Prediction": "visualizations.primaryPrediction",
  "Historical Accuracy": "visualizations.historicalAccuracy",
  "You": "common.you",
  "Network Stats": "visualizations.networkStats",
  
  // Calendar
  "Calendar synced": "calendar.synced",
  "Calendar disconnected": "calendar.disconnected",
  "Syncing...": "common.syncing",
  "Connect": "common.connect",
  "Disconnect": "common.disconnect",
  "Connected": "common.connected",
  "Not connected": "common.notConnected",
  
  // Marketplace
  "Loading...": "common.loading",
  "No results": "common.noResults",
  "Search": "common.search",
  "Install": "common.install",
  "Installed": "common.installed",
  "Uninstall": "common.uninstall",
  
  // Smart home
  "Brightness": "vibe.lights.brightness",
  "Temperature": "vibe.temperature.title",
  "Volume": "vibe.volume",
};

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
  } catch (e) {
    // Directory doesn't exist
  }
  return files;
}

function shouldSkip(filePath) {
  return SKIP_FILES.some(skip => filePath.endsWith(skip));
}

function generateKey(text, filePath) {
  // Check predefined mappings
  if (TEXT_KEY_MAP[text]) {
    return TEXT_KEY_MAP[text];
  }
  
  // Generate based on file name
  const fileName = basename(filePath, '.ts').replace('.ui', '').replace(/-/g, '');
  const textKey = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .slice(0, 4)
    .map((word, i) => i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
  
  // Determine category
  if (filePath.includes('visualizations')) return `visualizations.${textKey}`;
  if (filePath.includes('breathing')) return `breathing.${textKey}`;
  if (filePath.includes('calendar')) return `calendar.${textKey}`;
  if (filePath.includes('auth')) return `auth.${textKey}`;
  if (filePath.includes('onboarding')) return `onboarding.${textKey}`;
  
  return `ui.${fileName}.${textKey}`;
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
  
  // Pattern: textContent = 'Text' or textContent = "Text"
  const textContentRegex = /(\.\s*textContent\s*=\s*)(['"])([A-Z][^'"]*)\2/g;
  
  const newKeys = {};
  let replacements = [];
  let match;
  
  // Find simple textContent assignments
  while ((match = textContentRegex.exec(content)) !== null) {
    const [fullMatch, prefix, quote, text] = match;
    
    // Skip if it looks like a template or variable
    if (text.includes('${') || text.includes('`')) continue;
    
    const key = generateKey(text, filePath);
    newKeys[key] = text;
    
    replacements.push({
      original: fullMatch,
      replacement: `${prefix}t('${key}')`,
      text,
      key,
    });
  }
  
  if (replacements.length === 0) {
    return { file: relPath, changes: 0, newKeys: {} };
  }
  
  // Apply replacements (in reverse to preserve positions)
  for (const r of replacements.reverse()) {
    content = content.replace(r.original, r.replacement);
  }
  
  // Add i18n import if needed
  if (!hasI18nImport && replacements.length > 0) {
    const importPath = getImportPath(filePath);
    const importLine = `import { t } from '${importPath}';\n`;
    
    // Find first import and add after imports block
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
    newKeys,
    content: content !== originalContent ? content : null,
    replacements: replacements.reverse(),
  };
}

function addKeysToLocale(newKeys) {
  const enUS = JSON.parse(readFileSync(EN_US_PATH, 'utf-8'));
  let addedCount = 0;
  
  for (const [key, value] of Object.entries(newKeys)) {
    const parts = key.split('.');
    let obj = enUS;
    
    // Navigate/create nested structure
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    
    // Set the value if it doesn't exist
    const lastKey = parts[parts.length - 1];
    if (!obj[lastKey]) {
      obj[lastKey] = value;
      addedCount++;
      if (isVerbose) console.log(`   + ${key}: "${value}"`);
    }
  }
  
  if (!isDryRun && addedCount > 0) {
    writeFileSync(EN_US_PATH, JSON.stringify(enUS, null, 2) + '\n', 'utf-8');
  }
  
  return addedCount;
}

function main() {
  console.log('🌍 Automated i18n Text Fixer\n');
  console.log(isDryRun ? '📋 DRY RUN - No files will be modified\n' : '🔧 APPLYING CHANGES\n');
  console.log('='.repeat(60));
  
  const allFiles = getAllFiles(UI_DIR);
  
  let totalChanges = 0;
  const allNewKeys = {};
  const modifiedFiles = [];
  
  for (const file of allFiles) {
    if (shouldSkip(file)) continue;
    
    const result = processFile(file);
    
    if (result.changes > 0) {
      totalChanges += result.changes;
      Object.assign(allNewKeys, result.newKeys);
      modifiedFiles.push(result);
      
      console.log(`\n📁 ${result.file} (${result.changes} changes)`);
      if (isVerbose) {
        for (const r of result.replacements) {
          console.log(`   "${r.text.slice(0, 30)}..." → t('${r.key}')`);
        }
      }
      
      if (!isDryRun && result.content) {
        writeFileSync(file, result.content, 'utf-8');
      }
    }
  }
  
  // Update en-US.json
  if (Object.keys(allNewKeys).length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log(`\n📝 New translation keys: ${Object.keys(allNewKeys).length}`);
    
    const added = addKeysToLocale(allNewKeys);
    
    if (isDryRun) {
      console.log(`\n📋 Would add ${added} new keys to en-US.json`);
    } else {
      console.log(`\n✅ Added ${added} new keys to en-US.json`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Summary:`);
  console.log(`   Files modified: ${modifiedFiles.length}`);
  console.log(`   Text strings fixed: ${totalChanges}`);
  console.log(`   New translation keys: ${Object.keys(allNewKeys).length}`);
  
  if (isDryRun) {
    console.log(`\n💡 Run without --dry-run to apply changes`);
  } else {
    console.log(`\n✅ Changes applied!`);
    console.log(`\n⚠️  Remember to run: npm run i18n:sync-missing`);
  }
}

main();
