/**
 * gsap is bundled, not read from a CDN global: with no `window.gsap` the shared
 * instance still animates, and index.html loads no gsap script of its own.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { gsap } from '../../src/utils/gsap-setup.js';

describe('gsap setup', () => {
  it('provides a working gsap without a CDN global', () => {
    expect((window as unknown as { gsap?: unknown }).gsap).toBeUndefined();
    const el = document.createElement('div');
    gsap.set(el, { x: 4 });
    expect(gsap.getProperty(el, 'x')).toBe(4);
    expect(typeof gsap.to).toBe('function');
    expect(typeof gsap.timeline).toBe('function');
  });

  it('index.html loads no gsap script from a CDN', () => {
    const html = readFileSync(join(__dirname, '../../index.html'), 'utf8');
    expect(html).not.toMatch(/<script[^>]+gsap/i);
  });
});
