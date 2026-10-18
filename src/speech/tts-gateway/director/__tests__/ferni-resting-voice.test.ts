/**
 * FERNI_VOICE_EMOTION / FERNI_VOICE_SPEED: Ferni's resting tone and pace
 * (Seth's "lively" pick, 2026-10-17: calm B at excited / 1.08).
 *
 * Asserted on the request bodies the real Cartesia provider sends over its
 * socket (openReplyStream through the Director), not on a config read.
 */
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const warn = vi.hoisted(() => vi.fn());
vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../utils/safe-logger.js')>();
  return {
    ...actual,
    createLogger: (bindings: { module?: string }) =>
      bindings.module === 'FerniRestingVoice'
        ? { info: vi.fn(), warn, error: vi.fn(), debug: vi.fn() }
        : actual.createLogger(bindings),
  };
});

import { CartesiaTTSProvider } from '../../providers/cartesia.js';
import { CartesiaSocket } from '../../providers/cartesia-socket.js';
import {
  ferniRestingEmotion,
  ferniRestingSpeed,
  resetFerniRestingVoiceWarnings,
} from '../ferni-resting-voice.js';
import { resetPersonaDeliveryCache } from '../persona-delivery.js';
import { directSpeech } from '../reply-director.js';
import { DirectorSessions } from '../session-state.js';

/** Ferni's calm B voice (instant clone: honours <speed> and <emotion>). */
const CALM_B = '2e7f8a26-1627-4d66-88dc-293c297c1619';
const LIVE = { SPEECH_DIRECTOR: 'live' };
const LIVELY = { ...LIVE, FERNI_VOICE_EMOTION: 'excited', FERNI_VOICE_SPEED: '1.08' };

let sent: Array<{ transcript: string; voice: { id: string } }>;

beforeEach(() => {
  sent = [];
  warn.mockClear();
  resetFerniRestingVoiceWarnings();
  resetPersonaDeliveryCache();
  vi.spyOn(CartesiaSocket.prototype, 'send').mockImplementation(async (_id, request) => {
    sent.push(request as (typeof sent)[number]);
  });
});

afterEach(() => vi.restoreAllMocks());

/** One reply through the Director into the real provider; the request bodies it sent. */
async function speak(
  text: string,
  env: Record<string, string>,
  opts: { personaId?: string; sessions?: DirectorSessions } = {}
): Promise<string[]> {
  const from = sent.length;
  const inner = new CartesiaTTSProvider().openReplyStream(CALM_B);
  const directed = directSpeech(inner, {
    textStream: new ReadableStream<string>({
      start(c) {
        c.enqueue(text);
        c.close();
      },
    }),
    voiceId: CALM_B,
    sessionId: 'lively',
    personaId: opts.personaId ?? 'ferni',
    env,
    sessions: opts.sessions ?? new DirectorSessions(),
    onPlan: () => {},
  });
  for await (const _ of directed.textStream) {
    /* observe */
  }
  directed.reply.push(text);
  directed.reply.end();
  await vi.waitFor(() => expect(sent.length - from).toBeGreaterThanOrEqual(2));
  return sent.slice(from).map((r) => r.transcript);
}

const opening = (transcripts: string[]): string => transcripts[0] ?? '';
const tagOf = (push: string, name: 'emotion' | 'speed'): string | undefined =>
  new RegExp(`<${name} (?:value|ratio)="([^"]+)"/>`).exec(push)?.[1];

describe('Ferni resting voice: unset leaves the request as it was', () => {
  it('a neutral reply carries no emotion and no speed tag', async () => {
    const push = opening(await speak('I checked the calendar for Thursday.', LIVE));
    expect(push).toBe('I checked the calendar for Thursday. ');
  });

  it("a bright reply keeps the Director's content at its own pace", async () => {
    const push = opening(await speak('That is wonderful news about the job.', LIVE));
    expect(tagOf(push, 'emotion')).toBe('content');
    expect(tagOf(push, 'speed')).toBe('1.02');
  });
});

describe('Ferni resting voice: FERNI_VOICE_EMOTION=excited, FERNI_VOICE_SPEED=1.08', () => {
  it('a neutral reply is sent excited at 1.08', async () => {
    const transcripts = await speak('I checked the calendar for Thursday.', LIVELY);
    expect(opening(transcripts)).toBe(
      '<speed ratio="1.08"/><emotion value="excited"/>I checked the calendar for Thursday. '
    );
    expect(sent[0]?.voice.id).toBe(CALM_B);
  });

  it("a bright reply's content becomes excited, on Ferni's faster rest", async () => {
    const push = opening(await speak('That is wonderful news about the job.', LIVELY));
    expect(tagOf(push, 'emotion')).toBe('excited');
    expect(Number(tagOf(push, 'speed'))).toBeGreaterThan(1.08);
  });

  it('a sympathetic reply stays sympathetic', async () => {
    const push = opening(await speak("I'm so sorry about your dad.", LIVELY));
    expect(tagOf(push, 'emotion')).toBe('sympathetic');
  });

  it("the LLM's own calm stays calm", async () => {
    const push = opening(await speak('<emotion value="calm"/>Take a breath with me.', LIVELY));
    expect(tagOf(push, 'emotion')).toBe('calm');
  });

  it('a plain reply after a sympathetic one keeps the care, not excited', async () => {
    const sessions = new DirectorSessions();
    await speak("I'm so sorry about your dad.", LIVELY, { sessions });
    const push = opening(await speak('Tell me about him.', LIVELY, { sessions }));
    expect(tagOf(push, 'emotion')).toBe('sympathetic');
  });

  it("a question keeps the Director's curious", async () => {
    const push = opening(await speak('What did the doctor say about it?', LIVELY));
    expect(tagOf(push, 'emotion')).toBe('curious');
  });

  it('a teammate is not given Ferni’s resting voice', async () => {
    const push = opening(
      await speak('I checked the calendar for Thursday.', LIVELY, { personaId: 'maya-santos' })
    );
    expect(push).toBe('I checked the calendar for Thursday. ');
  });

  it('with the emotion lever not live, no emotion is added', async () => {
    const env = { ...LIVELY, SPEECH_DIRECTOR_EMOTION: 'shadow' };
    const push = opening(await speak('I checked the calendar for Thursday.', env));
    expect(tagOf(push, 'emotion')).toBeUndefined();
    expect(tagOf(push, 'speed')).toBe('1.08');
  });
});

describe('Ferni resting voice: bad values fall back with a warning', () => {
  it('an emotion Sonic 3 does not accept is ignored', async () => {
    const env = { ...LIVE, FERNI_VOICE_EMOTION: 'zesty' };
    const push = opening(await speak('I checked the calendar for Thursday.', env));
    expect(push).toBe('I checked the calendar for Thursday. ');
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'FERNI_VOICE_EMOTION', value: 'zesty' }),
      expect.any(String)
    );
  });

  it('a speed that is not a number is ignored', async () => {
    const env = { ...LIVE, FERNI_VOICE_SPEED: 'fast' };
    const push = opening(await speak('I checked the calendar for Thursday.', env));
    expect(push).toBe('I checked the calendar for Thursday. ');
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'FERNI_VOICE_SPEED', value: 'fast' }),
      expect.any(String)
    );
  });

  it('a speed outside 0.85-1.2 is clamped, with a warning', () => {
    expect(ferniRestingSpeed({ FERNI_VOICE_SPEED: '3' })).toBe(1.2);
    expect(ferniRestingSpeed({ FERNI_VOICE_SPEED: '0.5' })).toBe(0.85);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(ferniRestingSpeed({ FERNI_VOICE_SPEED: '1.08' })).toBe(1.08);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('accepts any Sonic 3 emotion, case-insensitively', () => {
    expect(ferniRestingEmotion({ FERNI_VOICE_EMOTION: ' Excited ' })).toBe('excited');
    expect(ferniRestingEmotion({ FERNI_VOICE_EMOTION: 'grateful' })).toBe('grateful');
    expect(ferniRestingEmotion({})).toBeUndefined();
  });
});
