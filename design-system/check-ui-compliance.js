#!/usr/bin/env node
/**
 * Comprehensive UI Compliance Checker
 * 
 * Detects and optionally fixes pre-existing UI issues:
 * - Accessibility: Buttons/interactive elements missing aria-labels
 * - Responsiveness: Hardcoded pixel widths that should be responsive
 * - Consistency: Hardcoded z-index values (should use design tokens)
 * - Performance: Animating expensive layout properties
 * 
 * Usage:
 *   node check-ui-compliance.js                    # Full audit
 *   node check-ui-compliance.js --category=a11y   # Accessibility only
 *   node check-ui-compliance.js --category=zindex # z-index only
 *   node check-ui-compliance.js --fix             # Auto-fix where possible
 *   node check-ui-compliance.js --json            # JSON output
 *   node check-ui-compliance.js --summary         # Summary only
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  scanDirs: [
    'apps/web/src/ui',
    'apps/web/src/admin',
    'apps/web/src/styles',
    'apps/web/src/pages',
  ],
  
  ignore: [
    '*.test.ts',
    '*.spec.ts',
    '__tests__',
    'node_modules',
    'dist',
    '.generated.',
  ],
  
  // z-index token mappings from spacing.json
  zIndexTokens: {
    '-1': 'var(--z-hide)',
    '0': 'var(--z-base)',
    '10': 'var(--z-docked)',
    '100': 'var(--z-docked)',  // Common close values
    '1000': 'var(--z-dropdown)',
    '1100': 'var(--z-sticky)',
    '1200': 'var(--z-banner)',
    '1300': 'var(--z-overlay)',
    '1400': 'var(--z-modal)',
    '1500': 'var(--z-popover)',
    '1600': 'var(--z-skipLink)',
    '1700': 'var(--z-toast)',
    '1800': 'var(--z-tooltip)',
    // Common non-standard values -> suggest nearest
    '50': 'var(--z-docked)',
    '99': 'var(--z-docked)',
    '999': 'var(--z-dropdown)',
    '9999': 'var(--z-tooltip)',
    '99999': 'var(--z-tooltip)',
    '999999': 'var(--z-tooltip)',
  },
  
  // Layout properties that are expensive to animate
  expensiveAnimationProperties: [
    'width',
    'height',
    'top',
    'left',
    'right',
    'bottom',
    'margin',
    'marginTop',
    'marginRight',
    'marginBottom',
    'marginLeft',
    'padding',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'border',
    'borderWidth',
    'font-size',
    'fontSize',
    'line-height',
    'lineHeight',
  ],
  
  // Good alternatives for layout animations
  performanceAlternatives: {
    'width': 'transform: scaleX()',
    'height': 'transform: scaleY()',
    'top': 'transform: translateY()',
    'left': 'transform: translateX()',
    'right': 'transform: translateX()',
    'bottom': 'transform: translateY()',
    'margin': 'transform: translate()',
    'marginTop': 'transform: translateY()',
    'marginRight': 'transform: translateX()',
    'marginBottom': 'transform: translateY()',
    'marginLeft': 'transform: translateX()',
    'padding': 'Redesign with transform/opacity',
    'font-size': 'transform: scale()',
    'fontSize': 'transform: scale()',
  },
};

// =============================================================================
// VIOLATION PATTERNS
// =============================================================================

const PATTERNS = {
  // ============================================
  // ACCESSIBILITY (a11y)
  // ============================================
  
  // Button without aria-label
  buttonMissingAriaLabel: {
    category: 'a11y',
    severity: 'warning',
    regex: /<button(?![^>]*aria-label)[^>]*>/gi,
    message: 'Button element missing aria-label',
    suggestion: 'Add aria-label="descriptive text" attribute',
    canFix: false,
  },
  
  // Interactive element (onclick) without role/aria
  clickableWithoutRole: {
    category: 'a11y',
    severity: 'warning',
    regex: /(?:onclick|@click|\.addEventListener\('click')(?![^>]*(?:role=|aria-))/gi,
    message: 'Clickable element may need role and aria attributes',
    suggestion: 'Add role="button" and aria-label if not a native button',
    canFix: false,
  },
  
  // createElement('button') without setting aria-label
  createButtonMissingAria: {
    category: 'a11y',
    severity: 'warning',
    regex: /createElement\(['"]button['"]\)(?![\s\S]{0,200}\.setAttribute\(['"]aria-label)/g,
    message: 'Created button may be missing aria-label',
    suggestion: 'Add element.setAttribute("aria-label", "...")',
    canFix: false,
  },
  
  // Icon-only button (common pattern)
  iconOnlyButton: {
    category: 'a11y',
    severity: 'warning',
    regex: /<button[^>]*>(?:\s*<(?:svg|img|i|span)[^>]*(?:icon|svg|img)[^>]*>|[^<]*(?:✕|✓|×|→|←|↑|↓|🔍|❌|✔))\s*<\/button>/gi,
    message: 'Icon-only button needs aria-label',
    suggestion: 'Add aria-label describing the button action',
    canFix: false,
  },
  
  // ============================================
  // RESPONSIVENESS (responsive)
  // ============================================
  
  // Hardcoded pixel widths in styles (not inside media query)
  hardcodedPixelWidth: {
    category: 'responsive',
    severity: 'warning',
    regex: /(?:width|minWidth|min-width|maxWidth|max-width):\s*['"]?(\d{3,})px['"]?/g,
    message: 'Hardcoded pixel width may break responsiveness',
    suggestion: (match) => {
      const px = parseInt(match.match(/\d+/)?.[0] || '0');
      if (px > 1000) return 'Use 100%, vw, or design token';
      if (px > 500) return 'Use clamp(), min(), or responsive tokens';
      return 'Consider using rem, %, or CSS variable';
    },
    canFix: false,
  },
  
  // Fixed height that could cause overflow
  fixedHeight: {
    category: 'responsive',
    severity: 'info',
    regex: /(?<!min-)height:\s*['"]?(\d{3,})px['"]?/g,
    message: 'Fixed height may cause content overflow on different screens',
    suggestion: 'Consider min-height, max-height, or auto',
    canFix: false,
  },
  
  // ============================================
  // CONSISTENCY (z-index)
  // ============================================
  
  // Hardcoded z-index values
  hardcodedZIndex: {
    category: 'consistency',
    severity: 'warning',
    regex: /z-?[iI]ndex:\s*['"]?(\d+)['"]?/g,
    message: 'Hardcoded z-index - use design token',
    suggestion: (match) => {
      const value = match.match(/\d+/)?.[0];
      const token = CONFIG.zIndexTokens[value];
      if (token) return `Use ${token}`;
      
      // Find nearest token
      const num = parseInt(value);
      if (num < 100) return 'Use var(--z-docked) or var(--z-base)';
      if (num < 1100) return 'Use var(--z-dropdown)';
      if (num < 1300) return 'Use var(--z-sticky) or var(--z-banner)';
      if (num < 1500) return 'Use var(--z-overlay) or var(--z-modal)';
      return 'Use var(--z-toast) or var(--z-tooltip)';
    },
    canFix: true,
    fix: (match) => {
      const value = match.match(/\d+/)?.[0];
      const token = CONFIG.zIndexTokens[value];
      if (token) {
        return match.replace(/\d+/, token);
      }
      // Map common values to nearest token
      const num = parseInt(value);
      if (num <= 10) return match.replace(/\d+/, 'var(--z-docked)');
      if (num < 1100) return match.replace(/\d+/, 'var(--z-dropdown)');
      if (num < 1300) return match.replace(/\d+/, 'var(--z-overlay)');
      if (num < 1500) return match.replace(/\d+/, 'var(--z-modal)');
      return match.replace(/\d+/, 'var(--z-tooltip)');
    },
  },
  
  // ============================================
  // PERFORMANCE (animations)
  // ============================================
  
  // Animating layout properties
  animatingLayoutProperty: {
    category: 'performance',
    severity: 'warning',
    regex: null, // Built dynamically
    message: 'Animating layout property - expensive for performance',
    suggestion: (match) => {
      for (const [prop, alt] of Object.entries(CONFIG.performanceAlternatives)) {
        if (match.toLowerCase().includes(prop.toLowerCase())) {
          return `Use ${alt} instead for 60fps animations`;
        }
      }
      return 'Use transform/opacity for smooth animations';
    },
    canFix: false,
  },
  
  // transition: all (performance anti-pattern)
  transitionAll: {
    category: 'performance',
    severity: 'warning',
    regex: /transition:\s*['"]?all\s+/gi,
    message: '"transition: all" is expensive - specify properties',
    suggestion: 'List specific properties: transition: transform 0.3s, opacity 0.3s',
    canFix: false,
  },
  
  // will-change overuse
  willChangeOveruse: {
    category: 'performance',
    severity: 'info',
    regex: /will-change:\s*(?!auto)/gi,
    message: 'will-change should be used sparingly',
    suggestion: 'Only use will-change on elements that will animate soon',
    canFix: false,
  },
};

// Build dynamic regex for expensive animations
function buildExpensiveAnimationRegex() {
  const props = CONFIG.expensiveAnimationProperties.join('|');
  // Matches: animate({width: ...}), { width: '100px' } in animation context
  return new RegExp(
    `(?:animate|animation|transition|keyframes|@keyframes)[^}]*\\{[^}]*(${props})\\s*:`,
    'gi'
  );
}

// =============================================================================
// FILE SCANNING
// =============================================================================

function getFilesToCheck(args) {
  const specificFile = args.find(a => !a.startsWith('--') && a.includes('.'));
  if (specificFile && fs.existsSync(path.join(ROOT, specificFile))) {
    return [path.join(ROOT, specificFile)];
  }
  
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
    } else if (entry.isFile() && (
      entry.name.endsWith('.ts') || 
      entry.name.endsWith('.tsx') ||
      entry.name.endsWith('.css') ||
      entry.name.endsWith('.html')
    )) {
      files.push(fullPath);
    }
  }
}

// =============================================================================
// VIOLATION CHECKING
// =============================================================================

function checkFile(filePath, categoryFilter = null) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const violations = [];
  
  for (const [patternName, pattern] of Object.entries(PATTERNS)) {
    // Skip if filtering by category and this doesn't match
    if (categoryFilter && pattern.category !== categoryFilter) {
      continue;
    }
    
    let regex = pattern.regex;
    
    // Build dynamic regex for expensive animations
    if (patternName === 'animatingLayoutProperty') {
      regex = buildExpensiveAnimationRegex();
    }
    
    if (!regex) continue;
    
    const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
    let match;
    
    while ((match = globalRegex.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      const line = lines[lineNumber - 1];
      
      // Skip if in a comment
      if (line?.trim().startsWith('//') || line?.trim().startsWith('*')) {
        continue;
      }
      
      violations.push({
        file: filePath,
        line: lineNumber,
        column: match.index - content.lastIndexOf('\n', match.index - 1),
        pattern: patternName,
        category: pattern.category,
        match: match[0].substring(0, 60) + (match[0].length > 60 ? '...' : ''),
        message: pattern.message,
        suggestion: typeof pattern.suggestion === 'function' 
          ? pattern.suggestion(match[0]) 
          : pattern.suggestion,
        severity: pattern.severity,
        lineContent: line?.trim().substring(0, 100) || '',
        canFix: pattern.canFix || false,
        fix: pattern.fix ? pattern.fix(match[0]) : null,
      });
    }
  }
  
  return violations;
}

// =============================================================================
// AUTO-FIX
// =============================================================================

function fixFile(filePath, violations) {
  let content = fs.readFileSync(filePath, 'utf8');
  let fixedCount = 0;
  
  const fixableViolations = violations
    .filter(v => v.canFix && v.fix)
    .sort((a, b) => b.line - a.line || b.column - a.column);
  
  for (const v of fixableViolations) {
    const originalMatch = v.match.replace(/\.\.\.$/,'');
    if (v.fix && content.includes(originalMatch)) {
      // Find and replace in context to avoid wrong matches
      const lines = content.split('\n');
      const line = lines[v.line - 1];
      if (line && line.includes(originalMatch)) {
        lines[v.line - 1] = line.replace(originalMatch, v.fix);
        content = lines.join('\n');
        fixedCount++;
      }
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
  magenta: '\x1b[35m',
};

const CATEGORY_COLORS = {
  a11y: COLORS.magenta,
  responsive: COLORS.blue,
  consistency: COLORS.yellow,
  performance: COLORS.cyan,
};

const CATEGORY_ICONS = {
  a11y: '♿',
  responsive: '📱',
  consistency: '🔧',
  performance: '⚡',
};

function formatViolation(v) {
  const icon = CATEGORY_ICONS[v.category] || '•';
  const color = CATEGORY_COLORS[v.category] || COLORS.reset;
  const relativePath = path.relative(ROOT, v.file);
  
  return [
    `${icon} ${color}[${v.category}]${COLORS.reset} ${COLORS.cyan}${relativePath}${COLORS.reset}:${v.line}`,
    `   ${v.message}`,
    `   ${COLORS.dim}${v.lineContent}${COLORS.reset}`,
    `   ${COLORS.green}💡 ${v.suggestion}${COLORS.reset}`,
    '',
  ].join('\n');
}

function printSummary(violations, fixedCount = 0, args = []) {
  const byCategory = { a11y: 0, responsive: 0, consistency: 0, performance: 0 };
  const byFile = {};
  const bySeverity = { error: 0, warning: 0, info: 0 };
  
  for (const v of violations) {
    byCategory[v.category] = (byCategory[v.category] || 0) + 1;
    byFile[v.file] = (byFile[v.file] || 0) + 1;
    bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;
  }
  
  const fileCount = Object.keys(byFile).length;
  
  console.log('\n' + '═'.repeat(70));
  console.log(`${COLORS.bold}UI COMPLIANCE AUDIT REPORT${COLORS.reset}`);
  console.log('═'.repeat(70) + '\n');
  
  if (violations.length === 0) {
    console.log(`${COLORS.green}✅ No UI compliance issues found!${COLORS.reset}\n`);
    return;
  }
  
  if (fixedCount > 0) {
    console.log(`${COLORS.green}🔧 Auto-fixed ${fixedCount} issue(s)${COLORS.reset}\n`);
  }
  
  console.log(`${COLORS.bold}Summary:${COLORS.reset}`);
  console.log(`  Total warnings: ${violations.length} across ${fileCount} files\n`);
  
  console.log(`${COLORS.bold}By Category:${COLORS.reset}`);
  console.log(`  ${CATEGORY_ICONS.a11y} ${CATEGORY_COLORS.a11y}Accessibility:${COLORS.reset}  ${byCategory.a11y.toString().padStart(5)} (buttons needing aria-labels)`);
  console.log(`  ${CATEGORY_ICONS.responsive} ${CATEGORY_COLORS.responsive}Responsiveness:${COLORS.reset} ${byCategory.responsive.toString().padStart(5)} (hardcoded pixel widths)`);
  console.log(`  ${CATEGORY_ICONS.consistency} ${CATEGORY_COLORS.consistency}Consistency:${COLORS.reset}    ${byCategory.consistency.toString().padStart(5)} (hardcoded z-index values)`);
  console.log(`  ${CATEGORY_ICONS.performance} ${CATEGORY_COLORS.performance}Performance:${COLORS.reset}    ${byCategory.performance.toString().padStart(5)} (animating layout properties)`);
  
  console.log(`\n${COLORS.bold}By Severity:${COLORS.reset}`);
  console.log(`  ${COLORS.red}Errors:${COLORS.reset}   ${bySeverity.error}`);
  console.log(`  ${COLORS.yellow}Warnings:${COLORS.reset} ${bySeverity.warning}`);
  console.log(`  ${COLORS.blue}Info:${COLORS.reset}     ${bySeverity.info}`);
  
  if (!args.includes('--summary')) {
    console.log(`\n${COLORS.bold}Top 20 Files by Issues:${COLORS.reset}`);
    const sortedFiles = Object.entries(byFile)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    
    for (const [file, count] of sortedFiles) {
      const relativePath = path.relative(ROOT, file);
      console.log(`  ${count.toString().padStart(4)} - ${relativePath}`);
    }
    
    console.log('\n' + '-'.repeat(70) + '\n');
    
    // Print sample violations (10 per category max)
    for (const category of ['a11y', 'responsive', 'consistency', 'performance']) {
      const categoryViolations = violations.filter(v => v.category === category).slice(0, 5);
      if (categoryViolations.length > 0) {
        console.log(`${COLORS.bold}Sample ${category.toUpperCase()} issues:${COLORS.reset}\n`);
        for (const v of categoryViolations) {
          console.log(formatViolation(v));
        }
      }
    }
  }
  
  // Recommendations
  console.log(`\n${COLORS.bold}🎯 Recommended Fix Order:${COLORS.reset}`);
  console.log(`  1. z-index consistency - Run: node check-ui-compliance.js --category=consistency --fix`);
  console.log(`  2. Accessibility - Add aria-labels to buttons (manual review needed)`);
  console.log(`  3. Performance - Replace layout animations with transform/opacity`);
  console.log(`  4. Responsiveness - Convert fixed widths to responsive units`);
  
  console.log(`\n${COLORS.bold}📊 Metrics:${COLORS.reset}`);
  console.log(`  Auto-fixable: ${violations.filter(v => v.canFix).length} (${Math.round(violations.filter(v => v.canFix).length / violations.length * 100)}%)`);
  console.log(`  Manual review: ${violations.filter(v => !v.canFix).length}`);
}

function printJSON(violations, fixedCount) {
  const byCategory = { a11y: 0, responsive: 0, consistency: 0, performance: 0 };
  const byFile = {};
  
  for (const v of violations) {
    byCategory[v.category] = (byCategory[v.category] || 0) + 1;
    byFile[v.file] = (byFile[v.file] || 0) + 1;
  }
  
  console.log(JSON.stringify({
    summary: {
      total: violations.length,
      files: Object.keys(byFile).length,
      fixed: fixedCount,
      byCategory,
    },
    violations: violations.map(v => ({
      file: path.relative(ROOT, v.file),
      line: v.line,
      category: v.category,
      severity: v.severity,
      pattern: v.pattern,
      message: v.message,
      suggestion: v.suggestion,
      canFix: v.canFix,
    })),
  }, null, 2));
}

// =============================================================================
// MAIN
// =============================================================================

function main() {
  const args = process.argv.slice(2);
  const shouldFix = args.includes('--fix');
  const jsonOutput = args.includes('--json');
  const categoryArg = args.find(a => a.startsWith('--category='));
  const categoryFilter = categoryArg ? categoryArg.split('=')[1] : null;
  
  // Map short names to full category names
  const categoryMap = {
    'a11y': 'a11y',
    'accessibility': 'a11y',
    'responsive': 'responsive',
    'responsiveness': 'responsive',
    'zindex': 'consistency',
    'z-index': 'consistency',
    'consistency': 'consistency',
    'performance': 'performance',
    'perf': 'performance',
  };
  
  const normalizedCategory = categoryFilter ? categoryMap[categoryFilter.toLowerCase()] : null;
  
  const files = getFilesToCheck(args);
  
  if (files.length === 0) {
    console.log('No files to check.');
    process.exit(0);
  }
  
  if (!jsonOutput) {
    const filterMsg = normalizedCategory ? ` (${normalizedCategory} only)` : '';
    console.log(`Checking ${files.length} file(s)${filterMsg}...`);
  }
  
  const allViolations = [];
  let totalFixed = 0;
  
  for (const file of files) {
    const violations = checkFile(file, normalizedCategory);
    
    if (shouldFix && violations.length > 0) {
      const fixedCount = fixFile(file, violations);
      totalFixed += fixedCount;
      
      // Re-check after fixing
      const remainingViolations = checkFile(file, normalizedCategory);
      allViolations.push(...remainingViolations);
    } else {
      allViolations.push(...violations);
    }
  }
  
  if (jsonOutput) {
    printJSON(allViolations, totalFixed);
  } else {
    printSummary(allViolations, totalFixed, args);
  }
  
  process.exit(0);
}

main();

