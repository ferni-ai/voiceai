#!/usr/bin/env node
/**
 * Comprehensive UI Issues Auto-Fixer
 * 
 * Fixes remaining UI compliance issues:
 * - Accessibility: Add role="button" to clickable divs/spans
 * - Responsiveness: Convert hardcoded pixel widths to responsive
 * - Performance: Convert "transition: all" to specific properties
 * 
 * Usage:
 *   node fix-all-ui-issues.js                    # Analyze all
 *   node fix-all-ui-issues.js --fix              # Apply all fixes
 *   node fix-all-ui-issues.js --fix=a11y         # Fix accessibility only
 *   node fix-all-ui-issues.js --fix=responsive   # Fix responsiveness only
 *   node fix-all-ui-issues.js --fix=performance  # Fix performance only
 *   node fix-all-ui-issues.js --dry-run          # Preview changes
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
  ],
  
  ignore: [
    '*.test.ts',
    '*.spec.ts',
    '__tests__',
    'node_modules',
    'dist',
    '.generated.',
  ],
};

// =============================================================================
// ACCESSIBILITY FIXES
// =============================================================================

/**
 * Fix clickable elements that use addEventListener('click') but might be divs/spans
 * Add tabindex="0" and role="button" to make them accessible
 */
function fixAccessibilityIssues(content, filePath) {
  let modified = content;
  let fixes = 0;
  
  // Pattern: Element creation followed by addEventListener('click')
  // We need to add tabindex and role to the element
  
  // Pattern 1: querySelector + addEventListener
  // E.g., const btn = container.querySelector('.btn'); btn.addEventListener('click', ...)
  // This is hard to fix automatically without knowing the element type
  
  // Pattern 2: Template literals creating clickable divs/spans
  // Fix: Add role="button" tabindex="0" to clickable non-button elements
  const clickableDivPattern = /<(div|span)([^>]*?)class="([^"]*(?:btn|button|clickable|action|toggle|trigger)[^"]*)"([^>]*)>/gi;
  
  modified = modified.replace(clickableDivPattern, (match, tag, before, className, after) => {
    // Skip if already has role or is inside a button
    if (match.includes('role=') || match.includes('tabindex=')) {
      return match;
    }
    fixes++;
    return `<${tag}${before}class="${className}" role="button" tabindex="0"${after}>`;
  });
  
  // Pattern 3: Template literals with onclick handlers on non-buttons
  const onclickDivPattern = /<(div|span)([^>]*?)onclick=/gi;
  modified = modified.replace(onclickDivPattern, (match, tag, attrs) => {
    if (match.includes('role=')) return match;
    fixes++;
    return `<${tag}${attrs}role="button" tabindex="0" onclick=`;
  });
  
  // Pattern 4: data-action attributes without role (common in our codebase)
  const dataActionPattern = /<(div|span|li)([^>]*?)data-action="([^"]+)"([^>]*)>/gi;
  modified = modified.replace(dataActionPattern, (match, tag, before, action, after) => {
    if (match.includes('role=') || tag === 'button') return match;
    fixes++;
    return `<${tag}${before}data-action="${action}" role="button" tabindex="0"${after}>`;
  });
  
  return { content: modified, fixes };
}

// =============================================================================
// RESPONSIVENESS FIXES
// =============================================================================

/**
 * Convert hardcoded pixel widths to responsive values
 */
function fixResponsivenessIssues(content, filePath) {
  let modified = content;
  let fixes = 0;
  
  // Pattern 1: width: XXXpx where XXX > 100
  // Convert to min(XXXpx, 100%) or use clamp
  const widthPattern = /(width:\s*)['"]?(\d{3,})px['"]?/g;
  modified = modified.replace(widthPattern, (match, prefix, pixels) => {
    const px = parseInt(pixels);
    fixes++;
    
    // For very large values (>800), use percentage-based approach
    if (px > 800) {
      return `${prefix}min(${px}px, 100%)`;
    }
    // For medium values (400-800), use clamp with mobile minimum
    if (px > 400) {
      const mobile = Math.round(px * 0.7);
      return `${prefix}clamp(${mobile}px, 90vw, ${px}px)`;
    }
    // For smaller values (100-400), use min
    return `${prefix}min(${px}px, 100%)`;
  });
  
  // Pattern 2: minWidth: XXXpx (camelCase in JS)
  const minWidthPattern = /(minWidth:\s*)['"]?(\d{3,})px['"]?/g;
  modified = modified.replace(minWidthPattern, (match, prefix, pixels) => {
    const px = parseInt(pixels);
    if (px < 150) return match; // Keep small min-widths
    fixes++;
    return `${prefix}'min(${px}px, 100%)'`;
  });
  
  // Pattern 3: maxWidth with hardcoded large values
  const maxWidthPattern = /(maxWidth:\s*)['"]?(\d{4,})px['"]?/g;
  modified = modified.replace(maxWidthPattern, (match, prefix, pixels) => {
    const px = parseInt(pixels);
    fixes++;
    return `${prefix}'min(${px}px, 100vw - 2rem)'`;
  });
  
  // Pattern 4: CSS property max-width/min-width
  const cssWidthPattern = /(max-width|min-width):\s*(\d{4,})px/g;
  modified = modified.replace(cssWidthPattern, (match, prop, pixels) => {
    const px = parseInt(pixels);
    fixes++;
    if (prop === 'max-width') {
      return `${prop}: min(${px}px, calc(100vw - 2rem))`;
    }
    return `${prop}: min(${px}px, 100%)`;
  });
  
  return { content: modified, fixes };
}

// =============================================================================
// PERFORMANCE FIXES
// =============================================================================

/**
 * Fix performance issues:
 * - Convert "transition: all" to specific properties
 * - Flag expensive layout animations
 */
function fixPerformanceIssues(content, filePath) {
  let modified = content;
  let fixes = 0;
  
  // Pattern 1: transition: all XXXms/s - Replace with common safe properties
  const transitionAllPattern = /transition:\s*['"]?all\s+(\d+(?:\.\d+)?)(m?s)([^;'"\n}]*)/gi;
  modified = modified.replace(transitionAllPattern, (match, duration, unit, rest) => {
    fixes++;
    // Default to transform and opacity - safe compositor properties
    return `transition: transform ${duration}${unit}${rest}, opacity ${duration}${unit}${rest}`;
  });
  
  // Pattern 2: transition-property: all
  const transitionPropAllPattern = /transition-property:\s*['"]?all['"]?/gi;
  modified = modified.replace(transitionPropAllPattern, () => {
    fixes++;
    return 'transition-property: transform, opacity';
  });
  
  // Pattern 3: Animating width/height in keyframes - add comment warning
  // This is informational, not auto-fixed (would break animations)
  
  // Pattern 4: will-change without removal - common memory leak
  // Skip this as it requires more context
  
  return { content: modified, fixes };
}

// =============================================================================
// FILE SCANNING
// =============================================================================

function getFilesToCheck() {
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
      entry.name.endsWith('.css')
    )) {
      files.push(fullPath);
    }
  }
}

// =============================================================================
// MAIN
// =============================================================================

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

function main() {
  const args = process.argv.slice(2);
  const shouldFix = args.some(a => a.startsWith('--fix'));
  const dryRun = args.includes('--dry-run');
  const fixCategory = args.find(a => a.startsWith('--fix='))?.split('=')[1] || 'all';
  
  const files = getFilesToCheck();
  
  console.log(`\nAnalyzing ${files.length} file(s)...\n`);
  
  const stats = {
    a11y: { analyzed: 0, fixed: 0, files: [] },
    responsive: { analyzed: 0, fixed: 0, files: [] },
    performance: { analyzed: 0, fixed: 0, files: [] },
  };
  
  for (const filePath of files) {
    let content = fs.readFileSync(filePath, 'utf8');
    let fileModified = false;
    const relativePath = path.relative(ROOT, filePath);
    
    // Accessibility fixes
    if (fixCategory === 'all' || fixCategory === 'a11y') {
      const { content: newContent, fixes } = fixAccessibilityIssues(content, filePath);
      if (fixes > 0) {
        stats.a11y.analyzed += fixes;
        if (shouldFix || dryRun) {
          stats.a11y.fixed += fixes;
          stats.a11y.files.push({ path: relativePath, fixes });
          content = newContent;
          fileModified = true;
        }
      }
    }
    
    // Responsiveness fixes
    if (fixCategory === 'all' || fixCategory === 'responsive') {
      const { content: newContent, fixes } = fixResponsivenessIssues(content, filePath);
      if (fixes > 0) {
        stats.responsive.analyzed += fixes;
        if (shouldFix || dryRun) {
          stats.responsive.fixed += fixes;
          stats.responsive.files.push({ path: relativePath, fixes });
          content = newContent;
          fileModified = true;
        }
      }
    }
    
    // Performance fixes
    if (fixCategory === 'all' || fixCategory === 'performance') {
      const { content: newContent, fixes } = fixPerformanceIssues(content, filePath);
      if (fixes > 0) {
        stats.performance.analyzed += fixes;
        if (shouldFix || dryRun) {
          stats.performance.fixed += fixes;
          stats.performance.files.push({ path: relativePath, fixes });
          content = newContent;
          fileModified = true;
        }
      }
    }
    
    // Write changes
    if (fileModified && shouldFix && !dryRun) {
      fs.writeFileSync(filePath, content);
    }
  }
  
  // Report
  console.log('═'.repeat(70));
  console.log(`${COLORS.bold}UI COMPLIANCE AUTO-FIXER REPORT${COLORS.reset}`);
  console.log('═'.repeat(70) + '\n');
  
  const mode = dryRun ? 'Would fix' : shouldFix ? 'Fixed' : 'Found';
  
  console.log(`${COLORS.bold}Summary:${COLORS.reset}\n`);
  
  console.log(`  ${COLORS.magenta}♿ Accessibility:${COLORS.reset}`);
  console.log(`     ${mode}: ${stats.a11y.fixed} issues in ${stats.a11y.files.length} files`);
  console.log(`     (Added role="button" tabindex="0" to clickable elements)\n`);
  
  console.log(`  ${COLORS.blue}📱 Responsiveness:${COLORS.reset}`);
  console.log(`     ${mode}: ${stats.responsive.fixed} issues in ${stats.responsive.files.length} files`);
  console.log(`     (Converted hardcoded widths to min()/clamp())\n`);
  
  console.log(`  ${COLORS.cyan}⚡ Performance:${COLORS.reset}`);
  console.log(`     ${mode}: ${stats.performance.fixed} issues in ${stats.performance.files.length} files`);
  console.log(`     (Converted "transition: all" to specific properties)\n`);
  
  const totalFixed = stats.a11y.fixed + stats.responsive.fixed + stats.performance.fixed;
  const totalFiles = new Set([
    ...stats.a11y.files.map(f => f.path),
    ...stats.responsive.files.map(f => f.path),
    ...stats.performance.files.map(f => f.path),
  ]).size;
  
  console.log(`${COLORS.bold}Total: ${totalFixed} fixes across ${totalFiles} files${COLORS.reset}\n`);
  
  // Show top files modified
  if (stats.a11y.files.length > 0) {
    console.log(`${COLORS.bold}Top files - Accessibility:${COLORS.reset}`);
    const top = stats.a11y.files.sort((a, b) => b.fixes - a.fixes).slice(0, 10);
    for (const f of top) {
      console.log(`  ${f.fixes.toString().padStart(3)} - ${f.path}`);
    }
    console.log();
  }
  
  if (stats.responsive.files.length > 0) {
    console.log(`${COLORS.bold}Top files - Responsiveness:${COLORS.reset}`);
    const top = stats.responsive.files.sort((a, b) => b.fixes - a.fixes).slice(0, 10);
    for (const f of top) {
      console.log(`  ${f.fixes.toString().padStart(3)} - ${f.path}`);
    }
    console.log();
  }
  
  if (stats.performance.files.length > 0) {
    console.log(`${COLORS.bold}Top files - Performance:${COLORS.reset}`);
    const top = stats.performance.files.sort((a, b) => b.fixes - a.fixes).slice(0, 10);
    for (const f of top) {
      console.log(`  ${f.fixes.toString().padStart(3)} - ${f.path}`);
    }
    console.log();
  }
  
  if (!shouldFix) {
    console.log(`${COLORS.bold}To apply fixes:${COLORS.reset}`);
    console.log(`  node design-system/fix-all-ui-issues.js --fix         # Fix all`);
    console.log(`  node design-system/fix-all-ui-issues.js --fix=a11y    # Accessibility only`);
    console.log(`  node design-system/fix-all-ui-issues.js --fix=responsive  # Responsiveness only`);
    console.log(`  node design-system/fix-all-ui-issues.js --fix=performance # Performance only`);
    console.log(`  node design-system/fix-all-ui-issues.js --dry-run     # Preview changes`);
  }
}

main();

