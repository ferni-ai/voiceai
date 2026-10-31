/**
 * CRISIS_LEXICAL_V2 at the detectors: performSafetyCheck's patterns and the
 * human-transfer detector's. Fictional lines only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { performSafetyCheck } from '../index.js';
import { detectCrisisSignals } from '../../human-transfer/escalation-classifier.js';

const typesOf = (line: string) =>
  performSafetyCheck(line, { userId: 'uid-words', personaId: 'ferni' }).detection.signals.map(
    (s) => s.type
  );
const on = (gate: 'live' | 'shadow' = 'shadow') => {
  vi.stubEnv('CRISIS_LEXICAL_V2', 'on');
  vi.stubEnv('CRISIS_GUARD_MODE', gate);
};
// Each test starts at main, whatever the run's env says; on() turns the flag on.
beforeEach(() => {
  vi.stubEnv('CRISIS_LEXICAL_V2', 'off');
  vi.stubEnv('CRISIS_SIGHT_NEEDS_CUE', 'off');
});
afterEach(() => vi.unstubAllEnvs());

describe('performSafetyCheck patterns (gate not live, so nothing is deferred)', () => {
  it.each([
    ['I got messages from my sister today', 'psychotic_symptoms'],
    ["I'm losing it, this game today is wild", 'severe_distress'],
    ['I took too many photos at the game tonight', 'substance_crisis'],
    ["I'm not losing it, I promise, just tired", 'severe_distress'],
    ["I don't hear voices, it was the radio in the kitchen", 'psychotic_symptoms'],
    ["I'm not having a panic attack, just excited", 'panic_attack'],
  ])('main reads "%s" as %s; the flag does not', (line, type) => {
    expect(typesOf(line)).toContain(type);
    on();
    expect(typesOf(line)).not.toContain(type);
  });

  it.each([
    ['I keep getting messages from god telling me what to do', 'psychotic_symptoms'],
    ["I'm hearing voices telling me to hurt myself", 'psychotic_symptoms'],
    ["I'm losing my mind and I can't go on", 'severe_distress'],
    ['I took too many of my pills', 'substance_crisis'],
    ['my husband hits me', 'domestic_abuse'],
  ])('real signals stand: "%s" is still %s', (line, type) => {
    on();
    expect(typesOf(line)).toContain(type);
  });

  it('whole words: "overdosed" is a substance crisis (main\'s "overdos\\b" never matched it)', () => {
    on();
    expect(typesOf('I overdosed on my sleeping pills')).toContain('substance_crisis');
  });

  it("a negation trap is not a negation: the guard's suicide read stands", () => {
    on();
    expect(typesOf("I can't stop thinking about killing myself")).toContain('suicidal_ideation');
  });
});

describe('performSafetyCheck with the gate live: suicide, self-harm and distress defer to it', () => {
  it.each(['I want to kill myself', "I'm completely falling apart", 'I cut myself on purpose'])(
    '%s',
    (line) => {
      expect(performSafetyCheck(line, { userId: 'u', personaId: 'ferni' }).crisisDetected).toBe(
        true
      );
      on('live');
      const check = performSafetyCheck(line, { userId: 'u', personaId: 'ferni' });
      expect(check.crisisDetected).toBe(false);
      expect(check.contextInjection).toBeNull();
    }
  );

  it('what the gate does not read stays: domestic violence', () => {
    on('live');
    expect(typesOf('my husband hits me')).toEqual(['domestic_abuse']);
  });
});

describe('the human-transfer detector', () => {
  it.each([
    ["What's the point of this meeting", 'suicidalIdeation'],
    ["I'm ending it with my boyfriend", 'suicidalIdeation'],
    ["let's end it there for today", 'suicidalIdeation'],
    ["I don't want to go on that trip", 'suicidalIdeation'],
    ['I want to die laughing at that', 'suicidalIdeation'],
    ["I cut my finger chopping onions, I'm bleeding", 'medicalEmergency'],
    ["I cut myself shaving and I'm bleeding a little", 'selfHarmIndicators'],
    ["I can't see your text, it never came through", 'medicalEmergency'],
    ['I never self harm, I just get sad sometimes', 'selfHarmIndicators'],
  ] as const)('main reads "%s" as %s; the flag does not', (line, flag) => {
    expect(detectCrisisSignals(line)[flag]).toBe(true);
    on();
    expect(detectCrisisSignals(line)[flag]).toBe(false);
  });

  it.each([
    ["I can't stop thinking that I want to die", 'suicidalIdeation'],
    ["I don't want to go on like this", 'suicidalIdeation'],
    ["I don't want to be here in this world", 'suicidalIdeation'],
    ["I don't want to be here at this point anymore", 'suicidalIdeation'],
    ["I don't want to go on this way anymore", 'suicidalIdeation'],
    ['I want to end it with a bottle of pills', 'suicidalIdeation'],
    ["I'm going to end it tonight", 'suicidalIdeation'],
    ["I cut myself chopping wood, I'm bleeding everywhere", 'medicalEmergency'],
    ['I cut myself again while cooking because I wanted to', 'selfHarmIndicators'],
    ["I'm scared to go home", 'domesticViolence'],
  ] as const)('real risk stands: "%s" is %s', (line, flag) => {
    on();
    expect(detectCrisisSignals(line)[flag]).toBe(true);
  });
});
