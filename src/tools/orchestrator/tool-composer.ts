/**
 * Tool Composer
 *
 * Enables tools to work together for human-level conversation.
 * Provides:
 * - Tool chaining (one tool suggesting the next)
 * - Context passing between tools
 * - Response composition
 * - Emotional awareness integration
 *
 * USAGE:
 *   const composer = new ToolComposer(conversationState);
 *
 *   // Execute with context sharing
 *   const result = await composer.execute('rememberAboutUser', params);
 *
 *   // Get next suggested tools
 *   const suggestions = composer.getSuggestedTools();
 */

import { getLogger } from '../../utils/safe-logger.js';

import {
  getConversationState,
  type ConversationStateManager,
  type EmotionalContext,
} from '../../services/conversation-state.js';

// Re-export types and data for backward compatibility
export type { ComposedResult, ToolChain, ComposeOptions } from './composer-types.js';
export { TOOL_CHAINS } from './tool-chains.js';

import type { ComposedResult, ComposeOptions } from './composer-types.js';
import { TOOL_CHAINS } from './tool-chains.js';

// ============================================================================
// EMOTION DETECTION
// ============================================================================

/**
 * Detect appropriate emotion based on result content
 */
function detectEmotion(result: unknown, toolName: string): ComposedResult['emotion'] {
  // Check for predefined emotion
  const chain = TOOL_CHAINS[toolName];
  if (chain?.typicalEmotion) {
    return chain.typicalEmotion;
  }

  // Analyze result content
  const resultStr = typeof result === 'string' ? result : JSON.stringify(result);

  // Celebratory indicators
  if (/🎉|🏆|congrat|amazing|excellent|streak|milestone|level up/i.test(resultStr)) {
    return 'celebratory';
  }

  // Happy/positive indicators
  if (/✅|done|success|complete|great|good job|nice/i.test(resultStr)) {
    return 'happy';
  }

  // Excited indicators
  if (/!{2,}|wow|exciting|can't wait|looking forward/i.test(resultStr)) {
    return 'excited';
  }

  // Concerned indicators
  if (/⚠️|warning|careful|concern|worry|risk|issue/i.test(resultStr)) {
    return 'concerned';
  }

  // Empathetic indicators
  if (/understand|hear you|that's hard|must be|support|here for you/i.test(resultStr)) {
    return 'empathetic';
  }

  return 'neutral';
}

/**
 * Extract facts from result
 */
function extractFacts(result: unknown, toolName: string): ComposedResult['factsToRemember'] {
  const facts: ComposedResult['factsToRemember'] = [];

  // Tool-specific extraction
  if (toolName === 'setGoal') {
    const goalData = result as Record<string, unknown>;
    if (goalData.name) {
      facts.push({
        fact: `Set goal: ${goalData.name}`,
        category: 'goal',
        importance: 'high',
      });
    }
  }

  if (toolName === 'logHabit') {
    const habitData = result as Record<string, unknown>;
    if (habitData.streak && Number(habitData.streak) >= 7) {
      facts.push({
        fact: `${habitData.streak}-day streak on ${habitData.habitName}`,
        category: 'goal',
        importance: 'medium',
      });
    }
  }

  if (toolName === 'noteEmotionalState') {
    const emotionData = result as Record<string, unknown>;
    if (emotionData.state) {
      facts.push({
        fact: `Feeling ${emotionData.state}: ${emotionData.context}`,
        category: 'emotional',
        importance: 'medium',
      });
    }
  }

  return facts;
}

// ============================================================================
// TOOL COMPOSER
// ============================================================================

export class ToolComposer {
  private state: ConversationStateManager;
  private context = new Map<string, unknown>();
  private logger = getLogger();

  constructor(sessionId: string, userId?: string, agentId?: string) {
    this.state = getConversationState(sessionId, userId, agentId);
  }

  /**
   * Get the conversation state manager
   */
  getState(): ConversationStateManager {
    return this.state;
  }

  /**
   * Set context value for sharing between tools
   */
  setContext(key: string, value: unknown): void {
    this.context.set(key, value);
  }

  /**
   * Get context value
   */
  getContext<T>(key: string): T | undefined {
    return this.context.get(key) as T | undefined;
  }

  /**
   * Clear context
   */
  clearContext(): void {
    this.context.clear();
  }

  /**
   * Compose a tool result with metadata
   */
  compose(toolName: string, result: unknown, options: ComposeOptions = {}): ComposedResult {
    const chain = TOOL_CHAINS[toolName];

    // Extract speech from result
    let speech: string;
    if (typeof result === 'string') {
      speech = result;
    } else if (result && typeof result === 'object' && 'speech' in result) {
      speech = (result as { speech: string }).speech;
    } else {
      speech = JSON.stringify(result);
    }

    // Detect emotion
    const emotion = options.emotion || detectEmotion(result, toolName);

    // Get suggested next tools
    const suggestedNext = chain?.suggestedFollowers || [];

    // Extract facts if requested
    const factsToRemember = options.extractFacts ? extractFacts(result, toolName) : undefined;

    // Store context keys for next tools
    if (options.shareContext && chain?.contextKeys) {
      for (const key of chain.contextKeys) {
        if (result && typeof result === 'object' && key in result) {
          this.setContext(key, (result as Record<string, unknown>)[key]);
        }
      }
    }

    // Update conversation state
    this.state.recordToolCall(toolName, speech.substring(0, 100));
    this.state.suggestNextTools(suggestedNext);

    if (factsToRemember) {
      for (const fact of factsToRemember) {
        this.state.addFactToRemember(fact.fact, fact.category, fact.importance);
      }
    }

    // Update emotional context based on tool
    if (emotion && emotion !== 'neutral') {
      const emotionMap: Record<string, EmotionalContext['emotions'][0]> = {
        happy: 'happy',
        excited: 'excited',
        concerned: 'anxious',
        empathetic: 'calm',
        celebratory: 'excited',
      };
      if (emotionMap[emotion]) {
        this.state.detectEmotion(emotionMap[emotion]);
      }
    }

    this.state.incrementTurn();

    return {
      result,
      speech,
      emotion,
      suggestedNext,
      factsToRemember,
    };
  }

  /**
   * Get suggested next tools based on conversation state
   */
  getSuggestedTools(): string[] {
    return this.state.getToolExecutionData().suggestedNextTools;
  }

  /**
   * Check if we should wrap up
   */
  shouldWrapUp(): { should: boolean; reasons: string[] } {
    return this.state.shouldWrapUp();
  }

  /**
   * Get emotional context for voice modulation
   */
  getEmotionalContext(): EmotionalContext {
    return this.state.getEmotionalContext() as EmotionalContext;
  }

  /**
   * Get conversation summary for LLM context
   */
  getConversationSummary(): string {
    return this.state.getSummaryForLLM();
  }

  /**
   * Get a circle-back topic if any pending
   */
  getCircleBackTopic(): { topic: string; reason: string } | null {
    return this.state.getNextCircleBack();
  }

  /**
   * Add a topic to circle back to later
   */
  addCircleBack(topic: string, reason: string): void {
    this.state.addCircleBackTopic(topic, reason);
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a tool composer for a session
 */
export function createToolComposer(
  sessionId: string,
  userId?: string,
  agentId?: string
): ToolComposer {
  return new ToolComposer(sessionId, userId, agentId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  ToolComposer,
  createToolComposer,
  TOOL_CHAINS,
};
