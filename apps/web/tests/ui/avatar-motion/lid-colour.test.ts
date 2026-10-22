/**
 * Lid colour: the lids take the page colour, the light "cap" that carries the
 * expression (Seth, 2026-10-11). One place sets it, inline-styles.css. A second
 * fill injected by ferni-expressions read as the live rule and the iOS avatar
 * copied it (dark lids, 2026-10-20), so nothing else may set a lid fill.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(resolve(__dirname, '../../../', path), 'utf8');

describe('lid colour', () => {
  it('inline-styles.css fills the lids with the page colour', () => {
    const rule = /\.avatar-lid-overlay \.lid-top,\s*\.avatar-lid-overlay \.lid-bottom \{([^}]*)\}/.exec(
      read('src/styles/inline-styles.css')
    );
    expect(rule?.[1]).toMatch(/fill:\s*var\(--color-background-primary/);
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
