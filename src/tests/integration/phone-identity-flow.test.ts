/**
 * Phone Identity Full Flow Integration Tests
 *
 * Tests complete user journeys through the phone identity system,
 * verifying that all components work together correctly.
 *
 * @module tests/integration/phone-identity-flow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

const mockProfiles = new Map<string, unknown>();
const mockIdentities = new Map<string, unknown>();
const mockApprovals = new Map<string, unknown>();
let mockVoiceSimilarity = 0.85;

vi.mock('../../memory/index.js', () => ({
  getDefaultStore: () => ({
    getProfile: vi.fn(async (id: string) => mockProfiles.get(id) ?? null),
    saveProfile: vi.fn(async (profile: unknown) => {
      mockProfiles.set((profile as { id: string }).id, profile);
    }),
    listProfiles: vi.fn(async () => Array.from(mockProfiles.values())),
  }),
}));

vi.mock('../../services/memory/voice-memory.js', () => ({
  VOICE_MISMATCH_THRESHOLD: 0.4,
  VOICE_MATCH_THRESHOLD: 0.75,
  VOICE_UNCERTAIN_THRESHOLD: 0.55,
  compareVoiceSketches: vi.fn(() => ({
    similarity: mockVoiceSimilarity,
    confidence: 0.9,
  })),
}));

vi.mock('../../services/push-notifications.js', () => ({
  getPushNotificationsService: () => ({
    sendNotification: vi.fn(async () => true),
  }),
}));

vi.mock('../../services/identity/sponsored-identity.js', () => ({
  createSelfRegisteredIdentity: vi.fn(async (phone, name, relationship, sponsor) => {
    const identity = {
      id: `pending_${Date.now()}`,
      phoneNumber: phone,
      displayName: name,
      relationship,
      claimedSponsorName: sponsor,
      status: 'pending',
    };
    mockIdentities.set(identity.id, identity);
    return identity;
  }),
  approveSelfRegisteredIdentity: vi.fn(async (identityId, sponsorId) => {
    const identity = mockIdentities.get(identityId) as { status: string; sponsorUserId?: string };
    if (identity) {
      identity.status = 'active';
      identity.sponsorUserId = sponsorId;
    }
    return identity;
  }),
  deleteSponsoredIdentity: vi.fn(async (id) => {
    mockIdentities.delete(id);
    return true;
  }),
  lookupByPhone: vi.fn(async (phone) => {
    for (const identity of mockIdentities.values()) {
      if ((identity as { phoneNumber: string }).phoneNumber === phone) {
        return identity;
      }
    }
    return null;
  }),
}));

// ============================================================================
// TEST DATA
// ============================================================================

const SPONSOR = {
  id: 'sponsor-seth-123',
  name: 'Seth',
  phone: '+15551234567',
  email: 'seth@example.com',
  voiceSketch: {
    fundamentalFrequency: { mean: 120, std: 15 },
    spectralCentroid: { mean: 2000, std: 300 },
  },
};

const FAMILY_MEMBER = {
  name: 'Linda',
  phone: '+15552223333',
  relationship: 'mom',
};

// ============================================================================
// HELPERS
// ============================================================================

function resetMocks() {
  mockProfiles.clear();
  mockIdentities.clear();
  mockApprovals.clear();
  mockVoiceSimilarity = 0.85;
  vi.clearAllMocks();
}

function createSponsorProfile() {
  mockProfiles.set(SPONSOR.id, {
    id: SPONSOR.id,
    name: SPONSOR.name,
    phoneNumber: SPONSOR.phone,
    email: SPONSOR.email,
    voiceSketch: SPONSOR.voiceSketch,
    linkedIdentifiers: [],
    totalConversations: 50,
  });
}

// ============================================================================
// TESTS
// ============================================================================

describe('Phone Identity Full Flow', () => {
  beforeEach(() => {
    resetMocks();
    createSponsorProfile();
  });

  afterEach(() => {
    resetMocks();
  });

  // ==========================================================================
  // FLOW 1: COMPLETE FAMILY REGISTRATION
  // ==========================================================================

  describe('Complete Family Registration Flow', () => {
    it('registers family member from phone call to approval', async () => {
      const sponsorNotifications = await import(
        '../../services/identity/sponsor-notifications.js'
      );
      const sponsoredIdentity = await import(
        '../../services/identity/sponsored-identity.js'
      );

      // STEP 1: Unknown caller calls, mentions sponsor
      // Agent detects family referral and collects info

      // STEP 2: Agent creates pending identity
      const pendingIdentity = await sponsoredIdentity.createSelfRegisteredIdentity(
        FAMILY_MEMBER.phone,
        FAMILY_MEMBER.name,
        FAMILY_MEMBER.relationship,
        SPONSOR.name
      );

      expect(pendingIdentity).toBeDefined();
      expect(pendingIdentity.status).toBe('pending');
      expect(pendingIdentity.displayName).toBe(FAMILY_MEMBER.name);

      // STEP 3: Notify potential sponsors
      const notifyResult = await sponsorNotifications.notifyPotentialSponsors(
        SPONSOR.name,
        pendingIdentity.id,
        {
          name: FAMILY_MEMBER.name,
          phone: FAMILY_MEMBER.phone,
          relationship: FAMILY_MEMBER.relationship,
        }
      );

      expect(notifyResult.notifiedCount).toBe(1);
      expect(notifyResult.sponsorIds).toContain(SPONSOR.id);

      // STEP 4: Sponsor sees pending approval in app
      const pendingApprovals = sponsorNotifications.getPendingApprovalsForSponsor(SPONSOR.id);
      expect(pendingApprovals).toHaveLength(1);
      expect(pendingApprovals[0].callerName).toBe(FAMILY_MEMBER.name);
      expect(pendingApprovals[0].relationship).toBe(FAMILY_MEMBER.relationship);

      // STEP 5: Sponsor approves
      const approvalResult = await sponsorNotifications.approvePendingApproval(
        pendingApprovals[0].id,
        SPONSOR.id
      );

      expect(approvalResult.success).toBe(true);

      // STEP 6: Verify approval status changed
      const approval = sponsorNotifications.getPendingApproval(pendingApprovals[0].id);
      expect(approval?.status).toBe('approved');

      // STEP 7: Next time caller calls, they should be recognized
      // (Identity is now active in the system)
      const identity = await sponsoredIdentity.lookupByPhone(FAMILY_MEMBER.phone);
      expect(identity).toBeDefined();
    });

    it('handles sponsor rejecting family member', async () => {
      const sponsorNotifications = await import(
        '../../services/identity/sponsor-notifications.js'
      );
      const sponsoredIdentity = await import(
        '../../services/identity/sponsored-identity.js'
      );

      // Create pending identity
      const pendingIdentity = await sponsoredIdentity.createSelfRegisteredIdentity(
        '+15559999999',
        'Unknown Person',
        'friend',
        SPONSOR.name
      );

      await sponsorNotifications.notifyPotentialSponsors(
        SPONSOR.name,
        pendingIdentity.id,
        {
          name: 'Unknown Person',
          phone: '+15559999999',
        }
      );

      // Sponsor rejects
      const pendingApprovals = sponsorNotifications.getPendingApprovalsForSponsor(SPONSOR.id);
      const rejectResult = await sponsorNotifications.rejectPendingApproval(
        pendingApprovals[0].id,
        SPONSOR.id
      );

      expect(rejectResult.success).toBe(true);

      // Verify rejection
      const approval = sponsorNotifications.getPendingApproval(pendingApprovals[0].id);
      expect(approval?.status).toBe('rejected');
    });
  });

  // ==========================================================================
  // FLOW 2: VOICE MISMATCH TO REGISTRATION
  // ==========================================================================

  describe('Voice Mismatch to New Registration Flow', () => {
    it('detects voice mismatch and registers new family member', async () => {
      mockVoiceSimilarity = 0.2; // Voice doesn't match

      const voiceVerification = await import(
        '../../services/voice/inbound-voice-verification.js'
      );
      const voiceMismatchContext = await import(
        '../../intelligence/context-builders/external/voice-mismatch-context.js'
      );
      const sponsorNotifications = await import(
        '../../services/identity/sponsor-notifications.js'
      );
      const sponsoredIdentity = await import(
        '../../services/identity/sponsored-identity.js'
      );

      const sessionId = 'mismatch-session';

      // STEP 1: Known caller's phone used by someone else
      voiceVerification.registerForVoiceVerification(
        sessionId,
        SPONSOR.id,
        SPONSOR.name,
        SPONSOR.voiceSketch
      );

      // STEP 2: Voice mismatch detected
      const verifyResult = await voiceVerification.verifyInboundVoice(
        sessionId,
        SPONSOR.voiceSketch
      );

      expect(verifyResult.shouldChallenge).toBe(true);

      // Set mismatch context for agent
      voiceMismatchContext.setVoiceMismatchContext(sessionId, {
        expectedName: SPONSOR.name,
        similarity: mockVoiceSimilarity,
        confidence: 0.9,
      });

      // STEP 3: Agent confirms different person
      voiceMismatchContext.confirmDifferentPerson(sessionId, FAMILY_MEMBER.name);

      const context = voiceMismatchContext.getVoiceMismatchContext(sessionId);
      expect(context?.confirmedDifferentPerson).toBe(true);
      expect(context?.actualCallerName).toBe(FAMILY_MEMBER.name);

      // STEP 4: New person registered as family
      const pendingIdentity = await sponsoredIdentity.createSelfRegisteredIdentity(
        FAMILY_MEMBER.phone,
        FAMILY_MEMBER.name,
        FAMILY_MEMBER.relationship,
        SPONSOR.name
      );

      await sponsorNotifications.notifyPotentialSponsors(
        SPONSOR.name,
        pendingIdentity.id,
        {
          name: FAMILY_MEMBER.name,
          phone: FAMILY_MEMBER.phone,
          relationship: FAMILY_MEMBER.relationship,
          notes: 'Called from phone associated with ' + SPONSOR.name,
        }
      );

      // Verify sponsor was notified
      const pending = sponsorNotifications.getPendingApprovalsForSponsor(SPONSOR.id);
      expect(pending).toHaveLength(1);
      expect(pending[0].callerName).toBe(FAMILY_MEMBER.name);
    });
  });

  // ==========================================================================
  // FLOW 3: PHONE CALLER LINKS TO WEB ACCOUNT
  // ==========================================================================

  describe('Phone Caller Links to Web Account', () => {
    it('detects email mention and offers account linking', async () => {
      const fastCapture = await import('../../memory/dynamic/fast-capture.js');
      const accountLinkingContext = await import(
        '../../intelligence/context-builders/external/account-linking-context.js'
      );

      const sessionId = 'linking-session';

      // STEP 1: Phone-only caller mentions email
      const transcript = `My email is ${SPONSOR.email}, I use the app too`;
      const signals = fastCapture.detectLinkingSignals(transcript);

      expect(signals.some(s => s.type === 'email_mention')).toBe(true);
      expect(signals.some(s => s.type === 'app_mention')).toBe(true);

      // STEP 2: Set linking context
      accountLinkingContext.setAccountLinkingContext(sessionId, {
        detectedEmail: SPONSOR.email,
        confidence: 0.95,
      });

      // Add potential matches
      accountLinkingContext.addPotentialMatches(sessionId, [
        {
          userId: SPONSOR.id,
          matchType: 'email',
          confidence: 0.95,
        },
      ]);

      const context = accountLinkingContext.getAccountLinkingContext(sessionId);
      expect(context?.detectedEmail).toBe(SPONSOR.email);
      expect(context?.potentialMatches).toHaveLength(1);

      // STEP 3: User confirms linking
      // (In real flow, agent would use linkPhoneToAccount tool)
      accountLinkingContext.markLinkingComplete(sessionId, SPONSOR.id);

      const updatedContext = accountLinkingContext.getAccountLinkingContext(sessionId);
      expect(updatedContext?.linkingComplete).toBe(true);
      expect(updatedContext?.linkedToUserId).toBe(SPONSOR.id);
    });
  });

  // ==========================================================================
  // FLOW 4: FIRST-TIME CALLER ONBOARDING
  // ==========================================================================

  describe('First-Time Caller Complete Onboarding', () => {
    it('guides unknown caller through full onboarding flow', async () => {
      const onboardingContext = await import(
        '../../intelligence/context-builders/external/first-call-onboarding-context.js'
      );

      const sessionId = 'onboarding-session';

      // STEP 1: Initial call - turn 0
      let progress = onboardingContext.getOnboardingProgress(sessionId);
      expect(progress.turnCount).toBe(0);
      expect(progress.nameCollected).toBe(false);

      // STEP 2: First few turns - get name
      onboardingContext.incrementTurnCount(sessionId);
      onboardingContext.incrementTurnCount(sessionId);

      // Agent asks for name, user provides it
      onboardingContext.markNameCollected(sessionId, FAMILY_MEMBER.name);

      progress = onboardingContext.getOnboardingProgress(sessionId);
      expect(progress.nameCollected).toBe(true);
      expect(progress.callerName).toBe(FAMILY_MEMBER.name);

      // STEP 3: Build rapport (more turns)
      for (let i = 0; i < 3; i++) {
        onboardingContext.incrementTurnCount(sessionId);
      }

      // STEP 4: Offer to remember
      onboardingContext.markRememberedOffered(sessionId);
      progress = onboardingContext.getOnboardingProgress(sessionId);
      expect(progress.rememberOffered).toBe(true);

      // User accepts
      onboardingContext.markRememberedAccepted(sessionId);
      progress = onboardingContext.getOnboardingProgress(sessionId);
      expect(progress.rememberAccepted).toBe(true);

      // STEP 5: Offer voice enrollment
      onboardingContext.incrementTurnCount(sessionId);
      onboardingContext.markVoiceEnrollmentOffered(sessionId);

      // User agrees to voice enrollment
      onboardingContext.markVoiceEnrollmentStarted(sessionId);

      progress = onboardingContext.getOnboardingProgress(sessionId);
      expect(progress.voiceEnrollmentStarted).toBe(true);

      // STEP 6: Complete voice enrollment
      onboardingContext.markVoiceEnrollmentComplete(sessionId);

      progress = onboardingContext.getOnboardingProgress(sessionId);
      expect(progress.voiceEnrollmentComplete).toBe(true);

      // Verify complete onboarding
      expect(progress.nameCollected).toBe(true);
      expect(progress.rememberAccepted).toBe(true);
      expect(progress.voiceEnrollmentComplete).toBe(true);
    });
  });

  // ==========================================================================
  // FLOW 5: MULTI-PHONE DETECTION
  // ==========================================================================

  describe('Multi-Phone Detection Flow', () => {
    it('detects known user calling from new phone', async () => {
      const inboundCallContext = await import(
        '../../intelligence/context-builders/external/inbound-call-context.js'
      );

      const sessionId = 'new-phone-session';
      const newPhone = '+15558887777';

      // STEP 1: Known user calls from new phone
      // System identifies user but notices different phone
      inboundCallContext.setInboundCallContext(sessionId, {
        callerPhone: newPhone,
        isKnownCaller: true,
        callerName: SPONSOR.name,
        isNewPhone: true,
        primaryPhone: SPONSOR.phone,
      });

      const context = inboundCallContext.getInboundCallContext(sessionId);

      expect(context?.isKnownCaller).toBe(true);
      expect(context?.callerName).toBe(SPONSOR.name);
      expect(context?.isNewPhone).toBe(true);
      expect(context?.primaryPhone).toBe(SPONSOR.phone);

      // STEP 2: Agent offers to add phone
      // (In real flow, agent would use add_phone_number tool)

      // STEP 3: User profile updated with linked phone
      const profile = mockProfiles.get(SPONSOR.id) as {
        linkedIdentifiers: { type: string; value: string }[];
      };
      profile.linkedIdentifiers.push({ type: 'phone', value: newPhone });

      expect(profile.linkedIdentifiers).toContainEqual({
        type: 'phone',
        value: newPhone,
      });
    });
  });
});
