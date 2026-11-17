/**
 * GROUP_CALL: while anyone on the call is heard on their own stream (people-speech.ts),
 * sttChain feeds STT silence of the same length in place of the mixed input and hands the
 * SDK those streams merged by the floor arbiter: a turn ends only when everyone is quiet,
 * and every final says who spoke.
 */
import { stt } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALEX, SARAH } from '../../group-conversation/__tests__/person-speech-events.js';
import { call, final, frame, settle, textOf, typesOf } from './stt-chain-people-call.js';

const guest = vi.hoisted(() => ({ on: false }));
vi.mock('../../group-conversation/group-hearing.js', () => ({
  groupHearingFor: () => (guest.on ? { guestLastOnAt: () => Number.MAX_SAFE_INTEGER } : undefined),
}));

const { START_OF_SPEECH, FINAL_TRANSCRIPT, END_OF_SPEECH } = stt.SpeechEventType;

beforeEach(() => {
  vi.stubEnv('FIRST_TURN_FAST', 'off');
  vi.stubEnv('NAME_MISHEAR_NORMALIZE', 'off');
  vi.stubEnv('GROUP_CALL', 'on');
  guest.on = false;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sttChain with people heard on their own streams', () => {
  it('end of turn waits for everyone', async () => {
    const c = await call();
    const alex = c.hearApart(ALEX);
    const sarah = c.hearApart(SARAH);
    await alex(START_OF_SPEECH);
    await sarah(START_OF_SPEECH);
    await alex(END_OF_SPEECH); // Sarah is mid-sentence: no end of turn yet
    expect(typesOf(c.out)).toEqual([START_OF_SPEECH]);
    await sarah(FINAL_TRANSCRIPT, 'see you at six');
    await sarah(END_OF_SPEECH);
    expect(typesOf(c.out)).toEqual([START_OF_SPEECH, FINAL_TRANSCRIPT, END_OF_SPEECH]);
  });

  it('finals carry the speaker', async () => {
    const c = await call();
    const sarah = c.hearApart(SARAH);
    await sarah(START_OF_SPEECH);
    await sarah(FINAL_TRANSCRIPT, 'see you at six');
    const saidFinal = c.out[1];
    if (typeof saidFinal === 'string' || !saidFinal) throw new Error('no final');
    expect(saidFinal.alternatives?.[0]?.text).toBe('[Sarah (guest)] see you at six');
    expect(saidFinal.alternatives?.[0]?.speakerId).toBe(SARAH.identity);
  });

  it("the name fix reaches the arbiter's finals, after the label", async () => {
    vi.stubEnv('NAME_MISHEAR_NORMALIZE', 'on');
    const c = await call();
    const sarah = c.hearApart(SARAH);
    await sarah(START_OF_SPEECH);
    await sarah(FINAL_TRANSCRIPT, 'Hey Fernie, see you at six');
    expect(textOf(c.out[1])).toBe('[Sarah (guest)] Hey Ferni, see you at six');
  });

  it("the mix's own transcript is not what the SDK hears while anyone is heard apart", async () => {
    const c = await call();
    c.hearApart(ALEX);
    c.mixedSaid.put(final('both at once'));
    await settle();
    expect(c.out).toEqual([]);
  });

  it('solo: with nobody heard apart, frames and events pass as they were', async () => {
    const c = await call();
    const said1: stt.SpeechEvent = { type: START_OF_SPEECH };
    for (let i = 0; i < 4; i++) c.audio.put(frame());
    c.audio.end();
    c.mixedSaid.put(said1);
    await c.sttRead();
    await settle();
    expect(c.heard).toEqual({ samples: 4 * 160, loudFrames: 4 });
    expect(c.out).toEqual([said1]);
    expect(c.out[0]).toBe(said1);
  });
});
