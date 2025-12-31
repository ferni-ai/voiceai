#!/usr/bin/env node
/**
 * Generate Accessibility Translation Keys
 * 
 * Scans for all aria-label values and adds them to en-US.json
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const UI_DIR = join(__dirname, '../src/ui');
const EN_US_PATH = join(__dirname, '../src/i18n/locales/en-US.json');

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

function camelCase(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^./, (chr) => chr.toLowerCase())
    .replace(/[^a-zA-Z0-9]/g, '');
}

function main() {
  console.log('🌍 Generating Accessibility Keys\n');
  
  const files = getAllFiles(UI_DIR);
  const allLabels = new Set();
  
  // Extract all aria-labels
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const matches = content.matchAll(/aria-label="([^"]+)"/g);
    for (const match of matches) {
      const label = match[1];
      // Skip dynamic labels (containing ${)
      if (!label.includes('${') && /^[A-Z]/.test(label)) {
        allLabels.add(label);
      }
    }
  }
  
  console.log(`Found ${allLabels.size} unique aria-labels\n`);
  
  // Load en-US.json
  const enUS = JSON.parse(readFileSync(EN_US_PATH, 'utf-8'));
  
  // Ensure accessibility section exists
  if (!enUS.accessibility) enUS.accessibility = {};
  
  // Add new labels
  let addedCount = 0;
  const sortedLabels = [...allLabels].sort();
  
  for (const label of sortedLabels) {
    const key = camelCase(label);
    if (!enUS.accessibility[key]) {
      enUS.accessibility[key] = label;
      addedCount++;
    }
  }
  
  // Sort accessibility keys
  enUS.accessibility = Object.fromEntries(
    Object.entries(enUS.accessibility).sort(([a], [b]) => a.localeCompare(b))
  );
  
  // Write back
  writeFileSync(EN_US_PATH, JSON.stringify(enUS, null, 2) + '\n', 'utf-8');
  
  console.log(`✅ Added ${addedCount} new accessibility keys`);
  console.log(`   Total accessibility keys: ${Object.keys(enUS.accessibility).length}`);
}

main();
