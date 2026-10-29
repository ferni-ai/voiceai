import { afterEach, describe, expect, it, vi } from 'vitest';

import { LESTER_PRO_V3_VOICE_ID } from '../../../../config/voice-ids.js';
import { prosodyTags } from '../../providers/cartesia.js';
import { DirectorEngine } from '../engine.js';
import { leverModes } from '../gate.js';
import { normalizeForSpeech, replyNormalizer } from '../normalize.js';

/** A whole reply, from its first word. */
const say = (text: string): string => normalizeForSpeech(text, '').text;

/** Pushes as the director gets them: each knows what the reply said before it. */
const sayPushes = (...pushes: string[]): string => {
  const normalize = replyNormalizer();
  return pushes.map((push) => normalize(push).text).join('');
};

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Ferni's own lines from the 2026-10-21 humanness red team on dev (#2334). */
const RED_TEAM_LINES: ReadonlyArray<readonly [string, string]> = [
  ['That is a massive shift.', "That's a massive shift."],
  ["It is a lot, even when you say it's fine.", "It's a lot, even when you say it's fine."],
  [
    'No, I am not going to say your feelings are valid.',
    "No, I'm not going to say your feelings are valid.",
  ],
  ['It is not dumb.', "It's not dumb."],
  [
    'Ugh, four emails and nothing? That is incredibly frustrating.',
    "Ugh, four emails and nothing? That's incredibly frustrating.",
  ],
  [
    'Well, I am currently hiding from my reading glasses.',
    "Well, I'm currently hiding from my reading glasses.",
  ],
];

describe('SPOKEN_CONTRACTIONS', () => {
  it.each(RED_TEAM_LINES)('off (unset or "off"): %s is spoken exactly as written', (line) => {
    expect(normalizeForSpeech(line, '')).toEqual({ text: line, count: 0 });
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'off');
    expect(normalizeForSpeech(line, '')).toEqual({ text: line, count: 0 });
  });

  it.each(RED_TEAM_LINES)('on: %s', (line, contracted) => {
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(say(line)).toBe(contracted);
  });

  it('on: counts each contraction for the shadow log', () => {
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(normalizeForSpeech('I am sure it is not that bad.', '').count).toBe(2);
  });

  it('on: "I will not" is "I won\'t"; "It is not" opening a sentence is "It\'s not"', () => {
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(say('I will not tell anyone. It is not a joke.')).toBe(
      "I won't tell anyone. It's not a joke."
    );
  });

  it('on: a negation contracts mid-clause, a subject + auxiliary only where it opens one', () => {
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(say('I will not tell anyone, and that is not a joke.')).toBe(
      "I won't tell anyone, and that's not a joke."
    );
    expect(say('I am sure it is not that bad.')).toBe("I'm sure it isn't that bad.");
  });

  it.each([
    // Clause-final: nothing follows, so "you're." would break English.
    "I'm ready when you are.",
    'Tell me who you are.',
    // A comma follows: "that is" here means "in other words".
    'That is, I think so.',
    // Stressed: the caller should hear the emphasis.
    'I am NOT going back there.',
    // Inside a word, not a pair.
    'The edit is notable.',
    // Markup is never touched.
    'It is <break time="200ms"/> a lot.',
  ])('on: leaves %s as written', (line) => {
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(say(line)).toBe(line.replace('NOT', 'not'));
  });

  /** Lead verifier's FAIL on 7dcd5c688 (PR #2347): each was contracted at a stranded spot. */
  it.each([
    'Who you are matters.',
    'I like who you are now.',
    'I know where it is now.',
    'I wonder how old they are today.',
    'I lost track of where that is anymore.',
    'I will tomorrow.',
    'Look at what there is to do.',
  ])('on: a stranded auxiliary keeps the full form: %s', (line) => {
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(normalizeForSpeech(line, '')).toEqual({ text: line, count: 0 });
  });

  /** Lead re-verify FAIL on 968abbd7f (PR #2347): a wh-phrase + adjective stranded the auxiliary. */
  it.each([
    'I can see how worried you are about this.',
    'I know how hard it is out there.',
    'Look how happy you are right now.',
    'Look how far we are right now.',
    'What a mess it is right now!',
    'I love the way you are right now.',
    'See how good it is out here.',
    'I wonder how quiet it is back there.',
    'Notice how calm you are really.',
  ])('on: an auxiliary inside an embedded clause keeps the full form: %s', (line) => {
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(normalizeForSpeech(line, '')).toEqual({ text: line, count: 0 });
  });

  it.each([
    ['However hard it is out there, we are fine.', "However hard it is out there, we're fine."],
    ['It is amazing how strong you are still.', "It's amazing how strong you are still."],
    ['It is as easy as it is now.', "It's as easy as it is now."],
  ])('on: only the clause-opening pair contracts: %s', (line, spoken) => {
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(say(line)).toBe(spoken);
  });

  it.each([
    ['Yeah, it is a lot.', "Yeah, it's a lot."],
    ['Okay. Honestly, that is a massive shift.', "Okay. Honestly, that's a massive shift."],
    ['Long day; you are so tired.', "Long day; you're so tired."],
    ['[sigh] It is a lot.', "[sigh] It's a lot."],
  ])('on: a pair that opens its clause contracts: %s', (line, contracted) => {
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(say(line)).toBe(contracted);
  });

  it.each([
    'He wrote "it is a thing" on the wall.',
    'She said \u201cI am not going\u201d and left.',
    'Type `it is a test` there.',
    'The word "cannot" is long.',
    'The sign says "do not disturb" all week.',
    'Type `did not work` in the box.',
    "Their motto is 'I am because we are.'",
    'He said \u2018it is not over\u2019 twice.',
  ])('on: quotes and code spans are spoken as with the flag off: %s', (line) => {
    const off = normalizeForSpeech(line, '');
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(normalizeForSpeech(line, '')).toEqual(off);
    expect(off.text).toMatch(/\b(it is|I am|cannot|do not|did not)\b/);
  });

  it('on: "That is who I am today" contracts only the pair with a complement', () => {
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(say('That is who I am today.')).toBe("That's who I am today.");
  });

  it.each([
    ['I am *not* going.', 'I am not going.'],
    ['It is _really_ hard.', 'It is really hard.'],
    ['*It is* a lot.', 'It is a lot.'],
  ])('on: emphasis keeps the full form: %s', (line, spoken) => {
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(say(line)).toBe(spoken);
  });

  it.each([
    ['I will call you after.', "I'll call you after."],
    ['They are so tired.', "They're so tired."],
    ['You are right about that.', "You're right about that."],
    ['There is a dog outside.', "There's a dog outside."],
    ['I am still here.', "I'm still here."],
  ])('on: a complement after the auxiliary still contracts: %s', (line, contracted) => {
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(say(line)).toBe(contracted);
  });

  it.each([
    ['That is huge.', "That's huge."],
    ['I am here.', "I'm here."],
    ['There is time.', "There's time."],
    ['Hmm, it is tricky.', "Hmm, it's tricky."],
    ['I know it is a lot, but you are not alone.', "I know it's a lot, but you're not alone."],
    ['I know how you are feeling.', "I know how you're feeling."],
  ])('on: wider coverage now the clause check holds: %s', (line, contracted) => {
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(say(line)).toBe(contracted);
  });

  it.each(['I am too.', 'They are lately.', 'You are though.', 'I am still.'])(
    'on: a lone adverb ending the clause strands the auxiliary: %s',
    (line) => {
      vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
      expect(say(line)).toBe(line);
      // A word after the adverb gives it something to modify: the pair contracts.
      expect(say(line.replace('.', ' tired.'))).toMatch(/^(I'm|They're|You're) /);
    }
  );

  it.each([
    ['It Is What It Is.', 'title case'],
    ['That is Bob.', 'a capital follows'],
    ['It is 5 already.', 'a digit follows'],
    ['You do not NEED to.', 'a stressed word follows a negation'],
    ['I cannot STAND it.', 'a stressed word follows "cannot"'],
  ])('on: needs a lowercase word after the pair: %s (%s)', (line) => {
    vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
    expect(say(line)).toBe(line);
  });

  /** Verifier FAIL on f37e7c45a (PR #2347): a push or a markup part that starts mid-sentence. */
  describe('on: a piece that starts mid-sentence', () => {
    it.each([
      [
        ['I can see how worried ', 'you are about this.'],
        'I can see how worried you are about this.',
      ],
      [['Look how far ', 'we are right now.'], 'Look how far we are right now.'],
      [['What a mess ', 'it is right now!'], 'What a mess it is right now!'],
    ])('the first push cut at a word (continuation-tts 150 ms): %j', (pushes, spoken) => {
      vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
      expect(sayPushes(...pushes)).toBe(spoken);
    });

    it.each([
      [
        'I can see how worried [sigh] you are about this.',
        'I can see how worried [sigh] you are about this.',
      ],
      [
        'Look how tired <break time="200ms"/> you are right now.',
        'Look how tired <break time="200ms"/> you are right now.',
      ],
      [
        'It is so funny how [laughter] you are always right about this stuff.',
        "It's so funny how [laughter] you are always right about this stuff.",
      ],
      ['He said "[sigh] I am not coming back."', 'He said "[sigh] I am not coming back."'],
    ])('markup in the middle of a sentence: %s', (line, spoken) => {
      vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
      expect(say(line)).toBe(spoken);
    });

    it('a push after a sentence end, or after "and", still contracts', () => {
      vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
      expect(sayPushes("It's a lot. ", 'It is a lot.')).toBe("It's a lot. It's a lot.");
      expect(sayPushes('That is a ', 'massive shift.')).toBe("That's a massive shift.");
      expect(sayPushes('It is late, and ', 'you are exhausted.')).toBe(
        "It's late, and you're exhausted."
      );
      expect(sayPushes('Long day. [sigh] ', 'It is a lot.')).toBe("Long day. [sigh] It's a lot.");
    });

    it('without what came before, a pair at the start keeps the full form', () => {
      vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
      expect(normalizeForSpeech('That is a massive shift.').text).toBe('That is a massive shift.');
      // Inside the piece, the clause is still known.
      expect(normalizeForSpeech('you see. That is a massive shift.').text).toBe(
        "you see. That's a massive shift."
      );
    });

    it('the director carries the reply into each push', () => {
      vi.stubEnv('SPOKEN_CONTRACTIONS', 'on');
      const engine = new DirectorEngine({
        modes: leverModes({ SPEECH_DIRECTOR: 'live', SPEECH_DIRECTOR_NORMALIZE: 'live' }),
        voiceId: LESTER_PRO_V3_VOICE_ID,
        carry: { speed: 1 },
        cues: { takeSighs: () => 0, opensWithSpokenSigh: false, opensWithSigh: false },
        renderTags: prosodyTags,
      });
      const spoken = [
        ...engine.take('That is so hard. I can see how worried '),
        ...engine.take('you are about this.'),
        ...engine.finish(),
      ].join('');
      expect(spoken).toContain("That's so hard.");
      expect(spoken).toContain('how worried you are about this.');
    });
  });
});
