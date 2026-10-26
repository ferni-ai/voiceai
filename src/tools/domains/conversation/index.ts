/**
 * Conversation Domain Tools
 *
 * Barrel export for conversation management tools:
 * - Conversation flow
 *
 * NOTE: Memory, Proactive, and Awareness tools have their own domain modules:
 * - Memory: src/tools/domains/memory/
 * - Proactive: src/tools/domains/proactive/
 * - Awareness: src/tools/domains/awareness/
 */

// Conversation tools - core conversation management
export { createConversationTools, default } from './conversation-tools.js';

// The caller's-name questions the turn reminder shares with rememberName (agents/personas)
export {
  confirmNameNote,
  eitherNote,
  noteTurnWords,
  pendingOf,
  propose,
  settle,
  type Pending,
} from './name-confirm.js';
export { doubleCheckLine, nameLikeness } from './name-likeness.js';
