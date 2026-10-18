import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CAPTIONS_HEARD_STORAGE_KEY,
  CAPTIONS_V2_STORAGE_KEY,
  isCaptionsHeardEnabled,
} from '@/ui/captions/captions-flag.js';

describe('captions-heard flag', () => {
  afterEach(() => {
    localStorage.removeItem(CAPTIONS_HEARD_STORAGE_KEY);
    localStorage.removeItem(CAPTIONS_V2_STORAGE_KEY);
    vi.unstubAllEnvs();
  });

  it('is off by default, and off with the build flag while captions v2 is off', () => {
    expect(isCaptionsHeardEnabled()).toBe(false);
    vi.stubEnv('VITE_CAPTIONS_HEARD', 'true');
    expect(isCaptionsHeardEnabled()).toBe(false);
  });

  it('turns on with captions v2 and the build flag', () => {
    localStorage.setItem(CAPTIONS_V2_STORAGE_KEY, 'true');
    vi.stubEnv('VITE_CAPTIONS_HEARD', 'true');
    expect(isCaptionsHeardEnabled()).toBe(true);
  });

  it('lets one browser switch it off again, even with the build flag on', () => {
    localStorage.setItem(CAPTIONS_V2_STORAGE_KEY, 'true');
    vi.stubEnv('VITE_CAPTIONS_HEARD', 'true');
    localStorage.setItem(CAPTIONS_HEARD_STORAGE_KEY, 'false');
    expect(isCaptionsHeardEnabled()).toBe(false);
  });
});
