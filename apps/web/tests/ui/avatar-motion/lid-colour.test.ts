/**
 * Lid colour: the lids are solid white in every theme, the "cap" that carries the
 * expression (Seth, 2026-10-23; the page colour vanished on midnight). The CSS rule
 * in inline-styles.css wins over the SVG's fill attribute, and both say white. A second
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
