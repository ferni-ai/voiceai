/**
 * Context Builder Helpers
 *
 * Re-exports from index.ts for backwards compatibility.
 */

export {
  type ContextUserData,
  type ContextBuilderInput,
  type ContextInjection,
  type ContextBuilder,
  type ConversationAnalysis,
  type SessionServices,
  type UserProfile,
  type VoiceEmotionResult,
  registerContextBuilder,
  getRegisteredBuilders,
  createInjection,
  createCriticalInjection,
  createStandardInjection,
  createHintInjection,
  buildConversationContext,
  formatContextForPrompt,
} from './index.js';
