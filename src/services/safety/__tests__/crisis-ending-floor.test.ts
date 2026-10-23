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
    // only softened, for the floor's words and the tiers' alike.
    for (const line of [
      'my brother keeps talking about killing himself. I would never kill myself',
      'my brother keeps talking about killing himself. I would never want to kill myself',
      'my friend wants to end her life, lol I might kill myself',
      'he texted me that he is going to kill himself. I used to want to commit suicide',
    ]) {
      const found = detectCrisis(line);
      expect(found.subject, line).toBe('third_party');
      expect(found.severity, line).toBeGreaterThanOrEqual(0.75);
      expect(found.isCrisis, line).toBe(true);
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
});
