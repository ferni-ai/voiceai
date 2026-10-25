/**
 * The generated lists are gitignored, so a build from the wrong tree could ship an
 * empty one. Importing the real modules over an empty list must throw, naming the
 * file and `pnpm gen:lists`, instead of booting with flags or settings missing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('../flags/index.generated.js');
  vi.doUnmock('../env-read-names.generated.js');
  vi.resetModules();
});

describe('generated-list guard', () => {
  it('flag-manifest throws at import when the flag barrel is empty', async () => {
    vi.resetModules();
    vi.doMock('../flags/index.generated.js', () => ({}));
    await expect(import('../flag-manifest.js')).rejects.toThrow(
      /flags\/index\.generated\.ts lists 0 entries.*pnpm gen:lists/
    );
  });

  it('effective-settings throws at import when the env-name list is short', async () => {
    vi.resetModules();
    vi.doMock('../env-read-names.generated.js', () => ({ ENV_READ_NAMES: ['NODE_ENV'] }));
    await expect(import('../effective-settings.js')).rejects.toThrow(
      /env-read-names\.generated\.ts lists 1 entries.*pnpm gen:lists/
    );
  });

  it('both load over the real generated lists', async () => {
    vi.resetModules();
    const manifest = await import('../flag-manifest.js');
    const settings = await import('../effective-settings.js');
    expect(Object.keys(manifest.FLAG_MANIFEST).length).toBeGreaterThan(100);
    expect(typeof settings.effectiveSettingsLines).toBe('function');
  });
});
