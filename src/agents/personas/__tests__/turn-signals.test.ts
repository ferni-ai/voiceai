import { afterEach, describe, expect, it, vi } from 'vitest';
import { extrasFor, modelSignals, PLAIN_SIGNALS } from '../turn-extras.js';
import { turnShapeFor } from '../turn-shape.js';
import { signalsFor } from '../turn-request.js';
import {
  setTurnUnderstander,
  TurnUnderstander,
  understandingMode,
  type Understanding,
} from '../turn-understanding.js';

const understood = (over: Partial<Understanding> = {}): Understanding => ({
  move: 'share',
  needsTool: false,
  mood: 'neutral',
  laughed: false,
  laughFits: false,
  adviceFits: false,
  wantsToEnd: false,
  reaction: null,
  ...over,
});
const ALL_ON = { HUMAN_TEXTURE: 'on', LAUGH_ALONG: 'on', ASK_ADVICE: 'on' };
/** 0.5 picks a one-sentence shape (0 would pick "react", which never adds a story); then 0. */
const oneThenZero = () => {
  let first = true;
  return () => (first ? ((first = false), 0.5) : 0);
};

describe('model signals drive the turn', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reads venting, bad news and tenderness as careful, and a tool request as no time for an aside', () => {
    for (const mood of ['venting', 'bad_news', 'tender'] as const)
      expect(modelSignals(understood({ mood })).careful, mood).toBe(true);
    expect(modelSignals(understood({ mood: 'funny' })).careful).toBe(false);
    expect(modelSignals(understood({ adviceFits: true, needsTool: true })).adviceFits).toBe(false);
  });

  it('laughs where the model hears something funny, even with no keyword for it', () => {
    // No regex cue: "stole the sandwich right off the counter" is funny only in meaning.
    const said = 'my dog stole the sandwich right off the counter while I watched';
    const model = modelSignals(understood({ mood: 'funny', laughFits: true }));
    expect(extrasFor(said, 'share', 'one', false, () => 0, ALL_ON, model).fired).toContain(
      'laugh_spontaneous'
    );
  });

  it('never laughs, asks advice or tells his own story when the model hears a tender moment', () => {
    const said = 'my sister called and we both just cried for a bit';
    const model = modelSignals(understood({ mood: 'tender', laughFits: false, adviceFits: false }));
    const shape = turnShapeFor(said, oneThenZero(), 'dice', model);
    expect(shape.shape).toBe('one');
    expect(shape.extras).not.toContain('laugh_spontaneous');
    expect(shape.extras).not.toContain('ask_advice');
    expect(shape.reminder).not.toMatch(/trades a story/);
    // Control: the same turn read as light does get his own story.
    const light = turnShapeFor(
      said,
      oneThenZero(),
      'dice',
      modelSignals(understood({ mood: 'funny' }))
    );
    expect(light.reminder).toMatch(/trades a story/);
  });

  it('lets the model reading pick the move when the model also picks the shape', () => {
    // No live-topic keyword, so the regex calls this a share; the model hears a look-up.
    const said = 'is the place on fifth still doing the late menu';
    expect(turnShapeFor(said, () => 0, 'model').move).toBe('share');
    const looked = turnShapeFor(
      said,
      () => 0,
      'model',
      modelSignals(understood({ move: 'lookup' }))
    );
    expect(looked.move).toBe('lookup');
    expect(looked.reminder).toMatch(/call the tool/);
  });

  it('is plain when the model has nothing in time: no laugh, no aside', () => {
    vi.stubEnv('HUMAN_TEXTURE', 'on');
    vi.stubEnv('ASK_ADVICE', 'on');
    const out = extrasFor(
      'my cat is plotting against me',
      'share',
      'one',
      false,
      () => 0,
      ALL_ON,
      PLAIN_SIGNALS
    );
    expect(out.fired).not.toContain('laugh_spontaneous');
    expect(out.fired).not.toContain('ask_advice');
    expect(out.fired).not.toContain('opinion');
  });
});

describe('signalsFor', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses the regexes unless TURN_UNDERSTANDING=live', () => {
    vi.stubEnv('TURN_UNDERSTANDING', 'shadow');
    expect(understandingMode()).toBe('shadow');
    expect(signalsFor({}, 'hello there')).toEqual({ signals: undefined, source: 'regex' });
  });

  it('live: the model when it understood these words, plain when it has not', async () => {
    vi.stubEnv('TURN_UNDERSTANDING', 'live');
    const session = {};
    expect(signalsFor(session, 'it has been a long day')).toEqual({
      signals: PLAIN_SIGNALS,
      source: 'plain',
    });
    const u = new TurnUnderstander(async () =>
      JSON.stringify({ ...understood({ mood: 'venting' }) })
    );
    setTurnUnderstander(session, u);
    await u.settle('it has been a long day');
    const live = signalsFor(session, 'it has been a long day');
    expect(live.source).toBe('model');
    expect(live.signals?.careful).toBe(true);
    setTurnUnderstander(session, null);
    expect(signalsFor(session, 'it has been a long day').source).toBe('plain');
  });
});
