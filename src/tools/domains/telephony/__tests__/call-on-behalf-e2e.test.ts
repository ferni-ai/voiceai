/**
 * Call On Behalf E2E Flow Tests
 *
 * Tests the complete flow from initiating a call through receiving Twilio
 * status updates and delivering results to the user.
 *
 * Flow: Tool → Orchestrator → Twilio → Webhook → Capture → Notifications
 *
 * Run with: npx vitest run src/tools/domains/telephony/__tests__/call-on-behalf-e2e.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';

// Mock dependencies before imports
vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  safeLog: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

// Mock Firestore utils
vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null),

  cleanForFirestore: vi.fn((obj) => {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) return obj.map((item) => item);
    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          result[key] = value;
        }
      }
      return result;
    }
    return obj;
  }),
  removeUndefined: vi.fn((obj) => {
    if (!obj) return obj;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }),
  deepRemoveUndefined: vi.fn((obj) => obj),
  recordDegradation: vi.fn(),
  getFirestoreHealth: vi.fn(() => ({
    dbAvailable: true,
    initialized: true,
    initializationError: null,
    degradationCount: 0,
    recentDegradations: [],
    lastDegradationAt: null,
  })),
  resetFirestoreInstance: vi.fn(),
}));

// Mock push notifications
vi.mock('../../../../services/outreach/delivery/push-notifications.js', () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
  isPushNotificationsAvailable: vi.fn(() => false),
}));

// Mock LiveKit RoomServiceClient
vi.mock('livekit-server-sdk', () => ({
  RoomServiceClient: vi.fn(() => ({
    listRooms: vi.fn().mockResolvedValue([]),
    sendData: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Import after mocks
import {
  handleTwilioCallStatus,
  trackOutboundCall,
  getPendingCall,
  removePendingCall,
} from '../../../../servers/api/routes/twilio-call-status.js';
import {
  captureCallResult,
  getCallResult,
} from '../../../../services/outreach/call-result-capture.js';
import type { CallOutcome, OnBehalfCallRequest } from '../call-on-behalf.js';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create a mock HTTP request with URL-encoded body (Twilio format)
 */
function createMockTwilioRequest(payload: Record<string, string>): IncomingMessage {
  const body = new URLSearchParams(payload).toString();
  const readable = new Readable();
  readable.push(body);
  readable.push(null);

  const req = readable as unknown as IncomingMessage;
  req.method = 'POST';
  req.headers = {
    'content-type': 'application/x-www-form-urlencoded',
    'content-length': Buffer.byteLength(body).toString(),
  };
  return req;
}

/**
 * Create a mock HTTP response
 */
function createMockResponse(): ServerResponse & {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
} {
  const res = {
    statusCode: 200,
    body: '',
    headers: {} as Record<string, string>,
    writeHead: vi.fn((code: number, headers?: Record<string, string>) => {
      res.statusCode = code;
      if (headers) {
        res.headers = { ...res.headers, ...headers };
      }
      return res;
    }),
    end: vi.fn((data?: string) => {
      if (data) res.body = data;
      return res;
    }),
  };
  return res as unknown as ServerResponse & {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
  };
}

// ============================================================================
// TWILIO WEBHOOK TESTS
// ============================================================================

describe('Twilio Call Status Webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Request Parsing', () => {
    it('should parse URL-encoded body from Twilio', async () => {
      // Track a call first
      trackOutboundCall('CA123abc', {
        callId: 'test-call-1',
        userId: 'user-123',
        contactName: 'Dr. Smith',
        purpose: 'reschedule appointment',
        objective: 'reschedule',
        callType: 'business',
        originalSessionId: 'session-xyz',
        startedAt: new Date().toISOString(),
      });

      const req = createMockTwilioRequest({
        CallSid: 'CA123abc',
        CallStatus: 'completed',
        From: '+14155551234',
        To: '+14155556789',
        CallDuration: '120',
      });

      const res = createMockResponse();
      const handled = await handleTwilioCallStatus(req, res);

      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('should handle unknown CallSid gracefully', async () => {
      const req = createMockTwilioRequest({
        CallSid: 'CA_unknown',
        CallStatus: 'completed',
      });

      const res = createMockResponse();
      const handled = await handleTwilioCallStatus(req, res);

      // Should still respond OK but not process
      expect(handled).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('should handle malformed body gracefully', async () => {
      const readable = new Readable();
      readable.push('not=valid=url=encoding===');
      readable.push(null);

      const req = readable as unknown as IncomingMessage;
      req.method = 'POST';
      req.headers = { 'content-type': 'application/x-www-form-urlencoded' };

      const res = createMockResponse();
      const handled = await handleTwilioCallStatus(req, res);

      // Should handle gracefully without crashing
      expect(handled).toBe(true);
    });
  });

  describe('Status Mapping', () => {
    const testCases = [
      { twilioStatus: 'completed', expectedStatus: 'completed' },
      { twilioStatus: 'busy', expectedStatus: 'busy' },
      { twilioStatus: 'no-answer', expectedStatus: 'no_answer' },
      { twilioStatus: 'failed', expectedStatus: 'failed' },
      { twilioStatus: 'canceled', expectedStatus: 'canceled' },
    ];

    for (const { twilioStatus, expectedStatus } of testCases) {
      it(`should map Twilio status "${twilioStatus}" to "${expectedStatus}"`, async () => {
        const callSid = `CA_${twilioStatus.replace('-', '_')}`;
        trackOutboundCall(callSid, {
          callId: `test-${twilioStatus}`,
          userId: 'user-123',
          contactName: 'Test Contact',
          purpose: 'test',
          objective: 'general',
          callType: 'personal',
          originalSessionId: 'session-123',
          startedAt: new Date().toISOString(),
        });

        const req = createMockTwilioRequest({
          CallSid: callSid,
          CallStatus: twilioStatus,
        });

        const res = createMockResponse();
        await handleTwilioCallStatus(req, res);

        // Verify the pending call was processed and removed
        expect(getPendingCall(callSid)).toBeUndefined();
      });
    }

    it('should not process intermediate statuses (ringing, in-progress)', async () => {
      trackOutboundCall('CA_intermediate', {
        callId: 'test-intermediate',
        userId: 'user-123',
        contactName: 'Test',
        purpose: 'test',
        objective: 'general',
        callType: 'personal',
        originalSessionId: 'session-123',
        startedAt: new Date().toISOString(),
      });

      // Send ringing status - should NOT complete the call
      const req1 = createMockTwilioRequest({
        CallSid: 'CA_intermediate',
        CallStatus: 'ringing',
      });
      await handleTwilioCallStatus(req1, createMockResponse());

      // Call should still be pending
      expect(getPendingCall('CA_intermediate')).toBeDefined();

      // Send in-progress status - should NOT complete
      const req2 = createMockTwilioRequest({
        CallSid: 'CA_intermediate',
        CallStatus: 'in-progress',
      });
      await handleTwilioCallStatus(req2, createMockResponse());

      // Call should still be pending
      expect(getPendingCall('CA_intermediate')).toBeDefined();

      // Finally send completed - should complete
      const req3 = createMockTwilioRequest({
        CallSid: 'CA_intermediate',
        CallStatus: 'completed',
      });
      await handleTwilioCallStatus(req3, createMockResponse());

      // Call should be removed
      expect(getPendingCall('CA_intermediate')).toBeUndefined();
    });
  });

  describe('Call Tracking', () => {
    it('should track and retrieve pending calls', () => {
      const context = {
        callId: 'test-track-1',
        userId: 'user-456',
        contactName: 'Mom',
        purpose: 'check in',
        objective: 'check_in' as const,
        callType: 'personal' as const,
        originalSessionId: 'session-abc',
        startedAt: new Date().toISOString(),
      };

      trackOutboundCall('CA_track_test', context);
      const retrieved = getPendingCall('CA_track_test');

      expect(retrieved).toBeDefined();
      expect(retrieved?.callId).toBe('test-track-1');
      expect(retrieved?.contactName).toBe('Mom');
    });

    it('should remove completed calls', () => {
      trackOutboundCall('CA_remove_test', {
        callId: 'test-remove',
        userId: 'user-789',
        contactName: 'Test',
        purpose: 'test',
        objective: 'general' as const,
        callType: 'personal' as const,
        originalSessionId: 'session-def',
        startedAt: new Date().toISOString(),
      });

      expect(getPendingCall('CA_remove_test')).toBeDefined();

      removePendingCall('CA_remove_test');

      expect(getPendingCall('CA_remove_test')).toBeUndefined();
    });
  });
});

// ============================================================================
// CALL RESULT CAPTURE TESTS
// ============================================================================

describe('Call Result Capture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('captureCallResult', () => {
    it('should store call result with all required fields', async () => {
      const outcome: CallOutcome = {
        callId: 'capture-test-1',
        status: 'completed',
        outcome: 'Appointment rescheduled to next Tuesday at 2pm',
        objectiveAchieved: true,
        callbackRequired: false,
      };

      const request: OnBehalfCallRequest = {
        userId: 'user-capture-1',
        contactQuery: 'my doctor',
        purpose: 'reschedule appointment',
        objective: 'reschedule',
        callType: 'business',
        originalSessionId: 'session-capture-1',
        userTimezone: 'America/Los_Angeles',
        userName: 'Test User',
        recordingConsent: true,
        resolvedContact: {
          name: 'Dr. Smith',
          phone: '+14155551234',
        },
      };

      await captureCallResult('capture-test-1', outcome, request);

      // Get stored result (from in-memory store since Firestore is mocked)
      const stored = await getCallResult('capture-test-1', 'user-capture-1');

      expect(stored).toBeDefined();
      expect(stored?.outcome.objectiveAchieved).toBe(true);
      expect(stored?.request.contactName).toBe('Dr. Smith');
    });

    it('should handle call failures appropriately', async () => {
      const outcome: CallOutcome = {
        callId: 'capture-fail-1',
        status: 'no_answer',
        outcome: 'No one picked up after 6 rings',
        objectiveAchieved: false,
        callbackRequired: true,
        callbackTime: '2 hours from now',
      };

      const request: OnBehalfCallRequest = {
        userId: 'user-fail-1',
        contactQuery: 'grandma',
        purpose: 'check in on grandma',
        objective: 'check_in',
        callType: 'personal',
        originalSessionId: 'session-fail-1',
        userTimezone: 'America/Los_Angeles',
        userName: 'Test User',
        recordingConsent: false,
        resolvedContact: {
          name: 'Grandma',
          phone: '+14155559876',
        },
      };

      await captureCallResult('capture-fail-1', outcome, request);

      const stored = await getCallResult('capture-fail-1', 'user-fail-1');

      expect(stored).toBeDefined();
      expect(stored?.outcome.status).toBe('no_answer');
      expect(stored?.outcome.callbackRequired).toBe(true);
    });

    it('should handle voicemail outcomes', async () => {
      const outcome: CallOutcome = {
        callId: 'capture-vm-1',
        status: 'voicemail',
        outcome: 'Left voicemail explaining the situation',
        objectiveAchieved: false,
        transcriptSummary: 'Explained need to reschedule and asked them to call back',
      };

      const request: OnBehalfCallRequest = {
        userId: 'user-vm-1',
        contactQuery: 'dentist office',
        purpose: 'cancel appointment',
        objective: 'cancel',
        callType: 'business',
        originalSessionId: 'session-vm-1',
        userTimezone: 'America/Los_Angeles',
        userName: 'Test User',
        recordingConsent: true,
        resolvedContact: {
          name: 'Downtown Dental',
          phone: '+14155551111',
        },
      };

      await captureCallResult('capture-vm-1', outcome, request);

      const stored = await getCallResult('capture-vm-1', 'user-vm-1');

      expect(stored).toBeDefined();
      expect(stored?.outcome.status).toBe('voicemail');
    });
  });

  describe('Follow-up Actions', () => {
    it('should create callback action when callbackRequired is true', async () => {
      const outcome: CallOutcome = {
        callId: 'followup-test-1',
        status: 'busy',
        outcome: 'Line was busy',
        objectiveAchieved: false,
        callbackRequired: true,
        callbackTime: 'in 30 minutes',
      };

      const request: OnBehalfCallRequest = {
        userId: 'user-followup-1',
        contactQuery: 'restaurant',
        purpose: 'make reservation',
        objective: 'reservation',
        callType: 'business',
        originalSessionId: 'session-followup-1',
        userTimezone: 'America/Los_Angeles',
        userName: 'Test User',
        recordingConsent: false,
        resolvedContact: {
          name: 'Italian Restaurant',
          phone: '+14155552222',
        },
      };

      // This should create follow-up actions
      await captureCallResult('followup-test-1', outcome, request);

      // Verify the call was captured
      const stored = await getCallResult('followup-test-1', 'user-followup-1');
      expect(stored).toBeDefined();
      expect(stored?.outcome.callbackRequired).toBe(true);
    });

    it('should create reminder actions for actionItems', async () => {
      const outcome: CallOutcome = {
        callId: 'action-items-1',
        status: 'completed',
        outcome: 'Spoke with the office',
        objectiveAchieved: true,
        actionItems: [
          'Send insurance information by email',
          'Bring ID to next appointment',
          'Fast for 12 hours before appointment',
        ],
      };

      const request: OnBehalfCallRequest = {
        userId: 'user-actions-1',
        contactQuery: 'doctor',
        purpose: 'schedule blood work',
        objective: 'new_appointment',
        callType: 'business',
        originalSessionId: 'session-actions-1',
        userTimezone: 'America/Los_Angeles',
        userName: 'Test User',
        recordingConsent: true,
        resolvedContact: {
          name: 'Dr. Johnson',
          phone: '+14155553333',
        },
      };

      await captureCallResult('action-items-1', outcome, request);

      const stored = await getCallResult('action-items-1', 'user-actions-1');
      expect(stored).toBeDefined();
      expect(stored?.outcome.actionItems).toHaveLength(3);
    });
  });
});

// ============================================================================
// E2E FLOW TESTS
// ============================================================================

describe('E2E Call On Behalf Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should complete full flow: initiate → webhook → capture → result', async () => {
    // Step 1: Simulate orchestrator tracking the call
    const callId = 'e2e-test-1';
    const twilioSid = 'CA_e2e_test_123';

    trackOutboundCall(twilioSid, {
      callId,
      userId: 'user-e2e-1',
      contactName: 'Dr. Smith',
      purpose: 'reschedule appointment to next week',
      objective: 'reschedule',
      callType: 'business',
      originalSessionId: 'session-e2e-1',
      startedAt: new Date().toISOString(),
    });

    // Verify call is tracked
    expect(getPendingCall(twilioSid)).toBeDefined();

    // Step 2: Simulate Twilio webhooks (status progression)
    // First: initiated
    await handleTwilioCallStatus(
      createMockTwilioRequest({ CallSid: twilioSid, CallStatus: 'initiated' }),
      createMockResponse()
    );
    expect(getPendingCall(twilioSid)).toBeDefined(); // Still pending

    // Then: ringing
    await handleTwilioCallStatus(
      createMockTwilioRequest({ CallSid: twilioSid, CallStatus: 'ringing' }),
      createMockResponse()
    );
    expect(getPendingCall(twilioSid)).toBeDefined(); // Still pending

    // Then: in-progress
    await handleTwilioCallStatus(
      createMockTwilioRequest({ CallSid: twilioSid, CallStatus: 'in-progress' }),
      createMockResponse()
    );
    expect(getPendingCall(twilioSid)).toBeDefined(); // Still pending

    // Finally: completed
    await handleTwilioCallStatus(
      createMockTwilioRequest({
        CallSid: twilioSid,
        CallStatus: 'completed',
        CallDuration: '120',
      }),
      createMockResponse()
    );

    // Step 3: Verify call was removed from pending
    expect(getPendingCall(twilioSid)).toBeUndefined();

    // Step 4: Verify result was captured
    const result = await getCallResult(callId, 'user-e2e-1');
    expect(result).toBeDefined();
    expect(result?.outcome.status).toBe('completed');
  });

  it('should handle failed call flow correctly', async () => {
    const callId = 'e2e-fail-1';
    const twilioSid = 'CA_e2e_fail';

    trackOutboundCall(twilioSid, {
      callId,
      userId: 'user-e2e-fail',
      contactName: 'Restaurant',
      purpose: 'make reservation',
      objective: 'reservation',
      callType: 'business',
      originalSessionId: 'session-e2e-fail',
      startedAt: new Date().toISOString(),
    });

    // Simulate failure
    await handleTwilioCallStatus(
      createMockTwilioRequest({ CallSid: twilioSid, CallStatus: 'failed' }),
      createMockResponse()
    );

    // Verify call was processed
    expect(getPendingCall(twilioSid)).toBeUndefined();

    const result = await getCallResult(callId, 'user-e2e-fail');
    expect(result).toBeDefined();
    expect(result?.outcome.status).toBe('failed');
  });

  it('should handle no-answer with callback required', async () => {
    const callId = 'e2e-noanswer-1';
    const twilioSid = 'CA_e2e_noanswer';

    trackOutboundCall(twilioSid, {
      callId,
      userId: 'user-e2e-noanswer',
      contactName: 'Mom',
      purpose: 'check in',
      objective: 'check_in',
      callType: 'personal',
      originalSessionId: 'session-e2e-noanswer',
      startedAt: new Date().toISOString(),
    });

    await handleTwilioCallStatus(
      createMockTwilioRequest({ CallSid: twilioSid, CallStatus: 'no-answer' }),
      createMockResponse()
    );

    const result = await getCallResult(callId, 'user-e2e-noanswer');
    expect(result).toBeDefined();
    expect(result?.outcome.status).toBe('no_answer');
    // Personal calls with no-answer should suggest callback
    expect(result?.outcome.callbackRequired).toBe(true);
  });

  it('should handle busy signal with retry suggestion', async () => {
    const callId = 'e2e-busy-1';
    const twilioSid = 'CA_e2e_busy';

    trackOutboundCall(twilioSid, {
      callId,
      userId: 'user-e2e-busy',
      contactName: 'Office',
      purpose: 'inquiry',
      objective: 'inquiry',
      callType: 'business',
      originalSessionId: 'session-e2e-busy',
      startedAt: new Date().toISOString(),
    });

    await handleTwilioCallStatus(
      createMockTwilioRequest({ CallSid: twilioSid, CallStatus: 'busy' }),
      createMockResponse()
    );

    const result = await getCallResult(callId, 'user-e2e-busy');
    expect(result).toBeDefined();
    expect(result?.outcome.status).toBe('busy');
    expect(result?.outcome.callbackRequired).toBe(true);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle duplicate webhook calls gracefully', async () => {
    const twilioSid = 'CA_duplicate';

    trackOutboundCall(twilioSid, {
      callId: 'duplicate-test',
      userId: 'user-dup',
      contactName: 'Test',
      purpose: 'test',
      objective: 'general',
      callType: 'personal',
      originalSessionId: 'session-dup',
      startedAt: new Date().toISOString(),
    });

    // First completed webhook - should process
    await handleTwilioCallStatus(
      createMockTwilioRequest({ CallSid: twilioSid, CallStatus: 'completed' }),
      createMockResponse()
    );

    // Second completed webhook (duplicate) - should handle gracefully
    const res = createMockResponse();
    await handleTwilioCallStatus(
      createMockTwilioRequest({ CallSid: twilioSid, CallStatus: 'completed' }),
      res
    );

    // Should still return OK (Twilio retries need 200)
    expect(res.statusCode).toBe(200);
  });

  it('should handle calls with missing contact name', async () => {
    const outcome: CallOutcome = {
      callId: 'no-name-test',
      status: 'completed',
      outcome: 'Call completed',
      objectiveAchieved: true,
    };

    const request: OnBehalfCallRequest = {
      userId: 'user-no-name',
      contactQuery: '+14155551234', // Phone number as query
      purpose: 'test',
      objective: 'general',
      callType: 'personal',
      originalSessionId: 'session-no-name',
      userTimezone: 'America/Los_Angeles',
      userName: 'Test User',
      recordingConsent: false,
      // No resolvedContact
    };

    await captureCallResult('no-name-test', outcome, request);

    const result = await getCallResult('no-name-test', 'user-no-name');
    expect(result).toBeDefined();
    expect(result?.request.contactQuery).toBe('+14155551234');
  });

  it('should handle long calls', async () => {
    const outcome: CallOutcome = {
      callId: 'long-call',
      status: 'completed',
      outcome: 'Long conversation about treatment plan - discussed all treatment options in detail',
      objectiveAchieved: true,
    };

    const request: OnBehalfCallRequest = {
      userId: 'user-long',
      contactQuery: 'doctor',
      purpose: 'detailed consultation',
      objective: 'inquiry',
      callType: 'business',
      originalSessionId: 'session-long',
      userTimezone: 'America/Los_Angeles',
      userName: 'Test User',
      recordingConsent: true,
      resolvedContact: { name: 'Dr. Long', phone: '+14155551234' },
    };

    await captureCallResult('long-call', outcome, request);

    const result = await getCallResult('long-call', 'user-long');
    expect(result?.outcome.objectiveAchieved).toBe(true);
  });
});
