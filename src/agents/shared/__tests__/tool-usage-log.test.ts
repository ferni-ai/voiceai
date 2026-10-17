import { EventEmitter } from 'node:events';
import { voice } from '@livekit/agents';
import { describe, expect, it, vi } from 'vitest';

const logged: Array<{ fields: Record<string, unknown>; msg: string }> = [];
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    info: (fields: Record<string, unknown>, msg: string) => logged.push({ fields, msg }),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

const { trackToolUsage } = await import('../tool-usage-log.js');

const executed = (names: string[], failed: string[] = []) => ({
  functionCalls: names.map((name) => ({ name, args: '{"secret":"words"}' })),
  functionCallOutputs: names.map((name) => ({ name, isError: failed.includes(name), output: 'x' })),
});

describe('TOOL_USAGE', () => {
  it('logs each tool called and how often, once, at the end of the call; names and counts only', () => {
    const session = new EventEmitter();
    const end = trackToolUsage(session, 's1', () => 31);
    session.emit(voice.AgentSessionEventTypes.FunctionToolsExecuted, executed(['quickTimer']));
    session.emit(
      voice.AgentSessionEventTypes.FunctionToolsExecuted,
      executed(['quickTimer', 'getFunFact'], ['getFunFact'])
    );
    expect(logged).toHaveLength(0);

    end();
    end();
    session.emit(voice.AgentSessionEventTypes.FunctionToolsExecuted, executed(['tellJoke']));

    expect(logged).toEqual([
      {
        msg: 'TOOL_USAGE',
        fields: {
          sessionId: 's1',
          calls: { quickTimer: 2, getFunFact: 1 },
          total: 3,
          distinct: 2,
          errors: 1,
          toolsHeld: 31,
        },
      },
    ]);
    expect(JSON.stringify(logged)).not.toContain('secret');
  });

  it('keeps phone numbers, emails and results out of the line', () => {
    logged.length = 0;
    const session = new EventEmitter();
    const end = trackToolUsage(session, 's3', () => 30);
    session.emit(voice.AgentSessionEventTypes.FunctionToolsExecuted, {
      functionCalls: [
        { name: 'callOnBehalf', args: '{"phone":"+1 (415) 555-0142","note":"ask for Dana"}' },
        { name: 'quickEmail', args: '{"to":"dana.k@example.com","body":"running late"}' },
      ],
      functionCallOutputs: [
        { name: 'callOnBehalf', isError: true, output: 'Could not reach +14155550142' },
        { name: 'quickEmail', isError: false, output: 'Sent to dana.k@example.com' },
      ],
    });
    end();
    const line = JSON.stringify(logged);
    for (const secret of ['555', '0142', 'dana', 'example.com', '@', 'Dana', 'late', 'reach']) {
      expect(line).not.toContain(secret);
    }
    expect(logged[0].fields).toMatchObject({
      calls: { callOnBehalf: 1, quickEmail: 1 },
      errors: 1,
    });
  });

  it('still logs the counts when the agent is gone at teardown', () => {
    logged.length = 0;
    const session = new EventEmitter();
    const end = trackToolUsage(session, 's2', () => {
      throw new Error('agent closed');
    });
    end();
    expect(logged[0].fields).toMatchObject({ total: 0, toolsHeld: null });
  });
});
