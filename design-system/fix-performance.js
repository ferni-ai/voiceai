#!/usr/bin/env node
/**
 * Performance Animation Fix Script
 * 
 * Identifies animations using expensive layout properties and suggests
 * transform/opacity alternatives for 60fps performance.
 * 
 * Usage:
 *   node fix-performance.js                    # Analyze and report
 *   node fix-performance.js path/to/file.ts   # Single file
 *   node fix-performance.js --json            # JSON output
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
  
  // Layout properties that trigger reflow (expensive)
  expensiveProperties: {
    // Size properties
    'width': {
      severity: 'high',
      alternative: 'transform: scaleX()',
      example: 'transform: scaleX(0.5) -> scaleX(1)',
    },
    'height': {
      severity: 'high', 
      alternative: 'transform: scaleY()',
      example: 'transform: scaleY(0) -> scaleY(1)',
    },
    'max-width': {
      severity: 'medium',
      alternative: 'transform: scaleX() with overflow:hidden wrapper',
      example: 'Use clip-path or scale transforms',
    },
    'max-height': {
      severity: 'medium',
      alternative: 'transform: scaleY() with overflow:hidden wrapper',
      example: 'Use max-height with very large value + overflow',
    },
    
    // Position properties
    'top': {
      severity: 'high',
      alternative: 'transform: translateY()',
      example: 'transform: translateY(-100%) -> translateY(0)',
    },
    'left': {
      severity: 'high',
      alternative: 'transform: translateX()',
      example: 'transform: translateX(-100%) -> translateX(0)',
    },
    'right': {
      severity: 'high',
      alternative: 'transform: translateX() (negative)',
      example: 'Use left with translateX instead',
    },
    'bottom': {
      severity: 'high',
      alternative: 'transform: translateY() (negative)',
      example: 'Use top with translateY instead',
    },
    
    // Margin properties
    'margin': {
      severity: 'medium',
      alternative: 'transform: translate()',
      example: 'Position with transform instead',
    },
    'margin-top': {
      severity: 'medium',
      alternative: 'transform: translateY()',
      example: 'Use translateY for vertical offset',
    },
    'margin-left': {
      severity: 'medium',
      alternative: 'transform: translateX()',
      example: 'Use translateX for horizontal offset',
    },
    
    // Padding (can't be replaced, but should be avoided in animations)
    'padding': {
      severity: 'low',
      alternative: 'Inner element with transform',
      example: 'Animate inner element scale instead',
    },
    
    // Typography
    'font-size': {
      severity: 'high',
      alternative: 'transform: scale()',
      example: 'transform: scale(1) -> scale(1.2)',
    },
    'line-height': {
      severity: 'medium',
      alternative: 'Avoid animating or use scale',
      example: 'Usually better to avoid entirely',
    },
    
    // Border
    'border-width': {
      severity: 'low',
      alternative: 'box-shadow or pseudo-element',
      example: 'Use ::after with opacity/scale',
    },
  },
  
  // Properties that are cheap to animate (compositor-only)
  cheapProperties: ['transform', 'opacity', 'filter', 'clip-path'],
};

// =============================================================================
// PATTERNS
// =============================================================================

function buildExpensivePropertyRegex() {
  const props = Object.keys(CONFIG.expensiveProperties);
  // Match CSS-style and camelCase versions
  const cssProps = props.join('|');
  const camelProps = props.map(p => p.replace(/-([a-z])/g, (_, c) => c.toUpperCase())).join('|');
  
  return new RegExp(`(?:${cssProps}|${camelProps})\\s*:`, 'gi');
}

// =============================================================================
// ANALYSIS
// =============================================================================

function findPerformanceIssues(content, filePath) {
  const issues = [];
  const lines = content.split('\n');
  
  // Pattern 1: animate() calls with expensive properties
  const animateRegex = /\.animate\s*\(\s*(\[[\s\S]*?\]|\{[\s\S]*?\})\s*,/g;
  let match;
  
  while ((match = animateRegex.exec(content)) !== null) {
    const keyframes = match[1];
    const lineNumber = content.substring(0, match.index).split('\n').length;
    
    for (const [prop, info] of Object.entries(CONFIG.expensiveProperties)) {
      const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const propRegex = new RegExp(`['"]?(${prop}|${camelProp})['"]?\\s*:`, 'i');
      
      if (propRegex.test(keyframes)) {
        issues.push({
          type: 'animate',
          line: lineNumber,
          property: prop,
          severity: info.severity,
          alternative: info.alternative,
          example: info.example,
          context: keyframes.substring(0, 100),
          file: filePath,
        });
      }
    }
  }
  
  // Pattern 2: CSS transition with expensive properties
  const transitionRegex = /transition\s*:\s*([^;}{]+)/gi;
  
  while ((match = transitionRegex.exec(content)) !== null) {
    const transitionValue = match[1];
    const lineNumber = content.substring(0, match.index).split('\n').length;
    
    // Check for 'all' keyword
    if (/\ball\b/i.test(transitionValue)) {
      issues.push({
        type: 'transition-all',
        line: lineNumber,
        property: 'all',
        severity: 'medium',
        alternative: 'Specify individual properties',
        example: 'transition: transform 0.3s, opacity 0.3s',
        context: match[0],
        file: filePath,
      });
    }
    
    // Check for specific expensive properties
    for (const [prop, info] of Object.entries(CONFIG.expensiveProperties)) {
      if (new RegExp(`\\b${prop}\\b`, 'i').test(transitionValue)) {
        issues.push({
          type: 'transition',
          line: lineNumber,
          property: prop,
          severity: info.severity,
          alternative: info.alternative,
          example: info.example,
          context: match[0],
          file: filePath,
        });
      }
    }
  }
  
  // Pattern 3: @keyframes with expensive properties
  const keyframesRegex = /@keyframes\s+[\w-]+\s*\{([\s\S]*?)\}/gi;
  
  while ((match = keyframesRegex.exec(content)) !== null) {
    const keyframeBody = match[1];
    const lineNumber = content.substring(0, match.index).split('\n').length;
    
    for (const [prop, info] of Object.entries(CONFIG.expensiveProperties)) {
      if (new RegExp(`\\b${prop}\\s*:`, 'i').test(keyframeBody)) {
        issues.push({
          type: 'keyframes',
          line: lineNumber,
          property: prop,
          severity: info.severity,
          alternative: info.alternative,
          example: info.example,
          context: match[0].substring(0, 100),
          file: filePath,
        });
      }
    }
  }
  
  // Pattern 4: will-change overuse
  const willChangeRegex = /will-change\s*:\s*([^;}{]+)/gi;
  
  while ((match = willChangeRegex.exec(content)) !== null) {
    const value = match[1].trim();
    const lineNumber = content.substring(0, match.index).split('\n').length;
    
    // will-change: auto is fine
    if (value === 'auto') continue;
    
    // Check if it's being set permanently (not before animation)
    const prevLines = lines.slice(Math.max(0, lineNumber - 5), lineNumber).join('\n');
    if (!prevLines.includes('addEventListener') && !prevLines.includes('hover')) {
      issues.push({
        type: 'will-change',
        line: lineNumber,
        property: value,
        severity: 'low',
        alternative: 'Set will-change just before animation, remove after',
        example: 'element.style.willChange = "transform"; // then remove',
        context: match[0],
        file: filePath,
      });
    }
  }
  
  return issues;
}

// =============================================================================
// FILE SCANNING
// =============================================================================

function getFilesToCheck(args) {
  const specificFile = args.find(a => !a.startsWith('--') && a.includes('.'));
  if (specificFile) {
    const fullPath = path.join(ROOT, specificFile);
    if (fs.existsSync(fullPath)) {
      return [fullPath];
    }
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
      entry.name.endsWith('.css')
    )) {
      files.push(fullPath);
    }
  }
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
  cyan: '\x1b[36m',
};

function printReport(allIssues, args) {
  const jsonOutput = args.includes('--json');
  
  if (jsonOutput) {
    console.log(JSON.stringify({
      total: allIssues.length,
      bySeverity: {
        high: allIssues.filter(i => i.severity === 'high').length,
        medium: allIssues.filter(i => i.severity === 'medium').length,
        low: allIssues.filter(i => i.severity === 'low').length,
      },
      issues: allIssues.map(i => ({
        file: path.relative(ROOT, i.file),
        line: i.line,
        type: i.type,
        property: i.property,
        severity: i.severity,
        alternative: i.alternative,
      })),
    }, null, 2));
    return;
  }
  
  console.log('\n' + '═'.repeat(70));
  console.log(`${COLORS.bold}⚡ ANIMATION PERFORMANCE AUDIT${COLORS.reset}`);
  console.log('═'.repeat(70) + '\n');
  
  if (allIssues.length === 0) {
    console.log(`${COLORS.green}✅ No performance issues found!${COLORS.reset}\n`);
    return;
  }
  
  const byFile = {};
  const bySeverity = { high: 0, medium: 0, low: 0 };
  const byProperty = {};
  const byType = {};
  
  for (const issue of allIssues) {
    byFile[issue.file] = (byFile[issue.file] || 0) + 1;
    bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
    byProperty[issue.property] = (byProperty[issue.property] || 0) + 1;
    byType[issue.type] = (byType[issue.type] || 0) + 1;
  }
  
  console.log(`${COLORS.bold}Summary:${COLORS.reset}`);
  console.log(`  Total issues: ${allIssues.length}`);
  console.log(`\n${COLORS.bold}By Severity:${COLORS.reset}`);
  console.log(`  ${COLORS.red}High:${COLORS.reset}   ${bySeverity.high} (triggers layout/reflow)`);
  console.log(`  ${COLORS.yellow}Medium:${COLORS.reset} ${bySeverity.medium} (may cause jank)`);
  console.log(`  ${COLORS.dim}Low:${COLORS.reset}    ${bySeverity.low} (optimization opportunity)`);
  
  console.log(`\n${COLORS.bold}By Property:${COLORS.reset}`);
  const sortedProps = Object.entries(byProperty).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [prop, count] of sortedProps) {
    const info = CONFIG.expensiveProperties[prop] || {};
    console.log(`  ${count.toString().padStart(3)} - ${prop} ${COLORS.dim}→ ${info.alternative || 'optimize'}${COLORS.reset}`);
  }
  
  console.log(`\n${COLORS.bold}By Pattern Type:${COLORS.reset}`);
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${count.toString().padStart(3)} - ${type}`);
  }
  
  // Top files
  console.log(`\n${COLORS.bold}Top Files Needing Attention:${COLORS.reset}`);
  const sortedFiles = Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 15);
  for (const [file, count] of sortedFiles) {
    const relativePath = path.relative(ROOT, file);
    console.log(`  ${count.toString().padStart(3)} - ${relativePath}`);
  }
  
  // Sample high-severity issues
  console.log(`\n${COLORS.bold}Sample High-Severity Issues:${COLORS.reset}`);
  const highSeverity = allIssues.filter(i => i.severity === 'high').slice(0, 10);
  for (const issue of highSeverity) {
    const relativePath = path.relative(ROOT, issue.file);
    console.log(`\n  ${COLORS.cyan}${relativePath}${COLORS.reset}:${issue.line}`);
    console.log(`  ${COLORS.red}${issue.property}${COLORS.reset} in ${issue.type}`);
    console.log(`  ${COLORS.green}💡 ${issue.alternative}${COLORS.reset}`);
    console.log(`  ${COLORS.dim}Example: ${issue.example}${COLORS.reset}`);
  }
  
  // Guidelines
  console.log(`\n${COLORS.bold}📖 Performance Guidelines:${COLORS.reset}`);
  console.log(`  • Only animate: transform, opacity, filter, clip-path`);
  console.log(`  • Replace width/height with scaleX/scaleY`);
  console.log(`  • Replace top/left with translateX/translateY`);
  console.log(`  • Never use transition: all - specify properties`);
  console.log(`  • Use will-change sparingly, only before animations`);
  console.log(`  • Test with Chrome DevTools Performance panel`);
  
  // Command suggestion
  console.log(`\n${COLORS.bold}📊 Export to JSON:${COLORS.reset}`);
  console.log(`  node design-system/fix-performance.js --json > performance-audit.json`);
}

// =============================================================================
// MAIN
// =============================================================================

function main() {
  const args = process.argv.slice(2);
  
  const files = getFilesToCheck(args);
  
  if (files.length === 0) {
    console.log('No files to check.');
    process.exit(0);
  }
  
  if (!args.includes('--json')) {
    console.log(`Analyzing ${files.length} file(s) for performance issues...`);
  }
  
  const allIssues = [];
  
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const issues = findPerformanceIssues(content, file);
    allIssues.push(...issues);
  }
  
  printReport(allIssues, args);
  
  process.exit(0);
}

main();

