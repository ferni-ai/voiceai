#!/usr/bin/env node
/**
 * Accessibility Auto-Fix Script
 * 
 * Analyzes buttons and interactive elements, suggests or applies aria-labels
 * based on content analysis and common patterns.
 * 
 * Usage:
 *   node fix-accessibility.js                    # Analyze and report
 *   node fix-accessibility.js --fix              # Apply auto-fixes
 *   node fix-accessibility.js --dry-run          # Show what would be fixed
 *   node fix-accessibility.js path/to/file.ts   # Single file
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
  ],
  
  ignore: [
    '*.test.ts',
    '*.spec.ts',
    '__tests__',
    'node_modules',
    'dist',
    '.generated.',
  ],
  
  // Icon patterns and their suggested labels
  iconPatterns: {
    // Close/dismiss icons
    '✕|×|&times;|close|Close': 'Close',
    'X</|x-icon|IconX|CloseIcon': 'Close',
    
    // Navigation
    '←|←|left-arrow|ArrowLeft|ChevronLeft': 'Go back',
    '→|→|right-arrow|ArrowRight|ChevronRight': 'Go forward',
    '↑|ArrowUp|ChevronUp': 'Move up',
    '↓|ArrowDown|ChevronDown': 'Move down',
    
    // Actions
    '✓|check|CheckIcon|IconCheck': 'Confirm',
    '❌|delete|trash|TrashIcon|DeleteIcon': 'Delete',
    '✏️|edit|EditIcon|PencilIcon': 'Edit',
    '⚙️|settings|SettingsIcon|GearIcon|CogIcon': 'Settings',
    '🔍|search|SearchIcon|MagnifyingGlass': 'Search',
    
    // Media controls
    '▶|play|PlayIcon|IconPlay': 'Play',
    '⏸|pause|PauseIcon|IconPause': 'Pause',
    '⏹|stop|StopIcon|IconStop': 'Stop',
    '⏮|previous|PreviousIcon|SkipBack': 'Previous',
    '⏭|next|NextIcon|SkipForward': 'Next',
    '🔊|volume|VolumeIcon|Speaker': 'Volume',
    '🔇|mute|MuteIcon|SpeakerOff': 'Mute',
    
    // Common UI
    '☰|menu|MenuIcon|HamburgerIcon|Bars': 'Menu',
    '⊕|➕|plus|PlusIcon|AddIcon': 'Add',
    '⊖|➖|minus|MinusIcon|RemoveIcon': 'Remove',
    'expand|ExpandIcon|ChevronDown|CaretDown': 'Expand',
    'collapse|CollapseIcon|ChevronUp|CaretUp': 'Collapse',
    'refresh|RefreshIcon|RotateCw': 'Refresh',
    'copy|CopyIcon|Clipboard': 'Copy',
    'share|ShareIcon': 'Share',
    'download|DownloadIcon': 'Download',
    'upload|UploadIcon': 'Upload',
    'info|InfoIcon|InfoCircle': 'More information',
    'help|HelpIcon|QuestionMark|HelpCircle': 'Help',
    
    // User actions
    'user|UserIcon|PersonIcon|Avatar': 'User profile',
    'logout|LogoutIcon|SignOut': 'Sign out',
    'login|LoginIcon|SignIn': 'Sign in',
  },
};

// =============================================================================
// ANALYSIS HELPERS
// =============================================================================

function detectIconContent(buttonContent) {
  for (const [pattern, label] of Object.entries(CONFIG.iconPatterns)) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(buttonContent)) {
      return label;
    }
  }
  return null;
}

function extractTextContent(content) {
  // Remove HTML tags
  let text = content.replace(/<[^>]+>/g, ' ');
  // Remove SVG content
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, '');
  // Remove template literals
  text = text.replace(/\$\{[^}]+\}/g, '');
  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

function suggestAriaLabel(buttonContent, context = '') {
  // First try to detect icon patterns
  const iconLabel = detectIconContent(buttonContent);
  if (iconLabel) return iconLabel;
  
  // Extract visible text
  const textContent = extractTextContent(buttonContent);
  if (textContent && textContent.length > 0 && textContent.length < 50) {
    return textContent;
  }
  
  // Analyze context for clues
  const contextLower = context.toLowerCase();
  if (contextLower.includes('close')) return 'Close';
  if (contextLower.includes('submit')) return 'Submit';
  if (contextLower.includes('save')) return 'Save';
  if (contextLower.includes('cancel')) return 'Cancel';
  if (contextLower.includes('delete')) return 'Delete';
  if (contextLower.includes('edit')) return 'Edit';
  if (contextLower.includes('settings')) return 'Settings';
  if (contextLower.includes('menu')) return 'Menu';
  if (contextLower.includes('toggle')) return 'Toggle';
  
  return null;
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
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      files.push(fullPath);
    }
  }
}

// =============================================================================
// BUTTON DETECTION
// =============================================================================

function findButtonsWithoutAriaLabel(content) {
  const issues = [];
  const lines = content.split('\n');
  
  // Pattern 1: HTML button tags
  const htmlButtonRegex = /<button(?![^>]*aria-label)[^>]*>([\s\S]*?)<\/button>/gi;
  let match;
  
  while ((match = htmlButtonRegex.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
    const buttonContent = match[1];
    const surroundingContext = content.substring(
      Math.max(0, match.index - 100),
      Math.min(content.length, match.index + match[0].length + 100)
    );
    
    issues.push({
      type: 'html-button',
      line: lineNumber,
      content: match[0].substring(0, 100),
      buttonContent,
      context: surroundingContext,
      suggestedLabel: suggestAriaLabel(buttonContent, surroundingContext),
    });
  }
  
  // Pattern 2: createElement('button')
  const createButtonRegex = /createElement\s*\(\s*['"]button['"]\s*\)(?![\s\S]{0,300}\.setAttribute\s*\(\s*['"]aria-label)/g;
  
  while ((match = createButtonRegex.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
    const surroundingContext = content.substring(
      Math.max(0, match.index - 50),
      Math.min(content.length, match.index + 200)
    );
    
    issues.push({
      type: 'createElement-button',
      line: lineNumber,
      content: match[0],
      buttonContent: '',
      context: surroundingContext,
      suggestedLabel: suggestAriaLabel('', surroundingContext),
    });
  }
  
  // Pattern 3: Template literal buttons
  const templateButtonRegex = /`[^`]*<button(?![^>]*aria-label)[^>]*>[^`]*`/gi;
  
  while ((match = templateButtonRegex.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
    const buttonMatch = match[0].match(/<button[^>]*>([\s\S]*?)<\/button>/i);
    const buttonContent = buttonMatch ? buttonMatch[1] : '';
    
    issues.push({
      type: 'template-button',
      line: lineNumber,
      content: match[0].substring(0, 100),
      buttonContent,
      context: match[0],
      suggestedLabel: suggestAriaLabel(buttonContent, match[0]),
    });
  }
  
  return issues;
}

// =============================================================================
// AUTO-FIX
// =============================================================================

function applyFix(content, issue) {
  if (!issue.suggestedLabel) return { content, fixed: false };
  
  const lines = content.split('\n');
  const line = lines[issue.line - 1];
  
  if (!line) return { content, fixed: false };
  
  let newLine = line;
  let fixed = false;
  
  if (issue.type === 'html-button' || issue.type === 'template-button') {
    // Add aria-label to button tag
    newLine = line.replace(
      /<button(?![^>]*aria-label)/i,
      `<button aria-label="${issue.suggestedLabel}"`
    );
    fixed = newLine !== line;
  } else if (issue.type === 'createElement-button') {
    // Add setAttribute call after createElement
    if (line.includes('createElement')) {
      const indent = line.match(/^\s*/)?.[0] || '';
      const varMatch = line.match(/(const|let|var)\s+(\w+)/);
      if (varMatch) {
        const varName = varMatch[2];
        newLine = line + `\n${indent}${varName}.setAttribute('aria-label', '${issue.suggestedLabel}');`;
        fixed = true;
      }
    }
  }
  
  if (fixed) {
    lines[issue.line - 1] = newLine;
    return { content: lines.join('\n'), fixed: true };
  }
  
  return { content, fixed: false };
}

function fixFile(filePath, issues, dryRun = false) {
  let content = fs.readFileSync(filePath, 'utf8');
  let fixedCount = 0;
  const fixes = [];
  
  // Sort by line number descending to avoid offset issues
  const sortedIssues = [...issues].sort((a, b) => b.line - a.line);
  
  for (const issue of sortedIssues) {
    if (!issue.suggestedLabel) continue;
    
    const { content: newContent, fixed } = applyFix(content, issue);
    if (fixed) {
      content = newContent;
      fixedCount++;
      fixes.push({
        line: issue.line,
        label: issue.suggestedLabel,
        type: issue.type,
      });
    }
  }
  
  if (fixedCount > 0 && !dryRun) {
    fs.writeFileSync(filePath, content);
  }
  
  return { fixedCount, fixes };
}

// =============================================================================
// REPORTING
// =============================================================================

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function printReport(allIssues, allFixes, args) {
  const dryRun = args.includes('--dry-run');
  const shouldFix = args.includes('--fix') || dryRun;
  
  console.log('\n' + '═'.repeat(70));
  console.log(`${COLORS.bold}♿ ACCESSIBILITY FIX REPORT${COLORS.reset}`);
  console.log('═'.repeat(70) + '\n');
  
  if (allIssues.length === 0) {
    console.log(`${COLORS.green}✅ All buttons have aria-labels!${COLORS.reset}\n`);
    return;
  }
  
  const byFile = {};
  for (const issue of allIssues) {
    byFile[issue.file] = byFile[issue.file] || [];
    byFile[issue.file].push(issue);
  }
  
  const withSuggestion = allIssues.filter(i => i.suggestedLabel);
  const needsManual = allIssues.filter(i => !i.suggestedLabel);
  
  console.log(`${COLORS.bold}Summary:${COLORS.reset}`);
  console.log(`  Total buttons without aria-label: ${allIssues.length}`);
  console.log(`  ${COLORS.green}Auto-fixable (label suggested):${COLORS.reset} ${withSuggestion.length}`);
  console.log(`  ${COLORS.yellow}Needs manual review:${COLORS.reset} ${needsManual.length}`);
  
  if (shouldFix) {
    const totalFixed = Object.values(allFixes).reduce((sum, f) => sum + f.fixedCount, 0);
    const mode = dryRun ? 'Would fix' : 'Fixed';
    console.log(`\n${COLORS.green}🔧 ${mode}: ${totalFixed} buttons${COLORS.reset}`);
  }
  
  // Show files with most issues
  const sortedFiles = Object.entries(byFile)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 15);
  
  console.log(`\n${COLORS.bold}Top files needing attention:${COLORS.reset}`);
  for (const [file, issues] of sortedFiles) {
    const relativePath = path.relative(ROOT, file);
    const autoFixable = issues.filter(i => i.suggestedLabel).length;
    console.log(`  ${issues.length.toString().padStart(3)} - ${relativePath} (${autoFixable} auto-fixable)`);
  }
  
  // Sample issues
  console.log(`\n${COLORS.bold}Sample issues requiring manual review:${COLORS.reset}`);
  const manualSamples = needsManual.slice(0, 10);
  for (const issue of manualSamples) {
    const relativePath = path.relative(ROOT, issue.file);
    console.log(`\n  ${COLORS.cyan}${relativePath}${COLORS.reset}:${issue.line}`);
    console.log(`  ${COLORS.dim}${issue.content.substring(0, 80)}...${COLORS.reset}`);
    console.log(`  ${COLORS.yellow}💡 Review button content and add descriptive aria-label${COLORS.reset}`);
  }
  
  if (needsManual.length > 10) {
    console.log(`\n  ${COLORS.dim}... and ${needsManual.length - 10} more${COLORS.reset}`);
  }
  
  // Guidance
  console.log(`\n${COLORS.bold}📖 Accessibility Guidelines:${COLORS.reset}`);
  console.log(`  • Icon-only buttons MUST have aria-label describing the action`);
  console.log(`  • Labels should describe what happens, not what it looks like`);
  console.log(`  • Good: "Close dialog" Bad: "X button"`);
  console.log(`  • Good: "Play song" Bad: "Triangle icon"`);
  console.log(`  • Test with screen reader: VoiceOver (Mac), NVDA (Windows)`);
  
  if (!shouldFix && withSuggestion.length > 0) {
    console.log(`\n${COLORS.bold}🚀 To auto-fix ${withSuggestion.length} buttons:${COLORS.reset}`);
    console.log(`  node design-system/fix-accessibility.js --fix`);
    console.log(`  node design-system/fix-accessibility.js --dry-run  # Preview first`);
  }
}

// =============================================================================
// MAIN
// =============================================================================

function main() {
  const args = process.argv.slice(2);
  const shouldFix = args.includes('--fix');
  const dryRun = args.includes('--dry-run');
  
  const files = getFilesToCheck(args);
  
  if (files.length === 0) {
    console.log('No files to check.');
    process.exit(0);
  }
  
  console.log(`Analyzing ${files.length} file(s) for accessibility issues...`);
  
  const allIssues = [];
  const allFixes = {};
  
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const issues = findButtonsWithoutAriaLabel(content);
    
    for (const issue of issues) {
      issue.file = file;
    }
    
    allIssues.push(...issues);
    
    if ((shouldFix || dryRun) && issues.length > 0) {
      const { fixedCount, fixes } = fixFile(file, issues, dryRun);
      allFixes[file] = { fixedCount, fixes };
    }
  }
  
  printReport(allIssues, allFixes, args);
  
  process.exit(0);
}

main();

