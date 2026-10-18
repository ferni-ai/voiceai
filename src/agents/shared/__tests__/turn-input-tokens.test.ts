/**
 * TURN_TOKEN_RECEIPT: the model's input per turn in four parts (persona,
 * context, tools, history), on the live path through attachTurnReceipts and
 * noteRequest, and nothing at all when the flag is off.
 */
import { EventEmitter } from 'node:events';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';

const { lines } = vi.hoisted(() => ({ lines: [] as Array<Record<string, unknown>> }));
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  return {
    ...real,
    createLogger: (bindings: Record<string, unknown>) => {
      const logger = real.createLogger(bindings);
      if (bindings.module !== 'TurnInputTokens') return logger;
      return {
        ...logger,
        info: (o: Record<string, unknown>, msg?: string) => lines.push({ msg, ...o }),
      };
    },
  };
});

import { TURN_CONTEXT_HEADER } from '../../multi-agent/turn-context-header.js';
import { promptSections } from '../prompt-sections.js';
import { attachTurnReceipts, noteReminder, noteRequest } from '../turn-receipt-session.js';
import type { TurnReceipt } from '../turn-receipt.js';
import { inputTokenParts, toolSchemaChars, turnInputTokens } from '../turn-input-tokens.js';

const INSTRUCTIONS = 'You are Ferni, a warm friend on a call. '.repeat(20);
const RECALL = '[WHAT YOU REMEMBER]\n- likes the lake';
const TURN_NOTE = `${TURN_CONTEXT_HEADER}\nThey sound tired.`;
const REMINDER = 'Keep it short, a friend on a call.';
const CALLER = 'can you check the weather for tomorrow';

/** A request as llmNode sends it: instructions, recall, history, a tool round, this turn + reminder. */
function request(): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: INSTRUCTIONS, id: 'lk.agent_task.instructions' });
  ctx.addMessage({ role: 'system', content: RECALL, id: 'recall_1' });
  ctx.addMessage({ role: 'user', content: 'hi there' });
  ctx.addMessage({ role: 'user', content: TURN_NOTE });
  ctx.insert(llm.FunctionCall.create({ callId: 'c1', name: 'getWeather', args: '{"day":1}' }));
  ctx.insert(
    llm.FunctionCallOutput.create({
      callId: 'c1',
      name: 'getWeather',
      output: 'sunny',
      isError: false,
    })
  );
  ctx.addMessage({ role: 'assistant', content: 'hey you' });
  ctx.addMessage({ role: 'user', content: [CALLER, `\n\n(${REMINDER})`] });
  return ctx;
}

const tool = (name: string) =>
  llm.tool({
    description: `${name}: does what its name says.`,
    parameters: z.object({ query: z.string().describe('what to look up') }),
    execute: async () => 'ok',
  });
const toolSet = (names: string[]) => Object.fromEntries(names.map((n) => [n, tool(n)]));
const NOTE = { reminder: REMINDER, directorNotes: '', offered: 0, droppedIdx: [] };

describe('inputTokenParts', () => {
  it('splits a known request into persona, context, tools and history that sum to its estimate', () => {
    const sections = promptSections(request().items as never, NOTE);
    const parts = inputTokenParts(sections, 1000);
    const est = (chars: number) => Math.ceil(chars / 4);
    expect(parts.personaEst).toBe(est(INSTRUCTIONS.length));
    expect(parts.contextEst).toBe(
      est(RECALL.length + TURN_NOTE.length + `\n\n(${REMINDER})`.length)
    );
    expect(parts.historyEst).toBe(
      est(
        'hi there'.length +
          'getWeather'.length +
          '{"day":1}'.length +
          'sunny'.length +
          'hey you'.length +
          CALLER.length
      )
    );
    expect(parts.toolsEst).toBe(250);
    expect(parts.totalEst).toBe(
      parts.personaEst + parts.contextEst + parts.toolsEst + parts.historyEst
    );
    // Every character of the request lands in a part: the parts are the whole chat estimate.
    const chatChars = sections.reduce((n, s) => n + s.chars, 0);
    expect(parts.totalEst - parts.toolsEst).toBeGreaterThanOrEqual(Math.ceil(chatChars / 4));
    expect(parts.totalEst - parts.toolsEst).toBeLessThanOrEqual(Math.ceil(chatChars / 4) + 2);
  });
});

describe('toolSchemaChars', () => {
  it('measures each tool as the Google plugin declares it: name, description and JSON schema', () => {
    const one = toolSchemaChars(toolSet(['getWeather']));
    const schema = JSON.stringify(llm.toJsonSchema(tool('getWeather').parameters, false));
    expect(one).toBeGreaterThan(
      'getWeather'.length + 'getWeather: does what its name says.'.length + schema.length
    );
  });

  it('grows with the number of tools', () => {
    const one = toolSchemaChars(toolSet(['a1']));
    const three = toolSchemaChars(toolSet(['a1', 'b2', 'c3']));
    expect(one).toBeGreaterThan(0);
    expect(three).toBe(3 * one);
    expect(toolSchemaChars({})).toBe(0);
  });
});

/** One caller turn on a session double, through the live hooks llmNode and LiveKit call. */
function oneTurn(env: Record<string, string>) {
  lines.length = 0;
  const session = new EventEmitter();
  const receipts: TurnReceipt[] = [];
  let t = 1_000_000;
  const detach = attachTurnReceipts(session as never, {
    sessionId: 'RM_tokens',
    userId: 'uid-1',
    persona: () => 'ferni',
    emit: (r) => receipts.push(r),
    now: () => t,
    env,
  });
  const metric = (m: Record<string, unknown>) => session.emit('metrics_collected', { metrics: m });
  metric({
    type: 'eou_metrics',
    endOfUtteranceDelayMs: 300,
    transcriptionDelayMs: 90,
    lastSpeakingTimeMs: t,
  });
  session.emit('conversation_item_added', {
    item: llm.ChatMessage.create({ role: 'user', content: CALLER }),
  });
  session.emit('agent_state_changed', { newState: 'thinking' });
  noteReminder(session, NOTE);
  noteRequest(session, request(), { functionTools: toolSet(['getWeather', 'endCall', 'recall']) });
  t += 500;
  metric({
    type: 'llm_metrics',
    ttftMs: 450,
    promptTokens: 22600,
    promptCachedTokens: 9000,
    completionTokens: 20,
    metadata: { modelName: 'test-model' },
  });
  session.emit('agent_state_changed', { newState: 'speaking' });
  session.emit('conversation_item_added', {
    item: llm.ChatMessage.create({ role: 'assistant', content: 'Sunny tomorrow.' }),
  });
  session.emit('agent_state_changed', { newState: 'listening' });
  detach();
  return { receipts, lines: [...lines] };
}

describe('turn_input_tokens on the live path', () => {
  it('flag off: no line and no tool schema measured', () => {
    const { receipts, lines: written } = oneTurn({});
    expect(receipts).toHaveLength(1);
    expect(receipts[0].tools.schemaChars).toBeNull();
    expect(written).toHaveLength(0);
  });

  it('flag on: one line per turn, measured totals beside the estimated parts', () => {
    const { receipts, lines: written } = oneTurn({ TURN_TOKEN_RECEIPT: 'on' });
    expect(receipts).toHaveLength(1);
    const schemaChars = toolSchemaChars(toolSet(['getWeather', 'endCall', 'recall']));
    expect(receipts[0].tools.schemaChars).toBe(schemaChars);
    expect(written).toHaveLength(1);
    const line = written[0];
    expect(line).toMatchObject({
      msg: 'turn_input_tokens',
      event: 'turn_input_tokens',
      sessionId: 'RM_tokens',
      turn: 1,
      personaId: 'ferni',
      model: 'test-model',
      totalMeasured: 22600,
      cachedMeasured: 9000,
      estimate: 'chars/4',
      toolCount: 3,
      toolsEst: Math.ceil(schemaChars / 4),
      personaEst: Math.ceil(INSTRUCTIONS.length / 4),
      requests: 1,
    });
    expect(line).toEqual({ msg: 'turn_input_tokens', ...turnInputTokens(receipts[0]) });
    // No words: the line is counts, ids and enums only.
    expect(JSON.stringify(line)).not.toContain('weather for tomorrow');
    expect(JSON.stringify(line)).not.toContain('warm friend');
  });
});
