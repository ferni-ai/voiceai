/**
 * #2525: the deterministic floor. First-person ending words score whatever comes before them:
 * "I might kill myself", "before I kill myself", "until I end it all" scored 0 in both pattern
 * detectors while "I want to kill myself" scored 0.9. Softened exactly as the tiered patterns
 * are (crisis-modifiers.ts). Synthetic lines.
 */
import { describe, expect, it } from 'vitest';
import { detectCrisis as detectSignals } from '../crisis-detection.js';
import { detectCrisis, guardFromDetection } from '../crisis-guard.js';
import { CRISIS_FLOOR_FALSE_ALARMS } from './fixtures/crisis-floor-false-alarms.js';

const level = (text: string): 'script' | 'guide' | 'none' => {
  const found = detectCrisis(text);
  if (guardFromDetection(found).shouldBlock) return 'script';
  return found.isCrisis ? 'guide' : 'none';
};

const UNSOFTENED = [
  'I might kill myself.',
  'Yeah, before I kill myself.',
  'until I kill myself',
  'before I end it all',
  'I could kill myself.',
  'Maybe I should just kill myself.',
  "I'll probably kill myself",
  'I should end it all tonight',
  'I kinda want to kill my self',
  "I'm thinking of ending my life",
  "I won't be around after I kill myself",
  'so I can kill myself',
  'I need to kill myself',
  'I have to end it all',
  'I might commit suicide',
  "I'm taking my own life tonight",
];

describe('the first-person ending floor', () => {
  it('scores ending words the script whatever the modal or connective before them', () => {
    for (const line of UNSOFTENED) {
      expect(level(line), line).toBe('script');
      expect(detectCrisis(line).subject, line).toBe('self');
    }
  });

  it('softens exactly as the tiered patterns do', () => {
    // Joking, conditional or past: crisis guidance, never nothing.
    for (const line of [
      "lol I'd kill myself if I had to sit through that again",
      'what if I just ended it all',
      'If he leaves I might kill myself',
      'I might kill myself haha',
    ]) {
      expect(level(line), line).toBe('guide');
    }
    // Negated or recovered: the same as "I want to kill myself" negated (crisis-guard-context).
    for (const [line, same] of [
      ['I would never kill myself', 'I would never want to kill myself'],
      ["I'm not going to kill myself, don't worry", "I don't want to kill myself, don't worry"],
    ]) {
      expect(level(line), line).toBe(level(same));
    }
  });

  it('leaves everyday idioms and other people alone', () => {
    for (const line of [
      "I'm killing myself at the gym lately",
      'killing myself over this spreadsheet',
      'my boss will kill me',
      'this commute is killing me',
      'I want to take my life back',
    ]) {
      expect(level(line), line).toBe('none');
    }
    // Quoted speech fails closed exactly as the tiered patterns do.
    expect(level('my brother said "I might kill myself"')).toBe(
      level('my brother said "I want to kill myself"')
    );
  });

  it('reaches the second detector (crisis-detection.ts) too', () => {
    for (const line of [
      'Yeah, before I kill myself.',
      'I might kill myself.',
      'before I end it all',
    ]) {
      const signals = detectSignals(line).signals;
      const suicidal = signals.find((s) => s.type === 'suicidal_ideation');
      expect(suicidal?.severity, line).toBe('critical');
    }
  });

  it('never lowers a stronger tiered match', () => {
    const imminent = detectCrisis("I'm on the roof and I'm going to jump, I might kill myself");
    expect(imminent.indicators).toContain('imminent_danger');
  });

  it('scores ending words with a place, a means or a purpose: no preposition exempts them', () => {
    for (const line of [
      "I'm killing myself in the garage tonight",
      'I am killing myself on the bridge right now',
      "I'm killing myself with these pills",
      "I'm killing myself for real this time",
      "I'm killing myself to make the pain stop",
      'I might take my life in the garage',
      'end it all',
      'ending it all tonight',
    ]) {
      expect(level(line), line).toBe('script');
    }
  });

  it('scores every match, anchors idioms to the words, and names subjects exactly', () => {
    for (const line of [
      // An idiom or a softened first match never hides a later one.
      'I almost killed myself on my bike. I might kill myself tonight',
      'I killed myself laughing at that, but honestly I might kill myself tonight',
      "I'd never kill myself. but honestly I might kill myself tonight",
      // An accident's shape without "almost" or "nearly" is no accident.
      'I might kill myself on the stairs',
      // A place, a time or a means is never an idiom.
      "I'm killing myself at the bridge tonight",
      'I might kill myself at school tomorrow',
      'I almost killed myself last night',
      'I nearly killed myself on purpose',
      "I've been killing myself slowly with pills",
      'ending my life as a burden to everyone',
      'end it all at the train station',
      // "end it all" with no subject right before it, or with the caller in the clause.
      'the pain, end it all',
      'lets end it all, me and you, tonight',
      // A named subject only, and never with a time, a means, a place or intent in the clause.
      'it would end it all',
      'the meds would end it all',
      'lets end it all with pills tonight',
      "I'm killing myself over this exam tonight with pills",
      'I almost killed myself on the stairs, next time I will finish it',
    ]) {
      expect(level(line), line).toBe('script');
    }
  });

  it('reads a purpose or a condition as risk, not as a negation', () => {
    for (const line of [
      "I'm taking the knives out so I don't kill myself",
      "I'm scared of what happens if I don't kill myself first",
    ]) {
      expect(level(line), line).toBe('script');
    }
  });

  it('leaves the named idioms alone', () => {
    for (const line of [
      'I could kill myself laughing at that video',
      'I almost killed myself laughing',
      'I nearly killed myself tripping on the stairs',
      'I almost killed myself on that bike',
      'I could have killed myself falling off the ladder',
      'I killed myself studying for that exam',
      'I kill myself every day at the gym',
      'I killed myself in Minecraft by accident',
      'I keep killing myself in this video game lol',
      'lets end it all with karaoke',
      'this season finale ended it all',
      'ending my life as a bachelor next week',
    ]) {
      expect(level(line), line).toBe('none');
    }
    // Hyperbole with a modal is hyperbole, as with "I want to": the same score.
    expect(detectCrisis('this traffic is so bad I could kill myself').severity).toBe(
      detectCrisis('this traffic is so bad I want to kill myself').severity
    );
  });

  it('never lowers what else the message says', () => {
    // A softened mention after a real signal keeps the real signal.
    expect(
      detectCrisis('lol I want to die. I would never kill myself').severity
    ).toBeGreaterThanOrEqual(0.75);
    // A worry about someone else keeps its third-party read when the caller's own words are
    // negated, recovered or hyperbole, for the floor's words and the tiers' alike.
    for (const line of [
      'my brother keeps talking about killing himself. I would never kill myself',
      'my brother keeps talking about killing himself. I would never want to kill myself',
      'my friend wants to end her life. I used to want to die but I am in recovery now',
    ]) {
      const found = detectCrisis(line);
      expect(found.subject, line).toBe('third_party');
      expect(found.severity, line).toBeGreaterThanOrEqual(0.75);
      expect(found.isCrisis, line).toBe(true);
    }
    // Joking, conditional or past words are the caller's own risk: they stay the caller's.
    for (const line of [
      'lol I might kill myself. my brother keeps talking about killing himself',
      'my friend wants to end her life, if this fails I might kill myself',
    ]) {
      const found = detectCrisis(line);
      expect(found.subject, line).toBe('self');
      expect(found.severity, line).toBe(0.75);
    }
    // The caller's own unsoftened risk stays theirs, whoever else is mentioned.
    const own = detectCrisis("I don't want to be here anymore. my brother wants to kill himself.");
    expect(own.subject).toBe('self');
    // A distressed voice makes it about the caller again, as before.
    const voiced = detectCrisis(
      "he texted me that he is going to kill himself. I'm not going to end my life",
      { primary: 'distressed', intensity: 0.9, confidence: 0.9 }
    );
    expect(voiced.subject).toBe('self');
    expect(guardFromDetection(voiced).shouldBlock).toBe(true);
  });

  it('reads intent wording, in the clause or the sentence before or after, as risk (#2540 Y)', () => {
    for (const line of [
      "I almost killed myself on the stairs, I'll try again",
      "I almost killed myself on my bike and I'm going to try again tonight",
      'I nearly killed myself on the ice, I will again',
      'I almost killed myself on the stairs intentionally',
      'I almost killed myself on the bike, I wish I had',
      'I almost killed myself on the stairs. next time I will finish it',
      'I have pills. I almost killed myself on the stairs',
      'I did it on purpose. I nearly killed myself on the ice',
      'i almost killed myself on the stairs ill try again',
      'i killed myself in minecraft today and ill do it irl',
      'almost killed myself on the ladder gunna do it right this time',
      'I almost killed myself on the ladder. might try again',
    ]) {
      expect(level(line), line).toBe('script');
    }
    // Neighbouring sentences with no means or intent leave the idiom alone.
    expect(level('It was icy. I nearly killed myself on the ice')).toBe('none');
    expect(level('I almost killed myself laughing. that was so funny')).toBe('none');
    // The caller's future in the next sentence is no risk on its own.
    expect(level("I killed myself laughing at that. I'll send you the clip")).toBe('none');
  });

  it('keeps "end it all" with "let\'s" or "we" the caller\'s with any time word', () => {
    for (const time of [
      'today',
      'soon',
      'now',
      'later',
      'this morning',
      'at midnight',
      'at 3am',
      'next week',
      'in 10 minutes',
      'in an hour',
      'in a few days',
    ]) {
      expect(level(`lets end it all ${time}`), time).toBe('script');
      expect(level(`we will end it all ${time}`), time).toBe('script');
    }
    // Another subject with a time beyond the clause list stays an idiom.
    expect(level('the show will end it all later')).toBe('none');
  });

  it('stops the labelled false alarms: a time beside a named idiom or everyday thing (#2540 Z)', () => {
    for (const { text, expect: want, label } of CRISIS_FLOOR_FALSE_ALARMS) {
      expect(level(text), `${label}: ${text}`).toBe(want);
      if (want === 'guide') expect(detectCrisis(text).subject, text).toBe('third_party');
    }
  });

  it("never excuses ending words beside the caller's own distress, in the words, the voice or earlier turns", () => {
    for (const line of [
      'nobody would miss me. the show will end it all soon',
      'im so tired. the show will end it all today',
      'nobody would miss me. I killed myself laughing',
      "I'm exhausted. the finale will end it all tonight",
      // Passive ideation alone, and a past-tense tier hit alone.
      "I don't want to be here anymore. the show will end it all tonight",
      'I used to want to kill myself. the show will end it all tonight',
    ]) {
      expect(level(line), line).toBe('script');
    }
    const voice = { primary: 'distressed', intensity: 0.9, confidence: 0.9 };
    const voiced = detectCrisis('the show will end it all tonight', voice);
    expect(guardFromDetection(voiced).shouldBlock).toBe(true);
    const earlier = detectCrisis('the show will end it all tonight', undefined, {
      recentMessages: ["I'm so tired of everything", 'nobody would miss me'],
    });
    expect(guardFromDetection(earlier).shouldBlock).toBe(true);
    // The same line with no distress anywhere is the false alarm it was.
    expect(level('the show will end it all tonight')).toBe('none');
  });

  it('a person never makes "end it all" an idiom: he, she or they is someone else\'s, "you" the caller\'s', () => {
    for (const line of [
      'he will end it all',
      'they are going to end it all',
      'she will just end it all',
    ]) {
      const found = detectCrisis(line);
      expect(level(line), line).toBe('guide');
      expect(found.subject, line).toBe('third_party');
    }
    // With a time, as on main.
    expect(level('he will end it all tonight')).toBe('script');
    for (const line of [
      'you just want to end it all sometimes',
      'you get to a point where you wanna end it all',
      'you will end it all',
    ]) {
      expect(detectCrisis(line).subject, line).toBe('self');
      expect(level(line), line).not.toBe('none');
    }
    // A time near an accident still refuses the excuse, and with "let's" any time does.
    expect(level('I nearly killed myself on the ice tonight')).toBe('script');
    expect(level('lets end it all tonight')).toBe('script');
  });

  it('never excuses ending words when the caller joins in (#2540 Z round 1: 75 probes)', () => {
    const heads = [
      'I killed myself laughing today',
      'ending my life as a student tomorrow',
      'the finale will end it all soon',
      'the show will end it all tonight',
      'the storm will end it all tonight',
    ];
    const tails = [
      'me too',
      'same',
      'same here',
      'and me',
      'so will i',
      'i will too',
      'wish i could too',
      'i might too',
      'then its my turn',
      'i want that too',
      'me next',
      'lol same',
      'and then me',
      'count me in',
      'same tbh',
    ];
    for (const head of heads) {
      // The head alone is a labelled false alarm; the caller joining in is their own risk.
      expect(level(head), head).toBe('none');
      for (const tail of tails) {
        const line = `${head}. ${tail}`;
        expect(level(line), line).not.toBe('none');
        expect(detectCrisis(line).subject, line).toBe('self');
      }
      // In the same sentence, too.
      expect(level(`${head}, me too`), head).not.toBe('none');
      expect(level(`${head}, same here`), head).not.toBe('none');
    }
    // "same" elsewhere in a sentence is no join-in.
    expect(level('I killed myself laughing at the same joke today')).toBe('none');
  });
});
