/**
 * E2E Call On Behalf Flow Tests
 *
 * Tests the complete pipeline:
 * 1. Tool invocation → Contact resolution
 * 2. Orchestrator → Twilio call initiation
 * 3. Webhook → Call status processing
 * 4. Result capture → Storage + Notifications
 *
 * Run with: npx vitest run src/tools/domains/telephony/__tests__/e2e-call-on-behalf.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import { Readable } from 'stream';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  createLogger: () => ({
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
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock Twilio client
const mockTwilioCall = vi.hoisted(() => vi.fn());
vi.mock('twilio', () => ({
  default: vi.fn(() => ({
    calls: {
      create: mockTwilioCall,
    },
  })),
}));

// Mock orchestrator - must return valid call ID
const mockOrchestratorInitiateCall = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/outreach/on-behalf-call-orchestrator.js', () => ({
  getOnBehalfCallOrchestrator: vi.fn(() => ({
    initiateCall: mockOrchestratorInitiateCall,
  })),
}));

// Mock contact resolution
const mockSearchContacts = vi.hoisted(() => vi.fn());
vi.mock('../../../../services/contacts/contact-relationship-service.js', () => ({
  searchContacts: mockSearchContacts,
}));

// Mock global services
vi.mock('../../../../services/global-services.js', () => ({
  getGlobalServicesSync: vi.fn(() => ({
    store: {
      getProfile: vi.fn().mockResolvedValue({
        preferredName: 'Test User',
        contactInfo: { timezone: 'America/New_York' },
      }),
    },
  })),
}));

// Mock compliance (always pass for E2E tests)
vi.mock('../compliance.js', async () => {
  const actual = await vi.importActual('../compliance.js');
  return {
    ...actual,
    checkCallCompliance: vi.fn(() => ({
      passed: true,
      issues: [],
      requiredDisclosures: [],
      warnings: [],
    })),
  };
});

// Mock Firestore
const mockFirestoreSet = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockFirestoreAdd = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'mock-doc-id' }));
vi.mock('../../../../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({
            set: mockFirestoreSet,
          }),
          add: mockFirestoreAdd,
        }),
        set: mockFirestoreSet,
      }),
    }),
  }),
}));

// Mock LiveKit for active session injection
const mockRoomServiceListRooms = vi.hoisted(() => vi.fn());
const mockRoomServiceSendData = vi.hoisted(() => vi.fn());
vi.mock('livekit-server-sdk', () => {
  const MockRoomServiceClient = vi.fn().mockImplementation(() => ({
    listRooms: mockRoomServiceListRooms,
    sendData: mockRoomServiceSendData,
  }));
  return { RoomServiceClient: MockRoomServiceClient };
});

// Mock push notifications
const mockSendPushNotification = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockIsPushAvailable = vi.hoisted(() => vi.fn().mockReturnValue(true));
vi.mock('../../../../services/outreach/delivery/push-notifications.js', () => ({
  sendPushNotification: mockSendPushNotification,
  isPushNotificationsAvailable: mockIsPushAvailable,
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import type { ToolContext } from '../../../registry/types.js';
import { createCallOnBehalfTool, registerOnBehalfCallInitiator } from '../call-on-behalf.js';
import {
  handleTwilioCallStatus,
  trackOutboundCall,
  getPendingCall,
} from '../../../../servers/api/routes/twilio-call-status.js';
import { captureCallResult } from '../../../../services/outreach/call-result-capture.js';
import type { CallOutcome, OnBehalfCallRequest } from '../call-on-behalf.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-e2e',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Service not available');
      },
      getOptional: () => undefined,
    },
  };
}

/**
 * Create a mock HTTP request with form-urlencoded body
 */
function createMockRequest(body: Record<string, string>): IncomingMessage {
  const bodyString = new URLSearchParams(body).toString();
  const readable = Readable.from([bodyString]);

  return Object.assign(readable, {
    method: 'POST',
    url: '/api/webhooks/call-status',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
  }) as unknown as IncomingMessage;
}

/**
 * Create a mock HTTP response
 */
function createMockResponse(): ServerResponse & { _statusCode: number; _body: string } {
  const mockRes = {
    _statusCode: 200,
    _body: '',
    writeHead(code: number) {
      mockRes._statusCode = code;
      return mockRes;
    },
    end(data?: string) {
      mockRes._body = data || '';
      return mockRes;
    },
  };

  return mockRes as unknown as ServerResponse & { _statusCode: number; _body: string };
}

// ============================================================================
// E2E TESTS
// ============================================================================

describe('E2E: Call On Behalf Flow', () => {
  let mockContext: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();

    // Set up environment for LiveKit
    process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
    process.env.LIVEKIT_API_KEY = 'test-key';
    process.env.LIVEKIT_API_SECRET = 'test-secret';

    // Default orchestrator mock - returns call ID successfully
    mockOrchestratorInitiateCall.mockResolvedValue('call-mock-id-123');
    // The mocked orchestrator module never self-registers the initiator
    // (the real one does at import time), so register the mock explicitly
    registerOnBehalfCallInitiator(mockOrchestratorInitiateCall);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Complete Happy Path', () => {
    it('should complete the full flow: tool → twilio → webhook → capture → notifications', async () => {
      // Arrange: Set up mock contact
      const mockContact = {
        id: 'contact-1',
        name: 'Dr. Smith',
        phone: '+15551234567',
        relationship: 'doctor',
      };
      mockSearchContacts.mockResolvedValue([mockContact]);

      // Arrange: Set up mock Twilio call
      const twilioCallSid = 'CA' + 'test123456789'.padEnd(32, '0');
      mockTwilioCall.mockResolvedValue({
        sid: twilioCallSid,
        status: 'queued',
      });

      // Arrange: User is connected (active session)
      mockRoomServiceListRooms.mockResolvedValue([{ name: 'session-123' }]);
      mockRoomServiceSendData.mockResolvedValue(undefined);

      // Act 1: Invoke the tool
      const tool = createCallOnBehalfTool(mockContext);
      const toolResult = await tool.execute({
        contactQuery: 'my doctor',
        purpose: 'reschedule my appointment to next week',
      });

      // Assert 1: Tool should indicate call is being placed
      expect(toolResult).toContain('calling');
      expect(toolResult).toContain('Dr. Smith');

      // Simulate: Track the call (normally done by orchestrator)
      trackOutboundCall(twilioCallSid, {
        callId: 'call-e2e-test',
        userId: 'test-user-e2e',
        contactName: 'Dr. Smith',
        purpose: 'reschedule my appointment',
        objective: 'reschedule',
        callType: 'business',
        originalSessionId: 'session-123',
        startedAt: new Date().toISOString(),
      });

      // Assert 2: Call should be tracked
      const pendingCall = getPendingCall(twilioCallSid);
      expect(pendingCall).toBeDefined();
      expect(pendingCall?.contactName).toBe('Dr. Smith');

      // Act 3: Simulate Twilio webhook for completed call
      const webhookPayload = {
        CallSid: twilioCallSid,
        AccountSid: 'ACtest123',
        From: '+15559876543',
        To: '+15551234567',
        CallStatus: 'completed',
        CallDuration: '180',
        Direction: 'outbound-api',
        AnsweredBy: 'human',
      };

      const req = createMockRequest(webhookPayload);
      const res = createMockResponse();

      const handled = await handleTwilioCallStatus(req, res);

      // Assert 3: Webhook should be handled
      expect(handled).toBe(true);
      expect(res._statusCode).toBe(200);

      // Assert 4: Call should no longer be pending (was captured)
      const afterCapture = getPendingCall(twilioCallSid);
      expect(afterCapture).toBeUndefined();

      // Assert 5: Result should be stored in Firestore
      expect(mockFirestoreSet).toHaveBeenCalled();

      // Assert 6: Push notification should be sent
      expect(mockSendPushNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user-e2e',
          title: expect.stringContaining('Dr. Smith'),
          data: expect.objectContaining({
            type: 'on_behalf_call_complete',
            status: 'completed',
          }),
        })
      );
    });

    it('should handle busy signal and schedule callback', async () => {
      const twilioCallSid = 'CA' + 'busy123456789'.padEnd(32, '0');

      // Track a call
      trackOutboundCall(twilioCallSid, {
        callId: 'call-busy-test',
        userId: 'test-user-e2e',
        contactName: 'Mom',
        purpose: 'check in',
        objective: 'check_in',
        callType: 'personal',
        originalSessionId: 'session-456',
        startedAt: new Date().toISOString(),
      });

      // Simulate busy webhook
      const webhookPayload = {
        CallSid: twilioCallSid,
        AccountSid: 'ACtest123',
        From: '+15559876543',
        To: '+15555555555',
        CallStatus: 'busy',
        Direction: 'outbound-api',
      };

      const req = createMockRequest(webhookPayload);
      const res = createMockResponse();

      await handleTwilioCallStatus(req, res);

      // Should send push notification about busy
      expect(mockSendPushNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("Couldn't reach"),
          body: expect.stringContaining('try again'),
        })
      );
    });

    it('should handle voicemail detection', async () => {
      const twilioCallSid = 'CA' + 'vm12345678901'.padEnd(32, '0');

      trackOutboundCall(twilioCallSid, {
        callId: 'call-vm-test',
        userId: 'test-user-e2e',
        contactName: 'Dr. Jones',
        purpose: 'confirm appointment',
        objective: 'inquiry',
        callType: 'business',
        originalSessionId: 'session-789',
        startedAt: new Date().toISOString(),
      });

      // Simulate voicemail detection
      const webhookPayload = {
        CallSid: twilioCallSid,
        AccountSid: 'ACtest123',
        From: '+15559876543',
        To: '+15551112222',
        CallStatus: 'completed',
        CallDuration: '30',
        Direction: 'outbound-api',
        AnsweredBy: 'machine',
        RecordingUrl: 'https://api.twilio.com/recordings/RE123',
      };

      const req = createMockRequest(webhookPayload);
      const res = createMockResponse();

      await handleTwilioCallStatus(req, res);

      // Should capture with voicemail outcome
      expect(mockFirestoreSet).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: expect.objectContaining({
            outcome: expect.stringContaining('voicemail'),
          }),
        })
      );
    });
  });

  describe('Disconnected User Flow', () => {
    it('should send push notification when user disconnected', async () => {
      const twilioCallSid = 'CA' + 'disconnect123'.padEnd(32, '0');

      // User is NOT connected (no active session)
      mockRoomServiceListRooms.mockResolvedValue([]);

      trackOutboundCall(twilioCallSid, {
        callId: 'call-disconnect-test',
        userId: 'test-user-e2e',
        contactName: 'Restaurant',
        purpose: 'make reservation',
        objective: 'reservation',
        callType: 'business',
        originalSessionId: 'session-disconnected',
        startedAt: new Date().toISOString(),
      });

      const webhookPayload = {
        CallSid: twilioCallSid,
        AccountSid: 'ACtest123',
        From: '+15559876543',
        To: '+15553334444',
        CallStatus: 'completed',
        CallDuration: '120',
        Direction: 'outbound-api',
        AnsweredBy: 'human',
      };

      const req = createMockRequest(webhookPayload);
      const res = createMockResponse();

      await handleTwilioCallStatus(req, res);

      // Should still send push notification
      expect(mockSendPushNotification).toHaveBeenCalled();

      // Should store notification for later
      expect(mockFirestoreAdd).toHaveBeenCalled();
    });
  });

  describe('Active Session Injection', () => {
    it('should capture result and store for active sessions', async () => {
      // This test verifies captureCallResult completes without error
      // and stores the result, even when LiveKit session injection is attempted.
      // The actual LiveKit injection is a best-effort optimization.

      const request: OnBehalfCallRequest = {
        userId: 'test-user-e2e',
        contactQuery: 'my dentist',
        resolvedContact: { name: 'Dr. Dental', phone: '+15556667777' },
        purpose: 'cancel appointment',
        objective: 'cancel',
        callType: 'business',
        originalSessionId: 'active-session',
        userTimezone: 'America/New_York',
        userName: 'Test User',
        recordingConsent: true,
      };

      const outcome: CallOutcome = {
        callId: 'call-active-test',
        status: 'completed',
        objectiveAchieved: true,
        outcome: 'Appointment cancelled successfully',
        callbackRequired: false,
      };

      // Should complete without throwing
      await expect(captureCallResult('call-active-test', outcome, request)).resolves.not.toThrow();

      // Should have stored the result in Firestore
      expect(mockFirestoreSet).toHaveBeenCalledWith(
        expect.objectContaining({
          callId: 'call-active-test',
          userId: 'test-user-e2e',
          outcome: expect.objectContaining({
            status: 'completed',
            objectiveAchieved: true,
          }),
        })
      );

      // Should have sent push notification
      expect(mockSendPushNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user-e2e',
          title: expect.stringContaining('Dr. Dental'),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown CallSid gracefully', async () => {
      const unknownSid = 'CA' + 'unknown1234567'.padEnd(32, '0');

      const webhookPayload = {
        CallSid: unknownSid,
        AccountSid: 'ACtest123',
        From: '+15559876543',
        To: '+15551234567',
        CallStatus: 'completed',
        Direction: 'outbound-api',
      };

      const req = createMockRequest(webhookPayload);
      const res = createMockResponse();

      const handled = await handleTwilioCallStatus(req, res);

      // Should still respond 200 to Twilio
      expect(handled).toBe(true);
      expect(res._statusCode).toBe(200);

      // Should NOT attempt to store (no pending call found)
      expect(mockFirestoreSet).not.toHaveBeenCalled();
    });

    it('should ignore non-terminal call statuses', async () => {
      const twilioCallSid = 'CA' + 'ringing1234567'.padEnd(32, '0');

      trackOutboundCall(twilioCallSid, {
        callId: 'call-ringing-test',
        userId: 'test-user-e2e',
        contactName: 'Friend',
        purpose: 'catch up',
        objective: 'check_in',
        callType: 'personal',
        originalSessionId: 'session-test',
        startedAt: new Date().toISOString(),
      });

      // Simulate ringing status (non-terminal)
      const webhookPayload = {
        CallSid: twilioCallSid,
        AccountSid: 'ACtest123',
        From: '+15559876543',
        To: '+15551234567',
        CallStatus: 'ringing', // Non-terminal
        Direction: 'outbound-api',
      };

      const req = createMockRequest(webhookPayload);
      const res = createMockResponse();

      await handleTwilioCallStatus(req, res);

      // Call should still be pending (not captured yet)
      const stillPending = getPendingCall(twilioCallSid);
      expect(stillPending).toBeDefined();

      // Should NOT send push notification for ringing
      expect(mockSendPushNotification).not.toHaveBeenCalled();
    });

    it('should handle failed calls with error messages', async () => {
      const twilioCallSid = 'CA' + 'failed12345678'.padEnd(32, '0');

      trackOutboundCall(twilioCallSid, {
        callId: 'call-failed-test',
        userId: 'test-user-e2e',
        contactName: 'Support Line',
        purpose: 'get help',
        objective: 'inquiry',
        callType: 'business',
        originalSessionId: 'session-fail',
        startedAt: new Date().toISOString(),
      });

      const webhookPayload = {
        CallSid: twilioCallSid,
        AccountSid: 'ACtest123',
        From: '+15559876543',
        To: '+15551234567',
        CallStatus: 'failed',
        Direction: 'outbound-api',
        ErrorCode: '21215',
        ErrorMessage: 'Invalid phone number',
      };

      const req = createMockRequest(webhookPayload);
      const res = createMockResponse();

      await handleTwilioCallStatus(req, res);

      // Should capture with failure status
      expect(mockFirestoreSet).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: expect.objectContaining({
            status: 'failed',
            outcome: 'Invalid phone number',
          }),
        })
      );
    });
  });

  describe('Follow-up Actions', () => {
    it('should create follow-up actions when callback is required', async () => {
      mockRoomServiceListRooms.mockResolvedValue([]);

      const request: OnBehalfCallRequest = {
        userId: 'test-user-e2e',
        contactQuery: 'insurance company',
        resolvedContact: { name: 'Acme Insurance', phone: '+18001234567' },
        purpose: 'claim status',
        objective: 'inquiry',
        callType: 'business',
        originalSessionId: 'session-followup',
        userTimezone: 'America/New_York',
        userName: 'Test User',
        recordingConsent: true,
      };

      const outcome: CallOutcome = {
        callId: 'call-followup-test',
        status: 'no_answer',
        objectiveAchieved: false,
        outcome: 'No answer - try again later',
        callbackRequired: true,
        callbackTime: 'in 30 minutes',
      };

      await captureCallResult('call-followup-test', outcome, request);

      // Should create follow-up action in Firestore
      expect(mockFirestoreSet).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'callback',
          description: expect.stringContaining('Acme Insurance'),
          scheduledFor: 'in 30 minutes',
        })
      );
    });
  });
});

describe('Integration: Contact Resolution → Tool Execution', () => {
  let mockContext: ToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = createMockContext();

    // Default orchestrator mock - returns call ID successfully
    mockOrchestratorInitiateCall.mockResolvedValue('call-integration-id');
    // Mocked orchestrator module never self-registers; register explicitly
    registerOnBehalfCallInitiator(mockOrchestratorInitiateCall);
  });

  it('should resolve contact by relationship and initiate call', async () => {
    // Mock a family contact
    mockSearchContacts.mockResolvedValue([
      { id: '1', name: 'Mom', phone: '+15551112222', relationship: 'mother' },
    ]);

    mockTwilioCall.mockResolvedValue({
      sid: 'CAfamily123',
      status: 'queued',
    });

    const tool = createCallOnBehalfTool(mockContext);
    const result = await tool.execute({
      contactQuery: 'my mom',
      purpose: 'tell her I love her',
    });

    expect(result).toContain('calling');
    expect(result).toContain('Mom');
  });

  it('should handle ambiguous contact matches', async () => {
    // Multiple Smiths
    mockSearchContacts.mockResolvedValue([
      { id: '1', name: 'John Smith', phone: '+15551111111', relationship: 'friend' },
      { id: '2', name: 'Jane Smith', phone: '+15552222222', relationship: 'colleague' },
    ]);

    mockTwilioCall.mockResolvedValue({
      sid: 'CAambiguous',
      status: 'queued',
    });

    const tool = createCallOnBehalfTool(mockContext);
    const result = await tool.execute({
      contactQuery: 'Smith',
      purpose: 'quick question',
    });

    // Should pick the first match (or could ask for clarification)
    expect(result).toContain('calling');
  });
});
