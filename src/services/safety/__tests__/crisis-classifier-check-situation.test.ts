/**
 * CRISIS_CLASSIFIER_CHECK's second read (crisis-classifier-check-situation.ts): the reply parse
 * and how it fails closed. Its effect on the gate is in
 * agents/personas/__tests__/crisis-classifier-check-gate.test.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  CHECK_SITUATION_PROMPT,
  parseSituationReply,
  readCheckSituation,
} from '../crisis-classifier-check-situation.js';

const NONE = '{"means":false,"place":false,"plan":false,"injury":false}';

describe('parseSituationReply', () => {
  it.each([
    [NONE, 'none'],
    ['{"means":true,"place":false,"plan":false,"injury":false}', 'stated'],
    ['{"means":false,"place":false,"plan":false,"injury":true}', 'stated'],
    ['```json\n{"means":false,"place":true,"plan":false,"injury":false}\n```', 'stated'],
    ['{"means":false,"place":false,"plan":false}', 'unread'],
    ['{"means":"no","place":false,"plan":false,"injury":false}', 'unread'],
    ['{"risk":"imminent","subject":"self"}', 'unread'],
    ['not json', 'unread'],
    ['', 'unread'],
  ])('%j -> %s', (reply, expected) => {
    expect(parseSituationReply(reply)).toBe(expected);
  });
});

describe('readCheckSituation', () => {
  it('asks with its own prompt and the classifier-shaped input', async () => {
    const seen: Array<[string, string]> = [];
    const result = await readCheckSituation(
      { latest: 'Yes.', earlier: ['Call my mom.'], companion: 'Ready?' },
      {
        generate: async (prompt, content) => {
          seen.push([prompt, content]);
          return NONE;
        },
      }
    );
    expect(result).toBe('none');
    expect(seen).toEqual([
      [CHECK_SITUATION_PROMPT, '{"latest":"Yes.","earlier":["Call my mom."],"companion":"Ready?"}'],
    ]);
  });

  it("with the call lines, EARLIER is every caller line before Ferni's last one (up to 12)", async () => {
    const seen: string[] = [];
    const lines = [
      ...Array.from({ length: 14 }, (_, i) => [
        { speaker: 'caller' as const, text: `line ${i}` },
        { speaker: 'ferni' as const, text: 'Mm.' },
      ]).flat(),
      { speaker: 'caller' as const, text: 'Yes.' },
    ];
    await readCheckSituation(
      { latest: 'Yes.', earlier: ['line 12', 'line 13'], companion: 'Mm.' },
      {
        lines,
        generate: async (_prompt, content) => {
          seen.push(content);
          return NONE;
        },
      }
    );
    const { earlier } = JSON.parse(seen[0] ?? '{}') as { earlier: string[] };
    expect(earlier).toEqual(Array.from({ length: 12 }, (_, i) => `line ${i + 2}`));
  });

  it('a timeout, an error or no words is unread', async () => {
    const env = { CRISIS_CLASSIFIER_TIMEOUT_MS: '20' };
    const slow = async (): Promise<string> =>
      new Promise((resolve) => {
        setTimeout(() => resolve(NONE), 200);
      });
    expect(await readCheckSituation({ latest: 'Yes.', earlier: [] }, { generate: slow, env })).toBe(
      'unread'
    );
    const broken = async (): Promise<string> => {
      throw new Error('down');
    };
    expect(await readCheckSituation({ latest: 'Yes.', earlier: [] }, { generate: broken })).toBe(
      'unread'
    );
    expect(
      await readCheckSituation({ latest: ' ', earlier: [] }, { generate: async () => NONE })
    ).toBe('unread');
  });
});
