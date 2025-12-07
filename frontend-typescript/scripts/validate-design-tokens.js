#!/usr/bin/env node
/**
 * Design Token Validation Script
 *
 * Validates that UI files use CSS variables instead of hardcoded values.
 * Run: node scripts/validate-design-tokens.js
 *
 * Add to package.json scripts:
 *   "lint:tokens": "node scripts/validate-design-tokens.js"
 *   "quality": "npm run typecheck && npm run lint && npm run lint:tokens && npm run test"
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Patterns that indicate hardcoded values that should use tokens
const VIOLATIONS = {
  hardcodedColors: {
    pattern: /(?<!var\()['"](#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)|hsl\([^)]+\)|hsla\([^)]+\))['"]|:\s*(#[0-9a-fA-F]{3,8})(?![0-9a-fA-F])/g,
    message: 'Hardcoded color - use var(--color-*)',
    exceptions: ['transparent', 'currentColor', 'inherit'],
    // Skip SVG data URLs and lines that already use var()
    skipIfContains: ['data:image/svg+xml', 'var('],
  },
  hardcodedFonts: {
    // Only flag fonts that don't use var() at all - the line must not contain 'var('
    pattern: /font-family:\s*['"]?([^;'"]+)['"]?;/g,
    message: 'Hardcoded font - use var(--font-*)',
    exceptions: [],
    // Skip lines that contain var( - they're using CSS variables correctly
    skipIfContains: ['var('],
  },
  hardcodedShadows: {
    pattern: /box-shadow:\s*([^;]+);/g,
    message: 'Hardcoded shadow - use var(--shadow-*)',
    exceptions: ['none', 'inherit', 'transparent'],
    // Skip: CSS variables, keyframes, template literals, multiline shadows (start with newline)
    skipIfContains: ['var(', '@keyframes', '0%', '100%', '50%', '70%', '${', 'glow}', 'Color}', 'box-shadow:\n', 'box-shadow: \n'],
  },
  hardcodedBlur: {
    pattern: /backdrop-filter:\s*blur\([^)]+\)/g,
    message: 'Hardcoded blur - use var(--glass-blur)',
    exceptions: [],
    skipIfContains: ['var('],
  },
  hardcodedDurations: {
    pattern: /(?:transition|animation)(?:-duration)?:\s*(\d+(?:\.\d+)?(?:ms|s))/g,
    message: 'Hardcoded duration - use DURATION constants or var(--duration-*)',
    exceptions: [],
    // Skip lines using template literals with DURATION constants
    skipIfContains: ['DURATION.'],
  },
  hardcodedZIndex: {
    // Match z-index with values >= 1000 (high z-index should use tokens)
    pattern: /z-index:\s*(\d{4,})/g,
    message: 'Hardcoded z-index - use var(--z-*) tokens',
    exceptions: [],
    // Skip lines that already use z-index tokens
    skipIfContains: ['var(--z-'],
  },
};

// Context patterns to skip (theme-specific blocks, dev tools, etc.)
const CONTEXT_SKIP_PATTERNS = [
  '[data-theme="zen"]',     // Zen theme overrides are intentional
  '[data-theme="midnight"]', // Theme overrides are intentional
  'PERSONA_COLORS',         // Persona color objects
  'const colors =',         // Color arrays for animations
  "colors = [",             // Color arrays for animations
  'colors:',                // Color properties in objects
  'ICONS =',                // SVG icon definitions
  '// Dev',                 // Dev-only code markers
  'outer:',                 // SVG/logo properties
  'iris:',                  // SVG/logo properties
  'pupil:',                 // SVG/logo properties
  'highlight:',             // SVG/logo properties
  'ambientColor:',          // Ambient effect colors
  'primary:',               // Config objects
  'secondary:',             // Config objects
  'glow:',                  // Glow colors
  'fillStyle',              // Canvas operations
  'strokeStyle',            // Canvas operations
  '.color =',               // Programmatic color assignment
  '.bgColor',               // Programmatic background
  '.borderColor',           // Programmatic border
  'typeStyle?.',            // Optional style properties
  'CELEBRATION_COLORS',     // Celebration color arrays
  'white:',                 // Logo white color
  'catchlight:',            // Logo highlight
  'Gold accent',            // Celebration color comments
  'Success green',          // Celebration color comments
  'Warm cedar',             // Celebration color comments
  'rgba(212, 168, 74',      // Celebration gold
  'rgba(107, 196, 143',     // Celebration green
  'rgba(192, 168, 130',     // Celebration warm
  'rgba(224, 213, 200',     // Celebration cream
  'rgba(166, 124, 53',      // Celebration amber
  'Ferni sage green',       // Fallback color comments
  'Ferni green default',    // Fallback color comments
  'currentPersonaColor',    // Dynamic persona color
  '// Ferni',               // Ferni fallback comments
];

// Directories to scan
const SCAN_DIRS = [
  join(__dirname, '..', 'src', 'ui'),
  join(__dirname, '..', 'public', 'onboarding'),
];

// File extensions to check
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.html', '.css'];

// Files/patterns to ignore
const IGNORE_PATTERNS = [
  'node_modules',
  '.test.',
  '.spec.',
  'dist/',
  'coverage/',
  'dev-panel.ui.ts',     // Dev tool - not production
  'easter-eggs.ui.ts',   // Easter eggs - intentional fun
  'marketplace.ui.ts',   // Complex component with custom shadows
  'team-unlock-celebration.ui.ts', // Celebration effects with custom shadows
];

function shouldIgnore(filePath) {
  return IGNORE_PATTERNS.some(pattern => filePath.includes(pattern));
}

function getAllFiles(dir, files = []) {
  if (!statSync(dir).isDirectory()) {
    return [dir];
  }

  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);

    if (shouldIgnore(fullPath)) continue;

    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      getAllFiles(fullPath, files);
    } else if (EXTENSIONS.some(ext => entry.endsWith(ext))) {
      files.push(fullPath);
    }
  }

  return files;
}

function validateFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const violations = [];
  const lines = content.split('\n');

  // Find context blocks (e.g., [data-theme="zen"] blocks)
  const contextBlockRanges = findContextBlockRanges(content, lines);

  for (const [ruleName, rule] of Object.entries(VIOLATIONS)) {
    let match;
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);

    while ((match = regex.exec(content)) !== null) {
      const value = match[1] || match[2] || match[0];

      // Check exceptions
      if (rule.exceptions.some(exc => value.toLowerCase().includes(exc.toLowerCase()))) {
        continue;
      }

      // Get the line for context checks
      const lineIndex = content.substring(0, match.index).split('\n').length - 1;
      const line = lines[lineIndex];

      // Check skipIfContains (supports array or string)
      const skipPatterns = Array.isArray(rule.skipIfContains)
        ? rule.skipIfContains
        : rule.skipIfContains ? [rule.skipIfContains] : [];
      if (skipPatterns.some(pattern => line.includes(pattern))) {
        continue;
      }

      // Skip comments
      if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('/*')) {
        continue;
      }

      // Skip eslint-disable comments
      if (lineIndex > 0 && lines[lineIndex - 1].includes('eslint-disable')) {
        continue;
      }

      // Skip if inside a context block (theme overrides, etc.)
      if (isInsideContextBlock(lineIndex, contextBlockRanges)) {
        continue;
      }

      // Skip if line matches context skip patterns
      if (CONTEXT_SKIP_PATTERNS.some(pattern => line.includes(pattern))) {
        continue;
      }

      violations.push({
        rule: ruleName,
        message: rule.message,
        line: lineIndex + 1,
        value: value.substring(0, 50),
        context: line.trim().substring(0, 80),
      });
    }
  }

  return violations;
}

/**
 * Find ranges of lines that are inside theme-specific CSS blocks.
 * Returns array of {start, end} line indices.
 */
function findContextBlockRanges(content, lines) {
  const ranges = [];
  let currentBlockStart = null;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this line starts a theme block
    if (line.includes('[data-theme="zen"]') || line.includes('[data-theme="midnight"]')) {
      currentBlockStart = i;
      braceDepth = 0;
    }

    // Count braces to track block depth
    if (currentBlockStart !== null) {
      for (const char of line) {
        if (char === '{') braceDepth++;
        if (char === '}') braceDepth--;
      }

      // Block ended
      if (braceDepth <= 0 && line.includes('}')) {
        ranges.push({ start: currentBlockStart, end: i });
        currentBlockStart = null;
      }
    }
  }

  return ranges;
}

/**
 * Check if a line index is inside any context block range.
 */
function isInsideContextBlock(lineIndex, ranges) {
  return ranges.some(range => lineIndex >= range.start && lineIndex <= range.end);
}

function main() {
  console.log('Design Token Validation\n');
  console.log('Scanning for hardcoded values that should use CSS variables...\n');

  let totalViolations = 0;
  const fileViolations = new Map();

  for (const dir of SCAN_DIRS) {
    try {
      const files = getAllFiles(dir);

      for (const file of files) {
        const violations = validateFile(file);

        if (violations.length > 0) {
          const relPath = relative(join(__dirname, '..'), file);
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
    console.log('All files comply with design token requirements!\n');
    process.exit(0);
  }

  console.log(`Found ${totalViolations} violations in ${fileViolations.size} files:\n`);

  // Group by violation type
  const byRule = new Map();

  for (const [file, violations] of fileViolations) {
    for (const v of violations) {
      if (!byRule.has(v.rule)) {
        byRule.set(v.rule, []);
      }
      byRule.get(v.rule).push({ file, ...v });
    }
  }

  // Print summary by rule
  console.log('Summary by violation type:');
  console.log('─'.repeat(60));

  for (const [rule, violations] of byRule) {
    console.log(`  ${rule}: ${violations.length} instances`);
  }

  console.log('\n' + '─'.repeat(60));
  console.log('\nTop files with violations:\n');

  // Sort files by violation count
  const sortedFiles = [...fileViolations.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);

  for (const [file, violations] of sortedFiles) {
    console.log(`  ${file}: ${violations.length} violations`);

    // Show first 3 violations as examples
    for (const v of violations.slice(0, 3)) {
      console.log(`    L${v.line}: ${v.message}`);
      console.log(`           ${v.context}`);
    }

    if (violations.length > 3) {
      console.log(`    ... and ${violations.length - 3} more`);
    }
    console.log();
  }

  console.log('─'.repeat(60));
  console.log(`\nTotal: ${totalViolations} violations in ${fileViolations.size} files`);
  console.log('\nTo fix: Replace hardcoded values with CSS variables from design-system/tokens.css');
  console.log('To skip: Add // eslint-disable-next-line design-tokens/no-hardcoded-colors\n');

  // Exit with error code for CI
  process.exit(1);
}

main();
