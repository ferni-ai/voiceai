import { describe, expect, it, vi } from 'vitest';

import { createSharedLaughRecorder } from '../shared-laugh-recorder.js';

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
});
