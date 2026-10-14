/**
 * Concierge Domain Tests
 *
 * Nothing can call, text or email a business yet. The phone caller only ever
 * faked calls and invented prices and bookings, which these tools reported to
 * the user as real. These tests pin that every concierge action now says it
 * can't do it, starts no outreach, and never reads back stored results.
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

// The service is mocked with working fakes, so any path that still starts
// outreach or reads the tracker would succeed and be caught below.
const { mockRouteRequest, mockGetRequest, mockGetUserRequests, mockPhoneCall, mockPhoneCaller } =
  vi.hoisted(() => ({
    mockRouteRequest: vi.fn(),
    mockGetRequest: vi.fn(),
    mockGetUserRequests: vi.fn(),
    mockPhoneCall: vi.fn(),
    mockPhoneCaller: vi.fn(),
  }));

vi.mock('../../../../services/concierge/index.js', () => ({
  createConciergeRouter: vi.fn(() => ({ routeRequest: mockRouteRequest })),
  getTaskTracker: vi.fn(() => ({
    getRequest: mockGetRequest,
    getUserRequests: mockGetUserRequests,
    updateStatus: vi.fn(),
    updateTargetStatus: vi.fn(),
    addResult: vi.fn(),
    isRequestComplete: vi.fn(() => false),
  })),
  PhoneCaller: mockPhoneCaller,
  registerNotifier: vi.fn(() => Promise.resolve()),
}));

const mockCalendarPrep = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/superhuman/calendar-prep-coaching.js', () => ({
  buildCalendarPrepContext: (...args: unknown[]) => mockCalendarPrep(...args),
}));

// Import after mocks
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import {
  CONCIERGE_CANT_CALL,
  CONCIERGE_NOTHING_IN_PROGRESS,
  definitions,
  getToolDefinitions,
} from '../index.js';

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'alex-chen',
    agentDisplayName: 'Alex',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Service not available in test');
      },
      getOptional: () => undefined,
    },
  };
}

/** Phrases that would tell the user a business was contacted or a booking exists. */
const FALSE_CLAIM =
  /I'm (now )?calling|I'll call|I'm on it|I'll (text|compare)|booked for|reference|confirmed|\$\d/i;

const ACTION_CALLS: Array<[string, Record<string, unknown>]> = [
  [
    'requestHotelQuotes',
    { destination: 'Miami', checkIn: '2026-11-01', checkOut: '2026-11-03', guests: 2 },
  ],
  [
    'makeRestaurantReservation',
    { restaurantName: 'Nobu', location: 'Miami', date: '2026-11-01', partySize: 4 },
  ],
  [
    'scheduleHealthcareAppointment',
    { providerType: 'dentist', location: 'Austin', urgency: 'urgent' },
  ],
  [
    'getServiceQuotes',
    { serviceType: 'plumber', description: 'leaky faucet', location: 'Austin', maxBudget: 300 },
  ],
];

describe('Concierge Domain', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  async function run(id: string, args: Record<string, unknown>): Promise<string> {
    const toolDef = toolDefinitions.find((t) => t.id === id);
    if (!toolDef) throw new Error(`${id} not registered`);
    return String(await toolDef.create(mockContext).execute(args));
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();

    mockRouteRequest.mockResolvedValue({ success: true, requestId: 'req-1', estimatedTargets: 5 });
    mockPhoneCall.mockResolvedValue({ success: true, result: { summary: '$189/night' } });
    mockPhoneCaller.mockImplementation(() => ({ call: mockPhoneCall }));
    // A request left over from when calls were faked, with an invented result.
    const stored = {
      id: 'req-old',
      description: 'Find hotel rates in Miami',
      status: 'completed',
      domain: 'hotel',
      targets: [{ id: 't1' }],
      results: [{ success: true, summary: 'Hotel A: $189/night, ref SVC123456' }],
    };
    mockGetRequest.mockResolvedValue(stored);
    mockGetUserRequests.mockResolvedValue([stored]);
    mockCalendarPrep.mockResolvedValue('');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Tool Loading', () => {
    it('keeps every concierge tool registered in the concierge domain', () => {
      expect(Array.isArray(definitions)).toBe(true);
      const toolIds = toolDefinitions.map((t) => t.id);
      for (const id of [
        'requestHotelQuotes',
        'makeRestaurantReservation',
        'scheduleHealthcareAppointment',
        'getServiceQuotes',
        'checkConciergeStatus',
        'prepareForUpcomingEvent',
        'proactiveConciergeCheckIn',
      ]) {
        expect(toolIds).toContain(id);
      }
      for (const tool of toolDefinitions) {
        expect(tool.domain).toBe('concierge');
      }
    });
  });

  describe.each(ACTION_CALLS)('%s', (id, args) => {
    it('says it cannot call and starts no outreach', async () => {
      const result = await run(id, args);

      expect(result).toBe(CONCIERGE_CANT_CALL);
      expect(result).not.toMatch(FALSE_CLAIM);
      expect(mockRouteRequest).not.toHaveBeenCalled();
      expect(mockPhoneCaller).not.toHaveBeenCalled();
      expect(mockPhoneCall).not.toHaveBeenCalled();
    });

    it("tells the model to relay the result, not that it's calling", () => {
      const tool = toolDefinitions.find((t) => t.id === id)!.create(mockContext) as {
        description: string;
      };
      expect(tool.description).toMatch(/isn't available yet/);
      expect(tool.description).not.toMatch(/by calling/i);
    });
  });

  describe('checkConciergeStatus', () => {
    it('never reads back stored (invented) results', async () => {
      for (const args of [{}, { requestId: 'req-old' }]) {
        const result = await run('checkConciergeStatus', args);
        expect(result).toBe(CONCIERGE_NOTHING_IN_PROGRESS);
        expect(result).not.toMatch(/\$189|SVC123456|completed/);
      }
      expect(mockGetRequest).not.toHaveBeenCalled();
      expect(mockGetUserRequests).not.toHaveBeenCalled();
    });
  });

  describe('proactiveConciergeCheckIn', () => {
    it.each([
      ['without calendar context', ''],
      ['with calendar context', 'Dinner with Sam on Friday'],
    ])('does not offer to call businesses %s', async (_label, prep) => {
      mockCalendarPrep.mockResolvedValue(prep);
      const result = await run('proactiveConciergeCheckIn', {});
      expect(result).toContain("I can't call businesses for you yet");
      expect(result).not.toMatch(/I can call|Make any reservations\?|I can get hotel quotes/);
    });
  });

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
});
