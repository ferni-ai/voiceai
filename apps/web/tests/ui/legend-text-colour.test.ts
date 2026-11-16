/**
 * A Legend's colours come from a rule app.state.ts writes at runtime, which sets
 * --persona-primary but not the text colour on it. Without a rule of their own,
 * Legends inherit --persona-on-primary from whoever spoke before: after Maya,
 * Henry Caldwell's active Trust tab was dark text on dark red (1.88:1).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGENDS } from '../../src/config/personas.js';

const inlineCss = readFileSync(resolve(__dirname, '../../src/styles/inline-styles.css'), 'utf8');
const tokensCss = readFileSync(resolve(__dirname, '../../../../design-system/dist/tokens.css'), 'utf8');

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

/** The value --persona-on-primary takes in the `[data-persona='id']` rule, resolved through tokens.css. */
function onPrimaryFor(id: string): string | undefined {
  const block = inlineCss.match(new RegExp(`\\[data-persona='${id}'\\]\\s*\\{([^}]*)\\}`))?.[1];
  const token = block?.match(/--persona-on-primary:\s*var\((--[a-z-]+)\)/)?.[1];
  return token ? tokensCss.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`))?.[1] : undefined;
}

describe('every Legend has its own readable text colour', () => {
  const legends = Object.entries(LEGENDS);

  it('there are Legends to check', () => {
    expect(legends.length).toBeGreaterThanOrEqual(2);
  });

  it.each(legends)('%s sets --persona-on-primary at 4.5:1 or better on its colour', (id, config) => {
    const onPrimary = onPrimaryFor(id);
    expect(onPrimary, `no [data-persona='${id}'] rule sets --persona-on-primary`).toBeDefined();
    expect(contrast(onPrimary!, config.colors.primary)).toBeGreaterThanOrEqual(4.5);
  });
});
