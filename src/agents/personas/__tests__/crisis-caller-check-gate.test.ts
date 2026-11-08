/**
 * The caller check in the gate (crisis-caller-check.ts), with a model that never complies. A worry
 * about someone else beside the caller's own ending words set aside, in a distressed voice, gets
 * main's fixed help for them (988 on their behalf, or 911 for them when they are down), then the
 * caller's own 988 line, on every reply path, with no model call: the reply never rests on the
 * model. All lines are fictional.
 */
import { describe, expect, it } from 'vitest';
import { CRISIS_SEVERITY } from '../../../services/safety/crisis-guard.js';
import {
  EMERGENCY_FOR_THEM,
  getCrisisResponse,
  TALK_TO_988,
} from '../../../services/safety/crisis-guard-replies.js';
import { FLIP_SHAPES, NON_COMPLIANT, PATHS, stubbedGateReply } from './caller-check-gate.js';

const DOWN = FLIP_SHAPES.filter((line) => line.includes('collapsed'));
/** The nine non-emergency shapes and four more, each a caller check in a distressed voice. */
const CHECKED = [
  ...FLIP_SHAPES.filter((line) => !DOWN.includes(line)),
  "my friend said she wants to kill herself. i'd never kill myself",
  'my neighbor said he wants to end it all. i would never end my life',
  "my teammate told me he wants to die. not me, i'd never kill myself",
  "my cousin said he is going to kill himself. i used to want to die but i'm better now",
];
const DISTRESSED = ['anxious', 'sad'] as const;
const voiceOf = (primary: string, confidence = 0.9) => ({ primary, confidence, stressLevel: 0.9 });
const FOR_THEM = getCrisisResponse(CRISIS_SEVERITY.block, 'third_party', 'en', false);

describe.each(Object.keys(PATHS))(
  'the caller check in the gate (%s), when the model never complies',
  (path) => {
    it("speaks main's help for them, then the caller's 988 line, with no model call", async () => {
      expect(FOR_THEM).toContain('on their behalf');
      expect(FOR_THEM).toContain('988');
      let cells = 0;
      for (const line of CHECKED) {
        for (const voice of DISTRESSED) {
          const where = `${voice}: ${line}`;
          const { text, modelCalls } = await stubbedGateReply(line, voiceOf(voice), path);
          expect(text, where).toBe(`${FOR_THEM}\n\n${TALK_TO_988}`);
          expect(text, where).not.toContain(NON_COMPLIANT);
          expect(modelCalls, where).toBe(0);
          cells++;
        }
      }
      // Thirteen lines, two distressed voices.
      expect(cells).toBe(26);
    }, 30_000);

    it('someone down and not getting up: 911 for them first, then 988, with no model call', async () => {
      for (const voice of DISTRESSED) {
        const { text, modelCalls } = await stubbedGateReply(DOWN[0], voiceOf(voice), path);
        expect(text.startsWith(EMERGENCY_FOR_THEM), voice).toBe(true);
        expect(text.endsWith(TALK_TO_988), voice).toBe(true);
        expect(text.indexOf('911'), voice).toBeLessThan(text.indexOf('988'));
        expect(modelCalls, voice).toBe(0);
      }
    });

    it('a voice at confidence 0.5 is no voice; at 0.51 it adds the check', async () => {
      const line = CHECKED[0];
      const quiet = await stubbedGateReply(line, undefined, path);
      expect(await stubbedGateReply(line, voiceOf('anxious', 0.5), path)).toEqual(quiet);
      expect(quiet.text).not.toContain(TALK_TO_988);
      const over = await stubbedGateReply(line, voiceOf('anxious', 0.51), path);
      expect(over).toEqual({ text: `${FOR_THEM}\n\n${TALK_TO_988}`, modelCalls: 0 });
    });
  }
);
