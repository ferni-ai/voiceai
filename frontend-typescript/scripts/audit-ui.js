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
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// AUDIT RULES
// ============================================================================

const AUDIT_RULES = {
  // Accessibility
  missingAriaLabel: {
    pattern: /<button[^>]*(?!aria-label)[^>]*>/g,
    message: 'Button may need aria-label for accessibility',
    severity: 'warning',
    category: 'accessibility',
  },
  missingAltText: {
    pattern: /<img[^>]*(?!alt=)[^>]*>/g,
    message: 'Image missing alt attribute',
    severity: 'error',
    category: 'accessibility',
  },
  clickableWithoutRole: {
    pattern: /onClick[^}]*(?!role=)/g,
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

  try {
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
  } catch (err) {
    // Ignore permission errors
  }

  return files;
}

// ============================================================================
// AUDIT LOGIC
// ============================================================================

function auditFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
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

  for (const dir of SCAN_DIRS) {
    try {
      const files = getAllFiles(dir);
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
      if (err.code !== 'ENOENT') {
        console.error(`Error scanning ${dir}:`, err.message);
      }
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

  // Exit with error if there are errors
  process.exit(stats.bySeverity.error > 0 ? 1 : 0);
}

main();
