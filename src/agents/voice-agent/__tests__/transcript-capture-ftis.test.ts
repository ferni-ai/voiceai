/**
 * A final transcript is captured for memory even when FTIS executes a tool
 * directly and processFinalTranscript returns early.
 */
import { describe, expect, it, vi } from 'vitest';

const { captureUserTurn, runFTISRouting, generateReplyBySessionId } = vi.hoisted(() => ({
  captureUserTurn: vi.fn(() => 1),
  runFTISRouting: vi.fn(async () => ({
    attempted: true,
    bypassLLM: true,
    toolResult: {
      toolId: 'playMusic',
      success: true,
      output: 'Playing jazz',
      speakableResponse: 'Playing some jazz',
    },
    classification: { fineCategory: 'music.play', confidence: 0.95 },
    processingTimeMs: 5,
  })),
  generateReplyBySessionId: vi.fn(async () => undefined),
}));
vi.mock('../user-turn-capture.js', () => ({ captureUserTurn }));

vi.mock('../../processors/tool-routing-integration.js', () => ({
  runFTISRouting,
  isFTISEnabled: () => true,
  buildToolResponseInstructions: () => 'Tell the user the music is playing',
}));
vi.mock('../../../config/tool-routing-config.js', () => ({ isFTISEnabled: () => true }));

vi.mock('../../shared/generate-reply-gateway.js', () => ({
  generateReplyBySessionId,
  TOOL_RESPONSE_TIMEOUT_MS: 1000,
}));

import { createTranscriptHandler, type TranscriptHandlerContext } from '../transcript-handler.js';

function makeContext(): TranscriptHandlerContext {
  return {
    room: { localParticipant: undefined } as unknown as TranscriptHandlerContext['room'],
    session: { interrupt: vi.fn() } as unknown as TranscriptHandlerContext['session'],
    services: { addTurn: vi.fn() } as unknown as TranscriptHandlerContext['services'],
    sessionPersona: { id: 'ferni', displayName: 'Ferni' } as TranscriptHandlerContext['sessionPersona'],
    conversationManager: {
      isAgentSpeaking: () => false,
    } as unknown as TranscriptHandlerContext['conversationManager'],
    voiceHumanization: null,
    userData: {} as TranscriptHandlerContext['userData'],
    userId: 'user-ftis',
    sessionId: 'sess-ftis',
    silenceContext: {} as TranscriptHandlerContext['silenceContext'],
    dynamicToolLoader: {
      processMessage: async () => [],
      getLoadedDomains: () => [],
      getCurrentTools: () => ({}),
    },
    agent: {} as TranscriptHandlerContext['agent'],
    autoOptimizer: { processUserMessage: () => undefined },
  };
}

describe('transcript handler memory capture', () => {
  it('captures the user turn even when FTIS handles the turn and returns early', async () => {
    const { handler } = createTranscriptHandler(makeContext());
    handler({ transcript: 'Play some jazz for me please', isFinal: true } as Parameters<typeof handler>[0]);

    await vi.waitFor(() => expect(generateReplyBySessionId).toHaveBeenCalled(), { timeout: 10_000 });
    expect(captureUserTurn).toHaveBeenCalledTimes(1);
    expect(captureUserTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        transcript: 'Play some jazz for me please',
        sessionId: 'sess-ftis',
        userId: 'user-ftis',
        personaId: 'ferni',
      })
    );
    // Capture ran before the tool route
    const captureOrder = captureUserTurn.mock.invocationCallOrder[0] ?? 0;
    const ftisOrder = runFTISRouting.mock.invocationCallOrder[0] ?? 0;
    expect(captureOrder).toBeLessThan(ftisOrder);
  });
});
