#!/usr/bin/env node
/**
 * AI-Powered Design System Fixer
 * 
 * Uses Gemini to intelligently fix design system violations.
 * Ferni understands context and makes smart decisions about:
 * - Which CSS variable to use based on semantic meaning
 * - How to refactor durations with proper imports
 * - Context-appropriate brand language replacements
 * - WCAG-compliant color alternatives
 * 
 * Usage:
 *   node ai-fix.js                           # Interactive mode
 *   node ai-fix.js path/to/file.ts           # Fix specific file
 *   node ai-fix.js --preview                 # Show fixes without applying
 *   node ai-fix.js --batch                   # Fix all priority files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
  model: 'gemini-2.0-flash',
  maxTokens: 8192,
  
  // Design system context for the AI
  systemPrompt: `You are Ferni, an AI design system expert for Ferni AI.
Your job is to fix design system violations while maintaining the warm, human brand.

## Design System Rules

### Colors (NEVER hardcode)
- Use CSS variables: var(--color-text-primary), var(--color-background-elevated), etc.
- Status colors: var(--color-success), var(--color-error), var(--color-warning)
- Persona colors are for ACCENTS only, never for text (WCAG violation)
- Always include fallback: var(--color-text-primary, #2C2520)

### Durations (Use DURATION constants)
Available constants from '../config/animation-constants.js':
- DURATION.MICRO = 50ms (immediate feedback)
- DURATION.FAST = 100ms (hover, focus)
- DURATION.NORMAL = 200ms (standard transitions)
- DURATION.SLOW = 300ms (deliberate moves)
- DURATION.MODERATE = 400ms (panel slides)
- DURATION.DELIBERATE = 500ms (emphasis)
- DURATION.DRAMATIC = 600ms (celebrations)
- DURATION.CELEBRATION = 800ms (major events)
- DURATION.GLACIAL = 1500ms (ambient effects)

### Brand Language (Warm, human, never corporate)
Forbidden words and replacements:
- "chatbot" → "Ferni" or "your team"
- "AI assistant" → "someone who understands"
- "bot" → never reference what we are
- "user/users" → "you" or "people"
- "utilize" → "use"
- "leverage" → "use"
- "platform" → "Ferni"
- "functionality" → describe what it does

### Logging (Use createLogger)
- Never use console.log/warn/error in UI files
- Import: import { createLogger } from '../utils/logger.js'
- Usage: const log = createLogger('ComponentName')

## Your Task
Given a code snippet with violations, return ONLY the fixed code.
Do not explain. Do not add comments. Just fix the code.
Preserve all other code exactly as-is.
If you need to add imports, add them at the appropriate location.`,
};

// Priority files (core user-facing UI)
const PRIORITY_FILES = [
  'apps/web/src/ui/coach.ui.ts',
  'apps/web/src/ui/waveform.ui.ts',
  'apps/web/src/ui/avatar-feedback.ui.ts',
  'apps/web/src/ui/avatar-soul.ui.ts',
  'apps/web/src/ui/message.ui.ts',
  'apps/web/src/ui/toast.ui.ts',
  'apps/web/src/ui/celebration.ui.ts',
  'apps/web/src/ui/team.ui.ts',
  'apps/web/src/ui/greeting.ui.ts',
  'apps/web/src/ui/subscription.ui.ts',
  'apps/web/src/ui/connection-heart.ui.ts',
];

// =============================================================================
// COLORS
// =============================================================================

const colors = {
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

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

// =============================================================================
// GEMINI API
// =============================================================================

async function callGemini(prompt, context) {
  const apiKey = process.env.GOOGLE_API_KEY;
  
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not set. Run: export GOOGLE_API_KEY="your-key"');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${CONFIG.systemPrompt}\n\n---\n\n${context}\n\n---\n\nFix this code:\n\n${prompt}` }],
          },
        ],
        generationConfig: {
          maxOutputTokens: CONFIG.maxTokens,
          temperature: 0.1, // Low temperature for consistent fixes
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// =============================================================================
// VIOLATION DETECTION
// =============================================================================

function detectViolations(content, filePath) {
  const violations = [];
  const lines = content.split('\n');

  // Hardcoded colors
  const colorRegex = /(?:color|background|border|fill|stroke):\s*['"]?#[0-9a-fA-F]{3,8}['"]?/g;
  let match;
  while ((match = colorRegex.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
    violations.push({
      type: 'hardcodedColor',
      line: lineNumber,
      match: match[0],
      context: getContext(lines, lineNumber),
    });
  }

  // Hardcoded durations
  const durationRegex = /duration:\s*(\d+)(?!\s*\*)/g;
  while ((match = durationRegex.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
    violations.push({
      type: 'hardcodedDuration',
      line: lineNumber,
      match: match[0],
      context: getContext(lines, lineNumber),
    });
  }

  // Console logs
  const consoleRegex = /console\.(log|warn|error|debug)\(/g;
  while ((match = consoleRegex.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length;
    violations.push({
      type: 'consoleLog',
      line: lineNumber,
      match: match[0],
      context: getContext(lines, lineNumber),
    });
  }

  return violations;
}

function getContext(lines, lineNumber, contextSize = 5) {
  const start = Math.max(0, lineNumber - contextSize - 1);
  const end = Math.min(lines.length, lineNumber + contextSize);
  return lines.slice(start, end).map((l, i) => {
    const num = start + i + 1;
    const marker = num === lineNumber ? '>>> ' : '    ';
    return `${marker}${num.toString().padStart(4)}: ${l}`;
  }).join('\n');
}

// =============================================================================
// FILE PROCESSING
// =============================================================================

async function processFile(filePath, options = {}) {
  const { preview = false, verbose = false } = options;
  
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  
  if (!fs.existsSync(fullPath)) {
    log(`File not found: ${filePath}`, colors.red);
    return null;
  }

  const relativePath = path.relative(ROOT, fullPath);
  log(`\n${colors.cyan}Processing: ${relativePath}${colors.reset}`);

  const content = fs.readFileSync(fullPath, 'utf8');
  const violations = detectViolations(content, fullPath);

  if (violations.length === 0) {
    log(`  ${colors.green}✓ No violations found${colors.reset}`);
    return { fixed: 0, remaining: 0 };
  }

  log(`  Found ${violations.length} violation(s)`, colors.yellow);

  // Group violations by type
  const byType = {};
  for (const v of violations) {
    byType[v.type] = (byType[v.type] || []).concat(v);
  }

  // Build context for AI
  const contextParts = [
    `File: ${relativePath}`,
    `\nViolations found:`,
    ...Object.entries(byType).map(([type, vs]) => `- ${type}: ${vs.length}`),
    `\nFull file content follows. Fix ALL violations while preserving functionality.`,
    `Current imports at top of file should be preserved or augmented as needed.`,
  ];

  if (verbose) {
    log(`\n  Sending to Ferni AI...`, colors.dim);
  }

  try {
    const fixedContent = await callGemini(content, contextParts.join('\n'));
    
    // Clean up AI response (remove markdown code blocks if present)
    let cleanedContent = fixedContent
      .replace(/^```(?:typescript|ts|javascript|js)?\n?/gm, '')
      .replace(/```$/gm, '')
      .trim();

    // Validate the fix
    const remainingViolations = detectViolations(cleanedContent, fullPath);
    const fixed = violations.length - remainingViolations.length;

    if (preview) {
      log(`\n  ${colors.bold}Preview of changes:${colors.reset}`);
      showDiff(content, cleanedContent);
      log(`\n  Would fix ${fixed} of ${violations.length} violations`, colors.cyan);
    } else {
      fs.writeFileSync(fullPath, cleanedContent);
      log(`  ${colors.green}✓ Fixed ${fixed} violations${colors.reset}`);
      if (remainingViolations.length > 0) {
        log(`  ${colors.yellow}⚠ ${remainingViolations.length} violations remain (may need manual review)${colors.reset}`);
      }
    }

    return { fixed, remaining: remainingViolations.length };

  } catch (error) {
    log(`  ${colors.red}✗ AI fix failed: ${error.message}${colors.reset}`);
    return null;
  }
}

function showDiff(original, fixed) {
  const originalLines = original.split('\n');
  const fixedLines = fixed.split('\n');
  
  let diffCount = 0;
  const maxDiffs = 20;

  for (let i = 0; i < Math.max(originalLines.length, fixedLines.length); i++) {
    if (originalLines[i] !== fixedLines[i]) {
      if (diffCount < maxDiffs) {
        console.log(`${colors.dim}Line ${i + 1}:${colors.reset}`);
        if (originalLines[i]) {
          console.log(`${colors.red}- ${originalLines[i]}${colors.reset}`);
        }
        if (fixedLines[i]) {
          console.log(`${colors.green}+ ${fixedLines[i]}${colors.reset}`);
        }
        console.log();
      }
      diffCount++;
    }
  }

  if (diffCount > maxDiffs) {
    console.log(`${colors.dim}... and ${diffCount - maxDiffs} more changes${colors.reset}`);
  }
}

// =============================================================================
// INTERACTIVE MODE
// =============================================================================

async function interactiveMode() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

  console.log(`
${colors.bold}${colors.cyan}╔══════════════════════════════════════════════════════════════╗
║  🤖 FERNI AI-POWERED DESIGN SYSTEM FIXER                     ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}

I'll use my AI brain to intelligently fix design system violations.
I understand context, so I'll pick the right CSS variables and constants.

${colors.bold}Options:${colors.reset}
  ${colors.cyan}1${colors.reset} - Fix priority files (core UI)
  ${colors.cyan}2${colors.reset} - Fix a specific file
  ${colors.cyan}3${colors.reset} - Preview fixes without applying
  ${colors.cyan}q${colors.reset} - Quit
`);

  while (true) {
    const choice = await question(`\n${colors.cyan}What would you like to do? ${colors.reset}`);

    if (choice === 'q' || choice === 'quit') {
      console.log(`\n${colors.green}See you later! 👋${colors.reset}\n`);
      break;
    }

    if (choice === '1') {
      console.log(`\n${colors.bold}Fixing priority files...${colors.reset}`);
      let totalFixed = 0;
      let totalRemaining = 0;

      for (const file of PRIORITY_FILES) {
        const result = await processFile(file);
        if (result) {
          totalFixed += result.fixed;
          totalRemaining += result.remaining;
        }
      }

      console.log(`\n${colors.bold}Summary:${colors.reset}`);
      console.log(`  Fixed: ${colors.green}${totalFixed}${colors.reset}`);
      console.log(`  Remaining: ${colors.yellow}${totalRemaining}${colors.reset}`);
    }

    if (choice === '2') {
      const filePath = await question(`Enter file path: `);
      await processFile(filePath.trim());
    }

    if (choice === '3') {
      const filePath = await question(`Enter file path to preview: `);
      await processFile(filePath.trim(), { preview: true, verbose: true });
    }
  }

  rl.close();
}

// =============================================================================
// BATCH MODE
// =============================================================================

async function batchMode(options = {}) {
  console.log(`
${colors.bold}${colors.cyan}╔══════════════════════════════════════════════════════════════╗
║  🤖 FERNI AI-POWERED DESIGN SYSTEM FIXER (BATCH MODE)        ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);

  let totalFixed = 0;
  let totalRemaining = 0;
  let filesProcessed = 0;

  for (const file of PRIORITY_FILES) {
    const result = await processFile(file, options);
    if (result) {
      totalFixed += result.fixed;
      totalRemaining += result.remaining;
      filesProcessed++;
    }
    
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`
${colors.bold}════════════════════════════════════════════════════════════════${colors.reset}
${colors.bold}BATCH COMPLETE${colors.reset}

  Files processed: ${filesProcessed}
  Violations fixed: ${colors.green}${totalFixed}${colors.reset}
  Remaining: ${colors.yellow}${totalRemaining}${colors.reset}

${options.preview ? 'Run without --preview to apply fixes.' : 'Run "ferni design check" to verify.'}
${colors.bold}════════════════════════════════════════════════════════════════${colors.reset}
`);
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  // Check for API key
  if (!process.env.GOOGLE_API_KEY) {
    log(`
${colors.red}Error: GOOGLE_API_KEY not set${colors.reset}

To use AI-powered fixing, set your Google API key:
  ${colors.cyan}export GOOGLE_API_KEY="your-api-key"${colors.reset}

Get a key at: https://makersuite.google.com/app/apikey
`, colors.red);
    process.exit(1);
  }

  const preview = args.includes('--preview');
  const batch = args.includes('--batch');
  const verbose = args.includes('--verbose') || args.includes('-v');
  
  // Specific file
  const filePath = args.find(a => !a.startsWith('--') && a.includes('.ts'));
  
  if (filePath) {
    await processFile(filePath, { preview, verbose });
  } else if (batch) {
    await batchMode({ preview, verbose });
  } else {
    await interactiveMode();
  }
}

main().catch(console.error);

