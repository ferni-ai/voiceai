import { describe, expect, it } from 'vitest';
import {
  parseUnderstanding,
  TurnUnderstander,
  understandingMode,
  type UnderstandFn,
} from '../turn-understanding.js';

const reply = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    move: 'share',
    needsTool: false,
    mood: 'venting',
    laughed: false,
    laughFits: false,
    adviceFits: false,
    wantsToEnd: false,
    reaction: 'Oof',
    ...over,
  });

/** A model that answers after `ms`, recording what it was asked. */
function fakeModel(ms = 0, answer = () => reply()) {
  const asked: Array<{ NOW: string; EARLIER: string[] }> = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fn: UnderstandFn = async (_s, input, signal) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    asked.push(JSON.parse(input));
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => (clearTimeout(t), reject(new Error('aborted'))));
    });
    inFlight--;
    return answer();
  };
  return { fn, asked, maxInFlight: () => maxInFlight };
}

describe('turn understanding', () => {
  it('is off unless TURN_UNDERSTANDING=shadow', () => {
    expect(understandingMode({})).toBe('off');
    expect(understandingMode({ TURN_UNDERSTANDING: 'shadow' })).toBe('shadow');
  });

  it('parses a usable reply and rejects anything else', () => {
    expect(parseUnderstanding(reply())).toMatchObject({
      move: 'share',
      mood: 'venting',
      reaction: 'Oof',
    });
    expect(
      parseUnderstanding(reply({ reaction: 'oh no that is really awful' }))?.reaction
    ).toBeNull();
    expect(parseUnderstanding(reply({ move: 'rant' }))).toBeNull();
    expect(parseUnderstanding(reply({ mood: 'angry' }))).toBeNull();
    expect(parseUnderstanding('not json')).toBeNull();
  });

  it('keeps one call in flight and catches up with the latest words', async () => {
    const m = fakeModel(20);
    const u = new TurnUnderstander(m.fn);
    u.onTurnText('ugh');
    u.onTurnText('ugh it has');
    u.onTurnText('ugh it has been a long day');
    await new Promise((r) => setTimeout(r, 80));
    expect(m.maxInFlight()).toBe(1);
    expect(m.asked.map((a) => a.NOW)).toEqual(['ugh', 'ugh it has been a long day']);
    expect(u.forTurn('ugh it has been a long day')?.result.mood).toBe('venting');
  });

  it('waits for two new words before asking again, and settles the end of the turn', async () => {
    const m = fakeModel(0);
    const u = new TurnUnderstander(m.fn);
    u.onTurnText('my cat');
    await new Promise((r) => setTimeout(r, 10));
    u.onTurnText('my cat just');
    await new Promise((r) => setTimeout(r, 10));
    expect(m.asked).toHaveLength(1);
    await u.settle('my cat just');
    expect(m.asked.map((a) => a.NOW)).toEqual(['my cat', 'my cat just']);
  });

  it('only answers for the words it covers', async () => {
    const u = new TurnUnderstander(fakeModel(0).fn);
    await u.settle('so anyway my week was slow');
    expect(u.forTurn('so anyway my week was slow')).not.toBeNull();
    expect(u.forTurn('so anyway my week was slow and then')).not.toBeNull(); // two words behind
    expect(u.forTurn('so anyway my week was slow and then the cat')).toBeNull();
    expect(u.forTurn('something else entirely')).toBeNull();
  });

  it('carries the last turn as context and forgets its answer', async () => {
    const m = fakeModel(0);
    const u = new TurnUnderstander(m.fn);
    await u.settle('set a timer for ten minutes');
    u.newTurn('set a timer for ten minutes');
    expect(u.forTurn('set a timer for ten minutes')).toBeNull();
    await u.settle('thanks');
    expect(m.asked.at(-1)).toEqual({ EARLIER: ['set a timer for ten minutes'], NOW: 'thanks' });
  });

  it('gives no answer when the model is too slow', async () => {
    const u = new TurnUnderstander(fakeModel(200).fn, Date.now, 30);
    await u.settle('hello there friend');
    expect(u.forTurn('hello there friend')).toBeNull();
  });
});
