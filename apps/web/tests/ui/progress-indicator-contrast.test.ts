import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * --persona-primary (#4a6741) is a fill and stroke colour; as text on dark
 * cards it measured 2.10:1. Text uses --persona-text, which the midnight theme
 * lifts to a light sage (inline-styles.css).
 */
describe('progress indicator text contrast', () => {
  const source = readFileSync(resolve(__dirname, '../../src/ui/progress-indicator.ui.ts'), 'utf8');

  it('never uses the persona fill colour as text colour', () => {
    expect(source).not.toMatch(/(^|[^-])color:\s*var\(--persona-primary/m);
    expect(source).toMatch(/color:\s*var\(--persona-text\)/);
  });
});
