/**
 * Rule definitions and text helpers for the Ferni brand compliance linter.
 * The engine (file globs, scoping, reporting) lives in lint-brand.ts.
 */

// TYPES

export interface LintError {
  file: string;
  line?: number;
  column?: number;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

export interface LintRule {
  id: string;
  name: string;
  description: string;
  severity: 'error' | 'warning';
  pattern?: RegExp;
  check?: (content: string, file: string) => LintError[];
  fileTypes?: string[];
  exclude?: string[];
}

// HELPERS

/**
 * The start of a logging call: log/logger/console method calls (optionally on a
 * receiver such as `this.` or `ctx.`), getLogger().x(...), and process stdout/stderr
 * writes. Anchored to an identifier start, so `dialog.show(` and `blog.post(` don't match.
 */
const LOG_CALL_START =
  /(?<![\w$])(?:[\w$]+\.)*(?:log|logger|console)\.\w+\s*\(|(?<![\w$])getLogger\(\)\.\w+\s*\(|(?<![\w$])process\.(?:stderr|stdout)\.write\s*\(/g;

function skipString(text: string, pos: number): number {
  const quote = text[pos];
  let i = pos + 1;
  while (i < text.length && text[i] !== quote) {
    if (text[i] === '\\') i++;
    else if (quote !== '`' && text[i] === '\n') break;
    i++;
  }
  return i + 1;
}

/**
 * Character ranges [start, end) covered by logging calls in `text`, including
 * calls that span several lines. Parens inside string literals are ignored.
 */
export function logCallRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const match of text.matchAll(LOG_CALL_START)) {
    const start = match.index ?? 0;
    let pos = start + match[0].length;
    let depth = 1;
    while (pos < text.length && depth > 0) {
      const ch = text[pos];
      if (ch === "'" || ch === '"' || ch === '`') {
        pos = skipString(text, pos);
        continue;
      }
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      pos++;
    }
    ranges.push([start, pos]);
  }
  return ranges;
}

function inRanges(ranges: Array<[number, number]>, index: number): boolean {
  return ranges.some(([start, end]) => index > start && index < end);
}

/** True when the character at `emojiIndex` sits inside a logging call on `line`. */
export function isEmojiInLoggingCall(line: string, emojiIndex: number): boolean {
  return inRanges(logCallRanges(line), emojiIndex);
}

function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

/** The same opt-outs ESLint's no-console honors, so dev tools need one marker, not two. */
function consoleAllowed(lines: string[], index: number): boolean {
  if (/eslint-disable-line\b.*\bno-console\b/.test(lines[index])) return true;
  return index > 0 && /eslint-disable-next-line\b.*\bno-console\b/.test(lines[index - 1]);
}

const CONSOLE_CALL = /(?<![\w$.])console\.(log|warn|error|debug|info)\s*\(/g;
const FILE_DISABLES_CONSOLE = /\/\*\s*eslint-disable\s+[^*]*\bno-console\b/;

const EMOJI =
  /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;

// ============================================================================
// LINT RULES
// ============================================================================

export const LINT_RULES: LintRule[] = [
  // LOGGING RULES
  {
    id: 'no-console-log',
    name: 'No Console Log',
    description: 'Use createLogger() instead of console.log',
    severity: 'error',
    check: (content, file) => {
      const errors: LintError[] = [];
      if (FILE_DISABLES_CONSOLE.test(content)) return errors;
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (isCommentLine(line) || consoleAllowed(lines, index)) return;
        for (const match of line.matchAll(CONSOLE_CALL)) {
          errors.push({
            file,
            line: index + 1,
            column: match.index,
            rule: 'no-console-log',
            message: 'Use createLogger() instead of console.log',
            severity: 'error',
          });
        }
      });
      return errors;
    },
    fileTypes: ['.ts', '.js'],
    exclude: [
      '**/logger.ts', '**/logger.js',
      'src/cli/**', 'src/scripts/**', 'scripts/**',
      '**/__tests__/**', '**/*.test.ts', '**/*.spec.ts', 'src/tests/**',
    ],
  },

  // COLOR RULES
  {
    id: 'no-hardcoded-hex-colors',
    name: 'No Hardcoded Hex Colors',
    description: 'Use CSS variables instead of hardcoded hex colors',
    severity: 'error',
    check: (content, file) => {
      const errors: LintError[] = [];
      const lines = content.split('\n');
      const hexPattern = /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})(?!\s*\))/g;
      lines.forEach((line, index) => {
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
        if (line.includes('--') && line.includes(':')) return;
        if (line.includes('var(') && line.includes(',')) return;
        let match;
        while ((match = hexPattern.exec(line)) !== null) {
          errors.push({
            file,
            line: index + 1,
            column: match.index,
            rule: 'no-hardcoded-hex-colors',
            message: `Hardcoded color ${match[0]} found`,
            severity: 'error',
            suggestion: 'Use CSS variable: var(--color-*)',
          });
        }
      });

      return errors;
    },
    fileTypes: ['.ts', '.js'],
    exclude: [
      '**/tokens.ts', '**/tokens.css', '**/design-tokens.css',
      'design-system/tokens/**', 'design-system/dist/**', '**/*.generated.*',
    ],
  },
  
  {
    id: 'no-purple-colors',
    name: 'No Purple Colors',
    description: 'Purple is not a Ferni brand color',
    severity: 'error',
    check: (content, file) => {
      const errors: LintError[] = [];
      const lines = content.split('\n');

      // Purple color patterns
      const purplePatterns = [
        /#(800080|9b59b6|8b5cf6|a855f7|7c3aed|6d28d9|5b21b6|4c1d95)/gi,
        /purple/gi,
        /violet/gi,
      ];

      lines.forEach((line, index) => {
        // Skip comments and strings that might be documentation
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;

        for (const pattern of purplePatterns) {
          let match;
          while ((match = pattern.exec(line)) !== null) {
            // Skip if it's in a "don't use" comment
            if (line.toLowerCase().includes("don't") || line.toLowerCase().includes('never')) continue;

            errors.push({
              file,
              line: index + 1,
              column: match.index,
              rule: 'no-purple-colors',
              message: `Purple color "${match[0]}" is not a Ferni brand color`,
              severity: 'error',
              suggestion: 'Use persona colors: --persona-primary or earthy tones',
            });
          }
        }
      });

      return errors;
    },
    fileTypes: ['.ts', '.js', '.css'],
    exclude: [
      'design-system/tokens/**', 'design-system/dist/**', '**/*.generated.*',
    ],
  },

  // ANIMATION RULES
  {
    id: 'no-hardcoded-durations',
    name: 'No Hardcoded Animation Durations',
    description: 'Use DURATION constants instead of hardcoded values',
    severity: 'warning',
    check: (content, file) => {
      const errors: LintError[] = [];
      const lines = content.split('\n');
      
      // Pattern for duration: <number>
      const durationPattern = /duration:\s*(\d+)(?!\s*\*\s*DURATION)/g;
      
      lines.forEach((line, index) => {
        // Skip if line imports or uses DURATION
        if (line.includes('DURATION') || line.includes('import')) return;
        
        let match;
        while ((match = durationPattern.exec(line)) !== null) {
          errors.push({
            file,
            line: index + 1,
            column: match.index,
            rule: 'no-hardcoded-durations',
            message: `Hardcoded duration ${match[1]}ms found`,
            severity: 'warning',
            suggestion: 'Use DURATION constant from animation-constants.ts',
          });
        }
      });
      
      return errors;
    },
    fileTypes: ['.ts', '.js'],
    exclude: ['**/animation-constants.ts', '**/choreography/**'],
  },
  
  {
    id: 'no-hardcoded-easings',
    name: 'No Hardcoded Easings',
    description: 'Use EASING constants instead of cubic-bezier strings',
    severity: 'warning',
    pattern: /easing:\s*['"`]cubic-bezier\([^)]+\)['"`]/g,
    fileTypes: ['.ts', '.js'],
    exclude: ['**/animation-constants.ts', '**/choreography/**'],
  },

  // EMOJI RULES
  {
    id: 'no-emoji-in-ui',
    name: 'No Emoji in UI Code',
    description: 'Use Lucide icons instead of emoji',
    severity: 'warning',
    check: (content, file) => {
      const errors: LintError[] = [];
      // Ranges over the whole file, so emoji on a continuation line of a
      // multi-line log call are recognized as log output too.
      const logRanges = logCallRanges(content);
      let offset = 0;
      content.split('\n').forEach((line, index) => {
        const lineStart = offset;
        offset += line.length + 1;
        if (isCommentLine(line)) return;
        for (const match of line.matchAll(EMOJI)) {
          if (inRanges(logRanges, lineStart + (match.index ?? 0))) continue;
          errors.push({
            file,
            line: index + 1,
            column: match.index,
            rule: 'no-emoji-in-ui',
            message: `Emoji "${match[0]}" found in UI code`,
            severity: 'warning',
            suggestion: 'Use Lucide SVG icons instead',
          });
        }
      });
      return errors;
    },
    fileTypes: ['.ts', '.js'],
    exclude: ['**/*.md', '**/*.txt', '**/test/**'],
  },

  // HMR PROTECTION
  {
    id: 'hmr-cleanup-required',
    name: 'HMR Cleanup Required',
    description: 'UI classes must clean up orphaned elements',
    severity: 'warning',
    check: (content, file) => {
      const errors: LintError[] = [];
      
      // Only check UI files
      if (!file.includes('/ui/') && !file.includes('\\ui\\')) return errors;
      
      // Check if file creates DOM elements but lacks cleanup
      const createsElements = content.includes('document.createElement') || 
                             content.includes('innerHTML');
      const hasCleanup = content.includes('cleanupOrphaned') || 
                        content.includes('querySelectorAll') && content.includes('.remove()');
      
      if (createsElements && !hasCleanup) {
        errors.push({
          file,
          line: 1,
          rule: 'hmr-cleanup-required',
          message: 'UI class creates elements but may lack HMR cleanup',
          severity: 'warning',
          suggestion: 'Add cleanupOrphanedElements() method to constructor',
        });
      }
      
      return errors;
    },
    fileTypes: ['.ts'],
  },

  // ACCESSIBILITY
  {
    id: 'button-needs-aria-label',
    name: 'Button Needs Aria Label',
    description: 'Buttons require aria-label for accessibility',
    severity: 'warning',
    check: (content, file) => {
      const errors: LintError[] = [];
      const lines = content.split('\n');
      
      // Pattern for button without aria-label
      const buttonPattern = /<button(?![^>]*aria-label)/gi;
      
      lines.forEach((line, index) => {
        let match;
        while ((match = buttonPattern.exec(line)) !== null) {
          errors.push({
            file,
            line: index + 1,
            column: match.index,
            rule: 'button-needs-aria-label',
            message: 'Button element missing aria-label',
            severity: 'warning',
            suggestion: 'Add aria-label="descriptive text"',
          });
        }
      });
      
      return errors;
    },
    fileTypes: ['.ts', '.js', '.html'],
  },
];
