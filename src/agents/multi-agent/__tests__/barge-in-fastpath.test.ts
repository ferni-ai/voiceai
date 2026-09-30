/**
 * A clear interruption stops Ferni at three non-backchannel words; a
 * backchannel, Ferni's own voice echoed back, or speech while Ferni is quiet
 * does not.
 */
import { describe, expect, it, vi } from 'vitest';
import { createBargeInFastPath, shouldInterrupt } from '../barge-in-fastpath.js';

const talking = {
  agentSpeaking: true,
  spokenText: 'so for her birthday I was thinking a trail day',
};

describe('shouldInterrupt', () => {
  it('stops for "Wait, sorry, hold on"', () => {
    expect(shouldInterrupt({ ...talking, transcript: 'Wait, sorry, hold on' })).toBe(true);
  });

  it('lets backchannels through, however many', () => {
    for (const t of ['Mm-hmm.', 'Yeah.', 'Uh-huh', 'yeah yeah yeah', 'oh wow okay', 'right, I see'])
      expect(shouldInterrupt({ ...talking, transcript: t })).toBe(false);
  });

  it('waits for three words', () => {
    expect(shouldInterrupt({ ...talking, transcript: 'Wait, sorry' })).toBe(false);
  });

  it("ignores the caller's mic picking up Ferni's own words", () => {
    expect(shouldInterrupt({ ...talking, transcript: 'for her birthday I was thinking' })).toBe(
      false
    );
  });

  it('does nothing while Ferni is quiet', () => {
    expect(
      shouldInterrupt({ agentSpeaking: false, spokenText: '', transcript: 'Wait, sorry, hold on' })
    ).toBe(false);
  });
});

describe('createBargeInFastPath', () => {
  it('interrupts once per reply, from live transcripts', () => {
    const interrupt = vi.fn();
    const fp = createBargeInFastPath({ interrupt });
    fp.onAgentState({ newState: 'speaking' });
    fp.onSpokenText('so for her birthday');
    fp.onTranscript({ transcript: 'Wait', isFinal: false });
    fp.onTranscript({ transcript: 'Wait, sorry, hold', isFinal: false });
    fp.onTranscript({ transcript: 'Wait, sorry, hold on. She hates surprises', isFinal: false });
    expect(interrupt).toHaveBeenCalledTimes(1);

    fp.onAgentState({ newState: 'listening' });
    fp.onAgentState({ newState: 'speaking' });
    fp.onTranscript({ transcript: 'no no hold on', isFinal: false });
    expect(interrupt).toHaveBeenCalledTimes(2);
  });

  it('ignores transcripts when Ferni is not speaking', () => {
    const interrupt = vi.fn();
    const fp = createBargeInFastPath({ interrupt });
    fp.onAgentState({ newState: 'listening' });
    fp.onTranscript({ transcript: 'I wanted to tell you something', isFinal: false });
    expect(interrupt).not.toHaveBeenCalled();
  });
});
