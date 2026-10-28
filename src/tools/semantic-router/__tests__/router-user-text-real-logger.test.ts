/**
 * The same guard as router-user-text-logs.test.ts, through the REAL safe-logger
 * (no logger mock): the lines the process actually writes to stderr. The real
 * logger cuts an error message only at its first quote, so an error that repeats
 * its input without quoting it passes through in full unless the call site logs
 * the error's class instead. Rows throw exactly such an error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SENTINEL = 'zqxprobe aunt philomena chemo';
const h = vi.hoisted(() => ({ bridged: undefined as undefined | (() => Promise<unknown>) }));

// The global test setup mocks safe-logger; this test needs the real one.
vi.unmock('../../../utils/safe-logger.js');
vi.mock('../../registry/index.js', () => ({
  getTool: () => ({ create: () => ({ execute: async () => h.bridged?.() }) }),
}));

import { GoalPlanner } from '../advanced/intelligent/goal-planner.js';
import { executeDomainTool } from '../domain-bridge/executor.js';

const ctx = {
  userId: 'u1',
  sessionId: 's1',
  personaId: 'ferni',
  conversationHistory: [],
  services: null,
};
const repeats = () => new Error(`no contact matching ${SENTINEL}`);

describe('router logs, through the real logger, never carry the caller words', () => {
  let written: string[];
  beforeEach(() => {
    written = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const rows: Array<[string, string, () => Promise<unknown>]> = [
    [
      'GoalPlanner.executePlan, a step throws',
      'Step failed',
      async () => {
        const step = { id: 's1', toolId: 't', args: { name: SENTINEL }, dependsOn: [] };
        const plan = { goal: 'g', steps: [step], strategy: 'sequential', confidence: 1 };
        await new GoalPlanner().executePlan(plan as never, {
          execute: async () => {
            throw repeats();
          },
        });
      },
    ],
    [
      'executeDomainTool, a bridged call',
      'Bridging semantic tool',
      async () => {
        h.bridged = async () => 'done';
        await executeDomainTool('p', { originalText: SENTINEL }, ctx, { p: { domainToolId: 'd' } });
      },
    ],
    [
      'executeDomainTool, the tool throws',
      'Domain tool execution failed',
      async () => {
        h.bridged = async () => {
          throw repeats();
        };
        await executeDomainTool('p', { originalText: SENTINEL }, ctx, { p: { domainToolId: 'd' } });
      },
    ],
  ];

  it.each(rows)('%s', async (_name, message, run) => {
    await run();
    const output = written.join('');
    expect(output).toContain(message);
    expect(output.toLowerCase()).not.toContain(SENTINEL);
    expect(output.toLowerCase()).not.toContain('philomena');
  });
});
