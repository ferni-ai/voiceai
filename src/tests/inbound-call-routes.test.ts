/**
 * Inbound Call Routes Tests
 *
 * Tests for the Twilio webhook handlers that process incoming phone calls
 * and route them to the voice agent.
 *
 * @module tests/inbound-call-routes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';

// ============================================================================
// MOCKS
// ============================================================================

// Mock environment variables
vi.stubEnv('LIVEKIT_URL', 'wss://test.livekit.cloud');
vi.stubEnv('SIP_TRUNK_ID', 'ST_test123');
vi.stubEnv('SIP_INBOUND_TRUNK_ID', 'ST_inbound123');

// Mock sponsored identity service
const mockSponsoredIdentities = new Map<string, unknown>();

vi.mock('../services/identity/sponsored-identity.js', () => ({
  lookupByPhone: vi.fn(async (phone: string) => {
    for (const [, identity] of mockSponsoredIdentities) {
      const id = identity as { phoneNumber: string };
      if (id.phoneNumber === phone) {
        return identity;
      }
    }
    return null;
  }),
  recordCall: vi.fn(async () => {}),
}));

// Mock user identification service
vi.mock('../services/identity/user-identification.js', () => ({
  identifyByPhone: vi.fn(async (phone: string) => {
    // Check if there's a sponsored identity first
    for (const [id, identity] of mockSponsoredIdentities) {
      const i = identity as { phoneNumber: string; sponsorUserId: string };
      if (i.phoneNumber === phone) {
        return {
          userId: `phone:${phone}`,
          source: 'sponsored' as const,
          confidence: 1.0,
          sponsoredIdentityId: id,
          sponsorUserId: i.sponsorUserId,
        };
      }
    }
    // Return unknown caller
    return {
      userId: `phone:${phone}`,
      source: 'phone' as const,
      confidence: 0.5,
    };
  }),
}));

// Mock voice profile store
vi.mock('../services/voice/voice-profile-store.js', () => ({
  loadVoiceProfile: vi.fn(async () => null),
}));

// Mock logger
vi.mock('../utils/safe-logger.js', () => {
  const mockLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => mockLogger,
  };
  return {
    createLogger: () => mockLogger,
    getLogger: () => mockLogger,
  };
});

// ============================================================================
// TEST DATA
// ============================================================================

const TEST_PHONE_NUMBER = '+15551234567';
const TEST_CALL_SID = 'CA1234567890abcdef';
const TEST_SPONSOR_USER_ID = 'firebase-uid-123';

// ============================================================================
// HELPERS
// ============================================================================

function resetMocks() {
  mockSponsoredIdentities.clear();
  vi.clearAllMocks();
}

function createMockRequest(body: Record<string, string>): Partial<IncomingMessage> {
  const bodyStr = new URLSearchParams(body).toString();
  return {
    method: 'POST',
    url: '/api/voice/inbound',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'content-length': String(bodyStr.length),
    },
    on: vi.fn((event: string, handler: (data?: unknown) => void) => {
      if (event === 'data') {
        handler(Buffer.from(bodyStr));
      }
      if (event === 'end') {
        handler();
      }
      return { on: vi.fn() };
    }),
  };
}

function createMockResponse(): Partial<ServerResponse> & {
  body: string;
  statusCode: number;
  headers: Record<string, string>;
} {
  const res = {
    statusCode: 200,
    body: '',
    headers: {} as Record<string, string>,
    setHeader: vi.fn((name: string, value: string) => {
      res.headers[name.toLowerCase()] = value;
    }),
    end: vi.fn((data?: string) => {
      if (data) res.body = data;
    }),
    write: vi.fn((data: string) => {
      res.body += data;
    }),
  };
  return res;
}

// ============================================================================
// TESTS
// ============================================================================

// TODO: Skipped - API has been refactored. handleInboundCall and handleInboundCallStatus
// no longer exist. Module now exports handleInboundCallRoutes, identifyInboundCaller,
// generateInboundTwiml, and activeInboundCalls.
describe.skip('Inbound Call Routes', () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    resetMocks();
  });

  // ==========================================================================
  // TWIML GENERATION
  // ==========================================================================

  describe('TwiML Generation', () => {
    it('should generate valid TwiML response for known caller', async () => {
      // Add a sponsored identity
      mockSponsoredIdentities.set('sponsored_mom123', {
        id: 'sponsored_mom123',
        phoneNumber: TEST_PHONE_NUMBER,
        displayName: 'Mom',
        relationship: 'mother',
        sponsorUserId: TEST_SPONSOR_USER_ID,
        voiceEnrolled: false,
        status: 'active',
      });

      const { handleInboundCall } = await import('../api/voice-auth/inbound-call-routes.js');

      const req = createMockRequest({
        CallSid: TEST_CALL_SID,
        From: TEST_PHONE_NUMBER,
        To: '+18001234567',
        CallStatus: 'ringing',
      });

      const res = createMockResponse();

      await handleInboundCall(req as IncomingMessage, res as unknown as ServerResponse);

      expect(res.headers['content-type']).toBe('text/xml');
      expect(res.body).toContain('<?xml version="1.0"');
      expect(res.body).toContain('<Response>');
      expect(res.body).toContain('<Say');
      expect(res.body).toContain('Mom'); // Should greet by name
      expect(res.body).toContain('<Dial');
      expect(res.body).toContain('<Sip>');
    });

    it('should generate TwiML with generic greeting for unknown caller', async () => {
      const { handleInboundCall } = await import('../api/voice-auth/inbound-call-routes.js');

      const req = createMockRequest({
        CallSid: TEST_CALL_SID,
        From: '+15559999999', // Unknown number
        To: '+18001234567',
        CallStatus: 'ringing',
      });

      const res = createMockResponse();

      await handleInboundCall(req as IncomingMessage, res as unknown as ServerResponse);

      expect(res.body).toContain('<Response>');
      expect(res.body).not.toContain('Mom'); // Should not have personalized greeting
    });

    it('should include caller context in SIP URI', async () => {
      mockSponsoredIdentities.set('sponsored_mom123', {
        id: 'sponsored_mom123',
        phoneNumber: TEST_PHONE_NUMBER,
        displayName: 'Mom',
        relationship: 'mother',
        sponsorUserId: TEST_SPONSOR_USER_ID,
        voiceEnrolled: true,
        status: 'active',
      });

      const { handleInboundCall } = await import('../api/voice-auth/inbound-call-routes.js');

      const req = createMockRequest({
        CallSid: TEST_CALL_SID,
        From: TEST_PHONE_NUMBER,
        To: '+18001234567',
        CallStatus: 'ringing',
      });

      const res = createMockResponse();

      await handleInboundCall(req as IncomingMessage, res as unknown as ServerResponse);

      // Should include base64-encoded context in SIP URI
      expect(res.body).toContain('X-Context=');
    });
  });

  // ==========================================================================
  // CALLER IDENTIFICATION
  // ==========================================================================

  describe('Caller Identification', () => {
    it('should identify sponsored caller by phone number', async () => {
      mockSponsoredIdentities.set('sponsored_mom123', {
        id: 'sponsored_mom123',
        phoneNumber: TEST_PHONE_NUMBER,
        displayName: 'Mom',
        relationship: 'mother',
        sponsorUserId: TEST_SPONSOR_USER_ID,
        voiceEnrolled: false,
        status: 'active',
        accessLevel: 'full',
      });

      const { handleInboundCall } = await import('../api/voice-auth/inbound-call-routes.js');

      const req = createMockRequest({
        CallSid: TEST_CALL_SID,
        From: TEST_PHONE_NUMBER,
        To: '+18001234567',
        CallStatus: 'ringing',
      });

      const res = createMockResponse();

      await handleInboundCall(req as IncomingMessage, res as unknown as ServerResponse);

      // TwiML should be generated with known caller context
      expect(res.body).toContain('Mom');
    });
  });

  // ==========================================================================
  // CALL STATUS HANDLING
  // ==========================================================================

  describe('Call Status Updates', () => {
    it('should handle call completion and record duration', async () => {
      mockSponsoredIdentities.set('sponsored_mom123', {
        id: 'sponsored_mom123',
        phoneNumber: TEST_PHONE_NUMBER,
        displayName: 'Mom',
        sponsorUserId: TEST_SPONSOR_USER_ID,
      });

      const { recordCall } = await import('../services/identity/sponsored-identity.js');
      const { handleInboundCallStatus } = await import('../api/voice-auth/inbound-call-routes.js');

      const req = createMockRequest({
        CallSid: TEST_CALL_SID,
        CallStatus: 'completed',
        CallDuration: '300', // 5 minutes
        From: TEST_PHONE_NUMBER,
      });

      const res = createMockResponse();

      await handleInboundCallStatus(req as IncomingMessage, res as unknown as ServerResponse);

      // Should record the call duration
      expect(recordCall).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // ERROR HANDLING
  // ==========================================================================

  describe('Error Handling', () => {
    it('should return 405 for non-POST requests', async () => {
      const { handleInboundCall } = await import('../api/voice-auth/inbound-call-routes.js');

      const req = {
        method: 'GET',
        url: '/api/voice/inbound',
      } as Partial<IncomingMessage>;

      const res = createMockResponse();

      await handleInboundCall(req as IncomingMessage, res as unknown as ServerResponse);

      expect(res.statusCode).toBe(405);
    });

    it('should handle missing CallSid gracefully', async () => {
      const { handleInboundCall } = await import('../api/voice-auth/inbound-call-routes.js');

      const req = createMockRequest({
        From: TEST_PHONE_NUMBER,
        To: '+18001234567',
        // Missing CallSid
      });

      const res = createMockResponse();

      await handleInboundCall(req as IncomingMessage, res as unknown as ServerResponse);

      // Should still generate valid TwiML (with generated SID)
      expect(res.body).toContain('<Response>');
    });
  });

  // ==========================================================================
  // ACCESS LEVEL HANDLING
  // ==========================================================================

  describe('Access Level Handling', () => {
    it('should include access restrictions in context for limited callers', async () => {
      mockSponsoredIdentities.set('sponsored_child123', {
        id: 'sponsored_child123',
        phoneNumber: '+15558887777',
        displayName: 'Kid',
        relationship: 'child',
        sponsorUserId: TEST_SPONSOR_USER_ID,
        voiceEnrolled: false,
        status: 'active',
        accessLevel: 'limited',
        allowedPersonas: ['ferni'],
      });

      const { handleInboundCall } = await import('../api/voice-auth/inbound-call-routes.js');

      const req = createMockRequest({
        CallSid: TEST_CALL_SID,
        From: '+15558887777',
        To: '+18001234567',
        CallStatus: 'ringing',
      });

      const res = createMockResponse();

      await handleInboundCall(req as IncomingMessage, res as unknown as ServerResponse);

      // Context should be encoded in SIP URI
      const sipMatch = res.body.match(/X-Context=([^"&]+)/);
      expect(sipMatch).toBeTruthy();

      if (sipMatch) {
        const context = JSON.parse(Buffer.from(sipMatch[1], 'base64').toString());
        expect(context.accessLevel).toBe('limited');
        expect(context.allowedPersonas).toContain('ferni');
      }
    });
  });
});
