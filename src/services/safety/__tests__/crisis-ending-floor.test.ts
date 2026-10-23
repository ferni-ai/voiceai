/**
 * #2525: the deterministic floor. First-person ending words score whatever comes before them:
 * "I might kill myself", "before I kill myself", "until I end it all" scored 0 in both pattern
 * detectors while "I want to kill myself" scored 0.9. Softened exactly as the tiered patterns
 * are (crisis-modifiers.ts). Synthetic lines.
 */
import { describe, expect, it } from 'vitest';
import { detectCrisis as detectSignals } from '../crisis-detection.js';
import { detectCrisis, guardFromDetection } from '../crisis-guard.js';

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

  it('pins each rule #2538 found unpinned', () => {
    // The strongest match wins, not the last.
    expect(
      detectCrisis('I might kill myself tonight. lol I would never kill myself').severity
    ).toBeGreaterThanOrEqual(0.75);
    for (const line of [
      // The other subject must sit right before the verb.
      'the show is over, end it all',
      // First person anywhere in the clause keeps it the caller's.
      'lets end it all, me and you',
      'he will end it all, and me too',
      // An idiom is judged at its own words, not anywhere in the clause.
      'I might end it all, I killed myself laughing earlier',
      // Means or intent before the words cancels an idiom too.
      'on purpose I almost killed myself on my bike',
      'with pills I am killing myself studying',
    ]) {
      expect(level(line), line).toBe('script');
    }
  });

  it('reads intent wording, in the clause or the next sentence, as risk', () => {
    for (const line of [
      'I almost killed myself on the stairs intentionally',
      'I nearly killed myself on the ice deliberately',
      'I almost killed myself on the stairs, I wanted to',
      'I almost killed myself on the bike, I wish I had',
      'I almost killed myself on the stairs. next time I will finish it',
      'I almost killed myself on the ladder. I might do it for good',
    ]) {
      expect(level(line), line).toBe('script');
    }
  });

  it('a time alone cancels no idiom; with "let\'s" it keeps "end it all" the caller\'s', () => {
    for (const line of [
      'I killed myself laughing today',
      'I nearly killed myself on the ice today',
      'I killed myself in minecraft today',
      'the show will end it all soon',
      'the party will end it all with fireworks tonight',
      'ending my life as a student tomorrow',
    ]) {
      expect(level(line), line).toBe('none');
    }
    expect(level('lets end it all tonight')).toBe('script');
    // "gonna kill myself …" is a tier above the floor, as on main: the floor never lowers it.
    expect(level('gonna kill myself laughing at this show tonight')).toBe('script');
  });

  it('costs time in proportion to the message, not its square', () => {
    // 160 KB of each shape: linear code takes milliseconds, a whole-text re-scan seconds.
    const units = [
      'kill myself ',
      'could ',
      'really ',
      'I killed myself laughing ',
      'the cat end it all ',
    ];
    for (const unit of units) {
      const text = unit.repeat(Math.ceil(160_000 / unit.length)) + 'kill myself';
      const started = performance.now();
      detectCrisis(text);
      expect(performance.now() - started, unit).toBeLessThan(1000);
    }
  });
});
