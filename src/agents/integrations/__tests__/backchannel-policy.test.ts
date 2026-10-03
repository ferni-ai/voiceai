import { describe, expect, it } from 'vitest';
import {
  decideBackchannel,
  pickBackchannel,
  type BackchannelMoment,
} from '../backchannel-policy.js';

const moment = (over: Partial<BackchannelMoment> = {}): BackchannelMoment => ({
  turnCount: 2,
  userSpeakingMs: 4000,
  sinceLastBackchannelMs: 60_000,
  sinceAgentSpokeMs: 10_000,
  agentSpeaking: false,
  partialTranscript: 'and on Saturday we went hiking up by the reservoir,',
  emotional: false,
  ...over,
});
const always = (): number => 0;

describe('decideBackchannel', () => {
  it('plays at a pause a few seconds into a story', () => {
    expect(decideBackchannel(moment(), always)).toEqual({ play: true });
  });

  it.each([
    ['agent_speaking', { agentSpeaking: true }],
    ['first_turn', { turnCount: 0 }],
    ['speaking_too_short', { userSpeakingMs: 1200 }],
    ['agent_just_spoke', { sinceAgentSpokeMs: 600 }],
    ['too_soon', { sinceLastBackchannelMs: 2000 }],
    ['question', { partialTranscript: 'do you think I should go?' }],
  ])('skips when %s', (reason, over) => {
    expect(decideBackchannel(moment(over), always)).toEqual({ play: false, reason });
  });

  it('is less likely in an emotional moment', () => {
    const at = (r: number, emotional: boolean): boolean =>
      decideBackchannel(moment({ emotional }), () => r).play;
    expect(at(0.5, false)).toBe(true);
    expect(at(0.5, true)).toBe(false);
  });
});

describe('pickBackchannel', () => {
  it('never repeats the last clip', () => {
    for (let i = 0; i < 20; i++)
      expect(pickBackchannel(false, 'Yeah', () => i / 20)).not.toBe('Yeah');
  });

  it('keeps to soft sounds in an emotional moment', () => {
    for (let i = 0; i < 20; i++)
      expect(['Mm', 'Mhm', 'Mm-hmm']).toContain(pickBackchannel(true, null, () => i / 20));
  });
});
