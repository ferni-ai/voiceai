/**
 * "Pattern Insights" (menu) and "show my patterns" (voice) both mount the
 * insights card into a container. They used to look up `.app-shell`, which
 * exists nowhere in index.html, so both did nothing. Every container the app
 * hands to showPatternInsights must exist in the real page.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = readFileSync(join(__dirname, '../../src/app.ts'), 'utf8');
const INDEX = readFileSync(join(__dirname, '../../index.html'), 'utf8');

function mountSelectors(): string[] {
  const calls = APP.split('\n').filter((line) => line.includes('showPatternInsights('));
  return calls.map((line) => {
    const byId = /getElementById\('([^']+)'\)/.exec(line);
    if (byId) return `#${byId[1]}`;
    const byQuery = /querySelector\('([^']+)'\)/.exec(line);
    return byQuery ? byQuery[1] : `[data-missing="${line.trim()}"]`;
  });
}

describe('pattern insights mount point', () => {
  it('is opened from both the menu and the voice command', () => {
    expect(mountSelectors()).toHaveLength(2);
  });

  it.each(mountSelectors())('mounts into %s, which exists in index.html', (selector) => {
    const page = new DOMParser().parseFromString(INDEX, 'text/html');
    expect(page.querySelector(selector)).not.toBeNull();
  });
});
