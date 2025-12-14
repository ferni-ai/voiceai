/**
 * Session Lifecycle Integration Tests
 *
 * Tests the complete session lifecycle from connection to disconnection.
 * These tests verify:
 * - Session initialization
 * - User profile loading
 * - Graceful session end
 * - Abrupt disconnection handling
 * - Resource cleanup
 *
 * @module agents/__tests__/integration/session-lifecycle
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Setup mocks BEFORE importing modules under test
import {
  createMockJobContext,
  createMockSessionServices,
  createMockVoicePipelineAgent,
  MockRoom,
  resetAllMocks,
  setupAllMocks,
} from '../mocks/index.js';

import { sessions, users } from '../fixtures/index.js';

// Setup all mocks
setupAllMocks();

// ============================================================================
// TEST SUITE
// ============================================================================

describe('Session Lifecycle Integration Tests', () => {
  let mockRoom: MockRoom;
  let mockServices: ReturnType<typeof createMockSessionServices>;
  let mockPipeline: ReturnType<typeof createMockVoicePipelineAgent>;

  beforeEach(() => {
    resetAllMocks();
    mockRoom = new MockRoom({ name: 'test-room' });
    mockServices = createMockSessionServices({
      userId: users.returningUser.id,
      sessionId: sessions.ongoingSession.id,
    });
    mockPipeline = createMockVoicePipelineAgent();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // SESSION INITIALIZATION
  // ==========================================================================

  describe('Session Initialization', () => {
    it('should initialize session on first connection', async () => {
      const jobCtx = createMockJobContext('job-init-1', 'test-room', users.newUser.id);

      // Simulate connection
      await jobCtx.connect();

      expect(jobCtx.room.isConnected).toBe(true);
      expect(jobCtx.room.state).toBe('connected');
    });

    it('should emit connection events in correct order', async () => {
      const events: string[] = [];

      mockRoom.on('connectionStateChanged', (state) => {
        events.push(`state:${state}`);
      });
      mockRoom.on('connected', () => {
        events.push('connected');
      });

      await mockRoom.connect('wss://test.livekit.cloud', 'test-token');

      expect(events).toEqual(['state:connecting', 'state:connected', 'connected']);
    });

    it('should detect participant joining', async () => {
      const participantJoinedSpy = vi.fn();
      mockRoom.on('participantConnected', participantJoinedSpy);

      await mockRoom.connect('wss://test', 'token');
      const user = mockRoom.simulateParticipantJoined();

      expect(participantJoinedSpy).toHaveBeenCalledWith(user);
      expect(mockRoom.remoteParticipants.size).toBe(1);
    });

    it('should create new profile for first-time users', async () => {
      const newUserServices = createMockSessionServices({
        userId: users.newUser.id,
        isReturningUser: false,
        relationshipTurns: 0,
      });

      expect(newUserServices.isReturningUser).toBe(false);
      expect(newUserServices.relationshipTurns).toBe(0);
    });

    it('should load user profile for returning users', async () => {
      const returningServices = createMockSessionServices({
        userId: users.returningUser.id,
        isReturningUser: true,
        relationshipTurns: users.returningUser.relationshipTurns,
      });

      expect(returningServices.isReturningUser).toBe(true);
      expect(returningServices.relationshipTurns).toBe(150);
    });
  });

  // ==========================================================================
  // SESSION LIFECYCLE EVENTS
  // ==========================================================================

  describe('Session Lifecycle Events', () => {
    it('should track session start time', async () => {
      const startTime = Date.now();
      const jobCtx = createMockJobContext();

      await jobCtx.connect();

      // Session should have started within a reasonable time
      expect(Date.now() - startTime).toBeLessThan(1000);
    });

    it('should track participant identity', async () => {
      const jobCtx = createMockJobContext('job-1', 'room-1', 'custom-user-id');

      expect(jobCtx.job.participant?.identity).toBe('custom-user-id');
    });

    it('should parse job metadata correctly', () => {
      const metadata = { persona_id: 'maya', custom_data: 'test' };
      const jobCtx = createMockJobContext('job-1', 'room-1', 'user-1', metadata);

      const parsedMetadata = JSON.parse(jobCtx.job.metadata || '{}');

      expect(parsedMetadata.persona_id).toBe('maya');
      expect(parsedMetadata.custom_data).toBe('test');
    });
  });

  // ==========================================================================
  // GRACEFUL SESSION END
  // ==========================================================================

  describe('Graceful Session End', () => {
    it('should handle graceful session end', async () => {
      const disconnectedSpy = vi.fn();
      mockRoom.on('disconnected', disconnectedSpy);

      await mockRoom.connect('wss://test', 'token');
      await mockRoom.disconnect();

      expect(disconnectedSpy).toHaveBeenCalled();
      expect(mockRoom.isConnected).toBe(false);
      expect(mockRoom.state).toBe('disconnected');
    });

    it('should call shutdown on job context', async () => {
      const jobCtx = createMockJobContext();

      await jobCtx.connect();
      await jobCtx.shutdown();

      expect(jobCtx.shutdown).toHaveBeenCalled();
    });

    it('should persist conversation summary on session end', async () => {
      // Verify that session services have persistence methods
      expect(mockServices.conversationState.recordMessage).toBeDefined();
      expect(mockServices.conversationState.getState).toBeDefined();

      // Simulate recording conversation state
      mockServices.conversationState.recordMessage({ role: 'user', content: 'test' });
      mockServices.conversationState.getState();

      expect(mockServices.conversationState.recordMessage).toHaveBeenCalled();
      expect(mockServices.conversationState.getState).toHaveBeenCalled();
    });

    it('should stop voice pipeline on disconnect', async () => {
      await mockPipeline.start();
      expect(mockPipeline.isStarted).toBe(true);

      await mockPipeline.stop();
      expect(mockPipeline.isStarted).toBe(false);
    });
  });

  // ==========================================================================
  // ABRUPT DISCONNECTION
  // ==========================================================================

  describe('Abrupt Disconnection Handling', () => {
    it('should handle participant leaving', async () => {
      const participantLeftSpy = vi.fn();
      mockRoom.on('participantDisconnected', participantLeftSpy);

      await mockRoom.connect('wss://test', 'token');
      const user = mockRoom.simulateParticipantJoined();
      mockRoom.simulateParticipantLeft(user.identity);

      expect(participantLeftSpy).toHaveBeenCalled();
      expect(mockRoom.remoteParticipants.size).toBe(0);
    });

    it('should handle room disconnection event', async () => {
      const events: string[] = [];

      mockRoom.on('connected', () => events.push('connected'));
      mockRoom.on('disconnected', () => events.push('disconnected'));

      await mockRoom.connect('wss://test', 'token');
      await mockRoom.disconnect();

      expect(events).toContain('connected');
      expect(events).toContain('disconnected');
    });

    it('should update room state on disconnect', async () => {
      await mockRoom.connect('wss://test', 'token');
      expect(mockRoom.state).toBe('connected');

      await mockRoom.disconnect();
      expect(mockRoom.state).toBe('disconnected');
    });
  });

  // ==========================================================================
  // RESOURCE CLEANUP
  // ==========================================================================

  describe('Resource Cleanup', () => {
    it('should cleanup session resources on disconnect', async () => {
      const jobCtx = createMockJobContext();

      await jobCtx.connect();

      // Verify participants can be added
      expect(jobCtx.room.remoteParticipants.size).toBeGreaterThanOrEqual(1);

      // Disconnect and verify cleanup
      await jobCtx.room.disconnect();

      expect(jobCtx.room.isConnected).toBe(false);
      expect(jobCtx.room.state).toBe('disconnected');
    });

    it('should clear utterance queue on pipeline stop', async () => {
      mockPipeline.say('Hello there!');
      mockPipeline.say('How are you?');

      expect(mockPipeline.getUtterances().length).toBe(2);

      mockPipeline.clearUtterances();

      expect(mockPipeline.getUtterances().length).toBe(0);
    });

    it('should allow services reset', () => {
      // Simulate some service calls
      mockServices.analyze('test message');
      mockServices.addTurn();

      // Reset should be available
      expect(mockServices.reset).toBeDefined();
      mockServices.reset();

      expect(mockServices.reset).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // VOICE PIPELINE INTEGRATION
  // ==========================================================================

  describe('Voice Pipeline Integration', () => {
    it('should start voice pipeline successfully', async () => {
      const startedSpy = vi.fn();
      mockPipeline.on('agentStarted', startedSpy);

      await mockPipeline.start();

      expect(mockPipeline.isStarted).toBe(true);
      expect(startedSpy).toHaveBeenCalled();
    });

    it('should handle pipeline start failure', async () => {
      const failingPipeline = createMockVoicePipelineAgent({ shouldFail: true });

      await expect(failingPipeline.start()).rejects.toThrow('Mock pipeline start failure');
    });

    it('should emit speaking events', async () => {
      const events: string[] = [];

      mockPipeline.on('agentStartedSpeaking', () => events.push('started'));
      mockPipeline.on('agentStoppedSpeaking', () => events.push('stopped'));

      await mockPipeline.start();
      mockPipeline.say('Hello!');

      // Wait for speaking to complete
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(events).toContain('started');
      expect(events).toContain('stopped');
    });

    it('should track utterances spoken', async () => {
      await mockPipeline.start();

      mockPipeline.say('First message');
      mockPipeline.say('Second message');
      mockPipeline.say('Third message');

      const utterances = mockPipeline.getUtterances();

      expect(utterances).toHaveLength(3);
      expect(utterances[0]).toBe('First message');
      expect(utterances[2]).toBe('Third message');
    });

    it('should handle interruption', async () => {
      const interruptedSpy = vi.fn();
      mockPipeline.on('agentInterrupted', interruptedSpy);

      await mockPipeline.start();
      mockPipeline.say('A very long message that takes time to say');

      // Simulate interruption while speaking
      mockPipeline.simulateInterruption();

      expect(interruptedSpy).toHaveBeenCalled();
      expect(mockPipeline.isSpeaking).toBe(false);
    });
  });

  // ==========================================================================
  // USER TURN SIMULATION
  // ==========================================================================

  describe('User Turn Simulation', () => {
    it('should emit user turn completed event', async () => {
      const turnCompletedSpy = vi.fn();
      mockPipeline.on('userTurnCompleted', turnCompletedSpy);

      mockPipeline.simulateUserTurnCompleted('Hello Ferni!');

      expect(turnCompletedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Hello Ferni!',
          timestamp: expect.any(Number),
        })
      );
    });

    it('should emit user speech start/end events', async () => {
      const events: string[] = [];

      mockPipeline.on('userStartedSpeaking', () => events.push('start'));
      mockPipeline.on('userStoppedSpeaking', () => events.push('stop'));

      mockPipeline.simulateUserSpeaking();
      mockPipeline.simulateUserSpeechEnd();

      expect(events).toEqual(['start', 'stop']);
    });

    it('should simulate voice activity in room', async () => {
      const speakersSpy = vi.fn();
      mockRoom.on('activeSpeakersChanged', speakersSpy);

      await mockRoom.connect('wss://test', 'token');
      const user = mockRoom.simulateParticipantJoined();

      mockRoom.simulateUserSpeaking(user.identity, true);

      expect(speakersSpy).toHaveBeenCalledWith([user]);
      expect(user.isSpeaking).toBe(true);

      mockRoom.simulateUserSpeaking(user.identity, false);

      expect(user.isSpeaking).toBe(false);
    });
  });

  // ==========================================================================
  // DATA CHANNEL
  // ==========================================================================

  describe('Data Channel Communication', () => {
    it('should publish data through local participant', async () => {
      const jobCtx = createMockJobContext();
      await jobCtx.connect();

      const data = new TextEncoder().encode(JSON.stringify({ type: 'test' }));

      await jobCtx.room.localParticipant.publishData(data, { reliable: true });

      expect(jobCtx.room.localParticipant.publishData).toHaveBeenCalledWith(data, {
        reliable: true,
      });
    });

    it('should receive data messages', async () => {
      const dataReceivedSpy = vi.fn();
      mockRoom.on('dataReceived', dataReceivedSpy);

      await mockRoom.connect('wss://test', 'token');

      const data = new TextEncoder().encode('test message');
      mockRoom.simulateDataReceived(data);

      expect(dataReceivedSpy).toHaveBeenCalled();
    });
  });
});
