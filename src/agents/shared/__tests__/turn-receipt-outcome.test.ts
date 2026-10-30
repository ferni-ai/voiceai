/**
 * TURN_RECEIPT tools.outcomes: what each executed tool came to (tool-outcome.ts
 * receiptToolOutcome), in the order of tools.called, as an enum only. Driven through
 * attachTurnReceipts with the function_tools_executed events LiveKit emits.
 */
import { EventEmitter } from 'node:events';
import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import { attachTurnReceipts } from '../turn-receipt-session.js';
import type { TurnReceipt } from '../turn-receipt.js';
import { receiptToolOutcome } from '../../voice-agent/tool-outcome.js';

const PRIVATE = 'Jane Doe, 555-0100, 39°F at 12 Fictional Lane';

function turnWith(calls: Array<{ name: string; output?: unknown; isError?: boolean }>) {
  const session = new EventEmitter();
  const receipts: TurnReceipt[] = [];
  const detach = attachTurnReceipts(session as never, {
    sessionId: 'RM_outcome',
    userId: 'voice-eval-x',
    persona: () => 'ferni',
    emit: (r) => receipts.push(r),
    env: {},
  });
  session.emit('conversation_item_added', {
    item: llm.ChatMessage.create({ role: 'user', content: 'what is the weather' }),
  });
  session.emit('function_tools_executed', {
    functionCalls: calls.map((c, i) => ({ callId: `c${i}`, name: c.name })),
    // Outputs in reverse order: matched by callId, not position.
    functionCallOutputs: calls
      .map((c, i) => ({ callId: `c${i}`, name: c.name, output: c.output, isError: c.isError }))
      .reverse(),
  });
  session.emit('conversation_item_added', {
    item: llm.ChatMessage.create({ role: 'assistant', content: 'here you go' }),
  });
  session.emit('agent_state_changed', { newState: 'speaking' });
  session.emit('agent_state_changed', { newState: 'listening' });
  detach();
  return receipts;
}

describe('TURN_RECEIPT tools.outcomes', () => {
  it('one enum per called tool, in called order, and never the output text', () => {
    const [r] = turnWith([
      { name: 'getWeather', output: `"Right now: ${PRIVATE}"` },
      { name: 'searchWeb', output: '"No results for \\"thai food\\"."' },
      { name: 'playMusic', output: "Spotify isn't connected, so here are previews." },
      { name: 'searchFlights', output: 'Flight search is not configured.' },
      { name: 'getNews', output: 'boom', isError: true },
    ]);
    expect(r.tools.called).toEqual([
      'getWeather',
      'searchWeb',
      'playMusic',
      'searchFlights',
      'getNews',
    ]);
    expect(r.tools.outcomes).toEqual(['data', 'no_data', 'not_connected', 'unconfigured', 'error']);
    const line = JSON.stringify(r);
    for (const s of ['Jane', '555-0100', 'Fictional', 'thai', 'Spotify isn'])
      expect(line).not.toContain(s);
  });

  it('a turn with no tools has an empty list', () => {
    expect(turnWith([])[0].tools.outcomes).toEqual([]);
  });

  it('an unreadable output never throws into the turn', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const [r] = turnWith([
      { name: 'getWeather', output: { n: BigInt(1) } },
      { name: 'getNews', output: cyclic },
    ]);
    expect(r.tools.outcomes).toEqual(['no_data', 'no_data']);
  });
});

describe('receiptToolOutcome', () => {
  it.each([
    ['"39°F and cloudy"', false, 'data'],
    [{ results: [{ name: 'Thai Orchid' }] }, false, 'data'],
    ['', false, 'no_data'],
    ['""', false, 'no_data'],
    [undefined, false, 'no_data'],
    [[], false, 'no_data'],
    ['[status: no_results] No results for "x".', false, 'no_data'],
    ["I couldn't find any restaurants nearby.", false, 'no_data'],
    ['[status: error] Search failed.', false, 'error'],
    ["The audio system isn't ready.", false, 'error'],
    ['"39°F"', true, 'error'],
    [
      'Your calendar is not linked yet. Link your Google account in settings.',
      false,
      'not_connected',
    ],
    ['Music playback is currently disabled.', false, 'unconfigured'],
    ['The flight provider is not set up.', false, 'unconfigured'],
  ] as const)('%j (isError %s) is %s', (output, isError, outcome) => {
    expect(receiptToolOutcome(output, isError)).toBe(outcome);
  });
});
