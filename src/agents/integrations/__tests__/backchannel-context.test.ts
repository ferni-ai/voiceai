import { describe, expect, it } from 'vitest';
import {
  backchannelContextEnabled,
  classifyBackchannelContext,
  pickContextualBackchannel,
  REACTIONS,
} from '../backchannel-context.js';
import { BACKCHANNELS } from '../../shared/conversational-audio-cache.js';

const first = (): number => 0;

describe('classifyBackchannelContext', () => {
  it.each([
    ['my grandmother passed away on tuesday and', 'bad_news'],
    ['so I got laid off this morning,', 'bad_news'],
    ['and then out of nowhere the dog just', 'surprise'],
    ['turns out she knew the whole time', 'surprise'],
    ['it was honestly so funny, he', 'funny'],
    ['haha and he fell right in the pool', 'funny'],
    ['I mean, it makes sense if you', 'agreement'],
    ['we drove to the coast, and then we', 'narrative'],
  ])('%s -> %s', (text, category) => {
    expect(classifyBackchannelContext(text)).toBe(category);
  });

  it.each([
    // Substrings of cues inside other words must not fire.
    ['I work in hospitality now', 'hospital'],
    ['I accidentally ordered two pizzas', 'accident'],
    ['it felt really authentic to me', 'then'],
    ['my uncle is such a jokester', 'joke'],
    ['the saddle on that bike', 'sad'],
  ])('whole words only: "%s" does not match "%s"', (text) => {
    expect(classifyBackchannelContext(text)).toBeNull();
  });

  it('ignores a negated cue', () => {
    expect(classifyBackchannelContext('it was not funny at all')).toBeNull();
    expect(classifyBackchannelContext("the drive wasn't terrible")).toBeNull();
  });

  it('prefers bad news over an upbeat category', () => {
    expect(classifyBackchannelContext('you know, my dad died last year')).toBe('bad_news');
  });

  it('reads only the latest words of a long turn', () => {
    const old = 'my dog died years ago ' + 'and we planted a little garden out back '.repeat(3);
    expect(classifyBackchannelContext(old)).toBeNull();
  });
});

describe('pickContextualBackchannel', () => {
  it('reacts to bad news with a fitting sound', () => {
    expect(pickContextualBackchannel('so I lost my job today and', false, null, first)).toBe(
      'Oh no'
    );
  });

  it('reacts to a surprise with "Whoa"', () => {
    expect(pickContextualBackchannel('and suddenly the lights went out', false, null, first)).toBe(
      'Whoa'
    );
  });

  it('never repeats the last clip', () => {
    for (let r = 0; r < 1; r += 0.05) {
      const text = pickContextualBackchannel('then he walked in', false, 'Mm-hmm', () => r);
      expect(text).toBe('Mhm');
    }
    expect(pickContextualBackchannel('that was hilarious', false, 'Ha', first)).toBeNull();
  });

  it('gives only soft sounds in an emotional moment', () => {
    const soft = new Set(['Mm', 'Mhm', 'Mm-hmm']);
    for (let r = 0; r < 1; r += 0.05) {
      const text = pickContextualBackchannel('and then my mom died', true, null, () => r);
      expect(text).toBe('Mm');
      expect(soft.has(text ?? '')).toBe(true);
    }
    expect(pickContextualBackchannel('and suddenly the lights went out', true, null, first)).toBe(
      null
    );
    expect(pickContextualBackchannel('that was hilarious', true, null, first)).toBeNull();
  });

  it('returns null when nothing clearly fits, drawing no randomness', () => {
    let draws = 0;
    const counting = (): number => (draws++, 0);
    expect(pickContextualBackchannel('we went to the store for milk', false, null, counting)).toBe(
      null
    );
    expect(pickContextualBackchannel('', false, null, counting)).toBeNull();
    expect(draws).toBe(0);
  });

  it('only returns phrases that are pre-rendered for ferni', () => {
    const cached = new Set(BACKCHANNELS.ferni);
    const missing = Object.values(REACTIONS)
      .flat()
      .filter((p) => !cached.has(p));
    expect(missing).toEqual([]);
  });
});

describe('backchannelContextEnabled', () => {
  it('is off unless BACKCHANNEL_CONTEXT=on', () => {
    expect(backchannelContextEnabled({})).toBe(false);
    expect(backchannelContextEnabled({ BACKCHANNEL_CONTEXT: 'off' })).toBe(false);
    expect(backchannelContextEnabled({ BACKCHANNEL_CONTEXT: 'on' })).toBe(true);
  });

  it('fits what callers actually said on dev evals (2026-10-09), which all got nothing or "Right"', () => {
    const cases: Array<[string, string]> = [
      ["Hey Ferni, it's been kind of a long day.", 'bad_news'],
      ['My manager moved a big deadline up to Friday.', 'bad_news'],
      ['Oh, and Biscuit chewed up my phone charger this morning.', 'bad_news'],
      ['Okay so my cat just knocked a full glass of water onto my keyboard.', 'bad_news'],
      ["I'm pretty sure she looked me dead in the eye while she did it.", 'funny'],
      ["I'm starting to think she's plotting against me.", 'funny'],
      ['I honestly started crying.', 'tender'],
      ['And then halfway up she proposed', 'surprise'],
    ];
    for (const [said, want] of cases) expect(classifyBackchannelContext(said), said).toBe(want);
  });

  it('does not hear the new cues inside other words or after a negation', () => {
    for (const said of [
      'the crackers were stale',
      'a sickle and a hammer',
      'the classical station',
      'I was not stressed at all',
      'she wonders about it',
    ])
      expect(classifyBackchannelContext(said), said).toBeNull();
    expect(classifyBackchannelContext('I honestly think so')).toBeNull();
  });

  it('meets tears with a soft "Aw", never "Oh no" or "Right"', () => {
    for (let i = 0; i < 10; i++)
      expect(['Aw', 'Mm']).toContain(
        pickContextualBackchannel('I honestly started crying', false, null, () => i / 10)
      );
  });
});
