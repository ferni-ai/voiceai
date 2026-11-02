#!/usr/bin/env node
/**
 * UI Audit Script
 *
 * Audits UI components for:
 * - Accessibility issues (ARIA, focus, contrast)
 * - Missing states (loading, error, empty)
 * - Responsiveness patterns
 * - Z-index consistency
 * - Animation performance
 *
 * Run: node scripts/audit-ui.js
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// TAG READING
// ============================================================================

// Reads the markup tag that opens at `start` ("<name ..."). Quoted values and {...} / ${...}
// expressions are skipped as a whole, so a ">" inside `onLoad={() => x}` or a string doesn't
// end the tag early. `attrs` keeps only the text between them, where attribute names live.
// `dynamic` means the tag spreads props or interpolates attributes, so any attribute may be
// set. Returns null for a tag that never closes.
export function readTag(content, start) {
  const name = /^<([A-Za-z][\w.:-]*)/.exec(content.slice(start, start + 80))?.[1];
  if (!name) return null;
  let attrs = '';
  let dynamic = false;
  let depth = 0;
  let quote = null;
  for (let i = start + 1 + name.length; i < content.length; i++) {
    const c = content[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === '`') {
      quote = c;
    } else if (c === '{') {
      if (depth === 0 && !attrs.replace(/\$$/, '').trimEnd().endsWith('=')) dynamic = true;
      depth++;
    } else if (c === '}') {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && c === '>') {
      return { name, attrs, dynamic, end: i };
    } else if (depth === 0) {
      attrs += c;
    }
  }
  return null;
}

// Whether a tag read by readTag names one of `names` (a regex alternation) as an attribute.
// `data-alt` is not `alt`: the name must start the attribute.
function hasAttr(tag, names) {
  return new RegExp(`(?:^|[\\s/])(?:${names})(?=[\\s=/]|$)`, 'i').test(tag.attrs);
}

// Built-in elements that are interactive without a role.
const INTERACTIVE_TAGS = new Set('a button input select textarea summary option label'.split(' '));

// ============================================================================
// AUDIT RULES
// ============================================================================
// A rule's `pattern` finds candidates; `isViolation(content, index)`, when present, decides
// whether the candidate at `index` is a finding. A negative lookahead after `[^>]*` can't do
// that (the scan just backtracks past it), which made three rules match every tag.

export const AUDIT_RULES = {
  // Accessibility
  missingAriaLabel: {
    pattern: /<button\b/gi,
    // A button with no label attribute and no visible text. Dynamic content can't be judged.
    isViolation: (content, index) => {
      const tag = readTag(content, index);
      if (!tag || tag.dynamic || hasAttr(tag, 'aria-label|aria-labelledby|title')) return false;
      const close = content.slice(tag.end).search(/<\/button\s*>/i);
      if (close < 0) return false;
      const inner = content.slice(tag.end + 1, tag.end + close);
      const labelledInside = /\b(alt|aria-label|title)\s*=\s*["'][^"']/i;
      if (/[{}]/.test(inner) || labelledInside.test(inner)) return false;
      const text = inner.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '');
      return text.trim() === '';
    },
    message: 'Button may need aria-label for accessibility',
    severity: 'warning',
    category: 'accessibility',
  },
  missingAltText: {
    pattern: /<img\b/gi,
    // alt="" is valid (a decorative image). Spread or interpolated attributes may carry alt.
    isViolation: (content, index) => {
      const tag = readTag(content, index);
      return tag !== null && !tag.dynamic && !hasAttr(tag, 'alt');
    },
    message: 'Image missing alt attribute',
    severity: 'error',
    category: 'accessibility',
  },
  clickableWithoutRole: {
    pattern: /<[a-z][\w-]*/g,
    // A lowercase (built-in) element with a click handler that isn't interactive and has no
    // role. Capitalised JSX components set their own semantics.
    isViolation: (content, index) => {
      const tag = readTag(content, index);
      if (!tag || tag.dynamic || INTERACTIVE_TAGS.has(tag.name.toLowerCase())) return false;
      return hasAttr(tag, 'onclick') && !hasAttr(tag, 'role');
    },
    message: 'Clickable element may need role="button"',
    severity: 'warning',
    category: 'accessibility',
  },
  missingFocusStyles: {
    pattern: /:hover\s*{[^}]+}(?![\s\S]*:focus)/g,
    message: 'Has :hover but may be missing :focus styles',
    severity: 'warning',
    category: 'accessibility',
  },

  // States
  missingLoadingState: {
    pattern: /async\s+function\s+\w+|fetch\(|await\s+/g,
    message: 'Async operation - verify loading state exists',
    severity: 'info',
    category: 'states',
    checkFunction: (content, filePath) => {
      const hasAsync = /async|fetch|await/.test(content);
      const hasLoading = /loading|isLoading|showLoading|Loading/i.test(content);
      return hasAsync && !hasLoading;
    },
  },
  missingErrorHandling: {
    pattern: /\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/g,
    message: 'Empty catch block - add error handling UI',
    severity: 'error',
    category: 'states',
  },

  // Responsiveness
  hardcodedPixelWidth: {
    pattern: /width:\s*\d{3,}px/g,
    message: 'Large hardcoded pixel width - consider responsive units',
    severity: 'warning',
    category: 'responsiveness',
  },
  missingMediaQuery: {
    pattern: /@media/g,
    message: 'Check for responsive breakpoints',
    severity: 'info',
    category: 'responsiveness',
    checkFunction: (content, filePath) => {
      // Only flag UI files that have CSS but no media queries
      const hasCSS = /\.style\s*=|styled|css`|<style/i.test(content);
      const hasMediaQuery = /@media/.test(content);
      const isLargeFile = content.length > 5000;
      return hasCSS && isLargeFile && !hasMediaQuery;
    },
  },

  // Z-index consistency
  hardcodedZIndex: {
    pattern: /z-index:\s*(\d+)/g,
    message: 'Hardcoded z-index - consider using var(--z-*) tokens',
    severity: 'warning',
    category: 'consistency',
    collectValues: true,
    // Skip lines that already use z-index tokens
    skipIfContains: ['var(--z-'],
  },

  // Animation performance
  animatingExpensiveProperties: {
    pattern: /animation[^}]*(width|height|top|left|right|bottom|margin|padding)[^}]*}/g,
    message: 'Animating layout properties - prefer transform/opacity',
    severity: 'warning',
    category: 'performance',
  },
  missingWillChange: {
    pattern: /transform:|animation:/g,
    message: 'Animation may benefit from will-change (use sparingly)',
    severity: 'info',
    category: 'performance',
  },
  missingReducedMotion: {
    pattern: /@keyframes/g,
    message: 'Has animations - verify prefers-reduced-motion support',
    severity: 'warning',
    category: 'accessibility',
    checkFunction: (content) => {
      const hasKeyframes = /@keyframes/.test(content);
      const hasReducedMotion = /prefers-reduced-motion/.test(content);
      return hasKeyframes && !hasReducedMotion;
    },
  },

  // Component patterns
  inlineStyles: {
    pattern: /style=\{\{[^}]+\}\}/g,
    message: 'Inline style object - consider CSS classes',
    severity: 'info',
    category: 'consistency',
  },
  magicNumbers: {
    pattern: /(?:margin|padding|gap|top|left|right|bottom):\s*\d+px/g,
    message: 'Magic number - consider using spacing tokens',
    severity: 'info',
    category: 'consistency',
  },
};

// ============================================================================
// FILE SCANNING
// ============================================================================

const SCAN_DIRS = [
  join(__dirname, '..', 'src', 'ui'),
  join(__dirname, '..', 'public'),
];

const EXTENSIONS = ['.ts', '.tsx', '.html'];

const IGNORE_PATTERNS = [
  'node_modules',
  '.test.',
  '.spec.',
  'dist/',
  'dev-panel.ui.ts',  // Dev tool - not production
];

function shouldIgnore(filePath) {
  return IGNORE_PATTERNS.some(pattern => filePath.includes(pattern));
}

function getAllFiles(dir, files = []) {
  if (!statSync(dir).isDirectory()) {
    return [dir];
  }

  // A directory that can't be read throws: skipping it would lower the error count.
  for (const entry of readdirSync(dir)) {
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

// ============================================================================
// AUDIT LOGIC
// ============================================================================

function auditFile(filePath) {
  return auditContent(readFileSync(filePath, 'utf-8'), filePath);
}

export function auditContent(content, filePath) {
  const findings = [];
  const lines = content.split('\n');

  for (const [ruleName, rule] of Object.entries(AUDIT_RULES)) {
    // Skip if custom check function returns false
    if (rule.checkFunction && !rule.checkFunction(content, filePath)) {
      continue;
    }

    // Skip info-level pattern matches that have custom check functions
    if (rule.checkFunction && rule.severity === 'info') {
      findings.push({
        rule: ruleName,
        message: rule.message,
        severity: rule.severity,
        category: rule.category,
        line: null,
      });
      continue;
    }

    let match;
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);

    while ((match = regex.exec(content)) !== null) {
      const lineIndex = content.substring(0, match.index).split('\n').length;
      const line = lines[lineIndex - 1];

      // Skip comments
      if (line?.trim().startsWith('//') || line?.trim().startsWith('*')) {
        continue;
      }

      if (rule.isViolation && !rule.isViolation(content, match.index)) {
        continue;
      }

      // Skip if line contains any skip patterns
      if (rule.skipIfContains) {
        const skipPatterns = Array.isArray(rule.skipIfContains)
          ? rule.skipIfContains
          : [rule.skipIfContains];
        if (skipPatterns.some(pattern => line?.includes(pattern))) {
          continue;
        }
      }

      findings.push({
        rule: ruleName,
        message: rule.message,
        severity: rule.severity,
        category: rule.category,
        line: lineIndex,
        context: line?.trim().substring(0, 60),
        value: rule.collectValues ? match[1] : undefined,
      });
    }
  }

  return findings;
}

// ============================================================================
// REPORTING
// ============================================================================

function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                      UI AUDIT REPORT                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const allFindings = new Map();
  const stats = {
    totalFiles: 0,
    filesWithIssues: 0,
    byCategory: {},
    bySeverity: { error: 0, warning: 0, info: 0 },
    zIndexValues: new Set(),
  };
  // Directories that could not be scanned, or held no files. Either makes the count wrong.
  const scanFailures = [];

  for (const dir of SCAN_DIRS) {
    try {
      const files = getAllFiles(dir);
      if (files.length === 0) {
        scanFailures.push(`${relative(join(__dirname, '..'), dir)}: no files`);
      }
      stats.totalFiles += files.length;

      for (const file of files) {
        const findings = auditFile(file);
        if (findings.length > 0) {
          const relPath = relative(join(__dirname, '..'), file);
          allFindings.set(relPath, findings);
          stats.filesWithIssues++;

          for (const f of findings) {
            stats.bySeverity[f.severity]++;
            stats.byCategory[f.category] = (stats.byCategory[f.category] || 0) + 1;
            if (f.value && f.rule === 'hardcodedZIndex') {
              stats.zIndexValues.add(parseInt(f.value));
            }
          }
        }
      }
    } catch (err) {
      scanFailures.push(`${relative(join(__dirname, '..'), dir)}: ${err.message}`);
    }
  }

  // Print summary
  console.log('📊 SUMMARY');
  console.log('─'.repeat(60));
  console.log(`   Files scanned: ${stats.totalFiles}`);
  console.log(`   Files with issues: ${stats.filesWithIssues}`);
  console.log();

  console.log('   By severity:');
  console.log(`     🔴 Errors: ${stats.bySeverity.error}`);
  console.log(`     🟡 Warnings: ${stats.bySeverity.warning}`);
  console.log(`     🔵 Info: ${stats.bySeverity.info}`);
  console.log();

  console.log('   By category:');
  for (const [cat, count] of Object.entries(stats.byCategory)) {
    const icon = {
      accessibility: '♿',
      states: '⏳',
      responsiveness: '📱',
      consistency: '🎨',
      performance: '⚡',
    }[cat] || '•';
    console.log(`     ${icon} ${cat}: ${count}`);
  }
  console.log();

  // Z-index analysis
  if (stats.zIndexValues.size > 0) {
    const sorted = [...stats.zIndexValues].sort((a, b) => a - b);
    console.log('📐 Z-INDEX USAGE');
    console.log('─'.repeat(60));
    console.log(`   Values found: ${sorted.join(', ')}`);
    console.log(`   Range: ${Math.min(...sorted)} - ${Math.max(...sorted)}`);
    console.log('   Recommendation: Create z-index tokens for consistency');
    console.log();
  }

  // Detailed findings by category
  const categories = ['accessibility', 'states', 'responsiveness', 'performance', 'consistency'];

  for (const category of categories) {
    const categoryFindings = [];
    for (const [file, findings] of allFindings) {
      const catFindings = findings.filter(f => f.category === category && f.severity !== 'info');
      if (catFindings.length > 0) {
        categoryFindings.push({ file, findings: catFindings });
      }
    }

    if (categoryFindings.length > 0) {
      const icon = {
        accessibility: '♿ ACCESSIBILITY',
        states: '⏳ STATES',
        responsiveness: '📱 RESPONSIVENESS',
        performance: '⚡ PERFORMANCE',
        consistency: '🎨 CONSISTENCY',
      }[category];

      console.log(`\n${icon}`);
      console.log('─'.repeat(60));

      for (const { file, findings } of categoryFindings.slice(0, 5)) {
        console.log(`\n  📁 ${file}`);
        for (const f of findings.slice(0, 3)) {
          const sev = f.severity === 'error' ? '🔴' : '🟡';
          console.log(`     ${sev} L${f.line || '?'}: ${f.message}`);
          if (f.context) {
            console.log(`        ${f.context}`);
          }
        }
        if (findings.length > 3) {
          console.log(`     ... and ${findings.length - 3} more`);
        }
      }

      if (categoryFindings.length > 5) {
        console.log(`\n  ... and ${categoryFindings.length - 5} more files`);
      }
    }
  }

  // Recommendations
  console.log('\n\n📋 RECOMMENDATIONS');
  console.log('═'.repeat(60));

  if (stats.bySeverity.error > 0) {
    console.log('\n🔴 HIGH PRIORITY:');
    console.log('   • Fix missing alt text on images');
    console.log('   • Add error handling to empty catch blocks');
  }

  if (stats.byCategory.accessibility > 5) {
    console.log('\n♿ ACCESSIBILITY:');
    console.log('   • Add aria-labels to icon-only buttons');
    console.log('   • Ensure focus styles match hover styles');
    console.log('   • Add prefers-reduced-motion media queries');
  }

  if (stats.byCategory.responsiveness > 0) {
    console.log('\n📱 RESPONSIVENESS:');
    console.log('   • Review hardcoded pixel widths');
    console.log('   • Add mobile breakpoints to large components');
  }

  if (stats.zIndexValues.size > 5) {
    console.log('\n🎨 CONSISTENCY:');
    console.log('   • Create z-index token scale (e.g., --z-dropdown: 100, --z-modal: 1000)');
  }

  console.log('\n' + '═'.repeat(60));
  console.log('Run `npx lighthouse http://localhost:3004 --view` for full audit');
  console.log('═'.repeat(60) + '\n');

  // A scan that went wrong must not pass on a count it never finished.
  if (scanFailures.length > 0) {
    console.error(`UI audit did not finish scanning:\n  ${scanFailures.join('\n  ')}`);
    process.exit(1);
  }

  // Ratchet: old errors may remain, but the count must not grow (as lint:tokens does).
  // CI ran this with `|| true`, so new errors never failed anything. 0 on main, 2026-11-02.
  const MAX_UI_AUDIT_ERRORS = 0;
  const errors = stats.bySeverity.error;
  if (errors > MAX_UI_AUDIT_ERRORS) {
    console.error(
      `UI audit ratchet exceeded: ${errors} > ${MAX_UI_AUDIT_ERRORS} errors. Fix the new ones before landing.`
    );
    process.exit(1);
  }
  const lower = errors < MAX_UI_AUDIT_ERRORS ? ` Lower MAX_UI_AUDIT_ERRORS to ${errors}.` : '';
  console.log(`Ratchet: ${errors}/${MAX_UI_AUDIT_ERRORS} errors (must not grow).${lower}\n`);
  process.exit(0);
}

// Run only as a script; tests import the rules.
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main();
}
