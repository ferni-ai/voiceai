/**
 * LiveKit Mock Infrastructure
 *
 * Comprehensive mocks for LiveKit SDK components used in voice agent testing.
 * These mocks simulate the behavior of:
 * - Room connections and participants
 * - Voice pipeline agents
 * - Audio tracks and streams
 * - Data channels
 *
 * @module agents/__tests__/mocks/livekit-mock
 */

import { EventEmitter } from 'events';
import { vi, type Mock } from 'vitest';

// ============================================================================
// TYPES
// ============================================================================

export interface MockParticipant {
  identity: string;
  sid: string;
  name: string;
  metadata?: string;
  isSpeaking: boolean;
  audioTracks: Map<string, MockTrack>;
  publishData: Mock;
  setMetadata: Mock;
}

export interface MockTrack {
  sid: string;
  name: string;
  kind: 'audio' | 'video' | 'data';
  source: 'microphone' | 'camera' | 'screen_share' | 'unknown';
  muted: boolean;
}

export interface MockRoomOptions {
  name?: string;
  participants?: MockParticipant[];
  autoConnect?: boolean;
}

export interface MockVoicePipelineOptions {
  personaId?: string;
  shouldFail?: boolean;
  responseDelay?: number;
}

// ============================================================================
// MOCK PARTICIPANT
// ============================================================================

/**
 * Create a mock LiveKit participant
 */
export function createMockParticipant(overrides: Partial<MockParticipant> = {}): MockParticipant {
  return {
    identity: `participant-${Date.now()}`,
    sid: `PA_${Math.random().toString(36).slice(2)}`,
    name: 'Test Participant',
    metadata: undefined,
    isSpeaking: false,
    audioTracks: new Map(),
    publishData: vi.fn().mockResolvedValue(undefined),
    setMetadata: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Create a mock local participant (the agent)
 */
export function createMockLocalParticipant(identity = 'voice-agent'): MockParticipant {
  return createMockParticipant({
    identity,
    name: 'Voice Agent',
    metadata: JSON.stringify({ type: 'agent' }),
  });
}

/**
 * Create a mock remote participant (the user)
 */
export function createMockRemoteParticipant(
  identity = 'test-user',
  metadata?: Record<string, unknown>
): MockParticipant {
  return createMockParticipant({
    identity,
    name: 'Test User',
    metadata: metadata ? JSON.stringify(metadata) : undefined,
  });
}

// ============================================================================
// MOCK ROOM
// ============================================================================

/**
 * Mock LiveKit Room with full event emitter support
 */
export class MockRoom extends EventEmitter {
  public name: string;
  public sid = `RM_${Math.random().toString(36).slice(2)}`;
  public state: 'disconnected' | 'connecting' | 'connected' = 'disconnected';
  public localParticipant: MockParticipant;
  public remoteParticipants = new Map<string, MockParticipant>();
  public isConnected = false;

  private autoConnect: boolean;

  constructor(options: MockRoomOptions = {}) {
    super();
    this.name = options.name || 'test-room';
    this.autoConnect = options.autoConnect ?? true;
    this.localParticipant = createMockLocalParticipant();

    // Add initial participants
    if (options.participants) {
      for (const participant of options.participants) {
        this.remoteParticipants.set(participant.identity, participant);
      }
    }
  }

  async connect(url: string, token: string): Promise<void> {
    this.state = 'connecting';
    this.emit('connectionStateChanged', 'connecting');

    // Simulate connection delay
    await new Promise<void>((resolve) => { setTimeout(resolve, 10); });

    this.state = 'connected';
    this.isConnected = true;
    this.emit('connectionStateChanged', 'connected');
    this.emit('connected');
  }

  async disconnect(): Promise<void> {
    this.state = 'disconnected';
    this.isConnected = false;
    this.emit('disconnected');
  }

  /**
   * Simulate a participant joining
   */
  simulateParticipantJoined(participant?: MockParticipant): MockParticipant {
    const p = participant || createMockRemoteParticipant();
    this.remoteParticipants.set(p.identity, p);
    this.emit('participantConnected', p);
    return p;
  }

  /**
   * Simulate a participant leaving
   */
  simulateParticipantLeft(identity: string): void {
    const participant = this.remoteParticipants.get(identity);
    if (participant) {
      this.remoteParticipants.delete(identity);
      this.emit('participantDisconnected', participant);
    }
  }

  /**
   * Simulate user speaking (voice activity)
   */
  simulateUserSpeaking(identity: string, isSpeaking: boolean): void {
    const participant = this.remoteParticipants.get(identity);
    if (participant) {
      participant.isSpeaking = isSpeaking;
      this.emit('activeSpeakersChanged', isSpeaking ? [participant] : []);
    }
  }

  /**
   * Simulate receiving a data message
   */
  simulateDataReceived(payload: Uint8Array, participant?: MockParticipant, topic?: string): void {
    this.emit('dataReceived', payload, participant, undefined, topic);
  }
}

/**
 * Create a mock room with a user already connected
 */
export function createMockRoomWithUser(
  userId = 'test-user',
  userMetadata?: Record<string, unknown>
): MockRoom {
  const room = new MockRoom({ name: 'test-room' });
  const user = createMockRemoteParticipant(userId, userMetadata);
  room.remoteParticipants.set(userId, user);
  return room;
}

// ============================================================================
// MOCK VOICE PIPELINE AGENT
// ============================================================================

/**
 * Mock VoicePipelineAgent for testing conversation flows
 */
export class MockVoicePipelineAgent extends EventEmitter {
  public isStarted = false;
  public isSpeaking = false;
  public currentUtterance: string | null = null;

  private options: MockVoicePipelineOptions;
  private utteranceQueue: string[] = [];

  constructor(options: MockVoicePipelineOptions = {}) {
    super();
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.options.shouldFail) {
      throw new Error('Mock pipeline start failure');
    }

    await new Promise<void>((resolve) => { setTimeout(resolve, 10); });
    this.isStarted = true;
    this.emit('agentStarted');
  }

  async stop(): Promise<void> {
    this.isStarted = false;
    this.isSpeaking = false;
    this.emit('agentStopped');
  }

  /**
   * Simulate agent speaking
   */
  say(text: string, options?: { allowInterruptions?: boolean }): void {
    this.utteranceQueue.push(text);
    this.currentUtterance = text;
    this.isSpeaking = true;

    this.emit('agentStartedSpeaking');

    // Simulate speaking duration
    const duration = this.options.responseDelay || text.length * 50;
    setTimeout(() => {
      this.isSpeaking = false;
      this.currentUtterance = null;
      this.emit('agentStoppedSpeaking');
    }, duration);
  }

  /**
   * Get all utterances spoken
   */
  getUtterances(): string[] {
    return [...this.utteranceQueue];
  }

  /**
   * Clear utterance history
   */
  clearUtterances(): void {
    this.utteranceQueue = [];
  }

  /**
   * Simulate user turn completion
   */
  simulateUserTurnCompleted(text: string): void {
    this.emit('userTurnCompleted', { text, timestamp: Date.now() });
  }

  /**
   * Simulate user speech start
   */
  simulateUserSpeechStart(): void {
    this.emit('userStartedSpeaking');
  }

  /**
   * Simulate user speaking (alias for simulateUserSpeechStart)
   */
  simulateUserSpeaking(): void {
    this.simulateUserSpeechStart();
  }

  /**
   * Simulate user speech end
   */
  simulateUserSpeechEnd(): void {
    this.emit('userStoppedSpeaking');
  }

  /**
   * Simulate interruption
   */
  simulateInterruption(): void {
    if (this.isSpeaking) {
      this.isSpeaking = false;
      this.currentUtterance = null;
      this.emit('agentInterrupted');
    }
  }
}

/**
 * Create a mock voice pipeline agent
 */
export function createMockVoicePipelineAgent(
  options?: MockVoicePipelineOptions
): MockVoicePipelineAgent {
  return new MockVoicePipelineAgent(options);
}

// ============================================================================
// MOCK JOB CONTEXT
// ============================================================================

export interface MockJobContext {
  job: {
    id: string;
    room?: { name: string };
    participant?: { identity: string };
    metadata?: string;
  };
  room: MockRoom;
  connect: Mock;
  shutdown: Mock;
}

/**
 * Create a mock job context for entry() function testing
 */
export function createMockJobContext(
  jobId = `job-${Date.now()}`,
  roomName = 'test-room',
  participantId = 'test-user',
  metadata?: Record<string, unknown>
): MockJobContext {
  const room = new MockRoom({ name: roomName });
  const participant = createMockRemoteParticipant(participantId);
  room.remoteParticipants.set(participantId, participant);

  return {
    job: {
      id: jobId,
      room: { name: roomName },
      participant: { identity: participantId },
      metadata: metadata ? JSON.stringify(metadata) : JSON.stringify({ persona_id: 'ferni' }),
    },
    room,
    connect: vi.fn().mockImplementation(async () => {
      await room.connect('wss://mock.livekit.cloud', 'mock-token');
    }),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
}

// ============================================================================
// MOCK JOB PROCESS
// ============================================================================

export interface MockJobProcess {
  userData: Record<string, unknown>;
}

/**
 * Create a mock job process for prewarm() function testing
 */
export function createMockJobProcess(): MockJobProcess {
  return {
    userData: {},
  };
}

// ============================================================================
// MOCK AUDIO TRACK
// ============================================================================

/**
 * Create a mock audio track
 */
export function createMockAudioTrack(overrides: Partial<MockTrack> = {}): MockTrack {
  return {
    sid: `TR_${Math.random().toString(36).slice(2)}`,
    name: 'microphone',
    kind: 'audio',
    source: 'microphone',
    muted: false,
    ...overrides,
  };
}

// ============================================================================
// LIVEKIT MODULE MOCK SETUP
// ============================================================================

/**
 * Setup complete LiveKit module mocks for vi.mock()
 */
export function setupLiveKitMocks(): void {
  vi.mock('@livekit/agents', () => ({
    defineAgent: vi.fn((definition) => definition),
    cli: {
      runApp: vi.fn(),
    },
    log: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(() => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      })),
    })),
    llm: {
      ChatContext: vi.fn().mockImplementation(() => ({
        messages: [],
        addMessage: vi.fn(),
      })),
    },
    voice: {
      VoicePipelineAgent: vi
        .fn()
        .mockImplementation((options) => new MockVoicePipelineAgent(options)),
    },
    AudioFrame: vi.fn(),
    JobContext: vi.fn(),
  }));
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createMockParticipant,
  createMockLocalParticipant,
  createMockRemoteParticipant,
  createMockRoomWithUser,
  createMockVoicePipelineAgent,
  createMockJobContext,
  createMockJobProcess,
  createMockAudioTrack,
  setupLiveKitMocks,
  MockRoom,
  MockVoicePipelineAgent,
};
