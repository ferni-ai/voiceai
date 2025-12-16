#!/usr/bin/env node
/**
 * Brand Compliance Check
 * 
 * Ensures NO purple/violet colors exist in the codebase.
 * Purple is NOT a Ferni color per FERNI-BRAND-GUIDELINES.md Section 3.
 * 
 * Run: node scripts/check-brand-compliance.js
 * 
 * Add to lint-staged or CI pipeline for enforcement.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// BANNED COLORS - Purple/Violet is NOT a Ferni brand color
// ============================================================================

// Known purple hex codes to detect
const BANNED_HEX_PATTERNS = [
  // Pure purples
  /#8b5cf6/gi,        // Violet 400
  /#a78bfa/gi,        // Violet 300
  /#c084fc/gi,        // Purple 400
  /#a855f7/gi,        // Purple 500
  /#9333ea/gi,        // Purple 600
  /#7c3aed/gi,        // Violet 600
  /#6366f1/gi,        // Indigo 500
  /#4f46e5/gi,        // Indigo 600
  /#818cf8/gi,        // Indigo 400
  // Common purple variations
  /#800080/gi,        // Purple
  /#9b59b6/gi,        // Amethyst
  /#8e44ad/gi,        // Wisteria
  /#9c27b0/gi,        // Material purple
];

// RGBA patterns with purple hues (R > B and G < R typically means purple)
const BANNED_RGBA_PATTERNS = [
  /rgba?\(\s*139\s*,\s*92\s*,\s*246/gi,   // The specific purple we found: rgba(139, 92, 246)
  /rgba?\(\s*99\s*,\s*102\s*,\s*241/gi,   // Indigo
  /rgba?\(\s*79\s*,\s*70\s*,\s*229/gi,    // Darker indigo
  /rgba?\(\s*124\s*,\s*58\s*,\s*237/gi,   // Violet
  /rgba?\(\s*147\s*,\s*51\s*,\s*234/gi,   // Purple 500
];

// HSL patterns with purple hues (h: 260-290) - must be inside hsl() function
const BANNED_HSL_PATTERN = /hsl\(\s*(2[67][0-9]|28[0-9]|290)\s*,/gi;

// ============================================================================
// DIRECTORIES TO SCAN
// ============================================================================

const SCAN_DIRS = [
  join(__dirname, '..', 'src'),
  join(__dirname, '..', 'public'),
  join(__dirname, '..', '..', 'brand'),
  join(__dirname, '..', '..', 'design-system'),
];

// File extensions to check
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.html', '.css', '.json'];

// Patterns to ignore
const IGNORE_PATTERNS = [
  'node_modules',
  'dist/',
  'coverage/',
  '.test.',
  '.spec.',
  'package-lock.json',
  // Allow in markdown documentation (examples of what NOT to do)
  'BRAND-GUIDELINES.md',
  'DESIGN-SYSTEM-LINT-RULES.md',
];

// ============================================================================
// SCANNING FUNCTIONS
// ============================================================================

function shouldIgnore(filePath) {
  return IGNORE_PATTERNS.some(pattern => filePath.includes(pattern));
}

function getAllFiles(dir, files = []) {
  try {
    if (!statSync(dir).isDirectory()) {
      return [dir];
    }
  } catch {
    return files;
  }

  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);

    if (shouldIgnore(fullPath)) continue;

    try {
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        getAllFiles(fullPath, files);
      } else if (EXTENSIONS.some(ext => entry.endsWith(ext))) {
        files.push(fullPath);
      }
    } catch {
      // Skip inaccessible files
    }
  }

  return files;
}

function findViolations(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const violations = [];
  const lines = content.split('\n');

  // Check each banned pattern
  for (const pattern of [...BANNED_HEX_PATTERNS, ...BANNED_RGBA_PATTERNS]) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);

    while ((match = regex.exec(content)) !== null) {
      const lineIndex = content.substring(0, match.index).split('\n').length - 1;
      const line = lines[lineIndex];

      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('/*')) {
        continue;
      }

      // Skip if it's documenting what NOT to do
      if (line.includes('❌') || line.includes('Bad') || line.includes('NEVER')) {
        continue;
      }

      violations.push({
        line: lineIndex + 1,
        value: match[0],
        context: line.trim().substring(0, 100),
      });
    }
  }

  // Check HSL purple hues (260-290)
  const hslMatch = BANNED_HSL_PATTERN.exec(content);
  if (hslMatch) {
    const lineIndex = content.substring(0, hslMatch.index).split('\n').length - 1;
    violations.push({
      line: lineIndex + 1,
      value: hslMatch[0],
      context: lines[lineIndex].trim().substring(0, 100),
    });
  }

  return violations;
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  console.log('🎨 Ferni Brand Compliance Check\n');
  console.log('Scanning for BANNED purple/violet colors...\n');
  console.log('Per FERNI-BRAND-GUIDELINES.md: Purple is NOT a Ferni color.\n');

  let totalViolations = 0;
  const fileViolations = new Map();

  for (const dir of SCAN_DIRS) {
    try {
      const files = getAllFiles(dir);

      for (const file of files) {
        const violations = findViolations(file);

        if (violations.length > 0) {
          const relPath = relative(join(__dirname, '..', '..'), file);
          fileViolations.set(relPath, violations);
          totalViolations += violations.length;
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`Error scanning ${dir}:`, err.message);
      }
    }
  }

  // Report results
  if (totalViolations === 0) {
    console.log('✅ All files comply with Ferni brand guidelines!\n');
    console.log('   No purple/violet colors detected.\n');
    process.exit(0);
  }

  console.log('❌ BRAND VIOLATION: Purple/violet colors detected!\n');
  console.log(`Found ${totalViolations} violations in ${fileViolations.size} files:\n`);
  console.log('─'.repeat(70));

  for (const [file, violations] of fileViolations) {
    console.log(`\n📁 ${file}:`);

    for (const v of violations) {
      console.log(`   Line ${v.line}: ${v.value}`);
      console.log(`   → ${v.context}`);
    }
  }

  console.log('\n' + '─'.repeat(70));
  console.log('\n🔧 HOW TO FIX:');
  console.log('   Replace purple colors with Ferni earthy palette:');
  console.log('   - Sage green: #4a6741, rgba(74, 103, 65, 0.X)');
  console.log('   - Teal: #3a6b73, rgba(58, 107, 115, 0.X)');
  console.log('   - Warm brown: #9a7b5a, rgba(154, 123, 90, 0.X)');
  console.log('   - Coral: #c4856a, rgba(196, 133, 106, 0.X)');
  console.log('\n   Or use CSS variables: var(--persona-glow), var(--persona-primary)\n');

  process.exit(1);
}

main();

