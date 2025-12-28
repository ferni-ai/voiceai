/**
 * LiveKit Mock for Voice Agent Testing
 *
 * Provides mock implementations of LiveKit's agents SDK components
 * to enable unit and integration testing without requiring actual
 * LiveKit infrastructure.
 *
 * @module tests/helpers/livekit-mock
 */

import { vi } from 'vitest';
import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface MockTranscriptEvent {
  transcript: string;
  isFinal: boolean;
  confidence: number;
  startTime: number;
  endTime: number;
}

export interface MockSpeechEvent {
  type: 'start' | 'end' | 'interim';
  text?: string;
  timestamp: number;
}

export interface MockDataMessage {
  type: string;
  payload: Record<string, unknown>;
}

export interface MockParticipant {
  identity: string;
  name: string;
  metadata?: string;
  isLocal: boolean;
}

// ============================================================================
// MOCK ROOM
// ============================================================================

/**
 * Mock LiveKit Room that simulates room events and participant management
 */
export class MockRoom extends EventEmitter {
  public name: string;
  public sid: string;
  public localParticipant: MockLocalParticipant;
  public remoteParticipants = new Map<string, MockRemoteParticipant>();
  public state: 'disconnected' | 'connecting' | 'connected' = 'disconnected';

  constructor(name = 'test-room') {
    super();
    this.name = name;
    this.sid = `room-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.localParticipant = new MockLocalParticipant('agent', 'Ferni');
  }

  async connect(url: string, token: string): Promise<void> {
    this.state = 'connecting';
    await new Promise<void>((resolve) => { setTimeout(resolve, 10); });
    this.state = 'connected';
    this.emit('connected');
  }

  async disconnect(): Promise<void> {
    this.state = 'disconnected';
    this.emit('disconnected');
  }

  // Simulate a remote participant joining
  simulateParticipantJoin(
    identity: string,
    name: string,
    metadata?: string
  ): MockRemoteParticipant {
    const participant = new MockRemoteParticipant(identity, name, metadata);
    this.remoteParticipants.set(identity, participant);
    this.emit('participantConnected', participant);
    return participant;
  }

  // Simulate a remote participant leaving
  simulateParticipantLeave(identity: string): void {
    const participant = this.remoteParticipants.get(identity);
    if (participant) {
      this.remoteParticipants.delete(identity);
      this.emit('participantDisconnected', participant);
    }
  }

  // Simulate receiving a data message from a participant
  simulateDataReceived(data: MockDataMessage, participant?: MockRemoteParticipant): void {
    const payload = new TextEncoder().encode(JSON.stringify(data));
    this.emit('dataReceived', payload, participant);
  }
}

// ============================================================================
// MOCK PARTICIPANTS
// ============================================================================

export class MockLocalParticipant extends EventEmitter {
  public identity: string;
  public name: string;
  public isLocal = true;
  private publishedData: Array<{ data: Uint8Array; options: unknown }> = [];

  constructor(identity: string, name: string) {
    super();
    this.identity = identity;
    this.name = name;
  }

  async publishData(data: Uint8Array, options?: { reliable?: boolean }): Promise<void> {
    this.publishedData.push({ data, options });
    this.emit('dataPublished', data, options);
  }

  getPublishedData(): Array<{ data: Uint8Array; options: unknown }> {
    return this.publishedData;
  }

  getLastPublishedMessage(): MockDataMessage | null {
    if (this.publishedData.length === 0) return null;
    const last = this.publishedData[this.publishedData.length - 1];
    try {
      return JSON.parse(new TextDecoder().decode(last.data));
    } catch {
      return null;
    }
  }

  clearPublishedData(): void {
    this.publishedData = [];
  }
}

export class MockRemoteParticipant extends EventEmitter {
  public identity: string;
  public name: string;
  public metadata?: string;
  public isLocal = false;

  constructor(identity: string, name: string, metadata?: string) {
    super();
    this.identity = identity;
    this.name = name;
    this.metadata = metadata;
  }
}

// ============================================================================
// MOCK VOICE ASSISTANT
// ============================================================================

/**
 * Mock VoiceAssistant for testing conversation flows
 */
export class MockVoiceAssistant extends EventEmitter {
  public room: MockRoom;
  public isActive = false;
  public currentTranscript = '';

  constructor(room: MockRoom) {
    super();
    this.room = room;
  }

  start(): void {
    this.isActive = true;
    this.emit('started');
  }

  stop(): void {
    this.isActive = false;
    this.emit('stopped');
  }

  // Simulate user speech with transcript events
  async simulateUserSpeech(
    text: string,
    options: {
      partials?: boolean;
      confidence?: number;
      durationMs?: number;
    } = {}
  ): Promise<void> {
    const { partials = true, confidence = 0.95, durationMs = 1000 } = options;

    if (partials) {
      // Simulate partial transcripts
      const words = text.split(' ');
      let accumulated = '';

      for (let i = 0; i < words.length; i++) {
        accumulated += (i > 0 ? ' ' : '') + words[i];
        this.currentTranscript = accumulated;

        const event: MockTranscriptEvent = {
          transcript: accumulated,
          isFinal: false,
          confidence: confidence * 0.8, // Partials have lower confidence
          startTime: Date.now(),
          endTime: Date.now() + (durationMs / words.length) * (i + 1),
        };

        this.emit('userTranscript', event);
        await new Promise<void>((resolve) => { setTimeout(resolve, durationMs / words.length / 2); });
      }
    }

    // Final transcript
    const finalEvent: MockTranscriptEvent = {
      transcript: text,
      isFinal: true,
      confidence,
      startTime: Date.now() - durationMs,
      endTime: Date.now(),
    };

    this.currentTranscript = text;
    this.emit('userTranscript', finalEvent);
    this.emit('userSpeechEnd', { transcript: text });
  }

  // Simulate the agent speaking
  simulateAgentSpeech(text: string): void {
    this.emit('agentSpeechStart', { text });
    setTimeout(() => {
      this.emit('agentSpeechEnd', { text });
    }, text.length * 10); // Rough estimate: 10ms per character
  }
}

// ============================================================================
// MOCK LLM
// ============================================================================

export interface MockLLMResponse {
  content: string;
  toolCalls?: Array<{
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

/**
 * Mock LLM for testing agent responses
 */
export class MockLLM {
  private responses = new Map<string, MockLLMResponse>();
  private defaultResponse: MockLLMResponse = {
    content: 'I understand. Tell me more about that.',
  };
  public callCount = 0;
  public lastPrompt: string | null = null;

  // Set a canned response for a specific user input pattern
  setResponse(pattern: string | RegExp, response: MockLLMResponse): void {
    this.responses.set(pattern.toString(), response);
  }

  // Set the default response when no pattern matches
  setDefaultResponse(response: MockLLMResponse): void {
    this.defaultResponse = response;
  }

  // Generate a response (simulating LLM call)
  async generate(prompt: string): Promise<MockLLMResponse> {
    this.callCount++;
    this.lastPrompt = prompt;

    // Check for matching pattern
    for (const [pattern, response] of this.responses) {
      const regex =
        pattern.startsWith('/') && pattern.endsWith('/')
          ? new RegExp(pattern.slice(1, -1))
          : new RegExp(pattern, 'i');

      if (regex.test(prompt)) {
        return response;
      }
    }

    return this.defaultResponse;
  }

  reset(): void {
    this.responses.clear();
    this.callCount = 0;
    this.lastPrompt = null;
  }
}

// ============================================================================
// MOCK TTS
// ============================================================================

/**
 * Mock TTS for testing speech synthesis
 */
export class MockTTS {
  public synthesizedTexts: string[] = [];
  public lastVoiceId: string | null = null;

  async synthesize(text: string, voiceId?: string): Promise<Uint8Array> {
    this.synthesizedTexts.push(text);
    this.lastVoiceId = voiceId || null;

    // Return mock audio data (just the text encoded for testing)
    return new TextEncoder().encode(`[AUDIO:${text}]`);
  }

  getLastSynthesized(): string | null {
    return this.synthesizedTexts[this.synthesizedTexts.length - 1] || null;
  }

  reset(): void {
    this.synthesizedTexts = [];
    this.lastVoiceId = null;
  }
}

// ============================================================================
// MOCK VAD (Voice Activity Detection)
// ============================================================================

/**
 * Mock VAD for testing voice activity detection
 */
export class MockVAD extends EventEmitter {
  public isActive = false;

  start(): void {
    this.isActive = true;
    this.emit('started');
  }

  stop(): void {
    this.isActive = false;
    this.emit('stopped');
  }

  // Simulate voice activity
  simulateSpeechStart(): void {
    this.emit('speechStart');
  }

  simulateSpeechEnd(): void {
    this.emit('speechEnd');
  }

  // Simulate silence detection
  simulateSilence(durationMs: number): void {
    this.emit('silence', { duration: durationMs });
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a complete mock environment for voice agent testing
 */
export function createMockVoiceEnvironment(
  options: {
    roomName?: string;
    userId?: string;
    userName?: string;
  } = {}
): {
  room: MockRoom;
  assistant: MockVoiceAssistant;
  llm: MockLLM;
  tts: MockTTS;
  vad: MockVAD;
  user: MockRemoteParticipant;
} {
  const { roomName = 'test-room', userId = 'user-123', userName = 'Test User' } = options;

  const room = new MockRoom(roomName);
  const assistant = new MockVoiceAssistant(room);
  const llm = new MockLLM();
  const tts = new MockTTS();
  const vad = new MockVAD();

  // Simulate the user joining
  const user = room.simulateParticipantJoin(userId, userName);

  return { room, assistant, llm, tts, vad, user };
}

/**
 * Create Vitest mocks for @livekit/agents module
 */
export function createLiveKitAgentsMocks() {
  return {
    llm: {
      tool: vi.fn((config) => ({
        description: config.description,
        parameters: config.parameters,
        execute: config.execute,
      })),
    },
    log: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    VoiceAssistant: vi.fn(() => new MockVoiceAssistant(new MockRoom())),
    Pipeline: vi.fn(),
    Room: vi.fn(() => new MockRoom()),
    WorkerOptions: vi.fn(),
    defineAgent: vi.fn((fn) => fn),
    JobContext: vi.fn(),
  };
}

// ============================================================================
// TESTING UTILITIES
// ============================================================================

/**
 * Wait for a specific event to be emitted
 */
export function waitForEvent<T>(
  emitter: EventEmitter,
  event: string,
  timeoutMs = 5000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${event}`));
    }, timeoutMs);

    emitter.once(event, (data: T) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });
}

/**
 * Simulate a multi-turn conversation
 */
export async function simulateConversation(
  assistant: MockVoiceAssistant,
  llm: MockLLM,
  turns: Array<{ user: string; expectedResponse?: RegExp }>
): Promise<void> {
  for (const turn of turns) {
    await assistant.simulateUserSpeech(turn.user);

    // Wait a bit for processing
    await new Promise<void>((resolve) => { setTimeout(resolve, 50); });

    // Verify LLM was called
    if (turn.expectedResponse && llm.lastPrompt) {
      if (!turn.expectedResponse.test(llm.lastPrompt)) {
        throw new Error(
          `Expected prompt to match ${turn.expectedResponse}, got: ${llm.lastPrompt.slice(0, 100)}...`
        );
      }
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  MockRoom,
  MockLocalParticipant,
  MockRemoteParticipant,
  MockVoiceAssistant,
  MockLLM,
  MockTTS,
  MockVAD,
  createMockVoiceEnvironment,
  createLiveKitAgentsMocks,
  waitForEvent,
  simulateConversation,
};
