/**
 * ESM init systems guard
 *
 * apps/web is native ES modules. Vite and Rollup leave a CommonJS `require()`
 * in ESM source untouched, so it throws "require is not defined" in the
 * browser (dev and production bundle alike) and aborts whatever function it
 * sits in. initTranscendentSystems, initColorSystem and initTypographySystem
 * each shipped with lazy require() calls and never ran; app.ts swallowed the
 * error in a try/catch. These tests call the real initializers and fail on any
 * require() that creeps back into src/.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { destroyTranscendentSystems, initTranscendentSystems } from '../src/systems/index.js';
import { initColorSystem } from '../src/ui/color/index.js';
import { initTypographySystem } from '../src/ui/typography/index.js';

const SRC_ROOT = join(__dirname, '..', 'src');

/** Returns `line: code` for every require( call outside a comment. */
function findRequireCalls(source: string): string[] {
  const hits: string[] = [];
  source.split('\n').forEach((line, i) => {
    const code = line.trim();
    if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
    if (/\brequire\s*\(/.test(code.replace(/\/\/.*$/, ''))) hits.push(`${i + 1}: ${code}`);
  });
  return hits;
}

describe('ESM init systems', () => {
  // jsdom has no IntersectionObserver; every browser the app targets does
  beforeAll(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
    );
  });

  afterEach(() => {
    destroyTranscendentSystems();
    document.head.querySelectorAll('style[id]').forEach((s) => s.remove());
    document.documentElement.removeAttribute('style');
  });

  it('initTranscendentSystems starts breath sync on :root', () => {
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--breath-phase')).toBe('');

    const systems = initTranscendentSystems({ debug: false });

    expect(systems.isInitialized).toBe(true);
    expect(root.getPropertyValue('--breath-phase')).toMatch(/^\d\.\d{4}$/);
  });

  // Contextual spacing writes a geometric --space-N scale inline on :root,
  // overriding the design system's linear one (--space-10: 40px -> 128px).
  it('initTranscendentSystems leaves design-system spacing alone by default', () => {
    initTranscendentSystems({ debug: false });

    expect(document.documentElement.style.getPropertyValue('--space-8')).toBe('');
  });

  it('initTranscendentSystems applies contextual spacing when opted in', () => {
    initTranscendentSystems({ debug: false, contextualSpacing: true });

    expect(document.documentElement.style.getPropertyValue('--spacing-device')).not.toBe('');
  });

  it('initColorSystem sets the mood palette and injects its styles', () => {
    expect(document.getElementById('ferni-time-fading-styles')).toBeNull();

    initColorSystem();

    expect(document.documentElement.style.getPropertyValue('--mood-primary')).not.toBe('');
    expect(document.getElementById('ferni-time-fading-styles')).not.toBeNull();
    expect(document.getElementById('ferni-persona-harmony-styles')).not.toBeNull();
  });

  it('initTypographySystem injects mood and persona typography styles', () => {
    expect(document.getElementById('mood-typography-styles')).toBeNull();

    initTypographySystem();

    expect(document.getElementById('mood-typography-styles')?.textContent).toMatch(/\S/);
    expect(document.getElementById('persona-typography-styles')?.textContent).toMatch(/\S/);
  });

  it('detects a require() call (scanner sanity check)', () => {
    const fixture = [
      "const { a } = require('./a.js');",
      '// require() in a comment is fine',
      ' * so is require() in a doc comment',
      '// eslint-disable-next-line @typescript-eslint/require-await',
      "x = 1; // require('./b.js')",
    ].join('\n');
    expect(findRequireCalls(fixture)).toEqual(["1: const { a } = require('./a.js');"]);
  });

  it('src/ contains no CommonJS require() calls', () => {
    const offenders = readdirSync(SRC_ROOT, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.ts') && !/\.(test|spec)\.ts$/.test(f))
      .flatMap((f) => {
        const file = join(SRC_ROOT, f);
        return findRequireCalls(readFileSync(file, 'utf8')).map(
          (hit) => `${relative(SRC_ROOT, file)}:${hit}`
        );
      });
    expect(offenders).toEqual([]);
  });
});
