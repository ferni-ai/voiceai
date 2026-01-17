/**
 * Concierge Domain Tests
 *
 * CRITICAL: These tools make actual phone calls to businesses.
 * Tests validate:
 * - Tool creation and parameter validation
 * - Proper error handling
 * - Rate limiting awareness
 * - Response formatting
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies BEFORE importing
vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

// Mock concierge service
const mockRouteRequest = vi.fn();
const mockGetRequest = vi.fn();
const mockGetUserRequests = vi.fn();

vi.mock('../../../../services/concierge/index.js', () => ({
  createConciergeRouter: vi.fn(() => ({
    routeRequest: mockRouteRequest,
  })),
  getTaskTracker: vi.fn(() => ({
    getRequest: mockGetRequest,
    getUserRequests: mockGetUserRequests,
    updateStatus: vi.fn(),
    updateTargetStatus: vi.fn(),
    addResult: vi.fn(),
    isRequestComplete: vi.fn(() => false),
  })),
  PhoneCaller: vi.fn().mockImplementation(() => ({
    call: vi.fn(() => Promise.resolve({ success: true, result: { price: '$200' } })),
  })),
  registerNotifier: vi.fn(() => Promise.resolve()),
}));

// Mock superhuman calendar prep
vi.mock('../../../../services/superhuman/calendar-prep-coaching.js', () => ({
  buildCalendarPrepContext: vi.fn(() => Promise.resolve('')),
}));

// Import after mocks
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions, definitions } from '../index.js';

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Service not available in test');
      },
      getOptional: () => undefined,
    },
  };
}

describe('Concierge Domain', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();

    // Default mock responses
    mockRouteRequest.mockResolvedValue({
      success: true,
      requestId: 'req-123',
      estimatedTargets: 5,
    });

    mockGetRequest.mockResolvedValue(null);
    mockGetUserRequests.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ============================================================================
  // TOOL LOADING TESTS
  // ============================================================================

  describe('Tool Loading', () => {
    it('should load all concierge tool definitions', () => {
      expect(toolDefinitions).toBeDefined();
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });

    it('should export definitions array', () => {
      expect(definitions).toBeDefined();
      expect(Array.isArray(definitions)).toBe(true);
    });

    it('should have expected tools', () => {
      const toolIds = toolDefinitions.map((t) => t.id);
      expect(toolIds).toContain('requestHotelQuotes');
      expect(toolIds).toContain('makeRestaurantReservation');
      expect(toolIds).toContain('scheduleHealthcareAppointment');
      expect(toolIds).toContain('getServiceQuotes');
      expect(toolIds).toContain('checkConciergeStatus');
    });

    it('should have domain set to concierge for all tools', () => {
      for (const tool of toolDefinitions) {
        expect(tool.domain).toBe('concierge');
      }
    });
  });

  // ============================================================================
  // HOTEL QUOTES TESTS
  // ============================================================================

  describe('requestHotelQuotes', () => {
    it('should create tool successfully', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'requestHotelQuotes');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      expect(tool).toBeDefined();
      expect(tool.execute).toBeDefined();
    });

    it('should initiate hotel search', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'requestHotelQuotes')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({
        destination: 'Miami',
        checkIn: '2024-03-15',
        checkOut: '2024-03-18',
        guests: 2,
      });

      expect(result).toContain('Miami');
      expect(result).toContain('hotels');
      expect(mockRouteRequest).toHaveBeenCalled();
    });

    it('should handle route request failure', async () => {
      mockRouteRequest.mockResolvedValue({
        success: false,
        error: 'No hotels available',
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'requestHotelQuotes')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({
        destination: 'Mars',
        checkIn: '2024-03-15',
        checkOut: '2024-03-18',
      });

      expect(result).toContain("couldn't start");
      expect(result).toContain('No hotels available');
    });

    it('should handle optional parameters', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'requestHotelQuotes')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({
        destination: 'Miami',
        checkIn: '2024-03-15',
        checkOut: '2024-03-18',
        rooms: 2,
        roomType: 'suite',
        maxBudget: 300,
      });

      expect(result).toContain('Miami');
      expect(mockRouteRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          location: 'Miami',
          rooms: 2,
          roomType: 'suite',
          budget: { max: 300 },
        }),
        expect.any(Object)
      );
    });
  });

  // ============================================================================
  // RESTAURANT RESERVATION TESTS
  // ============================================================================

  describe('makeRestaurantReservation', () => {
    it('should create tool successfully', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'makeRestaurantReservation');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      expect(tool).toBeDefined();
    });

    it('should initiate reservation for specific restaurant', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'makeRestaurantReservation')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({
        restaurantName: 'Nobu',
        location: 'Miami',
        date: '2024-03-15',
        partySize: 4,
      });

      expect(result).toContain('Nobu');
      expect(result).toContain('4');
      expect(mockRouteRequest).toHaveBeenCalled();
    });

    it('should search by cuisine type', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'makeRestaurantReservation')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({
        cuisine: 'Italian',
        location: 'San Francisco',
        date: '2024-03-15',
        partySize: 2,
      });

      expect(result).toContain('Italian');
      expect(mockRouteRequest).toHaveBeenCalled();
    });

    it('should handle dietary restrictions', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'makeRestaurantReservation')!;
      const tool = toolDef.create(mockContext);

      await tool.execute({
        location: 'NYC',
        date: '2024-03-15',
        partySize: 4,
        dietaryRestrictions: ['vegan', 'gluten-free'],
      });

      expect(mockRouteRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          dietaryRestrictions: ['vegan', 'gluten-free'],
        }),
        expect.any(Object)
      );
    });
  });

  // ============================================================================
  // HEALTHCARE APPOINTMENT TESTS
  // ============================================================================

  describe('scheduleHealthcareAppointment', () => {
    it('should create tool successfully', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'scheduleHealthcareAppointment');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      expect(tool).toBeDefined();
    });

    it('should initiate appointment search', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'scheduleHealthcareAppointment')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({
        providerType: 'dentist',
        location: 'Chicago',
      });

      expect(result).toContain('dentist');
      expect(result).toContain('Chicago');
      expect(mockRouteRequest).toHaveBeenCalled();
    });

    it('should handle urgency levels', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'scheduleHealthcareAppointment')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({
        providerType: 'dermatologist',
        location: 'NYC',
        urgency: 'urgent',
      });

      expect(result).toContain('prioritizing');
      expect(result).toContain('soonest');
    });

    it('should include insurance provider', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'scheduleHealthcareAppointment')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({
        providerType: 'primary care',
        location: 'LA',
        insuranceProvider: 'Blue Cross',
      });

      expect(result).toContain('Blue Cross');
      expect(mockRouteRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          insuranceProvider: 'Blue Cross',
        }),
        expect.any(Object)
      );
    });
  });

  // ============================================================================
  // SERVICE QUOTES TESTS
  // ============================================================================

  describe('getServiceQuotes', () => {
    it('should create tool successfully', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getServiceQuotes');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      expect(tool).toBeDefined();
    });

    it('should initiate service quote request', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getServiceQuotes')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({
        serviceType: 'plumber',
        description: 'leaky faucet in kitchen',
        location: 'Austin',
      });

      expect(result).toContain('plumber');
      expect(result).toContain('Austin');
      expect(result).toContain('quotes');
      expect(mockRouteRequest).toHaveBeenCalled();
    });

    it('should handle budget constraints', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'getServiceQuotes')!;
      const tool = toolDef.create(mockContext);

      await tool.execute({
        serviceType: 'electrician',
        description: 'install ceiling fan',
        location: 'Denver',
        maxBudget: 500,
      });

      expect(mockRouteRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          budget: { max: 500 },
        }),
        expect.any(Object)
      );
    });
  });

  // ============================================================================
  // CHECK STATUS TESTS
  // ============================================================================

  describe('checkConciergeStatus', () => {
    it('should create tool successfully', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'checkConciergeStatus');
      expect(toolDef).toBeDefined();
      const tool = toolDef!.create(mockContext);
      expect(tool).toBeDefined();
    });

    it('should handle no active requests', async () => {
      mockGetUserRequests.mockResolvedValue([]);

      const toolDef = toolDefinitions.find((t) => t.id === 'checkConciergeStatus')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({});

      expect(result).toContain("don't have any active");
    });

    it('should list active requests', async () => {
      mockGetUserRequests.mockResolvedValue([
        { description: 'Hotel search in Miami', status: 'in_progress' },
        { description: 'Restaurant reservation at Nobu', status: 'completed' },
      ]);

      const toolDef = toolDefinitions.find((t) => t.id === 'checkConciergeStatus')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({});

      expect(result).toContain('Hotel search');
      expect(result).toContain('Restaurant');
      expect(result).toContain('in_progress');
      expect(result).toContain('completed');
    });

    it('should handle specific request lookup', async () => {
      mockGetRequest.mockResolvedValue({
        id: 'req-123',
        description: 'Hotel in Miami',
        status: 'in_progress',
        results: [{ price: '$200' }],
        successCount: 1,
        failureCount: 0,
        enabled: true,
      });

      const toolDef = toolDefinitions.find((t) => t.id === 'checkConciergeStatus')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({ requestId: 'req-123' });

      expect(result).toContain('Hotel in Miami');
      expect(mockGetRequest).toHaveBeenCalledWith('req-123');
    });

    it('should handle request not found', async () => {
      mockGetRequest.mockResolvedValue(null);

      const toolDef = toolDefinitions.find((t) => t.id === 'checkConciergeStatus')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({ requestId: 'nonexistent' });

      expect(result).toContain("couldn't find");
    });
  });

  // ============================================================================
  // ERROR HANDLING TESTS
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      mockRouteRequest.mockRejectedValue(new Error('Network error'));

      const toolDef = toolDefinitions.find((t) => t.id === 'requestHotelQuotes')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({
        destination: 'Miami',
        checkIn: '2024-03-15',
        checkOut: '2024-03-18',
      });

      expect(result).toContain('issue');
      expect(result).not.toContain('Error:');
      expect(result).not.toContain('Network error'); // Don't expose internal errors
    });

    it('should provide retry suggestion on error', async () => {
      mockRouteRequest.mockRejectedValue(new Error('Timeout'));

      const toolDef = toolDefinitions.find((t) => t.id === 'getServiceQuotes')!;
      const tool = toolDef.create(mockContext);

      const result = await tool.execute({
        serviceType: 'plumber',
        description: 'leak',
        location: 'Austin',
      });

      expect(result).toContain('try again');
    });
  });

  // ============================================================================
  // TAG VALIDATION TESTS
  // ============================================================================

  describe('Tag Validation', () => {
    it('should have appropriate tags for each tool', () => {
      const hotelDef = toolDefinitions.find((t) => t.id === 'requestHotelQuotes');
      expect(hotelDef?.tags).toContain('hotel');
      expect(hotelDef?.tags).toContain('travel');
      expect(hotelDef?.tags).toContain('outreach');

      const healthcareDef = toolDefinitions.find((t) => t.id === 'scheduleHealthcareAppointment');
      expect(healthcareDef?.tags).toContain('healthcare');
      expect(healthcareDef?.tags).toContain('appointment');
    });
  });

  // ============================================================================
  // CALENDAR PREP TESTS
  // ============================================================================

  describe('prepareForUpcomingEvent', () => {
    it('should exist as a concierge tool', () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'prepareForUpcomingEvent');
      expect(toolDef).toBeDefined();
      expect(toolDef?.domain).toBe('concierge');
    });
  });
});
