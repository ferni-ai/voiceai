/**
 * Pins our @livekit/agents patch (patches/@livekit__agents@1.5.1.patch): a caller
 * who finishes just as Ferni's reply starts still gets a turn.
 *
 * Dev, 2026-09-30 ("Oh, and Biscuit chewed up my phone charger... So, that was
 * fun."): ink-2's final transcript for the second half was processed a moment
 * before the stale reply to the first half started playing; its END_OF_SPEECH
 * arrived a moment after, so LiveKit held it with the overlapping speech. A held
 * END_OF_SPEECH carries no text, so flushing the held events never re-emitted
 * it, the turn was never committed, and nothing answered the caller.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const agentsDist = dirname(createRequire(import.meta.url).resolve('@livekit/agents'));
const load = <T>(file: string): Promise<T> => import(pathToFileURL(join(agentsDist, file)).href);

interface Recognition {
  onSTTEvent(ev: unknown): Promise<void>;
  onStartOfAgentSpeech(at: number): Promise<unknown>;
  onEndOfAgentSpeech(ignoreUntil: number): Promise<void>;
}

async function setup() {
  const { initializeLogger } = await load<{ initializeLogger: (o: object) => void }>('log.js');
  initializeLogger({ pretty: false, level: 'silent' });
  const { AudioRecognition } = await load<{ AudioRecognition: new (o: object) => Recognition }>(
    'voice/audio_recognition.js'
  );
  const { SpeechEventType } = await load<{ SpeechEventType: Record<string, string> }>('stt/stt.js');
  const { ChatContext } = await load<{ ChatContext: { empty(): unknown } }>('llm/chat_context.js');
  const onEndOfTurn = vi.fn(async () => true);
  const hooks = {
    onInterruption: vi.fn(),
    onStartOfSpeech: vi.fn(),
    onVADInferenceDone: vi.fn(),
    onEndOfSpeech: vi.fn(),
    onInterimTranscript: vi.fn(),
    onFinalTranscript: vi.fn(),
    onEndOfTurn,
    onPreemptiveGeneration: vi.fn(),
    onAgentBackchannelOpportunity: vi.fn(),
    onUserTurnExceeded: vi.fn(),
    onEotPrediction: vi.fn(),
    retrieveChatCtx: () => ChatContext.empty(),
  };
  const recognition = new AudioRecognition({
    recognitionHooks: hooks,
    stt: async () => new ReadableStream(),
    vad: {}, // with interruptionDetection, turns on held-transcript handling
    interruptionDetection: {},
    turnDetectionMode: 'stt',
    minEndpointingDelay: 0,
    maxEndpointingDelay: 0,
  });
  const final = (text: string) => ({
    type: SpeechEventType.FINAL_TRANSCRIPT,
    alternatives: [{ text, language: 'en', startTime: 0, endTime: 0, confidence: 0.9 }],
  });
  const endOfSpeech = { type: SpeechEventType.END_OF_SPEECH };
  const committed = async () => {
    for (let i = 0; i < 20 && onEndOfTurn.mock.calls.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    return onEndOfTurn.mock.calls.map((c) => (c as unknown as [{ newTranscript: string }])[0].newTranscript);
  };
  return { recognition, final, endOfSpeech, committed };
}

describe('LiveKit held END_OF_SPEECH (patched)', () => {
  it('commits the turn when the reply starts between the final transcript and its end of speech', async () => {
    const { recognition, final, endOfSpeech, committed } = await setup();
    await recognition.onSTTEvent(final('So, that was fun.'));
    await recognition.onStartOfAgentSpeech(Date.now()); // the stale reply starts
    await recognition.onSTTEvent(endOfSpeech);
    await recognition.onEndOfAgentSpeech(Date.now()); // and is cut off
    expect(await committed()).toEqual(['So, that was fun.']);
  });

  it('still holds speech that started while Ferni was talking', async () => {
    const { recognition, final, endOfSpeech, committed } = await setup();
    await recognition.onStartOfAgentSpeech(Date.now());
    await recognition.onSTTEvent(final('mm-hmm'));
    await recognition.onSTTEvent(endOfSpeech);
    expect(await committed()).toEqual([]);
  });
});
