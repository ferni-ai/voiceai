/**
 * Tool Orchestration System
 *
 * The scalable, intelligent tool management system for Ferni.
 *
 * EXPORTS:
 * - toolOrchestrator: Main API for tool selection
 * - getToolsForAgent: Voice agent integration
 *
 * NOTE: Embedding persistence is handled by SemanticRouter (src/tools/semantic-router.ts)
 * which saves/loads tool embeddings from Firestore collection 'system_cache/tool_embeddings'
 */

export {
  toolOrchestrator,
  UnifiedToolOrchestrator,
  type ToolSelectionRequest,
  type ToolSelectionResult,
  type ToolSelectionContext,
  type RefreshRequest,
  type RefreshResult,
  type OrchestratorConfig,
} from './unified-tool-orchestrator.js';

// Voice agent integration - the main entry point for voice-agent.ts
export {
  initializeToolOrchestrator,
  isOrchestratorInitialized,
  getToolsForAgent,
  refreshToolsForContext,
  getToolSelectionDiagnostics,
  explainToolSelection,
  type GetToolsForAgentOptions,
  type GetToolsResult,
  type RefreshToolsOptions,
  type RefreshToolsResult,
  type PersonaConfig,
} from './voice-agent-integration.js';

// Re-export commonly used types
export type { Tool, ToolContext, ToolDomain, ToolDefinition } from '../registry/types.js';
export type { SemanticMatch } from '../semantic-router.js';
export type { DetectedIntent } from '../dynamic-tool-router.js';

// Tool composition (chaining tools together)
export {
  ToolComposer,
  createToolComposer,
  TOOL_CHAINS,
  type ToolChain,
  type ComposedResult,
  type ComposeOptions,
} from './tool-composer.js';
