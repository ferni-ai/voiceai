/**
 * Inbound Call Context Builder Tests
 *
 * Tests for the context builder that injects caller identity
 * and context for inbound phone calls.
 *
 * @module tests/context-builders/inbound-call-context
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ============================================================================
// TEST DATA
// ============================================================================

const TEST_SESSION_ID = 'session-test-123';
const TEST_CALL_SID = 'CA1234567890abcdef';
const TEST_PHONE_NUMBER = '+15551234567';
const TEST_CALLER_NAME = 'Mom';
const TEST_SPONSOR_USER_ID = 'firebase-uid-sponsor-123';
const TEST_SPONSORED_IDENTITY_ID = 'sponsored_mom123';

// ============================================================================
// HELPERS
// ============================================================================

function resetMocks() {
  vi.clearAllMocks();
}

// ============================================================================
// TESTS
// ============================================================================

describe('Inbound Call Context Builder', () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    resetMocks();
  });

  // ==========================================================================
  // CONTEXT STORAGE
  // ==========================================================================

  describe('Context Storage', () => {
    it('should store and retrieve inbound call context', async () => {
      const { setInboundCallContext, getInboundCallContext } = await import(
        '../../intelligence/context-builders/external/inbound-call-context.js'
      );

      const context = {
        callSid: TEST_CALL_SID,
        callerPhone: TEST_PHONE_NUMBER,
        callerName: TEST_CALLER_NAME,
        userId: `phone:${TEST_PHONE_NUMBER}`,
        sponsoredIdentityId: TEST_SPONSORED_IDENTITY_ID,
        sponsorUserId: TEST_SPONSOR_USER_ID,
        isKnownCaller: true,
        isVoiceEnrolled: false,
        relationship: 'mother',
      };

      setInboundCallContext(TEST_SESSION_ID, context);

      const retrieved = getInboundCallContext(TEST_SESSION_ID);

      expect(retrieved).toEqual(context);
    });

    it('should return undefined for unknown session', async () => {
      const { getInboundCallContext } = await import(
        '../../intelligence/context-builders/external/inbound-call-context.js'
      );

      const retrieved = getInboundCallContext('unknown-session');

      expect(retrieved).toBeUndefined();
    });

    it('should clear context after call completes', async () => {
      const { setInboundCallContext, getInboundCallContext, clearInboundCallContext } =
        await import('../../intelligence/context-builders/external/inbound-call-context.js');

      const context = {
        callSid: TEST_CALL_SID,
        callerPhone: TEST_PHONE_NUMBER,
        isKnownCaller: false,
        isVoiceEnrolled: false,
      };

      setInboundCallContext(TEST_SESSION_ID, context);
      expect(getInboundCallContext(TEST_SESSION_ID)).toBeDefined();

      clearInboundCallContext(TEST_SESSION_ID);
      expect(getInboundCallContext(TEST_SESSION_ID)).toBeUndefined();
    });
  });

  // ==========================================================================
  // CONTEXT BUILDER
  // ==========================================================================

  describe('Context Builder', () => {
    it('should return empty array for non-inbound sessions', async () => {
      const { inboundCallContextBuilder } = await import(
        '../../intelligence/context-builders/external/inbound-call-context.js'
      );

      const result = await inboundCallContextBuilder.build({
        services: { sessionId: 'regular-session-no-inbound' },
        persona: { id: 'ferni', name: 'Ferni' },
      } as never);

      expect(result).toEqual([]);
    });

    it('should inject caller identity for known caller', async () => {
      const { setInboundCallContext, inboundCallContextBuilder } = await import(
        '../../intelligence/context-builders/external/inbound-call-context.js'
      );

      // Set up inbound call context
      setInboundCallContext(TEST_SESSION_ID, {
        callSid: TEST_CALL_SID,
        callerPhone: TEST_PHONE_NUMBER,
        callerName: TEST_CALLER_NAME,
        userId: `phone:${TEST_PHONE_NUMBER}`,
        sponsoredIdentityId: TEST_SPONSORED_IDENTITY_ID,
        sponsorUserId: TEST_SPONSOR_USER_ID,
        isKnownCaller: true,
        isVoiceEnrolled: false,
        relationship: 'mother',
      });

      const result = await inboundCallContextBuilder.build({
        services: { sessionId: TEST_SESSION_ID },
        persona: { id: 'ferni', name: 'Ferni' },
      } as never);

      expect(result.length).toBeGreaterThan(0);

      // Should have caller identity injection
      const identityInjection = result.find((i) => i.key === 'inbound_call_identity');
      expect(identityInjection).toBeDefined();
      expect(identityInjection?.content).toContain(TEST_CALLER_NAME);
      expect(identityInjection?.content).toContain('KNOWN CALLER');
    });

    it('should inject unknown caller guidance for new callers', async () => {
      const { setInboundCallContext, inboundCallContextBuilder } = await import(
        '../../intelligence/context-builders/external/inbound-call-context.js'
      );

      // Set up inbound call context for unknown caller
      setInboundCallContext(TEST_SESSION_ID, {
        callSid: TEST_CALL_SID,
        callerPhone: '+15559999999',
        isKnownCaller: false,
        isVoiceEnrolled: false,
      });

      const result = await inboundCallContextBuilder.build({
        services: { sessionId: TEST_SESSION_ID },
        persona: { id: 'ferni', name: 'Ferni' },
      } as never);

      // Should have unknown caller injection
      const unknownInjection = result.find((i) => i.key === 'inbound_call_unknown');
      expect(unknownInjection).toBeDefined();
      expect(unknownInjection?.content).toContain('UNKNOWN');
    });

    it('should inject voice verification guidance for known but unenrolled caller', async () => {
      const { setInboundCallContext, inboundCallContextBuilder } = await import(
        '../../intelligence/context-builders/external/inbound-call-context.js'
      );

      setInboundCallContext(TEST_SESSION_ID, {
        callSid: TEST_CALL_SID,
        callerPhone: TEST_PHONE_NUMBER,
        callerName: TEST_CALLER_NAME,
        isKnownCaller: true,
        isVoiceEnrolled: false, // Not voice enrolled
      });

      const result = await inboundCallContextBuilder.build({
        services: { sessionId: TEST_SESSION_ID },
        persona: { id: 'ferni', name: 'Ferni' },
      } as never);

      // Should have voice verification guidance
      const verificationInjection = result.find((i) => i.key === 'inbound_call_verification');
      expect(verificationInjection).toBeDefined();
      expect(verificationInjection?.content).toContain('voice');
    });

    it('should not inject verification guidance for voice-enrolled caller', async () => {
      const { setInboundCallContext, inboundCallContextBuilder } = await import(
        '../../intelligence/context-builders/external/inbound-call-context.js'
      );

      setInboundCallContext(TEST_SESSION_ID, {
        callSid: TEST_CALL_SID,
        callerPhone: TEST_PHONE_NUMBER,
        callerName: TEST_CALLER_NAME,
        isKnownCaller: true,
        isVoiceEnrolled: true, // Already enrolled
      });

      const result = await inboundCallContextBuilder.build({
        services: { sessionId: TEST_SESSION_ID },
        persona: { id: 'ferni', name: 'Ferni' },
      } as never);

      // Should NOT have voice verification guidance
      const verificationInjection = result.find((i) => i.key === 'inbound_call_verification');
      expect(verificationInjection).toBeUndefined();
    });

    it('should inject sponsored identity context', async () => {
      const { setInboundCallContext, inboundCallContextBuilder } = await import(
        '../../intelligence/context-builders/external/inbound-call-context.js'
      );

      setInboundCallContext(TEST_SESSION_ID, {
        callSid: TEST_CALL_SID,
        callerPhone: TEST_PHONE_NUMBER,
        callerName: TEST_CALLER_NAME,
        sponsoredIdentityId: TEST_SPONSORED_IDENTITY_ID,
        sponsorUserId: TEST_SPONSOR_USER_ID,
        isKnownCaller: true,
        isVoiceEnrolled: false,
        relationship: 'mother',
        notes: 'Prefers morning calls',
      });

      const result = await inboundCallContextBuilder.build({
        services: { sessionId: TEST_SESSION_ID },
        persona: { id: 'ferni', name: 'Ferni' },
      } as never);

      const sponsoredInjection = result.find((i) => i.key === 'inbound_call_sponsored');
      expect(sponsoredInjection).toBeDefined();
      expect(sponsoredInjection?.content).toContain('sponsored');
      expect(sponsoredInjection?.content).toContain('mother');
    });

    it('should inject access restrictions for limited callers', async () => {
      const { setInboundCallContext, inboundCallContextBuilder } = await import(
        '../../intelligence/context-builders/external/inbound-call-context.js'
      );

      setInboundCallContext(TEST_SESSION_ID, {
        callSid: TEST_CALL_SID,
        callerPhone: TEST_PHONE_NUMBER,
        callerName: 'Kid',
        isKnownCaller: true,
        isVoiceEnrolled: false,
        accessLevel: 'limited',
        allowedPersonas: ['ferni'],
      });

      const result = await inboundCallContextBuilder.build({
        services: { sessionId: TEST_SESSION_ID },
        persona: { id: 'ferni', name: 'Ferni' },
      } as never);

      const restrictionInjection = result.find((i) => i.key === 'inbound_call_restrictions');
      expect(restrictionInjection).toBeDefined();
      expect(restrictionInjection?.content).toContain('LIMITED');
    });

    it('should not inject restrictions for full access callers', async () => {
      const { setInboundCallContext, inboundCallContextBuilder } = await import(
        '../../intelligence/context-builders/external/inbound-call-context.js'
      );

      setInboundCallContext(TEST_SESSION_ID, {
        callSid: TEST_CALL_SID,
        callerPhone: TEST_PHONE_NUMBER,
        callerName: TEST_CALLER_NAME,
        isKnownCaller: true,
        isVoiceEnrolled: false,
        accessLevel: 'full',
      });

      const result = await inboundCallContextBuilder.build({
        services: { sessionId: TEST_SESSION_ID },
        persona: { id: 'ferni', name: 'Ferni' },
      } as never);

      const restrictionInjection = result.find((i) => i.key === 'inbound_call_restrictions');
      expect(restrictionInjection).toBeUndefined();
    });
  });

  // ==========================================================================
  // BUILDER METADATA
  // ==========================================================================

  describe('Builder Metadata', () => {
    it('should have correct builder metadata', async () => {
      const { inboundCallContextBuilder } = await import(
        '../../intelligence/context-builders/external/inbound-call-context.js'
      );

      expect(inboundCallContextBuilder.name).toBe('inbound-call-context');
      expect(inboundCallContextBuilder.priority).toBeDefined();
      expect(inboundCallContextBuilder.category).toBeDefined();
    });
  });
});
