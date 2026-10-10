import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script, no types
import {
  echoCheck,
  scriptLines,
  sttAccuracy,
  wordErrorRate,
} from '../../../scripts/voice-eval/transcript-checks.mjs';
// @ts-expect-error plain .mjs script, no types
import {
  backgroundReach,
  mergeAgentRoom,
  voiceSegments,
} from '../../../scripts/voice-eval/phone-merge.mjs';

describe('voice-eval transcript checks', () => {
  it('keeps only the spoken words of a scenario', () => {
    const text = [
      '# a comment',
      'Hey Ferni.',
      '',
      '@data 0 {"type":"music_control"}',
      '@backchannel 1800 Mm-hmm.',
      'Oh, and Biscuit chewed it. [[slnc 700]] So, that was fun.',
    ].join('\n');
    expect(scriptLines(text)).toEqual([
      'Hey Ferni.',
      'Mm-hmm.',
      'Oh, and Biscuit chewed it.   So, that was fun.',
    ]);
  });

  it('counts word edits, ignoring case and punctuation', () => {
    expect(wordErrorRate('Hey Ferni, long day.', 'hey ferni long day')).toEqual({
      edits: 0,
      refWords: 4,
      wer: 0,
    });
    expect(wordErrorRate('Hey Ferni, long day.', 'hey fern a long day').edits).toBe(2);
  });

  it('scores the agent captions of the caller, last caption of each utterance only', () => {
    const run = {
      userSpeech: [[100, 900]],
      events: [
        { t: 50, who: 'agent', text: 'Hey.' },
        { t: 500, who: 'user', text: 'Long' },
        { t: 900, who: 'user', text: 'Long day at work.' },
        { t: 1500, who: 'agent', text: 'Oof.' },
      ],
    };
    expect(sttAccuracy(run, ['Long day at work.'])).toMatchObject({
      edits: 0,
      refWords: 4,
      wer: 0,
    });
    expect(sttAccuracy(run, ['Long day at home.']).edits).toBe(1);
  });

  it('flags caller captions while the caller was silent, and the agent line they cut', () => {
    const run = {
      userSpeech: [
        [1000, 3000],
        [20000, 22000],
      ],
      events: [
        { t: 2500, who: 'user', text: 'Long day.' },
        { t: 7000, who: 'agent', text: 'Oh no, what' },
        { t: 9000, who: 'user', text: 'oh no what' }, // the agent's own voice, heard back
        { t: 21000, who: 'user', text: 'Anyway.' },
        { t: 23000, who: 'agent', text: 'Anyway is right.' },
      ],
    };
    expect(echoCheck(run)).toEqual({
      phantomCallerCaptions: 1,
      selfInterruptions: 1,
      phantoms: ['oh no what'],
    });
    const clean = { ...run, events: run.events.filter((e) => e.t !== 9000) };
    expect(echoCheck(clean)).toMatchObject({ phantomCallerCaptions: 0, selfInterruptions: 0 });
  });
});

describe('voice-eval phone merge', () => {
  it('finds loud stretches in PCM', () => {
    const pcm = new Int16Array(24000); // 1 s at 24 kHz
    pcm.fill(3000, 2400, 4800); // 100-200 ms
    pcm.fill(3000, 16800, 19200); // 700-800 ms
    expect(voiceSegments(pcm, 24000)).toEqual([
      [100, 190],
      [700, 790],
    ]);
  });

  it('shifts agent-room captions onto the caller clock', () => {
    const run = { wallT0: 1000, events: [], tracks: [], userSpeech: [[500, 900]] };
    const agentRoom = {
      room: 'dev-call-x',
      wallT0: 3000,
      events: [
        { t: 100, who: 'agent', text: 'Hello?' },
        { t: 50, who: 'user', text: 'Hi.' },
      ],
      tracks: [{ name: 'agent-1:roomio_audio', file: 'a.wav', startT: 10 }],
    };
    const merged = mergeAgentRoom(run, agentRoom);
    expect(merged.events).toEqual([
      { t: 2050, who: 'user', text: 'Hi.' },
      { t: 2100, who: 'agent', text: 'Hello?' },
    ]);
    expect(merged.agentRoom).toMatchObject({ room: 'dev-call-x', shiftMs: 2000 });
    expect(merged.agentRoom.tracks[0].startT).toBe(2010);
  });

  it('counts background clips played alone and whether the phone carried them', () => {
    const background = [
      [1000, 1300], // alone, heard
      [5000, 5300], // alone, not heard
      [8000, 8300], // over the reply voice: can't tell, not counted
    ];
    const reply = [[7500, 9000]];
    const heard = [
      [1400, 1600],
      [7600, 9100],
    ];
    expect(backgroundReach(background, reply, heard)).toEqual({ clips: 2, reached: 1 });
    expect(backgroundReach(background, reply, [])).toEqual({ clips: 2, reached: 0 });
  });
});
