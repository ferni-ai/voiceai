import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectCrisis, IN_DANGER_NOW } from '../crisis-guard.js';
import { crisisVoice, type CrisisVoiceKind } from '../crisis-voice.js';

const KINDS: CrisisVoiceKind[] = ['imminent', 'third_party', 'severe', 'distress'];
/** Leaflet and therapist phrases the red team filed as AI tells (#2333, #2334). */
const LEAFLET = /\b(?:valid|courage|24\/7|trained counselors|reach out)\b/i;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("crisis responses in Ferni's voice", () => {
  it.each(KINDS)('%s still gives 988 by call or text, and asks a question', (kind) => {
    const text = crisisVoice(kind, IN_DANGER_NOW);
    expect(text).toMatch(/call or text 988/);
    expect(text.trim().endsWith('?')).toBe(true);
    expect(text).not.toMatch(LEAFLET);
    // Voice rules (speech-markup-notes.ts): no dashes, ellipses or stage directions.
    expect(text).not.toMatch(/[—–]|\.\.\.|…|\[|\*/);
  });

  it('imminent keeps the full in-danger line (911 or the ER) and stays', () => {
    const text = crisisVoice('imminent', IN_DANGER_NOW);
    expect(text).toContain(IN_DANGER_NOW);
    expect(text).toMatch(/staying right here with you/);
  });

  it('about someone else says 911 if they are in danger now', () => {
    expect(crisisVoice('third_party', IN_DANGER_NOW)).toMatch(/in danger right now, call 911/);
  });
});

describe('CRISIS_SCRIPT_HUMAN through the real crisis guard', () => {
  const cases: Array<[string, RegExp, RegExp]> = [
    [
      'I took the whole bottle of pills an hour ago',
      /Your safety matters most/,
      /I'm right here\./,
    ],
    ['I want to kill myself', /it takes courage|I hear how much pain/, /That sounds really heavy/],
    ['my brother says he wants to kill himself', /paying attention/, /looking out for them/],
  ];

  it.each(cases)('"%s": the leaflet when off, Ferni when on', (line, off, on) => {
    vi.stubEnv('CRISIS_SCRIPT_HUMAN', 'off');
    const before = detectCrisis(line).suggestedResponse ?? '';
    expect(before).toMatch(off);
    vi.stubEnv('CRISIS_SCRIPT_HUMAN', 'on');
    const after = detectCrisis(line).suggestedResponse ?? '';
    expect(after).toMatch(on);
    expect(after).toMatch(/988/);
    expect(after).not.toMatch(LEAFLET);
  });

  it('keeps the Spanish response either way', () => {
    vi.stubEnv('CRISIS_SCRIPT_HUMAN', 'off');
    const before = detectCrisis('quiero morir').suggestedResponse;
    vi.stubEnv('CRISIS_SCRIPT_HUMAN', 'on');
    expect(detectCrisis('quiero morir').suggestedResponse).toBe(before);
  });
});
