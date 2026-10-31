/**
 * CUSTOM_AGENT_LIVE: a caller who sounds under 18 is held on a custom-agent call
 * exactly as on a Ferni call (MINOR_CARE, utils/minor-care.ts).
 *
 * The live custom agent runs as the single-agent session, whose
 * PersonaVoiceAgent.llmNode sends every reply through gatedReply. gatedReply
 * builds the model request with withTurnReminder, which adds the minor-care note
 * and marks the session held, so no tool or writer stores anything from it.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { liveCallPersona } from '../../../services/custom-agent/custom-agent-live-persona.js';
import { customAgentToPersonaConfig } from '../../../services/custom-agent/custom-agent-runtime-service.js';
import { liveAgent } from '../../../services/custom-agent/__tests__/fixtures/live-agent.js';
import { MINOR_CARE_NOTE, memoryHeld, resetMinorCare } from '../../../utils/minor-care.js';
import { gatedReply } from '../../personas/crisis-gate.js';

const GATE_ENV = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const SAID = "I'm 14 years old and in 9th grade, school was boring today.";

/** The text of every message gatedReply sent to the model for one turn. */
async function sentToModel(systemPrompt: string, personaId: string, sessionId: string) {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: systemPrompt });
  ctx.addMessage({ role: 'user', content: SAID });
  const model = vi.fn(
    async (_request: llm.ChatContext) => new ReadableStream<unknown>({ start: (c) => c.close() })
  );
  const session = { userData: { personaId, services: { sessionId } } };
  await gatedReply(ctx, session, model as never, { wrap: (s: unknown) => s } as never, {
    env: GATE_ENV,
  });
  expect(model).toHaveBeenCalledTimes(1);
  return model.mock.calls[0]![0].items.map(
    (item) => (item as llm.ChatMessage).textContent ?? ''
  ).join('\n');
}

describe('minor-care on a live custom-agent call', () => {
  beforeEach(() => {
    vi.stubEnv('MINOR_CARE', 'on');
    resetMinorCare();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    resetMinorCare();
  });

  it('holds the caller and adds the note, the same as a Ferni call', async () => {
    const agent = liveCallPersona(customAgentToPersonaConfig(liveAgent()));
    const agentRequest = await sentToModel(agent.systemPrompt, agent.id, 'mc-agent');
    const ferniRequest = await sentToModel('You are Ferni.', 'ferni', 'mc-ferni');

    expect(ferniRequest).toContain(MINOR_CARE_NOTE); // the path fires for Ferni
    expect(agentRequest).toContain(MINOR_CARE_NOTE);
    expect(memoryHeld('mc-ferni')).toBe(true);
    expect(memoryHeld('mc-agent')).toBe(true);
  });
});
