/**
 * Meet More Friends carries no vendor brands and one registry source.
 *
 * The Your Team tab listed "Co-founders: Claude, Gemini, GPT" with their marks
 * (Ferni's brand rule: no vendor names or marks in the UI), cards said "by
 * VoiceAI Team", dev read /voiceai-agents/registry.json straight from the public
 * folder (skipping the server's isKnownId filter, so dev listed 15 friends who
 * can't join), "Become a creator" led to an error page, and an old install's
 * roster tile opened the hidden panel.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SRC = join(__dirname, '..', '..', 'src');
const REPO = join(__dirname, '..', '..', '..', '..');

/** Code without comments: developer prose may name a vendor, the UI may not. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
  );
}

describe('marketplace copy', () => {
  const marketplaceFiles = [
    join(SRC, 'ui', 'marketplace.ui.ts'),
    ...walk(join(SRC, 'ui', 'marketplace')),
    join(SRC, 'services', 'marketplace.service.ts'),
  ];
  const locales = readdirSync(join(SRC, 'i18n', 'locales'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => join(SRC, 'i18n', 'locales', f));

  it('names no AI vendor in the marketplace module or any locale', () => {
    for (const file of [...marketplaceFiles, ...locales]) {
      const text = readFileSync(file, 'utf8');
      // marketplace.team / teamNarrative blocks held the co-founder names
      expect(text, file).not.toMatch(/"(claude|gemini|gpt)"\s*:/);
      if (file.includes('marketplace')) expect(stripComments(text), file).not.toMatch(/\b(Claude|Gemini|GPT)\b/);
    }
  });

  it('has no co-founders section', () => {
    for (const file of [...marketplaceFiles, ...locales]) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/coFounders|cofounder/);
    }
  });

  it('credits agents to Ferni, never "VoiceAI Team"', () => {
    const registries = [
      join(REPO, 'apps', 'marketplace-agents', 'registry.json'),
      join(REPO, 'apps', 'web', 'public', 'voiceai-agents', 'registry.json'),
    ].filter(existsSync);
    expect(registries.length).toBeGreaterThan(0);
    for (const file of [...registries, ...marketplaceFiles, ...locales]) {
      expect(readFileSync(file, 'utf8'), file).not.toContain('VoiceAI Team');
    }
  });

  it('links "Become a creator" somewhere real', () => {
    const ui = readFileSync(join(SRC, 'ui', 'marketplace.ui.ts'), 'utf8');
    expect(ui).not.toContain('ferni.ai/creators');
    expect(ui).toContain('https://ferni.ai/marketplace');
  });
});

describe('marketplace registry source', () => {
  beforeEach(() => vi.resetModules());

  it('reads the server endpoint in dev, never the public registry file', async () => {
    expect(import.meta.env.DEV).toBe(true); // vitest runs as dev: the case that used to read the file
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '1', agents: [], categories: [] }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const svc = await import('../../src/services/marketplace.service.js');
    await svc.fetchRegistry(true);
    const urls = fetchMock.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(urls).toEqual(['/api/marketplace/registry']);
    vi.unstubAllGlobals();
  });
});

describe('hidden marketplace panel', () => {
  it('is not opened from a roster tile', async () => {
    vi.resetModules();
    const opened = vi.fn();
    vi.doMock('../../src/ui/marketplace.ui.js', () => ({ openMarketplace: opened }));
    const { openMarketplace } = await import('../../src/ui/lazy-screens.js');
    await openMarketplace();
    expect(opened).not.toHaveBeenCalled();
  });
});
