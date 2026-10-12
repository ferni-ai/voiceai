import { describe, expect, it } from 'vitest';
import {
  parseUnderstanding,
  setTurnUnderstander,
  TurnUnderstander,
  understandingMode,
  understandingOfLastTurn,
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

  it("keeps the finished turn's reading past newTurn, for the deliberator", async () => {
    const u = new TurnUnderstander(fakeModel(0).fn);
    const session = {};
    setTurnUnderstander(session, u);
    const turn = 'my sister finally moved out to denver last weekend';
    await u.settle(turn);
    expect(understandingOfLastTurn(session)).toBeNull();
    u.newTurn(turn);
    expect(u.forTurn(turn)).toBeNull();
    expect(understandingOfLastTurn(session)?.mood).toBe('venting');
    u.newTurn('a turn it never heard');
    expect(understandingOfLastTurn(session)).toBeNull();
    setTurnUnderstander(session, null);
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

  it('recovers when the model ignores the abort and never answers (dev: runs=0 for the rest of the call)', async () => {
    let calls = 0;
    const hangsOnce: UnderstandFn = async () => {
      calls++;
      // The first call never settles and ignores the abort signal.
      if (calls === 1)
        return new Promise<string>(() => {
          /* hangs */
        });
      return reply({ mood: 'funny' });
    };
    const u = new TurnUnderstander(hangsOnce, Date.now, 30);
    void u.settle('my dog stole the sandwich off the counter');
    await sleep(50);
    u.newTurn('my dog stole the sandwich off the counter');
    await u.settle('anyway he looked so proud of himself');
    expect(calls).toBe(2);
    expect(u.forTurn('anyway he looked so proud of himself')?.result.mood).toBe('funny');
  });

  it('starts on the final words at once instead of waiting for an interim call', async () => {
    const m = fakeModel(150);
    const u = new TurnUnderstander(m.fn);
    u.onTurnText('so my brother called me this morning');
    await sleep(10);
    const t0 = Date.now();
    await u.settle('so my brother called me this morning and he got the job');
    // The interim call (150 ms) was dropped, not waited for: one model wait (~150), not two (~290).
    expect(Date.now() - t0).toBeLessThan(240);
    expect(m.asked.map((a) => a.NOW)).toEqual([
      'so my brother called me this morning',
      'so my brother called me this morning and he got the job',
    ]);
    expect(u.forTurn('so my brother called me this morning and he got the job')).not.toBeNull();
    expect(u.status('so my brother called me this morning and he got the job')).toMatchObject({
      runs: 2,
      failed: 0,
      match: 'covered',
      missing: 0,
    });
  });

  it('accepts an answer missing the last quarter of a long turn, not more', async () => {
    const u = new TurnUnderstander(fakeModel(0).fn);
    const heard = 'i finally told my manager i am burned out and need'; // 11 words
    await u.settle(heard);
    const fourteen = `${heard} some time off`; // 3 missing, allowance ceil(14/4) = 4
    expect(u.forTurn(fourteen)?.result.mood).toBe('venting');
    expect(u.status(fourteen)).toMatchObject({ match: 'covered', missing: 3 });
    const seventeen = `${heard} some time off for a while`; // 6 missing, allowance 5
    expect(u.forTurn(seventeen)).toBeNull();
    expect(u.status(seventeen)).toMatchObject({ match: 'behind', missing: 6 });
    // Short turns keep the two-word floor.
    expect(u.status(`${heard} now please go`).match).toBe('covered');
  });

  it('gives no answer when the model is too slow', async () => {
    const u = new TurnUnderstander(fakeModel(200).fn, Date.now, 30);
    await u.settle('hello there friend');
    expect(u.forTurn('hello there friend')).toBeNull();
  });
});
