/**
 * CUSTOM_AGENT_LIVE: a loaded custom agent never starts the multi-agent orchestrator.
 *
 * The orchestrator builds bundled personas only, so for an agent id it threw
 * "Unknown persona" and told the browser multi-agent was unavailable. A live
 * custom agent steps aside before any of that, and the call runs as the
 * single-agent session, whose PersonaVoiceAgent keeps the crisis gate.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PersonaConfig } from '../../../../personas/types.js';
import { customAgentToPersonaConfig } from '../../../../services/custom-agent/custom-agent-runtime-service.js';
import { liveCallPersona } from '../../../../services/custom-agent/custom-agent-live-persona.js';
import { liveAgent } from '../../../../services/custom-agent/__tests__/fixtures/live-agent.js';
import { resolveLiveCustomAgent } from '../../../shared/custom-agent-live.js';

const initializeMultiAgentSession = vi.hoisted(() =>
  vi.fn(async () => {
    throw new Error('orchestrator stub');
  })
);

vi.mock('../../../multi-agent/multi-agent-entry.js', () => ({
  initializeMultiAgentSession,
  handleHandoffFromDataChannel: vi.fn(),
}));
vi.mock('../../../group-conversation/voice-integration.js', () => ({
  createGroupVoiceIntegration: vi.fn(),
}));
vi.mock('../../../group-conversation/session-roundtable-agents.js', () => ({
  roundtableAgentsForCall: vi.fn(),
}));
vi.mock('../../../../handoff/index.js', () => ({ handoffEvents: { on: vi.fn(), off: vi.fn() } }));
vi.mock('../../../multi-agent/handoff-messages.js', () => ({}));
vi.mock('../../../multi-agent/llm-handoff.js', () => ({ llmHandoffHandler: vi.fn() }));
vi.mock('../../../multi-agent/resume-after-drop.js', () => ({ startResumeLookup: vi.fn() }));
vi.mock('../../../multi-agent/live-data-context.js', () => ({ startInCallChannels: vi.fn() }));

const { runMultiAgentMode } = await import('../multi-agent-mode.js');

function run(sessionPersona: PersonaConfig) {
  return runMultiAgentMode({
    ctx: { room: undefined },
    room: undefined,
    participant: {},
    sessionPersona,
    services: {},
    userData: {},
    sessionId: 'session-1',
    userId: 'uid-owner',
    unregisterSession: () => undefined,
  } as never);
}

describe('runMultiAgentMode and a live custom agent', () => {
  it('does not start the orchestrator for a loaded custom agent', async () => {
    initializeMultiAgentSession.mockClear();
    const live = await resolveLiveCustomAgent(
      { id: liveAgent().id } as PersonaConfig,
      'uid-owner',
      { CUSTOM_AGENT_LIVE: 'on' },
      {
        personaForCaller: async (id) => id,
        loadCustomAgentAsPersona: async () => customAgentToPersonaConfig(liveAgent()),
        liveCallPersona: async (loaded) => liveCallPersona(loaded),
      }
    );
    if (live.kind !== 'loaded') throw new Error(`expected loaded, got ${live.kind}`);

    const result = await run(live.persona);

    expect(result).toEqual({ activated: false });
    expect(initializeMultiAgentSession).not.toHaveBeenCalled();
  });

  it('still starts it for a built-in persona (the path the skip guards)', async () => {
    initializeMultiAgentSession.mockClear();
    const result = await run({ id: 'ferni' } as PersonaConfig);
    expect(initializeMultiAgentSession).toHaveBeenCalledTimes(1);
    expect(result.activated).toBe(false);
    expect(result.error).toContain('orchestrator stub');
  });
});
