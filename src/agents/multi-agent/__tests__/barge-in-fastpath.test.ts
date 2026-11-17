/**
 * A clear interruption stops Ferni at three non-backchannel words; a
 * backchannel, Ferni's own voice echoed back, or speech while Ferni is quiet
 * does not.
 */
import { describe, expect, it, vi } from 'vitest';
import { labelTurn, stripTurnLabel } from '../../group-conversation/turn-label.js';
import {
  createBargeInFastPath,
  installBackchannelHook,
  shouldInterrupt,
} from '../barge-in-fastpath.js';

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

describe('sustained speech over Ferni', () => {
  function withTimers() {
    const pending: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
    const interrupt = vi.fn();
    const fp = createBargeInFastPath({
      interrupt,
      setTimer: (fn, ms) => {
        const t = { fn, ms, cleared: false };
        pending.push(t);
        return t as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: (t) => {
        (t as unknown as { cleared: boolean }).cleared = true;
      },
    });
    const elapse = () =>
      pending.filter((t) => !t.cleared).forEach((t) => ((t.cleared = true), t.fn()));
    return { fp, interrupt, pending, elapse };
  }

  it('stops Ferni when the caller keeps talking over him for about a second', () => {
    const { fp, interrupt, pending, elapse } = withTimers();
    fp.onAgentState({ newState: 'speaking' });
    fp.onUserState({ newState: 'speaking' });
    expect(pending[0].ms).toBe(950);
    elapse();
    expect(interrupt).toHaveBeenCalledTimes(1);
  });

  it('lets a backchannel that ends sooner through', () => {
    const { fp, interrupt, elapse } = withTimers();
    fp.onAgentState({ newState: 'speaking' });
    fp.onUserState({ newState: 'speaking' });
    fp.onUserState({ newState: 'listening' }); // "mm-hmm" is over
    elapse();
    expect(interrupt).not.toHaveBeenCalled();
  });

  it('does nothing while Ferni is quiet', () => {
    const { fp, interrupt, elapse } = withTimers();
    fp.onAgentState({ newState: 'listening' });
    fp.onUserState({ newState: 'speaking' });
    elapse();
    expect(interrupt).not.toHaveBeenCalled();
  });

  it('arms when Ferni starts talking over a caller who is already speaking', () => {
    const { fp, interrupt, elapse } = withTimers();
    fp.onUserState({ newState: 'speaking' });
    fp.onAgentState({ newState: 'speaking' });
    elapse();
    expect(interrupt).toHaveBeenCalledTimes(1);
  });
});

// Ink-2 writes a caller's "mm-hmm" as "M M M." (dev, 2026-10-04: 3 of 3
// talk-over calls). Read as a turn, it cut Ferni off and he re-answered the
// question he was already answering. The patched LiveKit asks this hook.
describe('the backchannel hook LiveKit consults', () => {
  const isBackchannel = (text: string): boolean => {
    installBackchannelHook();
    const hook = (globalThis as { __FERNI_IS_BACKCHANNEL?: (t: string) => boolean })
      .__FERNI_IS_BACKCHANNEL;
    return hook!(text);
  };

  it.each(['M M M.', 'M.', 'Mmm.', 'Mhmm.', 'Mm hm.', 'Hmmm.', 'Mm-hmm.', 'Uh huh.', 'Yeah.'])(
    'treats %j as a backchannel',
    (text) => expect(isBackchannel(text)).toBe(true)
  );

  it.each(['Uh-uh.', 'No.', 'Wait.', 'My mom.', 'Hmm, wait, no.'])(
    'does not treat %j as a backchannel',
    (text) => expect(isBackchannel(text)).toBe(false)
  );
});

// GROUP_CALL: while a guest is on, #4030 labels each final `[unclear] ...`, and the arbiter
// will label it `[Sarah (guest)] ...`. The label is who spoke, not what she said: counted
// as a word, `[unclear] wait, hold` cut Ferni off at two words and `[unclear] mm` was a turn.
describe('a group call turn label is not words', () => {
  /** The fast path on `call` (as live-call-behaviors.ts wires it), with Ferni talking. */
  const overFerni = (call: object) => {
    const interrupt = vi.fn();
    const fp = createBargeInFastPath({
      interrupt,
      unlabel: (transcript) => stripTurnLabel(call, transcript),
    });
    fp.onAgentState({ newState: 'speaking' });
    fp.onSpokenText(talking.spokenText);
    return { fp, interrupt };
  };

  it('counts only the words after the label toward the three it takes to interrupt', () => {
    const call = {};
    const { fp, interrupt } = overFerni(call);
    fp.onTranscript({ transcript: labelTurn(call, 'unclear', 'wait, hold'), isFinal: true });
    expect(interrupt).not.toHaveBeenCalled();
    fp.onTranscript({ transcript: labelTurn(call, 'unclear', 'wait, hold on'), isFinal: true });
    expect(interrupt).toHaveBeenCalledTimes(1);
  });

  it("still knows Ferni's own words echoed back under a label", () => {
    const call = {};
    const { fp, interrupt } = overFerni(call);
    const echo = labelTurn(call, 'Sarah (guest)', 'for her birthday I was thinking');
    fp.onTranscript({ transcript: echo, isFinal: true });
    expect(interrupt).not.toHaveBeenCalled();
  });

  it('on a solo call, a bracket the caller said is words: "[note] hi there" is three', () => {
    const { fp, interrupt } = overFerni({});
    fp.onTranscript({ transcript: '[note] hi there', isFinal: true });
    expect(interrupt).toHaveBeenCalledTimes(1);
  });

  it('a whole turn of labelled finals counts only its words: "wait. stop" is two', () => {
    const call = {};
    const { fp, interrupt } = overFerni(call);
    const turn = `${labelTurn(call, 'unclear', 'wait.')} ${labelTurn(call, 'unclear', 'stop')}`;
    fp.onTranscript({ transcript: turn, isFinal: true });
    expect(interrupt).not.toHaveBeenCalled();
    fp.onTranscript({ transcript: `${turn} ${labelTurn(call, 'unclear', 'now')}`, isFinal: true });
    expect(interrupt).toHaveBeenCalledTimes(1);
  });

  it('at end of turn, two labelled "mm"s are still a backchannel to the hook', () => {
    installBackchannelHook();
    const hook = (globalThis as { __FERNI_IS_BACKCHANNEL?: (t: string) => boolean })
      .__FERNI_IS_BACKCHANNEL;
    const call = {};
    const turn = `${labelTurn(call, 'unclear', 'Mm.')} ${labelTurn(call, 'unclear', 'Yeah.')}`;
    expect(hook?.(turn)).toBe(true);
  });

  it('the hook LiveKit consults reads a labelled "mm" as a backchannel', () => {
    installBackchannelHook();
    const hook = (globalThis as { __FERNI_IS_BACKCHANNEL?: (t: string) => boolean })
      .__FERNI_IS_BACKCHANNEL;
    expect(hook?.(labelTurn({}, 'unclear', 'Mm-hmm.'))).toBe(true);
    expect(hook?.('[Sarah (guest)] mm')).toBe(true);
    expect(hook?.('[note] hi there')).toBe(false);
  });
});
