/**
 * Tests for Home Executor - Smart Home Tool Integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../tools/domains/smart-home/smart-home.js', () => {
  return {
    getAllDevices: vi.fn(),
    controlDevice: vi.fn(),
    activateScene: vi.fn(),
    setLightsForVibe: vi.fn(),
  };
});

vi.mock('../../../../services/smart-home/user-credentials.js', () => {
  return {
    hasAnySmartHomeIntegration: vi.fn(),
  };
});

vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks
import { homeExecutor } from '../home-executor.js';
import type { ToolExecutionContext } from '../types.js';
import * as smartHome from '../../../../tools/domains/smart-home/smart-home.js';
import * as userCredentials from '../../../../services/smart-home/user-credentials.js';

function createMockContext(userId?: string): ToolExecutionContext {
  return {
    userId,
    sessionId: 'test-session',
    personaId: 'ferni',
  };
}

describe('homeExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handles', () => {
    it('should handle all expected tool names', () => {
      expect(homeExecutor.handles).toContain('setlights');
      expect(homeExecutor.handles).toContain('gethomestatus');
      expect(homeExecutor.handles).toContain('setthermostat');
      expect(homeExecutor.handles).toContain('controldevice');
      expect(homeExecutor.handles).toContain('getdevices');
      expect(homeExecutor.handles).toContain('setscene');
      expect(homeExecutor.handles).toContain('turnon');
      expect(homeExecutor.handles).toContain('turnoff');
    });
  });

  describe('execute - no userId', () => {
    it('should return sign-in message when userId is missing', async () => {
      const result = await homeExecutor.execute('setLights', {}, createMockContext());

      expect(result).toContain('sign in');
    });
  });

  describe('execute - no smart home configured', () => {
    it('should return setup message when no smart home configured', async () => {
      vi.mocked(userCredentials.hasAnySmartHomeIntegration).mockResolvedValue(false);

      const result = await homeExecutor.execute('setLights', {}, createMockContext('test-user'));

      expect(result).toContain('Settings');
      expect(result).toContain('Your Home');
    });

    it('should return setup message for getHomeStatus when no smart home', async () => {
      vi.mocked(userCredentials.hasAnySmartHomeIntegration).mockResolvedValue(false);

      const result = await homeExecutor.execute(
        'getHomeStatus',
        {},
        createMockContext('test-user')
      );

      expect(result).toContain("haven't connected");
    });
  });

  describe('execute - with smart home configured', () => {
    beforeEach(() => {
      vi.mocked(userCredentials.hasAnySmartHomeIntegration).mockResolvedValue(true);
    });

    describe('setLights', () => {
      it('should set brightness for all lights when no room specified', async () => {
        vi.mocked(smartHome.setLightsForVibe).mockResolvedValue({
          success: true,
          devices: ['Living Room', 'Bedroom'],
        });

        const result = await homeExecutor.execute(
          'setLights',
          { brightness: 75 },
          createMockContext('test-user')
        );

        expect(smartHome.setLightsForVibe).toHaveBeenCalledWith('test-user', 75);
        expect(result).toContain('💡');
        expect(result).toContain('2 lights');
        expect(result).toContain('75%');
      });

      it('should control specific room when room is specified', async () => {
        vi.mocked(smartHome.controlDevice).mockResolvedValue('✅ Living Room set to 50%');

        const result = await homeExecutor.execute(
          'setLights',
          { room: 'Living Room', brightness: 50 },
          createMockContext('test-user')
        );

        expect(smartHome.controlDevice).toHaveBeenCalledWith('Living Room', 'set', 50, 'test-user');
        expect(result).toContain('Living Room');
      });

      it('should turn off lights when state is off', async () => {
        vi.mocked(smartHome.getAllDevices).mockResolvedValue([
          { id: 'light.1', name: 'Living Room', type: 'light', state: 'on', platform: 'hue' },
        ]);
        vi.mocked(smartHome.controlDevice).mockResolvedValue('✅ Living Room turned off');

        const result = await homeExecutor.execute(
          'setLights',
          { state: 'off' },
          createMockContext('test-user')
        );

        expect(smartHome.controlDevice).toHaveBeenCalledWith(
          'light.1',
          'off',
          undefined,
          'test-user'
        );
        expect(result).toContain('Turned off');
      });
    });

    describe('getHomeStatus / getDevices', () => {
      it('should return device summary', async () => {
        vi.mocked(smartHome.getAllDevices).mockResolvedValue([
          { id: '1', name: 'Living Room Light', type: 'light', state: 'on', platform: 'hue' },
          { id: '2', name: 'Thermostat', type: 'thermostat', state: '72°F', platform: 'ecobee' },
        ]);

        const result = await homeExecutor.execute(
          'getHomeStatus',
          {},
          createMockContext('test-user')
        );

        expect(result).toContain('Smart Home');
        expect(result).toContain('Living Room Light');
        expect(result).toContain('Thermostat');
      });

      it('should handle no devices found', async () => {
        vi.mocked(smartHome.getAllDevices).mockResolvedValue([]);

        const result = await homeExecutor.execute('getDevices', {}, createMockContext('test-user'));

        expect(result).toContain('No devices found');
      });
    });

    describe('setThermostat', () => {
      it('should set thermostat temperature', async () => {
        vi.mocked(smartHome.controlDevice).mockResolvedValue('✅ Thermostat set to 72°F');

        await homeExecutor.execute(
          'setThermostat',
          { temperature: 72 },
          createMockContext('test-user')
        );

        expect(smartHome.controlDevice).toHaveBeenCalledWith('thermostat', 'set', 72, 'test-user');
      });

      it('should ask for temperature when not provided', async () => {
        const result = await homeExecutor.execute(
          'setThermostat',
          {},
          createMockContext('test-user')
        );

        expect(result).toContain('temperature');
      });
    });

    describe('controlDevice / turnOn / turnOff', () => {
      it('should turn on a device', async () => {
        vi.mocked(smartHome.controlDevice).mockResolvedValue('✅ TV turned on');

        await homeExecutor.execute('turnOn', { device: 'TV' }, createMockContext('test-user'));

        expect(smartHome.controlDevice).toHaveBeenCalledWith('TV', 'on', undefined, 'test-user');
      });

      it('should turn off a device', async () => {
        vi.mocked(smartHome.controlDevice).mockResolvedValue('✅ TV turned off');

        await homeExecutor.execute('turnOff', { device: 'TV' }, createMockContext('test-user'));

        expect(smartHome.controlDevice).toHaveBeenCalledWith('TV', 'off', undefined, 'test-user');
      });

      it('should ask for device when not specified', async () => {
        const result = await homeExecutor.execute(
          'controlDevice',
          {},
          createMockContext('test-user')
        );

        expect(result).toContain('Which device');
      });
    });

    describe('setScene', () => {
      it('should activate a scene', async () => {
        vi.mocked(smartHome.activateScene).mockResolvedValue('🎬 Movie Time activated');

        await homeExecutor.execute(
          'setScene',
          { scene: 'Movie Time' },
          createMockContext('test-user')
        );

        expect(smartHome.activateScene).toHaveBeenCalledWith('Movie Time', 'test-user');
      });

      it('should ask for scene when not specified', async () => {
        const result = await homeExecutor.execute('setScene', {}, createMockContext('test-user'));

        expect(result).toContain('Which scene');
      });
    });

    describe('lockDoors', () => {
      it('should lock all doors', async () => {
        vi.mocked(smartHome.getAllDevices).mockResolvedValue([
          {
            id: 'lock.1',
            name: 'Front Door',
            type: 'lock',
            state: 'unlocked',
            platform: 'homekit',
          },
          { id: 'lock.2', name: 'Back Door', type: 'lock', state: 'unlocked', platform: 'homekit' },
        ]);
        vi.mocked(smartHome.controlDevice)
          .mockResolvedValueOnce('✅ Front Door locked')
          .mockResolvedValueOnce('✅ Back Door locked');

        const result = await homeExecutor.execute(
          'lockDoors',
          { door: 'all', action: 'lock' },
          createMockContext('test-user')
        );

        expect(result).toContain('Locked');
        expect(result).toContain('2');
      });
    });
  });

  describe('execute - unknown tool', () => {
    it('should return null for unknown tools', async () => {
      const result = await homeExecutor.execute('unknownTool', {}, createMockContext('test-user'));

      expect(result).toBeNull();
    });
  });
});
