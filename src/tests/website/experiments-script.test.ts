/**
 * ferni.ai's experiments script (apps/website/ferni-website/src/js/experiments.js).
 * fetchVariant used a `consented` that only existed in getVariant, so every
 * assignment threw a ReferenceError, was caught, and every visitor saw control
 * (new-person hunt, 2026-10-18). The script runs here in a small fake browser.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const SCRIPT = readFileSync(
  join(process.cwd(), 'apps/website/ferni-website/src/js/experiments.js'),
  'utf8'
);

interface Experiments {
  getVariant: (id: string, options?: { skipExposure?: boolean }) => Promise<string | null>;
}

function load(opts: { consented: boolean; fetch: (url: string) => Promise<unknown> }) {
  const store = new Map<string, string>();
  if (opts.consented) store.set('ferni_cookies', 'accepted');
  const console = { warn: vi.fn(), error: vi.fn(), log: vi.fn() };
  const window: Record<string, unknown> = {
    location: { hostname: 'ferni.ai', search: '' },
    innerWidth: 390,
    addEventListener: () => undefined,
  };
  const context = vm.createContext({
    window,
    document: { readyState: 'complete', addEventListener: () => undefined, visibilityState: 'visible' },
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    navigator: { sendBeacon: () => true },
    fetch: vi.fn(opts.fetch),
    console,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    Date,
    Math,
    JSON,
    Promise,
    Object,
  });
  vm.runInContext(SCRIPT, context);
  return { experiments: window.FerniExperiments as Experiments, store, console };
}

const answer = (variantId: string) => async () => ({
  ok: true,
  status: 200,
  json: async () => ({ variantId }),
});

describe('experiments.js getVariant', () => {
  it('returns the assigned variant and remembers it for a visitor who accepted cookies', async () => {
    const { experiments, store, console } = load({ consented: true, fetch: answer('treatment') });
    await expect(experiments.getVariant('hero-test', { skipExposure: true })).resolves.toBe('treatment');
    expect(JSON.parse(store.get('ferni_experiments') ?? '{}')['hero-test']?.variantId).toBe('treatment');
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('returns the variant without storing anything before consent', async () => {
    const { experiments, store } = load({ consented: false, fetch: answer('treatment') });
    await expect(experiments.getVariant('hero-test', { skipExposure: true })).resolves.toBe('treatment');
    expect(store.has('ferni_experiments')).toBe(false);
  });

  it('fails soft: a failed request shows control with a console warning, not an error', async () => {
    const { experiments, console } = load({
      consented: true,
      fetch: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await expect(experiments.getVariant('hero-test', { skipExposure: true })).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalledOnce();
    expect(console.error).not.toHaveBeenCalled();
  });
});
