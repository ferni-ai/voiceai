/**
 * Emoji are not icons. The brand set lives in src/ui/icons (Lucide-style SVG,
 * currentColor); an emoji renders as someone else's art, in someone else's
 * colors, and differently on every OS.
 *
 * Two guards:
 *  1. Rendered UI strings under src/ui carry no emoji (comments and log
 *     messages are not rendered and are skipped).
 *  2. `icon:` fields in server data the web client renders carry icon names,
 *     never glyphs.
 *
 * ALLOWANCES is a ratchet: each entry is the exact count left in a file, with
 * the reason it is still there. A file may not grow, and when a count drops
 * the entry must drop with it, so the list only ever shrinks.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const UI = join(__dirname, '../src/ui');
const REPO = join(__dirname, '../../..');
const EMOJI = /\p{Extended_Pictographic}/gu;

const DEV_ONLY = 'developer-only panel, never shown to users';

/** path relative to src/ui -> exact emoji count still allowed, and why. */
const ALLOWANCES: Record<string, { count: number; reason: string }> = {
  'icons/idea-icons.ts': {
    count: 23,
    reason: 'legacy Firestore glyph -> icon name lookup keys; matched, never rendered',
  },
  'dev-panel.ui.ts': { count: 23, reason: DEV_ONLY },
  'insights-debug-panel.ui.ts': { count: 4, reason: DEV_ONLY },
  'routing-stats.ui.ts': { count: 9, reason: DEV_ONLY },
  'admin.ui.ts': { count: 2, reason: 'admin agent dashboard, staff-only' },
  'visualizations/builders/micro-trend.ts': {
    count: 6,
    reason: 'typographic trend arrows (text, not icons)',
  },
  'visualizations/builders/predictions.ts': {
    count: 2,
    reason: 'typographic trend arrows (text, not icons)',
  },
};

/** Server data the web client renders; their `icon:` fields must be names. */
const SERVER_UI_DATA = [
  'src/services/workflows/templates/template-library.ts',
  'src/services/workflows/workflow-engine.ts',
  'src/tools/domains/routines/index.ts',
  'src/services/games/game-insights.ts',
];

function uiSources(dir: string = UI): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : uiSources(path);
    return /\.ts$/.test(name) && !/\.(test|spec)\.ts$/.test(name) ? [path] : [];
  });
}

const LOG_CALL = /\b(?:log|logger|console)\.(?:trace|debug|info|warn|error|log)\(/;

/** Lines that can reach the screen: not comments, not log messages. */
function renderedEmojiLines(text: string): Array<{ line: number; count: number; source: string }> {
  const hits: Array<{ line: number; count: number; source: string }> = [];
  let inBlockComment = false;
  let logDepth = 0;
  text.split('\n').forEach((raw, i) => {
    let source = raw;
    if (inBlockComment) {
      const end = source.indexOf('*/');
      if (end === -1) return;
      inBlockComment = false;
      source = source.slice(end + 2);
    }
    const trimmed = source.trim();
    if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      inBlockComment = true;
      return;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    source = source.replace(/\s\/\/\s.*$/, '');

    const logAt = source.search(LOG_CALL);
    if (logDepth > 0 || logAt !== -1) {
      const from = logDepth > 0 ? 0 : logAt;
      for (const ch of source.slice(from)) {
        if (ch === '(') logDepth++;
        else if (ch === ')') logDepth--;
      }
      if (logDepth < 0) logDepth = 0;
      source = source.slice(0, from);
    }

    const count = source.match(EMOJI)?.length ?? 0;
    if (count > 0) hits.push({ line: i + 1, count, source: raw.trim() });
  });
  return hits;
}

describe('no emoji used as icons in the web UI', () => {
  const counts = new Map<string, { total: number; where: string[] }>();
  for (const path of uiSources()) {
    const hits = renderedEmojiLines(readFileSync(path, 'utf8'));
    if (hits.length === 0) continue;
    counts.set(relative(UI, path), {
      total: hits.reduce((n, h) => n + h.count, 0),
      where: hits.map((h) => `  ${h.line}: ${h.source.slice(0, 120)}`),
    });
  }

  it('finds emoji only where an allowance says why', () => {
    const unexpected = [...counts]
      .filter(([file]) => !ALLOWANCES[file])
      .map(([file, c]) => `${file} (${c.total})\n${c.where.join('\n')}`);
    expect(
      unexpected,
      `emoji used as UI text/icons; use src/ui/icons instead:\n${unexpected.join('\n')}`
    ).toEqual([]);
  });

  it('never lets an allowed file grow, and drops the allowance when it shrinks', () => {
    const drift = Object.entries(ALLOWANCES)
      .map(([file, allowed]) => ({
        file,
        allowed: allowed.count,
        actual: counts.get(file)?.total ?? 0,
      }))
      .filter((d) => d.actual !== d.allowed)
      .map((d) => `${d.file}: allowed ${d.allowed}, found ${d.actual}`);
    expect(
      drift,
      `update ALLOWANCES (lower it when you remove emoji; never raise it):\n${drift.join('\n')}`
    ).toEqual([]);
  });

  it('gives every allowance a reason', () => {
    for (const [file, allowed] of Object.entries(ALLOWANCES)) {
      expect(allowed.reason.trim().length, file).toBeGreaterThan(10);
    }
  });
});

describe('server data the UI renders carries icon names, not glyphs', () => {
  it.each(SERVER_UI_DATA)('%s', (file) => {
    const text = readFileSync(join(REPO, file), 'utf8');
    const glyphIcons = text
      .split('\n')
      .map((line, i) => ({ line: i + 1, source: line.trim() }))
      .filter((l) => /\bicon\??\s*:\s*['"`][^'"`]*\p{Extended_Pictographic}/u.test(l.source));
    expect(glyphIcons, `${file} sends emoji icons to the UI`).toEqual([]);
  });
});

describe('the scanner itself', () => {
  it('flags an emoji in rendered markup', () => {
    expect(renderedEmojiLines("el.innerHTML = '<span>🎯</span>';")).toHaveLength(1);
  });

  it('skips comments and log messages, including multi-line log calls', () => {
    const text = [
      '// 🎯 a comment',
      '/* 🎯',
      '   still a comment 🎯 */',
      ' * 🎯 jsdoc',
      "log.info('🎮 opened');",
      'log.warn(',
      '  { id },',
      "  '🎮 multi-line'",
      ');',
      'const x = 1; // 🎯 trailing',
    ].join('\n');
    expect(renderedEmojiLines(text)).toEqual([]);
  });

  it('counts each glyph, not each line', () => {
    expect(renderedEmojiLines("const a = '🌅 ☀️ 🌙';")[0].count).toBe(3);
  });
});
