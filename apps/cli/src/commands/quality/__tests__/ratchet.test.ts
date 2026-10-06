import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lineCount, lowered, measureBundle, regressions, type Measurement } from '../ratchet.js';
import { findTerm, getAllRelevantFiles, visibleCopy } from '../check-brand-compliance.js';

const base: Measurement = {
  oversized: { 'src/big.ts': 900, 'src/huge.ts': 2000 },
  brandCritical: 0,
  brandWarnings: 6,
  lint: { 'no-console-log': 10, 'no-hardcoded-hex-colors': 20 },
};

describe('quality ratchet', () => {
  it('passes a change that makes nothing worse, even with old debt', () => {
    expect(regressions(base, base)).toEqual([]);
    expect(
      regressions(base, { ...base, oversized: { 'src/big.ts': 850 }, lint: { 'no-console-log': 9 } })
    ).toEqual([]);
  });

  it('fails when an oversized file grows or a new one appears', () => {
    const worse = regressions(base, {
      ...base,
      oversized: { ...base.oversized, 'src/big.ts': 901, 'src/new.ts': 501 },
    });
    expect(worse).toHaveLength(2);
    expect(worse.join()).toMatch(/big\.ts: grew 900 → 901/);
    expect(worse.join()).toMatch(/new\.ts: 501 lines/);
  });

  it('fails on any critical brand copy and on more warnings or lint errors', () => {
    const worse = regressions(base, {
      ...base,
      brandCritical: 1,
      brandWarnings: 7,
      lint: { ...base.lint, 'no-console-log': 11, 'no-purple-colors': 1 },
    });
    expect(worse).toHaveLength(4);
  });

  it('only ever lowers the baseline', () => {
    const next = lowered(base, {
      oversized: { 'src/big.ts': 700, 'src/new.ts': 600 }, // huge.ts was split
      brandCritical: 0,
      brandWarnings: 9,
      lint: { 'no-console-log': 4, 'no-hardcoded-hex-colors': 25 },
    });
    expect(next.oversized).toEqual({ 'src/big.ts': 700 }); // new.ts is not adopted
    expect(next.brandWarnings).toBe(6);
    expect(next.lint).toEqual({ 'no-console-log': 4, 'no-hardcoded-hex-colors': 20 });
  });

  it('counts lines the way an editor does', () => {
    expect(lineCount('')).toBe(0);
    expect(lineCount('a\nb\n')).toBe(2);
    expect(lineCount('a\nb')).toBe(2);
  });
});

describe('bundle measurement', () => {
  let dist = '';
  afterEach(() => {
    rmSync(dist, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  /** A dist/ whose assets are `kb` KB each, with an optional Vite manifest. */
  function build(kb: Record<string, number>, manifest?: object): string {
    dist = mkdtempSync(join(tmpdir(), 'ratchet-dist-'));
    mkdirSync(join(dist, 'assets'));
    for (const [file, size] of Object.entries(kb)) writeFileSync(join(dist, 'assets', file), 'x'.repeat(size * 1024));
    if (manifest) {
      mkdirSync(join(dist, '.vite'));
      writeFileSync(join(dist, '.vite', 'manifest.json'), JSON.stringify(manifest));
    }
    return join(dist, 'assets');
  }

  const assets = {
    'index-a1.js': 10, // the entry
    'index-a1.css': 2, // the entry's CSS
    'vendor-b2.js': 40, // eager vendor chunk
    'index-c3.js': 100, // lazy settings/index.ts: named index-*, but not initial
    'firestore-d4.js': 7, // eager, but named like nothing the old regex knew
    'firestore-d4.css': 1,
  };
  const manifest = {
    'index.html': {
      file: 'assets/index-a1.js',
      isEntry: true,
      css: ['assets/index-a1.css'],
      imports: ['_vendor-b2.js', 'src/db/firestore.ts'],
      dynamicImports: ['src/settings/index.ts'],
    },
    '_vendor-b2.js': { file: 'assets/vendor-b2.js' },
    'src/db/firestore.ts': {
      file: 'assets/firestore-d4.js',
      css: ['assets/firestore-d4.css'],
      imports: ['_vendor-b2.js'], // shared: counted once
    },
    'src/settings/index.ts': { file: 'assets/index-c3.js', imports: ['_vendor-b2.js'] },
  };

  it('counts what the entry imports statically, whatever the chunks are called', () => {
    expect(measureBundle(build(assets, manifest))).toEqual({
      totalKB: 160,
      initialKB: 10 + 2 + 40 + 7 + 1, // not the lazy index-c3.js; yes firestore-d4.*
      maxChunkKB: 100,
    });
  });

  it('counts translation chunks once, at the largest, since a visitor loads one locale', () => {
    const withLocales = {
      ...manifest,
      'src/settings/index.ts': { ...manifest['src/settings/index.ts'], dynamicImports: ['src/i18n/locales/de.json', 'src/i18n/locales/ja.json'] },
      'src/i18n/locales/de.json': { file: 'assets/de-e5.js' },
      'src/i18n/locales/ja.json': { file: 'assets/ja-f6.js' },
    };
    const sizes = measureBundle(build({ ...assets, 'de-e5.js': 30, 'ja-f6.js': 50 }, withLocales));
    expect(sizes.totalKB).toBe(160 + 50);
    expect(sizes.initialKB).toBe(10 + 2 + 40 + 7 + 1);
  });

  it('falls back to guessing from filenames, with a warning, when there is no manifest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(measureBundle(build(assets)).initialKB).toBe(10 + 2 + 40 + 100);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/manifest\.json/));
  });
});

describe('brand copy check', () => {
  it('reads only what users see: strings in code, text in HTML', () => {
    expect(visibleCopy('if (scrollY <= bottom) return;', 'x.js')).toBe('');
    expect(visibleCopy("label: 'Talk to a bot', id: 2", 'x.ts')).toBe('Talk to a bot');
    expect(visibleCopy('<p class="bottom">A chatbot</p>', 'x.html')).toContain('A chatbot');
  });

  it('matches whole words, plural allowed', () => {
    expect(findTerm('bottom of the page', 'bot')).toBe(-1);
    expect(findTerm('not your average bot.', 'bot')).toBeGreaterThan(-1);
    expect(findTerm('AI chatbots forget', 'chatbot')).toBeGreaterThan(-1);
    expect(findTerm('Unlimited Conversations!', 'Unlimited conversations')).toBe(0);
  });

  it('finds copy files under the copy paths only, top level included', () => {
    const repo = mkdtempSync(join(tmpdir(), 'brand-files-'));
    try {
      for (const file of [
        'apps/web/src/app.ts',
        'apps/web/src/ui/menu.ui.ts',
        'apps/web/src/node_modules/dep/index.ts',
        '.claude/worktrees/other/apps/web/src/app.ts',
        'src/services/billing.ts',
      ]) {
        mkdirSync(join(repo, file, '..'), { recursive: true });
        writeFileSync(join(repo, file), '');
      }
      expect(getAllRelevantFiles(repo)).toEqual(['apps/web/src/app.ts', 'apps/web/src/ui/menu.ui.ts']);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
