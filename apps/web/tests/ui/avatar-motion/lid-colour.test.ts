/**
 * Lid colour: the lids are a white "cap" that carries the expression (Seth, 2026-10-23;
 * the page colour vanished on midnight). Zen is pure white; midnight softens it to warm
 * ivory, because pure white glared on the dark page (Seth, same day). The CSS rules in
 * inline-styles.css win over the SVG's fill attribute, which stays white. A second
 * fill injected by ferni-expressions read as the live rule and the iOS avatar
 * copied it (dark lids, 2026-10-20), so nothing else may set a lid fill.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(resolve(__dirname, '../../../', path), 'utf8');

describe('lid colour', () => {
  it('inline-styles.css fills the lids solid white, never a theme colour', () => {
    const rule = /\.avatar-lid-overlay \.lid-top,\s*\.avatar-lid-overlay \.lid-bottom \{([^}]*)\}/.exec(
      read('src/styles/inline-styles.css')
    );
    expect(rule?.[1]).toMatch(/fill:\s*#ffffff\s*;/i);
    expect(rule?.[1]).not.toMatch(/fill:\s*var\(/);
  });

  it('midnight softens the cap to a light ivory: lighter than the page, not pure white', () => {
    const css = read('src/styles/inline-styles.css');
    const rule = /\[data-theme='midnight'\] \.avatar-lid-overlay :is\(\.lid-top, \.lid-bottom\) \{\s*fill:\s*(#[0-9a-f]{6})/i.exec(css);
    expect(rule).not.toBeNull();
    const hex = (rule?.[1] ?? '#000000').slice(1);
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(luminance).toBeGreaterThan(0.6); // still reads as a light cap on #14110e
    expect(luminance).toBeLessThan(0.95); // not the pure white that glared
  });

  it('the lid paths themselves are white, so a missing stylesheet still shows white caps', () => {
    const src = read('src/ui/ferni-expressions.ui.ts');
    const fills = [...src.matchAll(/<path class="lid-(?:top|bottom)"[^>]*\sfill="([^"]*)"/g)].map((m) => m[1]);
    expect(fills).toEqual(['#ffffff', '#ffffff']);
  });

  it('the injected expression styles set no lid fill of their own', () => {
    const injected = /styleElement\.textContent = `([\s\S]*?)`;/.exec(
      read('src/ui/ferni-expressions.ui.ts')
    )?.[1];
    expect(injected).toBeDefined();
    const lidRules = [...(injected ?? '').matchAll(/([^{}]*\.lid-(?:top|bottom)[^{}]*)\{([^}]*)\}/g)];
    expect(lidRules.length).toBeGreaterThan(0); // the reduced-motion rule still names them
    for (const [, , body] of lidRules) expect(body).not.toMatch(/\bfill\s*:/);
  });
});
