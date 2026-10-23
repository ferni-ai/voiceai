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
});
