/**
 * One reply through the voice path the agent speaks with, as tts-wrapper.ts
 * runs it: the gateway TTS node (Speech Director, persona delivery, Cartesia)
 * then applyPostTTSEnhancement with the betterThanHuman preset. Flags are read
 * from process.env, so set them before calling. Shared by the audio evals
 * (phone-voice-blind.ts today).
 */
import { ReadableStream } from 'node:stream/web';
import type { AudioFrame } from '@livekit/rtc-node';

import {
  applyPostTTSEnhancement,
  PostTTSPresets,
} from '../../src/agents/shared/performance/post-tts-transform.js';
import { createGatewayTTSNode } from '../../src/speech/tts-gateway/gateway-tts-node.js';
import { getReplyAudioId } from '../../src/speech/tts-gateway/reply-audio-id.js';

export const RENDER_RATE = 24000;

/** The reply text as the LLM streams it: a few words at a time. */
function textStream(text: string): ReadableStream<string> {
  const words = text.split(' ');
  return new ReadableStream<string>({
    start(c) {
      for (let i = 0; i < words.length; i += 3) c.enqueue(`${words.slice(i, i + 3).join(' ')} `);
      c.close();
    },
  });
}

export interface ReplyToRender {
  text: string;
  personaId: string;
  voiceId: string;
  sessionId: string;
  /** What the caller said, for the Director. */
  userText: string;
}

/** The reply's audio after post-TTS, mono float PCM at RENDER_RATE. */
export async function renderReply(r: ReplyToRender): Promise<Float32Array> {
  const tts = createGatewayTTSNode({
    voiceId: r.voiceId,
    sessionId: r.sessionId,
    personaId: r.personaId,
    turnContext: { turnNumber: 3, userRequest: r.userText },
    sampleRate: RENDER_RATE,
    frameDurationMs: 20,
    enableCache: false,
  });
  const audio = await tts(textStream(r.text) as never);
  if (!audio) throw new Error(`no audio for ${r.personaId}`);
  const out = await applyPostTTSEnhancement(
    audio,
    { ...PostTTSPresets.betterThanHuman, sessionId: r.sessionId, personaId: r.personaId },
    getReplyAudioId(audio)
  );
  const samples: number[] = [];
  for await (const f of out as unknown as AsyncIterable<AudioFrame>) {
    if (f.sampleRate !== RENDER_RATE) throw new Error(`unexpected rate ${f.sampleRate}`);
    for (const v of new Int16Array(f.data.buffer, f.data.byteOffset, f.samplesPerChannel))
      samples.push(v / 32768);
  }
  return Float32Array.from(samples);
}
