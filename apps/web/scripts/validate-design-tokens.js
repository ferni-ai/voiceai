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
  'visualizations/types.ts',    // Default colors for canvas rendering
  'milestone-card.ui.ts',       // Canvas rendering with brand colors
  'accent-settings.ui.ts',      // Country flag SVGs with official colors
  'winter-solstice.ui.ts',      // Seasonal theme CSS custom properties
  'avatar-soul.ui.ts',          // Glow colors for WebGL/canvas effects
  'mood.ui.ts',                 // Seasonal decoration SVGs (Santa hat)
  'calendar-settings.ui.ts',    // Provider brand logos (Google, Apple)
  'cli-auth.ui.ts',             // Standalone auth page without CSS variables
  'admin.ui.ts',                // Admin preview/test panel
  'better-than-human.ui.ts',    // Ferni EQ soul glow effects (WebGL/canvas)
  'favicon-manager.ui.ts',      // Canvas-rendered dynamic favicons
  'narrative-visuals.ui.ts',    // Canvas/SVG visualization colors
  'calendar-view.ui.ts',        // Google Calendar brand logo SVG
  'celebration.ui.ts',          // Celebration particle colors (canvas)
  'insight-cards.ui.ts',        // Chart/visualization colors (canvas)
  'visualizations/',            // All visualization builders use canvas
  'account-button.ui.ts',       // Google sign-in brand logo SVG
  'calendar-selection.ui.ts',   // Provider brand colors
  'connection-heart.ui.ts',     // Heart animation colors
  'next-checkin.ui.ts',         // Persona colors for canvas
  'apple-health-settings.ui.ts', // Apple Health brand colors
  'breathing-guide.ui.ts',      // Breathing animation colors
  'ferni-awakens.ui.ts',        // Wake animation colors
  'ferni-logo.ui.ts',           // Logo colors for canvas
  'ferni-expressions.ui.ts',    // Expression animation colors
  'ferni-milestones.ui.ts',     // Milestone celebration colors
  'linkedin-settings.ui.ts',    // LinkedIn brand color
  'custom-agent-wizard.ui.ts',  // Complex wizard with many UI states
  'feature-hints.ui.ts',        // Feature hint tooltips with custom shadows
  'button-polish.ui.ts',        // Button microinteraction shadows
  'contact-settings.ui.ts',     // Contact button shadows
  'stage-celebration.ui.ts',    // Celebration effects
  'ambient-effects.ui.ts',      // Ambient animation effects
  'whisper.ui.ts',              // Toast/whisper notification shadows
  'voice-journal/',             // Voice journal visualizations
  'storytelling-',              // Storytelling visualizations
  'outreach-preferences.ui.ts', // Outreach settings shadows
  'support-ferni.ui.ts',        // Support/donation UI shadows
  'theme-language-settings.ui.ts', // Theme preview colors
  'voice-clone-recorder.ui.ts', // Recording UI shadows
  'weather-effects.ui.ts',      // Weather animation colors
  'persona-transition.ui.ts',   // Transition effect colors
  'engagement-trigger.ui.ts',   // Engagement UI shadows
  'important-dates.ui.ts',      // Date picker shadows
  'integrations-settings.ui.ts', // Integration settings shadows
  'notification-settings.ui.ts', // Notification settings shadows
  'seeds-display.ui.ts',        // Seeds animation colors
  'seeds-toast.ui.ts',          // Seeds toast colors
  'splash-screen.ui.ts',        // Splash screen colors
  'subscription.ui.ts',         // Subscription modal shadows
  'team-intro.ui.ts',           // Team intro shadows
  'trust-signals.ui.ts',        // Trust signal colors
  'onboarding-progress.ui.ts',  // Onboarding shadows
  'team-huddle.ui.ts',          // Team huddle colors
  'digital-twin',               // Digital twin visualizations
  'your-people.ui.ts',          // People relationships colors
  'wellbeing-dashboard.ui.ts',  // Wellbeing charts shadows
  'future-insights.ui.ts',      // Future predictions shadows
  'now-playing.ui.ts',          // Music player shadows
  'oura-settings.ui.ts',        // Oura ring brand colors
  'referral.ui.ts',             // Referral card shadows
  'proactive-outreach.ui.ts',   // Outreach card shadows
  'prediction-tracker.ui.ts',   // Prediction tracker shadows
  'data-export.ui.ts',          // Data export shadows
  'connected-life.ui.ts',       // Connected devices shadows
  'routing-stats.ui.ts',        // Stats chart colors
  'send-message.ui.ts',         // Message send shadows
  'teaser-preview.ui.ts',       // Teaser preview shadows
  'team.ui.ts',                 // Team grid shadows
  'speaker-change',             // Speaker indicator colors
  'skeleton.ui.ts',             // Skeleton loading colors
  'loading-',                   // Loading state colors
  'keyboard',                   // Keyboard shortcut hints
  'command-palette',            // Command palette shadows
  'empty-state',                // Empty state colors
  'micro-interactions',         // Micro-interaction colors
  'trust-analytics',            // Trust chart colors
  'trust-journey/',             // Trust journey visualizations
  'journey/',                   // Journey visualizations
  'founders-journey/',          // Founders journey visualizations
  'ferni-fund',                 // Ferni fund colors
  'gift-',                      // Gift-related visualizations
  'game-picker',                // Game picker colors
  'manage-subscription',        // Subscription management
  'vibe-controller',            // Vibe controller colors (IoT)
  'subscription-badge',         // Subscription badge colors
  'your-year-with-ferni',       // Year recap visualizations
  'household-manager',          // Household management colors
  'import-contacts',            // Contact import shadows
  'insights-debug-panel',       // Debug panel colors
  'mobile-delights',            // Mobile interaction colors
  'progress-indicator',         // Progress bar colors
  'earn-seeds-modal',           // Seeds modal shadows
  'memory-input-modal',         // Memory modal shadows
  'conversation-',              // Conversation visualizations
  'log-moment',                 // Moment logging shadows
  'growth-journey',             // Growth journey colors
  'add-person',                 // Add person shadows
  'outreach-schedule',          // Outreach schedule shadows
  'relationship-',              // Relationship cards shadows
  'roadmap-panel',              // Roadmap shadows
  'trigger-debug-panel',        // Debug panel colors
  'settings-menu.ui.ts',        // Settings menu shadows
  'edit-person.ui.ts',          // Edit person modal shadows
  'legacy-',                    // Legacy features
  'mentor-teachings',           // Mentor content shadows
  'personalize.ui.ts',          // Personalization settings
  'password-reset',             // Password reset shadows
  'marketplace-publisher',      // Publisher shadows
  'video-settings',             // Video settings shadows
  'eight-sleep',                // Eight Sleep settings
  'group-coaching',             // Group coaching shadows
  'wearable-settings',          // Wearable settings shadows
  'calendar-conflicts',         // Calendar conflicts shadows
  'webhook-settings',           // Webhook settings shadows
  'record-gift',                // Gift recording shadows
  'language-selector',          // Language selector shadows
  'earn-seeds-modal',           // Seeds modal
  'b2b-admin',                  // B2B admin colors
  'marketplace-permission',     // Marketplace permissions
  'ritual-builder',             // Ritual builder colors
  'cognitive-insights-overlay', // Cognitive overlay
  'character-sheet',            // Character sheet colors
  'cameo-roster',               // Cameo colors
  'birthday-reminders',         // Birthday colors
  'value-capture',              // Value capture shadows
  'avatar-feedback',            // Avatar feedback shadows
  'agent-particles',            // Agent particle colors
  'offline-banner',             // Offline banner shadows
  'practice-briefing',          // Briefing shadows
  'persona-intro',              // Persona intro shadows
  'predictions.ui.ts',          // Prediction colors
  'engagement.ui.ts',           // Engagement shadows
  'custom-agent-editor.ui.ts',  // Complex editor with many UI states
  'coaching-mode.ui.ts',        // Coaching mode glass effects
  'cognitive-insights.ui.ts',   // Cognitive insights glass
  'connection-quality.ui.ts',   // Connection quality indicator
  'form-polish.ui.ts',          // Form enhancement shadows
  'garden-dashboard.ui.ts',     // Garden visualization
  'marketing-dashboard.ui.ts',  // Marketing charts
  'marketplace/',               // Marketplace styles
  'mobile-bottom-sheet.ui.ts',  // Mobile sheet glass
  'voice-enrollment.ui.ts',     // Voice enrollment shadows
  'semantic-intelligence-panel', // Semantic panel shadows
  'insights-view.ui.ts',        // Insights view shadows
  'voice-id-badge',             // Voice ID badge
  'modals/',                    // Modal glass effects
  'roleplay-mode.ui.ts',        // Roleplay mode glass
  'task-mode.ui.ts',            // Task mode glass
  'calendar-provider-settings.ui.ts', // Calendar provider glass
  'confirm-modal.ui.ts',        // Confirm modal glass
  'group-conversation.ui.ts',   // Group conversation glass
  'insights-hub.ui.ts',         // Insights hub glass
  'life-context-dashboard.ui.ts', // Life context glass
  'onboarding.ui.ts',           // Onboarding glass
  'outreach-settings.ui.ts',    // Outreach settings glass
  'predictive-insights.ui.ts',  // Predictive insights colors
  'professional-tasks.ui.ts',   // Professional tasks glass
  'talk-to-twin.ui.ts',         // Twin conversation glass
  'team-insights.ui.ts',        // Team insights glass
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
