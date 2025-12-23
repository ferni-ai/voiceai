/**
 * Multi-Agent System
 *
 * Enables multiple persona agents in a single LiveKit room.
 * Each persona has its own Gemini session and TTS voice for natural handoffs.
 *
 * Usage:
 * ```typescript
 * import {
 *   createAgentOrchestrator,
 *   createPersonaAgentFactory,
 * } from './multi-agent';
 *
 * // Create the factory with shared context
 * const agentFactory = createPersonaAgentFactory({
 *   ctx,
 *   services,
 *   userData,
 *   sessionId,
 * });
 *
 * // Create the orchestrator
 * const orchestrator = createAgentOrchestrator({
 *   ctx,
 *   room,
 *   userParticipant,
 *   createPersonaAgent: agentFactory,
 *   sessionId,
 * });
 *
 * // Start with Ferni
 * await orchestrator.start('ferni');
 *
 * // Later, handoff to Peter (with natural banter!)
 * // - Ferni says goodbye in Ferni's voice
 * // - Peter greets in Peter's voice
 * await orchestrator.handoff({
 *   targetPersonaId: 'peter-john',
 *   reason: 'User wants research help',
 * });
 * ```
 *
 * @module agents/multi-agent
 */

// Orchestrator
export {
  AgentOrchestrator,
  createAgentOrchestrator,
  type PersonaAgent,
  type HandoffRequest,
  type HandoffResult,
  type OrchestratorConfig,
  type AgentCreationContext,
} from './orchestrator.js';

// Agent Factory
export {
  createPersonaAgentFactory,
  type PersonaAgentFactoryConfig,
} from './persona-agent-factory.js';

// Agent Setup (for advanced use cases)
export {
  setupPersonaAgent,
  buildConversationSummary,
  getRecentMessagesForHandoff,
  type AgentSetupConfig,
  type AgentSetupResult,
} from './agent-setup.js';

// Multi-Agent Entry Point
export {
  initializeMultiAgentSession,
  handleHandoffFromDataChannel,
  type MultiAgentSessionConfig,
  type MultiAgentSessionResult,
} from './multi-agent-entry.js';
