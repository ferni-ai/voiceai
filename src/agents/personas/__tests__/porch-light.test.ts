/**
 * Porch light at 2am (PORCH_LIGHT=on): a call the caller started in their
 * small hours gets a softer, simpler turn line and a slower, quieter voice
 * through the Director. Off, outside those hours, with no known zone, or once
 * the caller needs him: nothing changes.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LESTER_PRO_V3_VOICE_ID } from '../../../config/voice-ids.js';
import { gatedReply } from '../crisis-gate.js';
import { PORCH_LIGHT_NOTE, startedInQuietHours } from '../porch-light.js';
import {
  directSpeech,
  type PlanSummary,
} from '../../../speech/tts-gateway/director/reply-director.js';
import { DirectorSessions } from '../../../speech/tts-gateway/director/session-state.js';
import {
  ferniVolume,
  porchLightOn,
  scaleVolumeTags,
  setPorchLight,
} from '../../../speech/tts-gateway/director/ferni-energy.js';

const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const NOTE = /Keep your voice low and gentle/;
const ZONE = 'America/New_York';
/** Caller's local wall time on 2026-10-11 in New York (EDT, UTC-4). */
const at = (hhmm: string): number => Date.parse(`2026-10-11T${hhmm}:00-04:00`);

let n = 0;
function call(startedAt: number, opts: { zone?: string; personaId?: string } = {}) {
  const sessionId = `porch-light-${++n}`;
  return {
    sessionId,
    session: {
      userData: {
        personaId: opts.personaId,
        callerTimezone: 'zone' in opts ? opts.zone : ZONE,
        services: { sessionId, sessionStartTime: startedAt },
      },
    },
  };
}

function request(...said: string[]): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  said.forEach((text, i) => {
    if (i > 0) ctx.addMessage({ role: 'assistant', content: 'Mm, yeah.' });
    ctx.addMessage({ role: 'user', content: text });
  });
  return ctx;
}

/** The request the model is asked with, through the live reply path. */
async function askedWith(ctx: llm.ChatContext, session: object): Promise<string> {
  let asked = '';
  const model = vi.fn(async (c: llm.ChatContext) => {
    const last = c.items[c.items.length - 1] as { textContent?: string };
    asked = last.textContent ?? '';
    return new ReadableStream({ start: (s) => s.close() });
  });
  await gatedReply(ctx, session as never, model as never, { wrap: (s: unknown) => s } as never, {
    env: PATTERNS_ONLY,
  });
  return asked;
}

afterEach(() => {
  delete process.env.PORCH_LIGHT;
});

describe('PORCH_LIGHT off (default)', () => {
  it('changes nothing at 2am: no line, normal voice', async () => {
    const { session, sessionId } = call(at('02:10'));
    const asked = await askedWith(request('Hey. Can I just talk for a bit?'), session);
    expect(asked).not.toMatch(NOTE);
    expect(porchLightOn(sessionId)).toBe(false);
    expect(ferniVolume(sessionId)).toBe(1);
  });
});

describe('PORCH_LIGHT on', () => {
  const on = () => (process.env.PORCH_LIGHT = 'on');

  it.each(['23:00', '02:10', '04:59'])(
    'a call started at %s local gets the line and the gentler voice',
    async (hhmm) => {
      on();
      const { session, sessionId } = call(at(hhmm));
      const asked = await askedWith(request('Hey. Can I just talk for a bit?'), session);
      expect(asked).toContain(PORCH_LIGHT_NOTE);
      expect(porchLightOn(sessionId)).toBe(true);
      expect(ferniVolume(sessionId)).toBeLessThan(1);
    }
  );

  it.each(['05:00', '12:00', '22:59'])('a call started at %s local is unchanged', async (hhmm) => {
    on();
    const { session, sessionId } = call(at(hhmm));
    const asked = await askedWith(request('Hey. Can I just talk for a bit?'), session);
    expect(asked).not.toMatch(NOTE);
    expect(porchLightOn(sessionId)).toBe(false);
  });

  it('uses the caller zone, not the server clock: 02:10 in Tokyo is lit, the same instant in New York is not', () => {
    const instant = Date.parse('2026-10-11T02:10:00+09:00');
    const userData = (zone: string) => ({
      callerTimezone: zone,
      services: { sessionStartTime: instant },
    });
    expect(startedInQuietHours(userData('Asia/Tokyo'), new Date())).toBe(true);
    expect(startedInQuietHours(userData(ZONE), new Date())).toBe(false);
  });

  it.each([[undefined], [''], ['Not/AZone']])(
    'with no known zone (%s) nothing changes',
    async (zone) => {
      on();
      const { session, sessionId } = call(at('02:10'), { zone });
      const asked = await askedWith(request('Hey. Can I just talk for a bit?'), session);
      expect(asked).not.toMatch(NOTE);
      expect(porchLightOn(sessionId)).toBe(false);
    }
  );

  it('with no known zone falls back to no clock at all: off at every hour of the day', () => {
    for (let h = 0; h < 24; h++) {
      const instant = Date.parse('2026-10-11T00:00:00Z') + h * 3_600_000;
      for (const zone of [undefined, '', 'Not/AZone']) {
        const userData = { callerTimezone: zone, services: { sessionStartTime: instant } };
        expect(startedInQuietHours(userData, new Date(instant))).toBe(false);
      }
    }
  });

  it('stays on for the call even as the caller clock passes 05:00', async () => {
    on();
    const { session } = call(at('04:58'));
    await askedWith(request('Hey.'), session);
    const later = await askedWith(request('Hey.', 'So anyway, about the move.'), session);
    expect(later).toContain(PORCH_LIGHT_NOTE);
  });

  it('goes back to full presence for hard news, and stays there for the call', async () => {
    on();
    const { session, sessionId } = call(at('02:10'));
    await askedWith(request('Hey. Can I just talk for a bit?'), session);
    expect(porchLightOn(sessionId)).toBe(true);
    const hard = await askedWith(
      request('Hey.', "My dad's in the hospital. They think it was a stroke."),
      session
    );
    expect(hard).not.toMatch(NOTE);
    expect(porchLightOn(sessionId)).toBe(false);
    const later = await askedWith(
      request('Hey.', "My dad's in the hospital.", 'Okay. Tell me about your day.'),
      session
    );
    expect(later).not.toMatch(NOTE);
    expect(porchLightOn(sessionId)).toBe(false);
  });

  it('goes back to full presence when the crisis gate guides the reply', async () => {
    on();
    const { session, sessionId } = call(at('02:10'));
    const asked = await askedWith(request("I hope I don't wake up tomorrow"), session);
    expect(asked).not.toMatch(NOTE);
    expect(porchLightOn(sessionId)).toBe(false);
  });

  it('leaves other personas alone', async () => {
    on();
    const { session, sessionId } = call(at('02:10'), { personaId: 'maya-santos' });
    const asked = await askedWith(request('Hey. Can I just talk for a bit?'), session);
    expect(asked).not.toMatch(NOTE);
    expect(porchLightOn(sessionId)).toBe(false);
  });
});

describe('the line', () => {
  it('never mentions the time, the night or sleep', () => {
    const forbidden =
      /\b(?:time|hour|hours|clock|late|night|tonight|midnight|morning|am|pm|\d+\s*(?:am|pm)|o'clock|sleep|sleepy|asleep|awake|tired|bed|bedtime|insomnia|rest|up)\b/i;
    expect(PORCH_LIGHT_NOTE).not.toMatch(forbidden);
  });

  it('follows the voice text rules: no em dash, no ellipsis', () => {
    expect(PORCH_LIGHT_NOTE).not.toMatch(/—|…|\.\.\./);
  });
});

describe('the Director hears it', () => {
  async function plan(sessionId: string, voiceId: string) {
    let summary: PlanSummary | undefined;
    const pushed: string[] = [];
    const sink = {
      push: (t: string) => pushed.push(t),
      end() {},
      cancel() {},
      async *[Symbol.asyncIterator]() {},
    };
    const text = 'Yeah, I know that feeling. ';
    const directed = directSpeech(sink as never, {
      textStream: new ReadableStream<string>({
        start(c) {
          c.enqueue(text);
          c.close();
        },
      }),
      voiceId,
      sessionId,
      env: { SPEECH_DIRECTOR: 'live' },
      sessions: new DirectorSessions(),
      onPlan: (s) => (summary = s),
    });
    for await (const _ of directed.textStream) {
      /* drain */
    }
    directed.reply.push(text);
    directed.reply.end();
    return { summary: summary!, spoken: pushed.join('') };
  }
  const INSTANT = 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc';

  it('an instant clone answers slower and quieter (<speed> and <volume>)', async () => {
    const normal = await plan('porch-director-off', INSTANT);
    setPorchLight('porch-director-on', true);
    const lit = await plan('porch-director-on', INSTANT);
    expect(lit.summary.speed).toBeLessThan(normal.summary.speed);
    expect(normal.summary.speed - lit.summary.speed).toBeLessThanOrEqual(0.05);
    expect(lit.spoken).toContain('<volume ratio="0.85"/>');
    expect(lit.summary.volume).toBe(0.85);
    expect(normal.spoken).not.toMatch(/<volume/);
    expect(normal.summary.volume).toBeUndefined();
  });

  it('a Pro clone gets <volume> only, and the slower pace as Stage 2 tempo', async () => {
    setPorchLight('porch-pvc-on', true);
    const lit = await plan('porch-pvc-on', LESTER_PRO_V3_VOICE_ID);
    expect(lit.spoken).toContain('<volume ratio="0.85"/>');
    expect(lit.spoken).not.toMatch(/<speed|<emotion/);
    expect(lit.summary.tempo).toBeLessThan(1);
  });

  it('scales a soft start and its later return to 1, so the reply stays quiet', () => {
    expect(scaleVolumeTags('<volume ratio="0.7"/><speed ratio="1"/>', 0.85, true)).toBe(
      '<volume ratio="0.6"/><speed ratio="1"/>'
    );
    expect(scaleVolumeTags('<volume ratio="1"/>', 0.85, false)).toBe('<volume ratio="0.85"/>');
    expect(scaleVolumeTags('', 0.85, false)).toBe('');
    expect(scaleVolumeTags('<volume ratio="1"/>', 1, true)).toBe('<volume ratio="1"/>');
  });
});
