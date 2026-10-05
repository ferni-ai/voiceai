/** How Ferni answers the way the caller sounds: a small pace nudge, and a tone only where the words agree. */
import { describe, expect, it } from 'vitest';
import { respondToProsody } from '../prosody-response.js';

const base = { pitchMedianHz: 180, pitchRelSt: 0, pitchSlopeStPerS: 0, energyRelDb: 0, rateRel: 1, voicedMs: 3000 };

describe('respondToProsody', () => {
  it('does nothing for a caller who sounds like themself', () => {
    expect(respondToProsody(base, 'neutral')).toEqual({ speedNudge: 0, reason: 'steady' });
  });

  it('does nothing without a reading', () => {
    expect(respondToProsody(undefined, 'neutral')).toEqual({ speedNudge: 0, reason: 'no-reading' });
  });

  it('picks up a little with an excited caller, brightening only bright words', () => {
    const excited = { ...base, rateRel: 1.25, energyRelDb: 4 };
    expect(respondToProsody(excited, 'bright')).toEqual({ speedNudge: 0.03, emotion: 'content', reason: 'excited' });
    expect(respondToProsody(excited, 'neutral')).toEqual({ speedNudge: 0.03, reason: 'excited' });
  });

  it('steadies a tense caller instead of matching them', () => {
    const tense = { ...base, rateRel: 1.2, energyRelDb: 4, pitchRelSt: 3 };
    expect(respondToProsody(tense, 'neutral')).toEqual({ speedNudge: -0.03, emotion: 'calm', reason: 'tense' });
  });

  it('slows and softens for a low, tired caller', () => {
    const low = { ...base, rateRel: 0.8, energyRelDb: -4, pitchSlopeStPerS: -2.5 };
    expect(respondToProsody(low, 'heavy')).toEqual({ speedNudge: -0.06, emotion: 'sympathetic', reason: 'low' });
    expect(respondToProsody(low, 'neutral')).toEqual({ speedNudge: -0.06, emotion: 'calm', reason: 'low' });
    expect(respondToProsody(low, 'bright')).toEqual({ speedNudge: -0.06, reason: 'low' });
  });
});

describe('the director answering the caller’s voice', async () => {
  const { DirectorEngine } = await import('../engine.js');
  const { leverModes } = await import('../gate.js');
  const { prosodyTags } = await import('../../providers/cartesia.js');
  const tired = { ...base, rateRel: 0.8, energyRelDb: -5, pitchSlopeStPerS: -3 };
  const engine = (prosodyMode: 'live' | 'shadow') =>
    new DirectorEngine({
      modes: leverModes({ SPEECH_DIRECTOR: 'live', SPEECH_DIRECTOR_PROSODY: prosodyMode }),
      voiceId: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',
      carry: { speed: 1 },
      cues: { takeSighs: () => 0, opensWithSpokenSigh: false, opensWithSigh: false },
      renderTags: prosodyTags,
      callerProsody: tired,
    });
  const run = (e: InstanceType<typeof DirectorEngine>) =>
    [...e.take('Okay, I hear you. Let us take it slow tonight. '), ...e.finish()].join('');

  it('slows down and calms for a tired caller when the lever is live', () => {
    const e = engine('live');
    const out = run(e);
    expect(e.prosody.reason).toBe('low');
    expect(e.speed).toBeLessThan(1);
    expect(out).toMatch(/<emotion value="calm"\/>/);
  });

  it('only records what it would do in shadow', () => {
    const e = engine('shadow');
    const out = run(e);
    expect(e.prosody).toEqual({ speedNudge: -0.06, emotion: 'calm', reason: 'low' });
    expect(e.speed).toBe(1);
    expect(out).not.toMatch(/<emotion value="calm"\/>/);
  });
});

describe('the plan log carries the raw caller reading', async () => {
  const { ReadableStream } = await import('node:stream/web');
  const { directSpeech } = await import('../reply-director.js');
  const { DirectorSessions } = await import('../session-state.js');
  const { getCallerProsodyTracker, removeCallerProsodyTracker } = await import(
    '../../../audio-prosody/caller-prosody.js'
  );

  it('so thresholds can be set from real calls, not guessed', async () => {
    const sessionId = 'plan-log-reading';
    const tracker = getCallerProsodyTracker(sessionId);
    for (let i = 0; i < 200; i++) {
      tracker.addFrame({ pitchHz: 180, pitchConfidence: 0.9, energyDb: -30, isSpeech: true }, i * 10);
    }
    let summary: import('../reply-director.js').PlanSummary | undefined;
    const sink = {
      push() {},
      end() {},
      cancel() {},
      async *[Symbol.asyncIterator]() {},
    };
    const directed = directSpeech(sink, {
      textStream: new ReadableStream<string>({
        start(c) {
          c.enqueue('Okay, tell me more about that. ');
          c.close();
        },
      }),
      voiceId: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',
      sessionId,
      env: { SPEECH_DIRECTOR: 'live' },
      sessions: new DirectorSessions(),
      turnContext: { userRequest: 'I had a pretty long day at work today honestly' },
      onPlan: (s) => (summary = s),
    });
    for await (const _ of directed.textStream) {
      /* drain */
    }
    directed.reply.push('Okay, tell me more about that. ');
    directed.reply.end();
    removeCallerProsodyTracker(sessionId);
    expect(summary?.prosody).toBe('steady');
    expect(summary?.callerVoicedMs).toBe(2000);
    expect(summary?.callerRateRel).toBe(1);
    expect(summary?.callerEnergyRelDb).toBe(0);
  });
});
