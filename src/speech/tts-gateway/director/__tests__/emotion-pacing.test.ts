import { ReadableStream } from 'node:stream/web';
import type { AudioFrame } from '@livekit/rtc-node';
import { describe, expect, it } from 'vitest';

import { createContinuationTTS } from '../../continuation-tts.js';
import type { ReplyStream } from '../../providers/cartesia-reply-stream.js';
import { prosodyTags } from '../../providers/cartesia.js';
import { getSSMLProcessor } from '../../ssml/processor.js';
import { decideEmotion, readValence, STABLE_EMOTIONS } from '../emotion.js';
import { decideSpeed, PRO_VOICE_IDS } from '../pacing.js';
import { DirectorSessions } from '../session-state.js';

const FERNI_VOICE = 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc';

describe('STABLE_EMOTIONS (the measured-stable allowlist)', () => {
  it('is exactly the calm set continuation-tts lets through to Cartesia', async () => {
    // Behavioral check against continuation-tts's own CALM_EMOTIONS filter.
    for (const emotion of [...STABLE_EMOTIONS, 'excited', 'happy', 'surprised']) {
      const pushes: string[] = [];
      const reply: ReplyStream = {
        push: (t) => pushes.push(t),
        end: () => undefined,
        cancel: () => undefined,
        async *[Symbol.asyncIterator]() {},
      };
      const stream = createContinuationTTS({
        textStream: new ReadableStream<string>({
          start(c) {
            c.enqueue('Hello there, how are you?');
            c.close();
          },
        }),
        reply,
        sanitize: (t) => ({ text: t.trim(), prosody: {} }),
        openingTags: prosodyTags,
        emotion,
        toFrames: () => [] as AudioFrame[],
        onFirstAudio: () => undefined,
        onError: () => undefined,
      });
      for await (const _ of stream) {
        /* drain */
      }
      const passed = pushes[0].includes(`<emotion value="${emotion}"/>`);
      expect(passed).toBe((STABLE_EMOTIONS as readonly string[]).includes(emotion));
    }
  });

  it('only holds values the gateway SSML validator accepts', () => {
    const processor = getSSMLProcessor();
    for (const emotion of STABLE_EMOTIONS) {
      expect(processor.parse(`<emotion value="${emotion}"/>hi`).prosody.emotion).toBe(emotion);
    }
  });
});

describe('readValence', () => {
  it('reads heavy, bright, inquisitive and neutral openings', () => {
    expect(readValence("I'm so sorry about your dad passing.")).toBe('heavy');
    expect(readValence('Congratulations, that is amazing news!')).toBe('bright');
    expect(readValence('What happened next?')).toBe('inquisitive');
    expect(readValence('The meeting is on Tuesday.')).toBe('neutral');
  });

  it('does not make a repair, an apology or slang heavy on one weak cue', () => {
    // Review M2: each of these got the sympathetic voice and a slower pace.
    expect(readValence('Sorry, could you say that again?')).toBe('inquisitive');
    expect(readValence("That's a hard question.")).toBe('neutral');
    expect(readValence('Tough call, honestly.')).toBe('neutral');
    expect(readValence("That's sick!")).toBe('neutral');
    expect(readValence('I lost my keys again.')).toBe('neutral');
  });

  it('reads a loss or illness word, or two weak cues together, as heavy', () => {
    expect(readValence("I'm so sorry for your loss.")).toBe('heavy');
    expect(readValence('My mom was diagnosed last week.')).toBe('heavy');
    expect(readValence("I'm sorry, that sounds really hard.")).toBe('heavy');
  });

  it('keeps a repair turn untagged and at full pace', () => {
    const opening = 'Sorry, could you say that again?';
    expect(decideEmotion({ openingText: opening }).emotion).not.toBe('sympathetic');
    expect(
      decideSpeed({ valence: readValence(opening), voiceId: FERNI_VOICE, previous: 1 }).speed
    ).toBe(1);
  });

  it('does not read a positive word inside another word', () => {
    expect(readValence('That was greatly delayed.')).toBe('neutral');
  });
});

describe('decideEmotion (one per reply)', () => {
  it('keeps an authored stable emotion that fits the words', () => {
    expect(
      decideEmotion({ authored: 'sympathetic', openingText: "I'm sorry, that's hard." })
    ).toEqual({
      emotion: 'sympathetic',
      source: 'authored',
    });
  });

  it('maps an unstable authored emotion to its nearest calm one', () => {
    expect(decideEmotion({ authored: 'excited', openingText: 'That is wonderful news!' })).toEqual({
      emotion: 'content',
      source: 'mapped',
    });
  });

  it('vetoes an emotion the words contradict', () => {
    const d = decideEmotion({ authored: 'content', openingText: 'I am so sorry for your loss.' });
    expect(d.emotion).toBe('sympathetic');
    expect(d.source).toBe('words');
  });

  it('drops a contradicted emotion when the words carry no tone of their own', () => {
    expect(decideEmotion({ authored: 'angry', openingText: 'The meeting is on Tuesday.' })).toEqual(
      {
        emotion: undefined,
        source: 'none',
      }
    );
  });

  it('uses the session hint, then the previous reply, before going untagged', () => {
    expect(
      decideEmotion({ sessionHint: 'calm', openingText: 'The meeting is Tuesday.' }).source
    ).toBe('session');
    expect(decideEmotion({ previous: 'curious', openingText: 'The meeting is Tuesday.' })).toEqual({
      emotion: 'curious',
      source: 'previous',
    });
  });

  it('bridges through calm instead of jumping from sympathy to brightness', () => {
    expect(
      decideEmotion({
        previous: 'sympathetic',
        sessionHint: 'content',
        openingText: 'Okay, so Tuesday.',
      })
    ).toEqual({ emotion: 'calm', source: 'bridge' });
  });

  it('never returns anything outside the allowlist', () => {
    const inputs = ['excited', 'angry', 'scared', 'happy', 'triumphant', 'zzz', undefined];
    const chosen = new Set<string>();
    for (const authored of inputs) {
      for (const openingText of ['Wow!', 'I am sorry.', 'Why?', 'Okay.']) {
        const { emotion } = decideEmotion({ authored, openingText });
        if (emotion) chosen.add(emotion);
      }
    }
    // Non-vacuous: real tags were chosen, and every one is on the allowlist.
    expect(chosen.size).toBeGreaterThan(1);
    for (const emotion of chosen) expect(STABLE_EMOTIONS).toContain(emotion);
  });
});

describe('decideSpeed', () => {
  it('slows for heavy replies and lifts slightly for bright banter', () => {
    expect(decideSpeed({ valence: 'heavy', voiceId: FERNI_VOICE, previous: 0.94 }).speed).toBe(
      0.94
    );
    expect(decideSpeed({ valence: 'bright', voiceId: FERNI_VOICE, previous: 1.03 }).speed).toBe(
      1.03
    );
  });

  it('smooths toward the target across turns instead of jumping', () => {
    const first = decideSpeed({ valence: 'heavy', voiceId: FERNI_VOICE });
    expect(first.speed).toBe(0.97);
    const second = decideSpeed({ valence: 'heavy', voiceId: FERNI_VOICE, previous: first.speed });
    expect(second.speed).toBeLessThan(first.speed);
    expect(second.speed).toBeGreaterThanOrEqual(0.94);
  });

  it('stays inside 0.9-1.08', () => {
    // A carried speed far outside the range is pulled back in by the clamp,
    // not just by the half-way smoothing (which alone would give 0.72 / 1.52).
    expect(decideSpeed({ valence: 'heavy', voiceId: FERNI_VOICE, previous: 0.5 }).speed).toBe(0.9);
    expect(
      decideSpeed({ valence: 'bright', voiceId: FERNI_VOICE, previous: 2 }).speed
    ).toBeLessThanOrEqual(1.08);
  });

  it('asks for no speed tag on a Professional Voice Clone', () => {
    PRO_VOICE_IDS.add('pvc-voice');
    try {
      expect(decideSpeed({ valence: 'heavy', voiceId: 'pvc-voice' })).toEqual({
        speed: 1,
        supported: false,
      });
    } finally {
      PRO_VOICE_IDS.delete('pvc-voice');
    }
  });
});

describe('DirectorSessions', () => {
  it('keeps each session separate', () => {
    const sessions = new DirectorSessions(10);
    sessions.update('a', 'ferni', { emotion: 'sympathetic', speed: 0.94 });
    expect(sessions.get('a', 'ferni')).toEqual({ emotion: 'sympathetic', speed: 0.94 });
    expect(sessions.get('b', 'ferni')).toEqual({ speed: 1 });
  });

  it('starts a handed-off persona fresh inside the same session (review L3)', () => {
    const sessions = new DirectorSessions(10);
    sessions.update('a', 'ferni', { emotion: 'sympathetic', speed: 0.94 });
    expect(sessions.get('a', 'maya')).toEqual({ speed: 1 });
    expect(sessions.get('a', 'ferni').speed).toBe(0.94);
  });

  it('evicts the least recently used entry past its cap', () => {
    const sessions = new DirectorSessions(2);
    sessions.update('a', 'ferni', { speed: 0.95 });
    sessions.update('b', 'ferni', { speed: 0.96 });
    sessions.get('a', 'ferni');
    sessions.update('c', 'ferni', { speed: 0.97 });
    expect(sessions.size).toBe(2);
    expect(sessions.get('b', 'ferni')).toEqual({ speed: 1 });
    expect(sessions.get('a', 'ferni').speed).toBe(0.95);
  });

  it('forgets every persona of a session on clear, and only that session', () => {
    const sessions = new DirectorSessions(10);
    sessions.update('a', 'ferni', { speed: 0.95 });
    sessions.update('a', 'maya', { speed: 0.96 });
    sessions.update('ab', 'ferni', { speed: 0.97 });
    sessions.clear('a');
    expect(sessions.get('a', 'ferni')).toEqual({ speed: 1 });
    expect(sessions.get('a', 'maya')).toEqual({ speed: 1 });
    expect(sessions.get('ab', 'ferni').speed).toBe(0.97);
  });
});
