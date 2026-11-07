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
vi.mock('../../services/cross-persona-insights.js', () => ({ addCrossPersonaInsight: vi.fn() }));

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

/** Runs the real tool and returns the log lines it wrote with its message. */
async function linesFrom(c: Case, userId: string): Promise<string[]> {
  const def = c.defs.find((d) => d.id === c.tool);
  if (!def) throw new Error(`no tool ${c.tool}`);
  const tool = def.create(ctxFor(userId)) as unknown as {
    execute: (args: Record<string, unknown>, opts: unknown) => Promise<unknown>;
  };
  await tool.execute(c.args, {});
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
