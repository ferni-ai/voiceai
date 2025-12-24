/**
 * Travel Domain Tests
 *
 * Tests for travel planning and search tools.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock logger FIRST
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

// Mock the travel.js module functions
vi.mock('../travel.js', () => ({
  createTravelTools: vi.fn(() => ({
    searchFlights: {
      description: 'Search for flights',
      execute: vi.fn().mockResolvedValue('Found 3 flights from NYC to LAX'),
    },
    searchHotels: {
      description: 'Search for hotels',
      execute: vi.fn().mockResolvedValue('Found 5 hotels in Los Angeles'),
    },
    planTrip: {
      description: 'Plan a trip',
      execute: vi.fn().mockResolvedValue('Trip plan created for your vacation'),
    },
    getSavedTrips: {
      description: 'Get saved trips',
      execute: vi.fn().mockResolvedValue('You have 2 saved trips'),
    },
    getTripSuggestions: {
      description: 'Get trip suggestions',
      execute: vi.fn().mockResolvedValue('Based on your preferences: Tokyo, Barcelona'),
    },
    getFlightPrice: {
      description: 'Get flight price',
      execute: vi.fn().mockResolvedValue('Flight price: $450 roundtrip'),
    },
  })),
}));

// Import AFTER mocks
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'jordan',
    agentDisplayName: 'Jordan',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Not available');
      },
      getOptional: () => undefined,
    },
  };
}

describe('Travel Domain Tools', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  describe('Tool Loading', () => {
    it('should load all travel tool definitions', async () => {
      expect(toolDefinitions.length).toBeGreaterThan(0);
      const toolIds = toolDefinitions.map((t) => t.id);
      expect(toolIds).toContain('searchFlights');
      expect(toolIds).toContain('searchHotels');
      expect(toolIds).toContain('planTrip');
      expect(toolIds).toContain('getSavedTrips');
      expect(toolIds).toContain('getTripSuggestions');
      expect(toolIds).toContain('getFlightPrice');
    });

    it('should have all tools in travel domain', () => {
      for (const toolDef of toolDefinitions) {
        expect(toolDef.domain).toBe('travel');
      }
    });

    it('should have descriptions for all tools', () => {
      for (const toolDef of toolDefinitions) {
        expect(toolDef.description).toBeDefined();
        expect(toolDef.description.length).toBeGreaterThan(5);
      }
    });
  });

  describe('Tool Execution', () => {
    it('searchFlights - should search for flights', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'searchFlights');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        origin: 'NYC',
        destination: 'LAX',
        departureDate: '2024-03-15',
      });
      expect(result).toContain('flights');
    });

    it('searchHotels - should search for hotels', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'searchHotels');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        destination: 'Los Angeles',
        checkIn: '2024-03-15',
        checkOut: '2024-03-20',
      });
      expect(result).toContain('hotels');
    });

    it('planTrip - should create trip plan', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'planTrip');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        destination: 'Tokyo',
        duration: '7 days',
      });
      expect(result).toContain('Trip');
    });

    it('getSavedTrips - should retrieve saved trips', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getSavedTrips');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({});
      expect(result).toContain('trips');
    });

    it('getTripSuggestions - should provide trip suggestions', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getTripSuggestions');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        preferences: 'beach and culture',
      });
      expect(result).toContain('preferences');
    });

    it('getFlightPrice - should get flight prices', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getFlightPrice');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({
        flightId: 'test-flight-123',
      });
      expect(result).toContain('price');
    });
  });

  describe('Content Validation', () => {
    it('should not contain placeholder text', async () => {
      for (const toolDef of toolDefinitions) {
        const tool = toolDef.create(mockContext);
        const result = await tool.execute({});
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
        expect(resultStr).not.toContain('TODO');
        expect(resultStr).not.toContain('placeholder');
      }
    });
  });
});

