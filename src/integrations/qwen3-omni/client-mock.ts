/**
 * Mock Qwen3-Omni Client (local dev without Thinker/TTS servers)
 *
 * Use QWEN3_OMNI_MOCK=true to run Director Mode locally without the Qwen3-Omni
 * Thinker or TTS backends. Yields canned text so you can:
 * - Connect and see Director Console
 * - Speak and get a fake reply (no real LLM/audio)
 * - Exercise cast, scene, WebSocket, and UI flow
 *
 * @module qwen3-omni/client-mock
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../utils/safe-logger.js';
import type {
  Qwen3FunctionDefinition,
  Qwen3OmniMessage,
  Qwen3OmniResponse,
} from './types.js';

const log = createLogger({ module: 'qwen3-omni-mock' });

const MOCK_REPLY = "I'm here. This is Director Mode with a mock backend—no Thinker or TTS. You can still use the Director Console to try cast and scene controls.";

type StreamChunk =
  | { type: 'text'; content: string }
  | { type: 'audio'; data: string; format: string }
  | { type: 'function_call'; call: { name: string; arguments: Record<string, unknown> } }
  | { type: 'done'; finishReason: string; fullAudioBase64?: string };

/**
 * Mock client that implements Qwen3OmniClient's streaming API
 * without calling any real server.
 */
export class MockQwen3OmniClient extends EventEmitter {
  private _requestCount = 0;

  async *streamAudioCompletion(
    _messages: Qwen3OmniMessage[],
    _options: {
      tools?: Qwen3FunctionDefinition[];
      temperature?: number;
      maxTokens?: number;
      voiceDesign?: string;
      instruct?: string;
      format?: 'wav' | 'pcm' | 'opus';
      sampleRate?: number;
    }
  ): AsyncGenerator<StreamChunk> {
    this._requestCount++;
    log.info('Mock: yielding canned reply (no Thinker server)');

    // Simulate streaming text
    const words = MOCK_REPLY.split(' ');
    for (let i = 0; i < words.length; i++) {
      yield { type: 'text', content: (i === 0 ? '' : ' ') + words[i]! };
    }
    yield { type: 'done', finishReason: 'stop' };
  }

  async chatCompletion(
    _messages: Qwen3OmniMessage[],
    _options?: { tools?: Qwen3FunctionDefinition[]; stream?: boolean }
  ): Promise<Qwen3OmniResponse> {
    this._requestCount++;
    log.info('Mock: returning canned chat completion');
    return {
      id: 'mock-' + Date.now(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'mock-qwen3-omni',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: MOCK_REPLY },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }

  async *streamChatCompletion(
    _messages: Qwen3OmniMessage[],
    _options?: {
      tools?: Qwen3FunctionDefinition[];
      temperature?: number;
      maxTokens?: number;
    }
  ): AsyncGenerator<
    | { type: 'text'; content: string }
    | { type: 'function_call'; call: { name: string; arguments: Record<string, unknown> } }
    | { type: 'done'; finishReason: string }
  > {
    this._requestCount++;
    log.info('Mock: yielding canned streaming reply');
    const words = MOCK_REPLY.split(' ');
    for (let i = 0; i < words.length; i++) {
      yield { type: 'text', content: (i === 0 ? '' : ' ') + words[i]! };
    }
    yield { type: 'done', finishReason: 'stop' };
  }

  async transcribeAudio(_audioDataUrl: string): Promise<string> {
    this._requestCount++;
    log.info('Mock: returning canned transcription');
    return 'Hello, this is a mock transcription.';
  }

  async processAudioInput(
    _audioData: Uint8Array,
    _systemPrompt: string,
    _options?: { tools?: Qwen3FunctionDefinition[]; conversationHistory?: Qwen3OmniMessage[] }
  ): Promise<Qwen3OmniResponse> {
    return this.chatCompletion([], {});
  }

  async checkHealth(): Promise<{ ok: boolean; latencyMs?: number }> {
    return { ok: true, latencyMs: 0 };
  }

  get connected(): boolean {
    return true;
  }

  get requestCount(): number {
    return this._requestCount;
  }
}

/**
 * Create the mock client (used when QWEN3_OMNI_MOCK=true).
 */
export function createMockQwen3OmniClient(): MockQwen3OmniClient {
  return new MockQwen3OmniClient();
}

/**
 * Check if mock mode is enabled (no real Thinker/TTS required).
 */
export function isQwen3OmniMockEnabled(): boolean {
  return process.env.QWEN3_OMNI_MOCK === 'true';
}
