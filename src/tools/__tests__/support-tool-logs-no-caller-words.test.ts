/**
 * Grief, trauma-support and sobriety tools log the size of what the caller said, never the
 * words. The tool arguments are the caller's own words (an anniversary, a self-blame, the name
 * of someone who died), and nothing reads these log lines back as data.
 *
 * Through the REAL safe-logger (the global setup mocks it; this unmocks it): under vitest it
 * writes to process.stderr, which is captured. Each case runs the real tool `execute` with a
 * planted fictional marker and asserts the line still fires, carries the length, and never
 * the marker. It runs for a demo visitor and for a signed-in owner: the rule is the same.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.LOG_LEVEL = 'debug'; // the sobriety lines are debug
});
vi.unmock('../../utils/safe-logger.js');
// The only persisting writer these tools reach; faked so nothing leaves the test.
const { addInsight } = vi.hoisted(() => ({
  addInsight: vi.fn<(userId: string, insight: { target: string }) => void>(),
}));
vi.mock('../../services/cross-persona-insights.js', () => ({ addCrossPersonaInsight: addInsight }));

import { getLogger } from '../../utils/safe-logger.js';
import { definitions as griefTools } from '../domains/grief/index.js';
import { definitions as sobrietyTools } from '../domains/sobriety/index.js';
import { definitions as traumaTools } from '../domains/trauma-support/index.js';
import type { ToolContext, ToolDefinition } from '../registry/types.js';

// Fictional caller words with a marker no log line could carry by accident.
const MARKER = 'SAM-MARKER-sunflower';
const SAID = `the day Sam lost ${MARKER}`;

const DEMO_ID = 'device:demo_1700000000000_sam01';
const OWNER_ID = 'sam-owner-uid-0101';

interface Case {
  tool: string;
  defs: ToolDefinition[];
  args: Record<string, unknown>;
  line: string;
  /** The logged size field for each word argument. */
  sizes: string[];
}

const CASES: Case[] = [
  {
    tool: 'anniversarySupport',
    defs: griefTools,
    args: { occasion: SAID, approaching: true },
    line: 'Anniversary support',
    sizes: ['occasionChars'],
  },
  {
    tool: 'acknowledgeLoss',
    defs: griefTools,
    args: { loss: SAID },
    line: 'Acknowledging loss',
    sizes: ['lossChars'],
  },
  {
    tool: 'rememberLoved',
    defs: griefTools,
    args: { personName: SAID, relationship: 'friend', whatToRemember: 'their-essence' },
    line: 'Remembering loved one',
    sizes: ['personNameChars'],
  },
  {
    tool: 'processEnding',
    defs: griefTools,
    args: { whatIsEnding: SAID },
    line: 'Processing ending',
    sizes: ['whatIsEndingChars'],
  },
  {
    tool: 'embraceNewIdentity',
    defs: griefTools,
    args: { oldIdentity: SAID, trigger: SAID },
    line: 'Embracing new identity',
    sizes: ['oldIdentityChars', 'triggerChars'],
  },
  {
    tool: 'flagTransitionForJordan',
    defs: griefTools,
    args: { transition: SAID, stage: 'beginning', needsPlanning: false },
    line: 'Flagging transition for Jordan',
    sizes: ['transitionChars'],
  },
  {
    tool: 'selfCompassionTrauma',
    defs: traumaTools,
    args: { selfBlame: SAID },
    line: 'Self-compassion for trauma',
    sizes: ['selfBlameChars'],
  },
  {
    tool: 'sobrietyCheckin',
    defs: sobrietyTools,
    args: { timeSober: SAID },
    line: '[sobriety] check-in',
    sizes: ['timeSoberChars'],
  },
  {
    tool: 'sobrietyGrief',
    defs: sobrietyTools,
    args: { whatYouGaveUp: SAID },
    line: '[sobriety] grief',
    sizes: ['whatYouGaveUpChars'],
  },
  {
    tool: 'soberSocializing',
    defs: sobrietyTools,
    args: { upcomingEvent: SAID },
    line: '[sobriety] social',
    sizes: ['upcomingEventChars'],
  },
];

let out: string[];
beforeEach(() => {
  out = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    out.push(String(chunk));
    return true;
  });
});
afterEach(() => vi.restoreAllMocks());

function ctxFor(userId: string): ToolContext {
  return {
    userId,
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    services: {
      has: () => false,
      get: () => {
        throw new Error('services unavailable in this test');
      },
      getOptional: () => undefined,
    },
  } as unknown as ToolContext;
}

/** Runs the real tool `execute` (no zod parse in front of it) and returns what it returned. */
async function run(c: Case, userId: string, args: Record<string, unknown>): Promise<unknown> {
  const def = c.defs.find((d) => d.id === c.tool);
  if (!def) throw new Error(`no tool ${c.tool}`);
  const tool = def.create(ctxFor(userId)) as unknown as {
    execute: (args: Record<string, unknown>, opts: unknown) => Promise<unknown>;
  };
  return tool.execute(args, {});
}

/** Runs the real tool and returns the log lines it wrote with its message. */
async function linesFrom(c: Case, userId: string): Promise<string[]> {
  await run(c, userId, c.args);
  return logLines(c);
}

function logLines(c: Case): string[] {
  return out
    .join('')
    .split('\n')
    .filter((l) => l.includes(`"msg":${JSON.stringify(c.line)}`));
}

describe('support tools log the size of the caller words, never the words', () => {
  it('control: the capture sees a word field when one is logged', () => {
    getLogger().info({ said: SAID }, 'capture control');
    expect(out.join('')).toContain(MARKER);
  });

  for (const userId of [DEMO_ID, OWNER_ID]) {
    describe(userId === DEMO_ID ? 'demo visitor' : 'owner', () => {
      it.each(CASES)('$tool', async (c) => {
        const lines = await linesFrom(c, userId);
        expect(lines).toHaveLength(1); // the line still fires
        for (const size of c.sizes) expect(lines[0]).toContain(`"${size}":${SAID.length}`);
        expect(out.join('')).not.toContain('sunflower');
      });
    });
  }
});

// Callers that skip the zod parse (the admin /api/chat/tool route) can hand a grief tool a
// required word field as undefined or null. Main still answered with its support text there,
// so the size log must not be what throws: it logs 0 and the reply is unchanged.
describe('grief tools with a required word field missing', () => {
  const griefCases = CASES.filter((c) => c.defs === griefTools);
  const rows = griefCases.flatMap((c) =>
    [undefined, null].map((missing) => ({ ...c, missing, label: String(missing) }))
  );

  it.each(rows)('$tool with $label', async (c) => {
    const words = c.sizes.map((size) => size.replace(/Chars$/, ''));
    const withMissing = { ...c.args, ...Object.fromEntries(words.map((w) => [w, c.missing])) };
    // Main's reply for a missing field: these fields are only ever interpolated, so it is the
    // reply for the field's String() form, byte for byte.
    const asText = { ...c.args, ...Object.fromEntries(words.map((w) => [w, String(c.missing)])) };

    const reply = await run(c, OWNER_ID, withMissing);
    const lines = logLines(c);
    expect(lines).toHaveLength(1);
    for (const size of c.sizes) expect(lines[0]).toContain(`"${size}":0`);

    expect(typeof reply).toBe('string');
    expect(reply).toBe(await run(c, OWNER_ID, asText));
  });

  it('flagTransitionForJordan still hands Jordan the insight', async () => {
    addInsight.mockClear();
    const c = griefCases.find((g) => g.tool === 'flagTransitionForJordan');
    if (!c) throw new Error('no flagTransitionForJordan case');

    await run(c, OWNER_ID, { ...c.args, transition: undefined });

    expect(addInsight).toHaveBeenCalledTimes(1);
    expect(addInsight).toHaveBeenCalledWith(
      OWNER_ID,
      expect.objectContaining({
        target: 'jordan',
        category: 'life_transition',
        content: 'Life transition in beginning stage: "undefined" | Planning needed: false',
      })
    );
  });

  // The same normal / undefined / null grid through every grief tool, for a demo visitor and an
  // owner, and for every stage and planning answer of the Jordan hand-off. On main every
  // flagTransitionForJordan run hands Jordan one insight and no other grief tool hands any, so
  // main's count is 3 values x 3 stages x 2 planning answers x 2 users = 36. A tool that throws
  // drops its insight; c8a83f44f handed over 12.
  it('hands Jordan as many insights across the grid as main does (36)', async () => {
    const MAIN_JORDAN_INSIGHTS = 36;
    addInsight.mockClear();
    const values = [SAID, undefined, null];
    const users = [DEMO_ID, OWNER_ID];
    const settled: string[] = [];
    const attempt = async (c: Case, userId: string, args: Record<string, unknown>) => {
      try {
        await run(c, userId, args);
        settled.push('ok');
      } catch {
        settled.push('threw');
      }
    };

    const grid: Array<[Case, string, Record<string, unknown>]> = [];
    for (const c of griefCases) {
      const words = c.sizes.map((size) => size.replace(/Chars$/, ''));
      for (const value of values) {
        const args = { ...c.args, ...Object.fromEntries(words.map((w) => [w, value])) };
        for (const userId of users) {
          if (c.tool !== 'flagTransitionForJordan') {
            grid.push([c, userId, args]);
            continue;
          }
          for (const stage of ['beginning', 'middle', 'integrating']) {
            for (const needsPlanning of [true, false]) {
              grid.push([c, userId, { ...args, stage, needsPlanning }]);
            }
          }
        }
      }
    }
    for (const [c, userId, args] of grid) {
      // eslint-disable-next-line no-await-in-loop -- one at a time: the runs share one mock
      await attempt(c, userId, args);
    }

    const toJordan = addInsight.mock.calls.filter(([, insight]) => insight.target === 'jordan');
    expect(toJordan).toHaveLength(MAIN_JORDAN_INSIGHTS);
    expect(addInsight).toHaveBeenCalledTimes(MAIN_JORDAN_INSIGHTS);
    expect(settled.filter((r) => r === 'threw')).toHaveLength(0);
  });
});
