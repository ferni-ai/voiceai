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

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
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
    await sleep(80);
    expect(m.maxInFlight()).toBe(1);
    expect(m.asked.map((a) => a.NOW)).toEqual(['ugh', 'ugh it has been a long day']);
    expect(u.forTurn('ugh it has been a long day')?.result.mood).toBe('venting');
  });

  it('waits for two new words before asking again, and settles the end of the turn', async () => {
    const m = fakeModel(0);
    const u = new TurnUnderstander(m.fn);
    u.onTurnText('my cat');
    await sleep(10);
    u.onTurnText('my cat just');
    await sleep(10);
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

  it('drops an answer that lands after the turn ended (dev: 11 of 15 turns unready)', async () => {
    const m = fakeModel(20);
    const u = new TurnUnderstander(m.fn);
    // The final's call is still running when Ferni starts to speak.
    const late = u.settle(
      'my sister finally moved out to denver last weekend and the house feels weird'
    );
    u.newTurn('my sister finally moved out to denver last weekend and the house feels weird');
    await late;
    // Its answer must not count for the next turn, nor hold the next turn's calls back.
    expect(u.forTurn('honestly so tired')).toBeNull();
    u.onTurnText('honestly so tired');
    await sleep(40);
    expect(m.asked.at(-1)?.NOW).toBe('honestly so tired');
    expect(u.forTurn('honestly so tired')?.result.mood).toBe('venting');
  });

  it('still asks about words heard while the last turn was being dropped', async () => {
    const m = fakeModel(20);
    const u = new TurnUnderstander(m.fn);
    void u.settle('it rained all weekend so we stayed in and watched movies');
    u.newTurn('it rained all weekend so we stayed in and watched movies');
    u.onTurnText('anyway what should i cook tonight');
    await sleep(60);
    expect(m.asked.at(-1)?.NOW).toBe('anyway what should i cook tonight');
    expect(u.status('anyway what should i cook tonight')).toMatchObject({
      match: 'covered',
      runs: 1,
      failed: 0,
    });
  });

  it('reports why there is no answer, without the words', async () => {
    const u = new TurnUnderstander(fakeModel(0).fn);
    expect(u.status('hi')).toMatchObject({ match: 'none', runs: 0, inFlight: false });
    await u.settle('i want to go');
    expect(u.status('i wanted to go').match).toBe('diverged');
    expect(u.status('i want to go out tonight with my friends').match).toBe('behind');
  });

  it('gives no answer when the model is too slow', async () => {
    const u = new TurnUnderstander(fakeModel(200).fn, Date.now, 30);
    await u.settle('hello there friend');
    expect(u.forTurn('hello there friend')).toBeNull();
  });
});
