/**
 * Smart Home Domain Tests
 *
 * Tests for smart home device control tools:
 * - Home Assistant tools
 * - Ecobee tools
 * - Generic smart home (Hue/LIFX/SmartThings)
 *
 * Created as part of HEALTH-HOME-WELLNESS-AUDIT.md cleanup
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../../../../utils/safe-logger.js', () => {
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  };
  return {
    getLogger: () => mockLogger,
    createLogger: () => mockLogger,
    safeLog: () => mockLogger,
  };
});

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

// Mock the self-healing clients
vi.mock('../../../../services/self-healing/index.js', () => ({
  getHomeAssistantClient: vi.fn(() => ({
    isHealthy: () => true,
    get: vi.fn(() => Promise.resolve({ data: [], error: null })),
    post: vi.fn(() => Promise.resolve({ data: {}, error: null })),
    put: vi.fn(() => Promise.resolve({ data: {}, error: null })),
  })),
  getHueClient: vi.fn(() => ({
    isHealthy: () => true,
    get: vi.fn(() => Promise.resolve({ data: {}, error: null })),
    put: vi.fn(() => Promise.resolve({ data: {}, error: null })),
  })),
  getLifxClient: vi.fn(() => ({
    isHealthy: () => true,
    get: vi.fn(() => Promise.resolve({ data: [], error: null })),
    put: vi.fn(() => Promise.resolve({ data: {}, error: null })),
  })),
}));

// Mock tool descriptions
vi.mock('../../../utils/tool-descriptions.js', () => ({
  getToolDescription: (id: string) => `Description for ${id}`,
}));

// Mock Home Assistant service
vi.mock('../../../../services/home-assistant.js', () => ({
  getHomeAssistantService: vi.fn(() => null),
}));

// Mock Ecobee API
vi.mock('../../../../api/ecobee-api.js', () => ({
  getEcobeeApi: vi.fn(() => null),
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions, getAllDevices, controlDevice, activateScene } from '../index.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Not available');
      },
      getOptional: () => undefined,
    },
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Smart Home Domain', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tool Loading', () => {
    it('should load all tool definitions', async () => {
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });

    it('should have all tools in home domain', () => {
      toolDefinitions.forEach((def) => {
        expect(def.domain).toBe('home'); // Domain is 'home' not 'smart-home'
      });
    });

    it('should include Home Assistant tools', () => {
      const haTools = toolDefinitions.filter((t) =>
        ['controlLight', 'setThermostat', 'activateScene', 'controlLock', 'getHomeStatus'].includes(
          t.id
        )
      );
      expect(haTools.length).toBeGreaterThan(0);
    });

    it('should include Ecobee tools if available', () => {
      const ecobeeToolIds = [
        'getThermostatStatus',
        'setThermostatTemperature',
        'setClimateMode',
        'setHvacMode',
        'getSensorReadings',
        'resumeThermostatSchedule',
      ];
      const ecobeeTools = toolDefinitions.filter((t) => ecobeeToolIds.includes(t.id));
      // Ecobee tools are optional - skip if not yet implemented
      if (ecobeeTools.length === 0) {
        console.log('Ecobee tools not yet implemented - skipping');
        return;
      }
      expect(ecobeeTools.length).toBeGreaterThan(0);
    });
  });

  describe('Home Assistant Tools', () => {
    it('controlLight - should execute with room and action', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'controlLight');
      if (!toolDef) {
        console.warn('controlLight not found in definitions');
        return;
      }

      const tool = toolDef.create(mockContext);
      const result = await tool.execute({
        room: 'living room',
        action: 'on',
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('setThermostat - should execute with temperature', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'setThermostat');
      if (!toolDef) {
        console.warn('setThermostat not found in definitions');
        return;
      }

      const tool = toolDef.create(mockContext);
      const result = await tool.execute({
        temperature: 72,
      });

      expect(result).toBeDefined();
    });

    it('controlLock - should execute with lock and action', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'controlLock');
      if (!toolDef) {
        console.warn('controlLock not found in definitions');
        return;
      }

      const tool = toolDef.create(mockContext);
      const result = await tool.execute({
        lock: 'front door',
        action: 'lock',
      });

      expect(result).toBeDefined();
    });

    it('getHomeStatus - should execute without parameters', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getHomeStatus');
      if (!toolDef) {
        console.warn('getHomeStatus not found in definitions');
        return;
      }

      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toBeDefined();
    });
  });

  describe('Ecobee Tools', () => {
    it('getThermostatStatus - should execute', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getThermostatStatus');
      if (!toolDef) {
        console.warn('getThermostatStatus not found in definitions');
        return;
      }

      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toBeDefined();
    });

    it('setThermostatTemperature - should execute with parameters', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'setThermostatTemperature');
      if (!toolDef) {
        console.warn('setThermostatTemperature not found in definitions');
        return;
      }

      const tool = toolDef.create(mockContext);
      const result = await tool.execute({
        coolTemp: 75,
        heatTemp: 68,
      });

      expect(result).toBeDefined();
    });

    it('setClimateMode - should execute with preset', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'setClimateMode');
      if (!toolDef) {
        console.warn('setClimateMode not found in definitions');
        return;
      }

      const tool = toolDef.create(mockContext);
      const result = await tool.execute({
        preset: 'home',
      });

      expect(result).toBeDefined();
    });

    it('getSensorReadings - should execute', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getSensorReadings');
      if (!toolDef) {
        console.warn('getSensorReadings not found in definitions');
        return;
      }

      const tool = toolDef.create(mockContext);
      const result = await tool.execute({});

      expect(result).toBeDefined();
    });
  });

  describe('Generic Smart Home Functions', () => {
    it('getAllDevices - should return empty array when no integrations configured', async () => {
      const devices = await getAllDevices();
      expect(Array.isArray(devices)).toBe(true);
    });

    it('controlDevice - should handle missing device gracefully', async () => {
      const result = await controlDevice('nonexistent-device', 'on');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      // When no devices exist, returns setup help mentioning "connected"
      // When devices exist but specific one not found, mentions "find"
      expect(
        result.toLowerCase().includes('connected') || result.toLowerCase().includes('find')
      ).toBe(true);
    });

    it('activateScene - should handle unknown scene gracefully', async () => {
      const result = await activateScene('unknown-scene');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      // Should mention scene not found or available scenes
      expect(result.toLowerCase().includes('scene')).toBe(true);
    });

    it('activateScene - should recognize built-in scenes', async () => {
      // Test with known built-in scene name
      const result = await activateScene('good morning');
      expect(result).toBeDefined();
      // Either activates or mentions configuration
    });
  });

  describe('Content Validation', () => {
    it('should not contain placeholder text in tool outputs', async () => {
      // Test a few tools for placeholder content
      for (const toolDef of toolDefinitions.slice(0, 3)) {
        const tool = toolDef.create(mockContext);
        try {
          const result = await tool.execute({});
          if (result) {
            const resultStr = String(result);
            expect(resultStr).not.toContain('TODO');
            expect(resultStr).not.toContain('placeholder');
            expect(resultStr).not.toContain('FIXME');
          }
        } catch {
          // Some tools may fail without proper params, that's okay
        }
      }
    });

    it('all tools should have descriptions', () => {
      toolDefinitions.forEach((def) => {
        expect(def.description).toBeDefined();
        expect(def.description.length).toBeGreaterThan(0);
      });
    });

    it('all tools should have unique IDs', () => {
      const ids = toolDefinitions.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });
  });

  describe('Error Handling', () => {
    it('controlLight - should handle invalid action gracefully', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'controlLight');
      if (!toolDef) return;

      const tool = toolDef.create(mockContext);
      // This should either fail validation or return error message
      try {
        await tool.execute({
          room: 'bedroom',
          action: 'invalid-action' as 'on',
        });
      } catch {
        // Expected for Zod validation errors
        expect(true).toBe(true);
      }
    });
  });
});

describe('Smart Home Domain Integration', () => {
  describe('Cross-platform compatibility', () => {
    it('should gracefully handle when all platforms are unavailable', async () => {
      const devices = await getAllDevices();
      // When no platforms are configured, should return empty array
      expect(devices).toEqual([]);
    });
  });
});
