/**
 * The avatar lab is the exact path /avatar-lab (or with a trailing slash):
 * any other page, even one whose path only starts with or contains it, is the app.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logError = vi.hoisted(() => vi.fn());
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: logError }),
}));

import { isAvatarLab, openAvatarLab } from '../../src/avatar-lab/lab-mode.js';

describe('isAvatarLab', () => {
  it.each(['/avatar-lab', '/avatar-lab/'])('is the lab at %s', (pathname) => {
    expect(isAvatarLab({ pathname })).toBe(true);
  });

  it.each(['/', '/admin', '/avatar-lab-x', '/a/avatar-lab'])('is the app at %s', (pathname) => {
    expect(isAvatarLab({ pathname })).toBe(false);
  });

  it('reads the current location by default', () => {
    window.history.replaceState(null, '', '/avatar-lab');
    expect(isAvatarLab()).toBe(true);
    window.history.replaceState(null, '', '/');
    expect(isAvatarLab()).toBe(false);
  });
});

describe('openAvatarLab', () => {
  beforeEach(() => logError.mockClear());

  it('loads the lab page and starts it', async () => {
    const startAvatarLab = vi.fn(async () => undefined);
    await openAvatarLab(async () => ({ startAvatarLab }));
    expect(startAvatarLab).toHaveBeenCalledOnce();
    expect(logError).not.toHaveBeenCalled();
  });

  it('logs a boot failure instead of rejecting app initialize()', async () => {
    const boom = new Error('i18n failed');
    await expect(
      openAvatarLab(async () => ({ startAvatarLab: () => Promise.reject(boom) }))
    ).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith('Failed to initialize the avatar lab:', boom);
  });

  it('logs a failure to load the lab chunk too', async () => {
    const boom = new Error('chunk failed');
    await expect(openAvatarLab(() => Promise.reject(boom))).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith('Failed to initialize the avatar lab:', boom);
  });
});

describe('app.ts initialize() on the lab path', () => {
  // app.ts starts every service on import, so its lab branch is read from source,
  // as other app.ts tests do.
  const source = readFileSync(join(__dirname, '..', '..', 'src', 'app.ts'), 'utf8');
  const start = source.indexOf('if (isAvatarLab()) {');
  const branch = source.slice(start, source.indexOf('}', start));

  it('marks the app initialized before it opens the lab, so a second call cannot boot it twice', () => {
    expect(start).toBeGreaterThan(source.indexOf('async initialize(): Promise<void> {'));
    const marked = branch.indexOf('this.isInitialized = true;');
    expect(marked).toBeGreaterThan(-1);
    expect(branch.indexOf('return openAvatarLab();')).toBeGreaterThan(marked);
  });
});
