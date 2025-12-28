/**
 * LLM Mock Infrastructure
 *
 * Comprehensive mocks for LLM/Gemini components used in voice agent testing.
 * Supports:
 * - Streaming responses
 * - Token-by-token generation
 * - Error simulation
 * - Response timing control
 *
 * @module agents/__tests__/mocks/llm-mock
 */

import { vi, type Mock } from 'vitest';

// ============================================================================
// TYPES
// ============================================================================

export interface MockLLMOptions {
  /** Default response to return */
  defaultResponse?: string;
  /** Delay between tokens (ms) */
  tokenDelay?: number;
  /** Should fail on next call */
  shouldFail?: boolean;
  /** Error message if failing */
  errorMessage?: string;
  /** Timeout simulation (ms) */
  timeoutMs?: number;
}

export interface MockStreamChunk {
  delta: string;
  finishReason?: 'stop' | 'length' | 'error' | null;
}

export interface MockChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface MockChatContext {
  messages: MockChatMessage[];
  addMessage: Mock;
  getMessages: () => MockChatMessage[];
}

// ============================================================================
// MOCK CHAT CONTEXT
// ============================================================================

/**
 * Create a mock chat context that tracks messages
 */
export function createMockChatContext(initialMessages: MockChatMessage[] = []): MockChatContext {
  const messages = [...initialMessages];

  return {
    messages,
    addMessage: vi.fn((msg: MockChatMessage) => {
      messages.push(msg);
    }),
    getMessages: () => [...messages],
  };
}

// ============================================================================
// MOCK LLM STREAM
// ============================================================================

/**
 * Create a mock async iterator for LLM streaming
 */
export function createMockLLMStream(
  response: string,
  options: Pick<MockLLMOptions, 'tokenDelay' | 'shouldFail' | 'errorMessage'> = {}
): AsyncGenerator<MockStreamChunk> {
  const { tokenDelay = 10, shouldFail = false, errorMessage = 'LLM Error' } = options;

  // Split response into word chunks for realistic streaming
  const words = response.split(' ');

  async function* generator(): AsyncGenerator<MockStreamChunk> {
    if (shouldFail) {
      throw new Error(errorMessage);
    }

    for (let i = 0; i < words.length; i++) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, tokenDelay);
      });

      const isLast = i === words.length - 1;
      yield {
        delta: words[i] + (isLast ? '' : ' '),
        finishReason: isLast ? 'stop' : null,
      };
    }
  }

  return generator();
}

/**
 * Create a mock LLM stream that times out
 */
export function createMockTimeoutStream(timeoutMs: number): AsyncGenerator<MockStreamChunk> {
  async function* generator(): AsyncGenerator<MockStreamChunk> {
    await new Promise((_, reject) => {
      setTimeout(() => reject(new Error('LLM request timed out')), timeoutMs);
    });
    yield { delta: '', finishReason: 'error' };
  }

  return generator();
}

// ============================================================================
// MOCK LLM CLIENT
// ============================================================================

/**
 * Mock LLM client with configurable responses
 */
export class MockLLMClient {
  private options: MockLLMOptions;
  private responseQueue: string[] = [];
  private callHistory: { messages: MockChatMessage[]; response: string }[] = [];

  constructor(options: MockLLMOptions = {}) {
    this.options = {
      defaultResponse: 'I understand. Let me help you with that.',
      tokenDelay: 10,
      shouldFail: false,
      ...options,
    };
  }

  /**
   * Queue a specific response for the next call
   */
  queueResponse(response: string): void {
    this.responseQueue.push(response);
  }

  /**
   * Queue multiple responses
   */
  queueResponses(responses: string[]): void {
    this.responseQueue.push(...responses);
  }

  /**
   * Get the response for a given context
   */
  private getNextResponse(): string {
    if (this.responseQueue.length > 0) {
      return this.responseQueue.shift()!;
    }
    return this.options.defaultResponse!;
  }

  /**
   * Generate a streaming response
   */
  async *generateStream(messages: MockChatMessage[]): AsyncGenerator<MockStreamChunk> {
    if (this.options.shouldFail) {
      throw new Error(this.options.errorMessage || 'LLM generation failed');
    }

    if (this.options.timeoutMs) {
      await new Promise((_, reject) => {
        setTimeout(() => reject(new Error('LLM request timed out')), this.options.timeoutMs);
      });
    }

    const response = this.getNextResponse();
    this.callHistory.push({ messages: [...messages], response });

    yield* createMockLLMStream(response, {
      tokenDelay: this.options.tokenDelay,
    });
  }

  /**
   * Generate a non-streaming response
   */
  async generate(messages: MockChatMessage[]): Promise<string> {
    if (this.options.shouldFail) {
      throw new Error(this.options.errorMessage || 'LLM generation failed');
    }

    // Handle timeout
    if (this.options.timeoutMs !== undefined) {
      await new Promise((_, reject) => {
        setTimeout(() => reject(new Error('LLM request timed out')), this.options.timeoutMs);
      });
    }

    const response = this.getNextResponse();
    this.callHistory.push({ messages: [...messages], response });

    // Simulate processing time
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });

    return response;
  }

  /**
   * Get call history for assertions
   */
  getCallHistory(): { messages: MockChatMessage[]; response: string }[] {
    return [...this.callHistory];
  }

  /**
   * Get last call for assertions
   */
  getLastCall(): { messages: MockChatMessage[]; response: string } | undefined {
    return this.callHistory[this.callHistory.length - 1];
  }

  /**
   * Clear call history
   */
  clearHistory(): void {
    this.callHistory = [];
    this.responseQueue = [];
  }

  /**
   * Set failure mode
   */
  setFailure(shouldFail: boolean, errorMessage?: string): void {
    this.options.shouldFail = shouldFail;
    if (errorMessage) {
      this.options.errorMessage = errorMessage;
    }
  }

  /**
   * Set timeout mode
   */
  setTimeout(timeoutMs: number | undefined): void {
    this.options.timeoutMs = timeoutMs;
  }
}

/**
 * Create a mock LLM client
 */
export function createMockLLMClient(options?: MockLLMOptions): MockLLMClient {
  return new MockLLMClient(options);
}

// ============================================================================
// PREDEFINED RESPONSES
// ============================================================================

/**
 * Common response templates for testing
 */
export const mockResponses = {
  greeting: "Hey there! It's so good to hear from you. How's your day going?",

  empathetic:
    "I hear you, and that sounds really challenging. It takes courage to share something like this. Would you like to talk more about what's been going on?",

  supportive:
    "You're doing great, and I want you to know that. Every step forward, no matter how small, matters.",

  curious: "That's really interesting! Tell me more about that. What made you think of it?",

  celebratory: "That's amazing news! I'm so happy for you! This is definitely worth celebrating.",

  reflective:
    "It sounds like you've been doing a lot of thinking about this. What feels most important to you right now?",

  clarifying: 'I want to make sure I understand. Are you saying that...?',

  transitional:
    'I appreciate you sharing that. It reminds me of something we talked about before...',

  closing: "Thank you for spending this time with me today. I'm always here when you need to talk.",

  error_recovery:
    'I lost my train of thought for a moment there. Let me refocus - you were telling me about...',
};

// ============================================================================
// EMOTION-BASED RESPONSES
// ============================================================================

/**
 * Get an appropriate mock response based on detected emotion
 */
export function getMockResponseForEmotion(emotion: string, intensity = 0.5): string {
  const responses: Record<string, string[]> = {
    happy: [
      mockResponses.celebratory,
      "That's wonderful! Your energy is contagious!",
      'I love seeing you in such good spirits!',
    ],
    sad: [
      mockResponses.empathetic,
      "I'm here for you. It's okay to feel this way.",
      'Thank you for trusting me with this. How can I support you right now?',
    ],
    anxious: [
      "I can sense some worry in what you're sharing. Let's take this one step at a time.",
      "It's understandable to feel anxious about this. What would help you feel more grounded?",
      mockResponses.supportive,
    ],
    frustrated: [
      'That sounds really frustrating. Your feelings are completely valid.',
      'I can understand why that would be upsetting. Want to vent a bit more?',
      "Sometimes things just don't go our way. I'm here to listen.",
    ],
    neutral: [mockResponses.curious, mockResponses.greeting, "What's on your mind?"],
    excited: [
      'I can feel your excitement! This is so great!',
      mockResponses.celebratory,
      'Your enthusiasm is wonderful - keep that energy going!',
    ],
  };

  const emotionResponses = responses[emotion] || responses.neutral;
  const index = Math.min(
    Math.floor(intensity * emotionResponses.length),
    emotionResponses.length - 1
  );
  return emotionResponses[index];
}

// ============================================================================
// GOOGLE GENAI MOCK SETUP
// ============================================================================

/**
 * Setup Google GenAI module mocks for vi.mock()
 */
export function setupGoogleGenAIMocks(client?: MockLLMClient): void {
  const mockClient = client || createMockLLMClient();

  vi.mock('@google/genai', () => ({
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
      getGenerativeModel: vi.fn().mockReturnValue({
        generateContent: vi.fn().mockImplementation(async (prompt) => ({
          response: {
            text: () => mockClient.generate([{ role: 'user', content: prompt }]),
          },
        })),
        generateContentStream: vi.fn().mockImplementation(async (prompt) => ({
          stream: mockClient.generateStream([{ role: 'user', content: prompt }]),
        })),
      }),
    })),
  }));
}

/**
 * Setup LiveKit Agents Google plugin mocks
 */
export function setupLiveKitGoogleMocks(client?: MockLLMClient): void {
  const mockClient = client || createMockLLMClient();

  vi.mock('@livekit/agents-plugin-google', () => ({
    tts: {
      TTS: vi.fn().mockImplementation(() => ({
        synthesize: vi.fn().mockResolvedValue({
          audio: new Uint8Array(1000),
          duration: 1.5,
        }),
      })),
    },
    stt: {
      STT: vi.fn().mockImplementation(() => ({
        recognize: vi.fn().mockResolvedValue({
          text: 'Mock transcription',
          confidence: 0.95,
        }),
      })),
    },
    llm: {
      LLM: vi.fn().mockImplementation(() => ({
        chat: vi.fn().mockImplementation(async (ctx) => {
          const response = await mockClient.generate(ctx.messages || []);
          return {
            choices: [{ message: { content: response } }],
          };
        }),
        stream: vi.fn().mockImplementation((ctx) => mockClient.generateStream(ctx.messages || [])),
      })),
    },
  }));
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  createMockChatContext,
  createMockLLMStream,
  createMockTimeoutStream,
  createMockLLMClient,
  getMockResponseForEmotion,
  setupGoogleGenAIMocks,
  setupLiveKitGoogleMocks,
  mockResponses,
  MockLLMClient,
};
