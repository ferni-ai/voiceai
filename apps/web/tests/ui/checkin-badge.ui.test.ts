/**
 * Check-in Badge UI (deprecated shim) Tests
 *
 * checkin-badge.ui.ts is a backward-compatibility shim: its badge rendering,
 * accessibility and tooltip behaviour moved to unified-indicator.ui.ts, and its
 * polling moved to checkin.service.ts (covered by
 * tests/services/checkin.service.test.ts).
 *
 * The shim is still load-bearing — app.ts imports initCheckinBadgeUI and it is
 * the only caller that starts the check-in service — so what remains worth
 * testing is precisely that: each shim export delegates to the service.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const mockInit = vi.fn();
const mockDispose = vi.fn();
const mockForceCheck = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/services/checkin.service.js', () => ({
  checkinService: {
    init: (...args: unknown[]) => mockInit(...args),
    dispose: (...args: unknown[]) => mockDispose(...args),
    forceCheck: (...args: unknown[]) => mockForceCheck(...args),
  },
}));

type ShimModule = typeof import('../../src/ui/checkin-badge.ui.js');

describe('CheckinBadgeUI (deprecated shim)', () => {
  let shim: ShimModule;

  beforeEach(async () => {
    mockInit.mockClear();
    mockDispose.mockClear();
    mockForceCheck.mockClear();
    vi.resetModules();
    shim = await import('../../src/ui/checkin-badge.ui.js');
  });

  describe('Module exports', () => {
    it('should export the three compat functions', () => {
      expect(typeof shim.initCheckinBadgeUI).toBe('function');
      expect(typeof shim.disposeCheckinBadgeUI).toBe('function');
      expect(typeof shim.triggerCheckin).toBe('function');
    });

    it('should export a facade wired to those functions', () => {
      expect(shim.checkinBadgeUI.init).toBe(shim.initCheckinBadgeUI);
      expect(shim.checkinBadgeUI.dispose).toBe(shim.disposeCheckinBadgeUI);
      expect(shim.checkinBadgeUI.trigger).toBe(shim.triggerCheckin);
      expect(shim.default).toBe(shim.checkinBadgeUI);
    });
  });

  describe('Delegation to checkinService', () => {
    it('should start the check-in service on init', () => {
      shim.initCheckinBadgeUI();

      expect(mockInit).toHaveBeenCalledTimes(1);
      expect(mockDispose).not.toHaveBeenCalled();
    });

    it('should dispose the check-in service on dispose', () => {
      shim.disposeCheckinBadgeUI();

      expect(mockDispose).toHaveBeenCalledTimes(1);
      expect(mockInit).not.toHaveBeenCalled();
    });

    it('should force an immediate check on trigger', () => {
      shim.triggerCheckin();

      expect(mockForceCheck).toHaveBeenCalledTimes(1);
    });

    it('should not inject any DOM or styles - that is unified-indicator now', () => {
      shim.initCheckinBadgeUI();

      expect(document.getElementById('checkin-badge-styles')).toBeNull();
      expect(document.querySelector('.checkin-badge')).toBeNull();
    });
  });
});
