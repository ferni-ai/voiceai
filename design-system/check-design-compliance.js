#!/usr/bin/env node
/**
 * Design System Compliance Checker
 * 
 * Comprehensive checker for design system violations:
 * - Hardcoded colors (#hex, rgba)
 * - Hardcoded durations (ms numbers)
 * - console.log statements in UI files
 * - Forbidden brand words
 * - Persona color misuse (using persona colors for text)
 * - Missing WCAG contrast
 * 
 * Usage:
 *   node check-design-compliance.js                    # Check all
 *   node check-design-compliance.js --staged           # Check staged files only
 *   node check-design-compliance.js --fix              # Auto-fix what's possible
 *   node check-design-compliance.js --priority         # Focus on priority files
 *   node check-design-compliance.js path/to/file.ts   # Check specific file
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  // Directories to scan
  scanDirs: [
    'frontend-typescript/src/ui',
    'frontend-typescript/src/services',
    'frontend-typescript/src/narrative',
  ],
  
  // Priority files to fix first (core user-facing UI)
  priorityFiles: [
    'frontend-typescript/src/ui/coach.ui.ts',
    'frontend-typescript/src/ui/waveform.ui.ts',
    'frontend-typescript/src/ui/avatar-feedback.ui.ts',
    'frontend-typescript/src/ui/avatar-soul.ui.ts',
    'frontend-typescript/src/ui/message.ui.ts',
    'frontend-typescript/src/ui/toast.ui.ts',
    'frontend-typescript/src/ui/celebration.ui.ts',
    'frontend-typescript/src/ui/team.ui.ts',
    'frontend-typescript/src/ui/greeting.ui.ts',
    'frontend-typescript/src/ui/subscription.ui.ts',
    'frontend-typescript/src/ui/connection-heart.ui.ts',
    'frontend-typescript/src/ui/contact-settings.ui.ts',
    'frontend-typescript/src/ui/account-button.ui.ts',
  ],
  
  // Files/patterns to ignore
  ignore: [
    '*.test.ts',
    '*.spec.ts',
    '__tests__',
    'node_modules',
    'dist',
    '.generated.',
    'dev-panel.ui.ts',
    'evalops-dashboard.ui.ts',
    'admin.ui.ts',
  ],
  
  // Forbidden brand words (per FERNI-BRAND-GUIDELINES.md)
  forbiddenWords: [
    'chatbot',
    'virtual assistant',
    'AI assistant',
    'bot',
    'utilize',
    'leverage',
    'solution',
    'platform',
    'functionality',
    'user',  // Should be 'you' or 'people'
  ],
  
  // Persona colors that should NOT be used for text
  personaColors: [
    '#4a6741', // ferni
    '#3a6b73', // peter
    '#5a6b8a', // alex
    '#a67a6a', // maya
    '#c4856a', // jordan
    '#b8956a', // nayan
    '#9a7b5a', // jack
  ],
  
  // Violation severity
  severity: {
    hardcodedColor: 'error',
    hardcodedDuration: 'warning',
    consoleLog: 'warning',
    forbiddenWord: 'warning',
    personaColorText: 'error',
    missingFallback: 'info',
  },
};

// =============================================================================
// COLOR MAPPINGS FOR AUTO-FIX
// =============================================================================

const COLOR_MAPPINGS = {
  // Common hardcoded colors → CSS variables
  '#ffffff': 'var(--color-background-primary, #ffffff)',
  '#fff': 'var(--color-background-primary, #fff)',
  '#000000': 'var(--color-text-primary, #000000)',
  '#000': 'var(--color-text-primary, #000)',
  '#0a0908': 'var(--color-background-inverse, #0a0908)',
  '#1a1612': 'var(--color-text-primary, #1a1612)',
  '#2c2520': 'var(--color-text-primary, #2C2520)',
  '#f5f1e8': 'var(--color-background-primary, #F5F1E8)',
  '#fffdfb': 'var(--color-background-elevated, #FFFDFB)',
  
  // Status colors
  '#22c55e': 'var(--color-success, #22c55e)',
  '#ef4444': 'var(--color-error, #ef4444)',
  '#dc2626': 'var(--color-error, #dc2626)',
  '#f59e0b': 'var(--color-warning, #f59e0b)',
  '#3b82f6': 'var(--color-info, #3b82f6)',
  
  // Grays (should use warm browns)
  '#808080': 'var(--color-text-muted, #9a8a7a)',
  '#666666': 'var(--color-text-secondary, #756A5E)',
  '#999999': 'var(--color-text-muted, #9a8a7a)',
};

// Duration constant suggestions
const DURATION_CONSTANTS = {
  50: 'DURATION.MICRO',
  100: 'DURATION.FAST',
  150: 'DURATION.FAST',
  200: 'DURATION.NORMAL',
  250: 'DURATION.NORMAL',
  300: 'DURATION.SLOW',
  400: 'DURATION.MODERATE',
  500: 'DURATION.DELIBERATE',
  600: 'DURATION.DRAMATIC',
  800: 'DURATION.CELEBRATION',
  1000: 'DURATION.GLACIAL',
  1500: 'DURATION.GLACIAL',
};

// =============================================================================
// VIOLATION PATTERNS
// =============================================================================

const PATTERNS = {
  // Hardcoded hex colors
  hardcodedHexColor: {
    regex: /(?:color|background|border|fill|stroke|boxShadow):\s*['"]?#[0-9a-fA-F]{3,8}['"]?/g,
    message: 'Hardcoded color - use CSS variable',
    canFix: true,
    fix: (match) => {
      const hex = match.match(/#[0-9a-fA-F]+/)?.[0]?.toLowerCase();
      if (hex && COLOR_MAPPINGS[hex]) {
        return match.replace(hex, COLOR_MAPPINGS[hex]);
      }
      return null;
    },
    suggestion: (match) => {
      const hex = match.match(/#[0-9a-fA-F]+/)?.[0]?.toLowerCase();
      return COLOR_MAPPINGS[hex] 
        ? `Replace with ${COLOR_MAPPINGS[hex]}`
        : `Use var(--color-*, ${hex}) instead`;
    },
  },
  
  // Hardcoded rgba
  hardcodedRgba: {
    regex: /(?:color|background|border|fill|stroke):\s*['"]?rgba?\([^)]+\)['"]?/g,
    message: 'Hardcoded RGBA - use CSS variable',
    canFix: false,
    suggestion: () => 'Use var(--color-*) with opacity modifier',
  },
  
  // Hardcoded durations
  hardcodedDuration: {
    regex: /duration:\s*(\d+)(?!\s*\*)/g,
    message: 'Hardcoded duration - use DURATION constant',
    canFix: false,
    suggestion: (match) => {
      const ms = parseInt(match.match(/\d+/)?.[0] || '0');
      const constant = DURATION_CONSTANTS[ms] || `DURATION constant (~${ms}ms)`;
      return `Use ${constant}`;
    },
  },
  
  // Console statements
  consoleLog: {
    regex: /console\.(log|warn|error|debug|info)\(/g,
    message: 'Console statement - use createLogger()',
    canFix: false,
    suggestion: () => "import { createLogger } from '../utils/logger.js'",
  },
  
  // Forbidden brand words
  forbiddenWord: {
    regex: null, // Built dynamically
    message: 'Forbidden brand word',
    canFix: false,
    suggestion: (match) => {
      const word = match.toLowerCase();
      const replacements = {
        'chatbot': 'Ferni or "your team"',
        'virtual assistant': '"someone who understands"',
        'ai assistant': '"six brilliant minds"',
        'bot': 'Never reference what we are technically',
        'utilize': 'use',
        'leverage': 'use',
        'solution': 'help or support',
        'platform': 'Ferni',
        'functionality': 'describe what it does',
        'user': '"you" or "people"',
      };
      return replacements[word] || 'See FERNI-BRAND-GUIDELINES.md';
    },
  },
  
  // Persona colors used for text (accessibility violation)
  personaColorText: {
    regex: null, // Built dynamically
    message: 'Persona color used for text - WCAG violation',
    canFix: false,
    suggestion: () => 'Use --color-text-* variables for text. Persona colors are for accents only.',
  },
};

// Build dynamic regex patterns
function buildForbiddenWordRegex() {
  const escaped = CONFIG.forbiddenWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
}

function buildPersonaColorTextRegex() {
  const colors = CONFIG.personaColors.map(c => c.replace('#', ''));
  return new RegExp(`color:\\s*['"]?#(${colors.join('|')})['"]?`, 'gi');
}

// =============================================================================
// FILE SCANNING
// =============================================================================

function getFilesToCheck(args) {
  const isPriority = args.includes('--priority');
  const isStaged = args.includes('--staged');
  
  // Check specific file
  const specificFile = args.find(a => !a.startsWith('--') && a.includes('.ts'));
  if (specificFile && fs.existsSync(specificFile)) {
    return [specificFile];
  }
  
  // Priority files only
  if (isPriority) {
    return CONFIG.priorityFiles.filter(f => {
      const fullPath = path.join(ROOT, f);
      return fs.existsSync(fullPath);
    }).map(f => path.join(ROOT, f));
  }
  
  // Staged files only
  if (isStaged) {
    try {
      const staged = execSync('git diff --cached --name-only --diff-filter=ACMR', { encoding: 'utf8' });
      return staged.split('\n')
        .filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))
        .filter(f => CONFIG.scanDirs.some(dir => f.startsWith(dir)))
        .filter(f => !CONFIG.ignore.some(pattern => f.includes(pattern)))
        .map(f => path.join(ROOT, f));
    } catch {
      return [];
    }
  }
  
  // Scan all configured directories
  const files = [];
  for (const dir of CONFIG.scanDirs) {
    const fullPath = path.join(ROOT, dir);
    if (fs.existsSync(fullPath)) {
      scanDir(fullPath, files);
    }
  }
  return files;
}

function scanDir(dir, files) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (CONFIG.ignore.some(pattern => fullPath.includes(pattern))) {
      continue;
    }
    
    if (entry.isDirectory()) {
      scanDir(fullPath, files);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      files.push(fullPath);
    }
  }
}

// =============================================================================
// VIOLATION CHECKING
// =============================================================================

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const violations = [];
  
  // Standard pattern checks
  for (const [patternName, pattern] of Object.entries(PATTERNS)) {
    if (!pattern.regex) continue;
    
    let match;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    
    while ((match = regex.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      const line = lines[lineNumber - 1];
      
      violations.push({
        file: filePath,
        line: lineNumber,
        column: match.index - content.lastIndexOf('\n', match.index - 1),
        pattern: patternName,
        match: match[0],
        message: pattern.message,
        suggestion: pattern.suggestion(match[0]),
        severity: CONFIG.severity[patternName] || 'warning',
        lineContent: line?.trim() || '',
        canFix: pattern.canFix || false,
        fix: pattern.fix ? pattern.fix(match[0]) : null,
      });
    }
  }
  
  // Forbidden words check
  const forbiddenRegex = buildForbiddenWordRegex();
  let wordMatch;
  while ((wordMatch = forbiddenRegex.exec(content)) !== null) {
    // Skip if in comments or strings that might be documentation
    const lineNumber = content.substring(0, wordMatch.index).split('\n').length;
    const line = lines[lineNumber - 1];
    
    // Skip if likely in a comment or JSDoc
    if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('/*')) {
      continue;
    }
    
    violations.push({
      file: filePath,
      line: lineNumber,
      column: wordMatch.index - content.lastIndexOf('\n', wordMatch.index - 1),
      pattern: 'forbiddenWord',
      match: wordMatch[0],
      message: `Forbidden brand word: "${wordMatch[0]}"`,
      suggestion: PATTERNS.forbiddenWord.suggestion(wordMatch[0]),
      severity: CONFIG.severity.forbiddenWord,
      lineContent: line?.trim() || '',
      canFix: false,
    });
  }
  
  // Persona color text check
  const personaRegex = buildPersonaColorTextRegex();
  let colorMatch;
  while ((colorMatch = personaRegex.exec(content)) !== null) {
    const lineNumber = content.substring(0, colorMatch.index).split('\n').length;
    const line = lines[lineNumber - 1];
    
    violations.push({
      file: filePath,
      line: lineNumber,
      column: colorMatch.index - content.lastIndexOf('\n', colorMatch.index - 1),
      pattern: 'personaColorText',
      match: colorMatch[0],
      message: 'Persona color used for text - WCAG accessibility violation',
      suggestion: PATTERNS.personaColorText.suggestion(),
      severity: CONFIG.severity.personaColorText,
      lineContent: line?.trim() || '',
      canFix: false,
    });
  }
  
  return violations;
}

// =============================================================================
// AUTO-FIX
// =============================================================================

function fixFile(filePath, violations) {
  let content = fs.readFileSync(filePath, 'utf8');
  let fixedCount = 0;
  
  // Sort violations by position (reverse order to avoid offset issues)
  const fixableViolations = violations
    .filter(v => v.canFix && v.fix)
    .sort((a, b) => b.line - a.line || b.column - a.column);
  
  for (const v of fixableViolations) {
    const oldValue = v.match;
    const newValue = v.fix;
    
    if (newValue && content.includes(oldValue)) {
      content = content.replace(oldValue, newValue);
      fixedCount++;
    }
  }
  
  if (fixedCount > 0) {
    fs.writeFileSync(filePath, content);
  }
  
  return fixedCount;
}

// =============================================================================
// REPORTING
// =============================================================================

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function formatViolation(v) {
  const severityIcon = {
    error: `${COLORS.red}❌${COLORS.reset}`,
    warning: `${COLORS.yellow}⚠️${COLORS.reset} `,
    info: `${COLORS.blue}ℹ️${COLORS.reset} `,
  }[v.severity] || '•';
  
  const relativePath = path.relative(ROOT, v.file);
  
  return [
    `${severityIcon} ${COLORS.cyan}${relativePath}${COLORS.reset}:${v.line}:${v.column}`,
    `   ${v.message}`,
    `   ${COLORS.dim}${v.lineContent.substring(0, 80)}${COLORS.reset}`,
    `   ${COLORS.green}💡 ${v.suggestion}${COLORS.reset}`,
    '',
  ].join('\n');
}

function printSummary(violations, fixedCount = 0) {
  const byFile = {};
  const bySeverity = { error: 0, warning: 0, info: 0 };
  const byPattern = {};
  
  for (const v of violations) {
    byFile[v.file] = (byFile[v.file] || 0) + 1;
    bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;
    byPattern[v.pattern] = (byPattern[v.pattern] || 0) + 1;
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log(`${COLORS.bold}DESIGN SYSTEM COMPLIANCE REPORT${COLORS.reset}`);
  console.log('═'.repeat(60) + '\n');
  
  if (violations.length === 0) {
    console.log(`${COLORS.green}✅ No design system violations found!${COLORS.reset}\n`);
    return;
  }
  
  if (fixedCount > 0) {
    console.log(`${COLORS.green}🔧 Auto-fixed ${fixedCount} violation(s)${COLORS.reset}\n`);
  }
  
  console.log(`Found ${violations.length} violation(s):\n`);
  console.log(`  ${COLORS.red}❌ Errors:   ${bySeverity.error}${COLORS.reset}`);
  console.log(`  ${COLORS.yellow}⚠️  Warnings: ${bySeverity.warning}${COLORS.reset}`);
  console.log(`  ${COLORS.blue}ℹ️  Info:     ${bySeverity.info}${COLORS.reset}`);
  
  console.log(`\n${COLORS.bold}By type:${COLORS.reset}`);
  for (const [pattern, count] of Object.entries(byPattern).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(4)} - ${pattern}`);
  }
  
  console.log(`\n${COLORS.bold}By file (top 15):${COLORS.reset}`);
  const sortedFiles = Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 15);
  for (const [file, count] of sortedFiles) {
    const relativePath = path.relative(ROOT, file);
    console.log(`  ${count.toString().padStart(4)} - ${relativePath}`);
  }
  
  console.log('\n' + '-'.repeat(60) + '\n');
  
  // Print violations (limit to 30 for readability)
  const displayViolations = violations.slice(0, 30);
  for (const v of displayViolations) {
    console.log(formatViolation(v));
  }
  
  if (violations.length > 30) {
    console.log(`${COLORS.dim}... and ${violations.length - 30} more violations${COLORS.reset}\n`);
  }
}

// =============================================================================
// MAIN
// =============================================================================

function main() {
  const args = process.argv.slice(2);
  const shouldFix = args.includes('--fix');
  const verbose = args.includes('--verbose') || args.includes('-v');
  const jsonOutput = args.includes('--json');
  
  const files = getFilesToCheck(args);
  
  if (files.length === 0) {
    console.log('No files to check.');
    process.exit(0);
  }
  
  if (!jsonOutput) {
    console.log(`Checking ${files.length} file(s)...`);
  }
  
  const allViolations = [];
  let totalFixed = 0;
  
  for (const file of files) {
    const violations = checkFile(file);
    
    if (shouldFix && violations.length > 0) {
      const fixedCount = fixFile(file, violations);
      totalFixed += fixedCount;
      
      // Re-check after fixing to get remaining violations
      const remainingViolations = checkFile(file);
      allViolations.push(...remainingViolations);
    } else {
      allViolations.push(...violations);
    }
  }
  
  if (jsonOutput) {
    console.log(JSON.stringify({
      total: allViolations.length,
      fixed: totalFixed,
      violations: allViolations.map(v => ({
        file: path.relative(ROOT, v.file),
        line: v.line,
        severity: v.severity,
        pattern: v.pattern,
        message: v.message,
      })),
    }, null, 2));
  } else {
    printSummary(allViolations, totalFixed);
  }
  
  // Exit with error if there are errors
  const hasErrors = allViolations.some(v => v.severity === 'error');
  process.exit(hasErrors ? 1 : 0);
}

main();
