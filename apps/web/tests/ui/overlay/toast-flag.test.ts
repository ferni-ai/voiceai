/**
 * The toast-region flag is on by default; 'off' (build variable or this
 * browser's storage) is the kill switch back to the old per-surface toasts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_HOST_STORAGE_KEY } from '../../../src/ui/overlay/overlay-flag';
import { TOAST_REGION_STORAGE_KEY, isToastRegionEnabled } from '../../../src/ui/overlay/toast-flag';

afterEach(() => {
  vi.unstubAllEnvs();
  localStorage.clear();
});

describe('isToastRegionEnabled', () => {
  it('is on when nothing is set', () => {
    vi.stubEnv('VITE_TOAST_REGION', undefined as unknown as string);
    expect(isToastRegionEnabled()).toBe(true);
  });

  it.each(['off', 'false'])('the build variable %s turns it off', (value) => {
    vi.stubEnv('VITE_TOAST_REGION', value);
    expect(isToastRegionEnabled()).toBe(false);
  });

  it("this browser's 'off' turns it off on a build that has it on", () => {
    localStorage.setItem(TOAST_REGION_STORAGE_KEY, 'off');
    expect(isToastRegionEnabled()).toBe(false);
  });

  it("this browser's 'on' turns it on on a build that has it off", () => {
    vi.stubEnv('VITE_TOAST_REGION', 'off');
    localStorage.setItem(TOAST_REGION_STORAGE_KEY, 'on');
    expect(isToastRegionEnabled()).toBe(true);
  });

  it('the overlay host keeps toasts in the region even with the kill switch set', () => {
    vi.stubEnv('VITE_TOAST_REGION', 'off');
    localStorage.setItem(OVERLAY_HOST_STORAGE_KEY, 'true');
    expect(isToastRegionEnabled()).toBe(true);
  });
});
