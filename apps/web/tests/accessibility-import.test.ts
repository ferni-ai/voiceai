/**
 * Importing accessibility.ts injects the .sr-only styles in a browser, and does
 * nothing where there is no usable DOM.
 *
 * Server-side contract tests (src/tests/trust-*-contract.test.ts) import web UI
 * modules from node. Once trust-dashboard.ui.ts imported this module (#2109),
 * the import-time injection threw `document is not defined` there and turned
 * the required Integration Tests red on main.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const srStyles = (): HTMLStyleElement[] =>
  Array.from(document.head.querySelectorAll('style')).filter((s) => s.textContent?.includes('.sr-only'));

beforeEach(() => {
  vi.resetModules();
  document.head.innerHTML = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('accessibility.ts on import', () => {
  it('injects the screen-reader styles once when there is a DOM', async () => {
    expect(srStyles()).toHaveLength(0);
    await import('../src/utils/accessibility.js');
    expect(srStyles()).toHaveLength(1);
  });

  it('imports without throwing when document is a partial stub', async () => {
    vi.stubGlobal('document', { documentElement: {} });
    await expect(import('../src/utils/accessibility.js')).resolves.toBeDefined();
  });

  it('imports without throwing when there is no document', async () => {
    vi.stubGlobal('document', undefined);
    await expect(import('../src/utils/accessibility.js')).resolves.toBeDefined();
  });
});
