import { describe, expect, it, vi } from 'vitest';

import { createSharedLaughRecorder, humorIncrement } from '../shared-laugh-recorder.js';

const msg = (role: 'user' | 'assistant', textContent: string) => ({
  type: 'message',
  role,
  textContent,
});

function setup() {
  let clock = 1000;
  const userData: Record<string, unknown> = {};
  const save = vi.fn().mockResolvedValue(undefined);
  const recorder = createSharedLaughRecorder({ userData, save, now: () => clock });
  const laughAt = (at: number, confidence = 0.9) => {
    userData.detectedLaughter = { isLaughing: true, confidence, suggestedResponse: 'join_in' };
    userData.detectedLaughterAt = at;
  };
  const tick = (ms: number) => (clock += ms);
  return { recorder, save, laughAt, tick };
}

describe('shared laugh recorder', () => {
  it("saves Ferni's line when the caller laughs at it", () => {
    const { recorder, save, laughAt, tick } = setup();
    recorder.onItem(msg('user', 'I named my sourdough starter Gerald'));
    recorder.onItem(msg('assistant', 'Gerald has more of a social life than I do.'));
    tick(500);
    laughAt(1500);
    recorder.onItem(msg('user', 'haha he really does'));

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toMatchObject({
      moment: 'Gerald has more of a social life than I do.',
      context: 'I named my sourdough starter Gerald',
      source: 'laugh',
    });
  });

  it('counts a laugh during the punchline, before the reply is committed', () => {
    const { recorder, save, laughAt, tick } = setup();
    recorder.onItem(msg('user', 'My cat judges my cooking'));
    tick(300);
    laughAt(1200); // laughing while Ferni is still talking
    tick(300);
    recorder.onItem(msg('assistant', 'Honestly, cats are the harshest food critics alive.'));
    recorder.onItem(msg('user', 'she really is'));

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].moment).toContain('harshest food critics');
  });

  it('ignores laughs from before the reply, unsure laughs, and caps a call at three', () => {
    const { recorder, save, laughAt, tick } = setup();
    laughAt(10); // an old laugh
    recorder.onItem(msg('assistant', 'Tell me about your weekend plans then.'));
    recorder.onItem(msg('user', 'Nothing much'));
    expect(save).not.toHaveBeenCalled();

    recorder.onItem(msg('assistant', 'That sounds like a very relaxing weekend indeed.'));
    tick(100);
    laughAt(1100, 0.3);
    recorder.onItem(msg('user', 'mm'));
    expect(save).not.toHaveBeenCalled();

    for (let i = 0; i < 5; i++) {
      recorder.onItem(msg('assistant', `Joke number ${i} about the stubborn office printer`));
      tick(100);
      laughAt(2000 + i * 1000);
      tick(1000);
      recorder.onItem(msg('user', 'haha'));
    }
    expect(save).toHaveBeenCalledTimes(3);
  });

  describe('callback outcomes', () => {
    const joke = {
      id: 'j1',
      moment: 'Gerald the sourdough starter has a better social life than me',
      context: 'baking',
      at: 1,
      source: 'laugh' as const,
    };

    function withCallback() {
      let clock = 1000;
      const userData: Record<string, unknown> = {};
      const onCallbackOutcome = vi.fn();
      let offered: typeof joke | null = null;
      const save = vi.fn().mockResolvedValue(undefined);
      const recorder = createSharedLaughRecorder({
        userData,
        save,
        now: () => clock,
        takeOfferedCallback: () => {
          const o = offered;
          offered = null;
          return o;
        },
        onCallbackOutcome,
      });
      return {
        recorder,
        save,
        onCallbackOutcome,
        offer: () => (offered = joke),
        laugh: () => {
          userData.detectedLaughter = {
            isLaughing: true,
            confidence: 0.9,
            suggestedResponse: 'join_in',
          };
          userData.detectedLaughterAt = clock + 1;
          clock += 10;
        },
        tick: () => (clock += 100),
      };
    }

    it('counts a used callback that got a laugh as landed, and does not save it as a new moment', () => {
      const t = withCallback();
      t.offer(); // recall offered it while they were talking
      t.recorder.onItem(msg('user', 'Gerald is still going strong'));
      t.tick();
      t.recorder.onItem(msg('assistant', "Is Gerald's social life still better than mine?"));
      t.laugh();
      t.recorder.onItem(msg('user', 'haha always'));

      expect(t.onCallbackOutcome).toHaveBeenCalledWith(joke, true);
      expect(t.save).not.toHaveBeenCalled();
    });

    it('counts a used callback without a laugh as flat, and ignores one the reply never used', () => {
      const t = withCallback();
      t.offer();
      t.recorder.onItem(msg('user', 'Gerald is still going strong'));
      t.recorder.onItem(msg('assistant', 'Gerald and his social life, then.'));
      t.tick();
      t.recorder.onItem(msg('user', 'yeah'));
      expect(t.onCallbackOutcome).toHaveBeenCalledWith(joke, false);

      t.onCallbackOutcome.mockClear();
      t.offer();
      t.recorder.onItem(msg('user', 'Gerald again'));
      t.recorder.onItem(msg('assistant', 'How was your week otherwise?'));
      t.recorder.onItem(msg('user', 'fine'));
      expect(t.onCallbackOutcome).not.toHaveBeenCalled();
    });
  });
});

describe('humor tally', () => {
  it('counts user turns and laughs at replies for the call', () => {
    const { recorder, laughAt, tick } = setup();
    recorder.onItem(msg('user', 'I named my sourdough starter Gerald'));
    recorder.onItem(msg('assistant', 'Gerald has more of a social life than I do.'));
    tick(500);
    laughAt(1500);
    recorder.onItem(msg('user', 'haha he really does'));
    expect(recorder.tally()).toEqual({ turns: 2, laughs: 1 });
  });

  it('adds the call once and only new laughs, across a handoff', () => {
    expect(humorIncrement({ turns: 1, laughs: 1 }, { call: false, laughs: 0 })).toBeNull();
    expect(humorIncrement({ turns: 4, laughs: 2 }, { call: false, laughs: 0 })).toEqual({
      calls: 1,
      laughs: 2,
    });
    expect(humorIncrement({ turns: 6, laughs: 3 }, { call: true, laughs: 2 })).toEqual({
      calls: 0,
      laughs: 1,
    });
    expect(humorIncrement({ turns: 6, laughs: 3 }, { call: true, laughs: 3 })).toBeNull();
  });
});
