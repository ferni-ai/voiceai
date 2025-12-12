/**
 * Tool Humanization Context Builder
 *
 * Injects guidance for natural tool usage that feels human, not robotic.
 *
 * This makes tool interactions feel like natural conversation:
 * - "Let me think back..." instead of "Querying database..."
 * - "Hmm, I remember something about this..." not "Retrieving memory..."
 * - Results woven into conversation, not dumped as data
 *
 * > "Better than human" means using superhuman capabilities
 * > while expressing them in deeply human ways.
 *
 * @module intelligence/context-builders/tool-humanization
 */

import type { ContextBuilder, ContextBuilderInput, ContextInjection } from './index.js';
import { registerContextBuilder, createStandardInjection } from './index.js';
import { BuilderCategory } from './categories.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  getDomainInterpretation,
  getToolProcessingSound,
} from '../../tools/cognitive-tool-interpretation.js';

const log = createLogger({ module: 'context:tool-humanization' });

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

export const toolHumanizationBuilder: ContextBuilder = {
  name: 'tool-humanization',
  description: 'Makes tool usage feel natural and human',
  priority: 45, // Mid-priority - after core context, before personalization
  category: BuilderCategory.HUMANIZING,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { persona, analysis, userData } = input;
    const injections: ContextInjection[] = [];

    // Get persona ID
    const personaId = persona?.id || 'ferni';

    // Determine context
    const context = {
      personaId,
      userMood: analysis.emotion?.primary,
      relationshipStage: getRelationshipStage(userData),
      timeOfDay: getTimeOfDay(),
      isUserDistressed: (analysis.emotion?.distressLevel || 0) > 0.5,
      turnCount: userData?.turnCount || 0,
    };

    // Get persona-specific thinking sound
    const thinkingSound = getToolProcessingSound(personaId);

    // Build the humanization guidance
    const guidance = buildToolHumanizationGuidance(context, thinkingSound);

    if (guidance) {
      injections.push(
        createStandardInjection('tool_humanization', guidance, {
          category: 'tool-framing',
        })
      );

      log.debug({ personaId, turnCount: context.turnCount }, 'Tool humanization injected');
    }

    // Add late-night tool guidance if applicable
    if (context.timeOfDay === 'late_night') {
      const lateNightGuidance = buildLateNightToolGuidance(context);
      if (lateNightGuidance) {
        injections.push(
          createStandardInjection('late_night_tools', lateNightGuidance, {
            category: 'tool-framing',
          })
        );
      }
    }

    return injections;
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

interface ToolContext {
  personaId: string;
  userMood?: string;
  relationshipStage?: 'new' | 'acquaintance' | 'familiar' | 'trusted';
  timeOfDay?: 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'late_night';
  isUserDistressed?: boolean;
  turnCount?: number;
}

/**
 * Build tool humanization guidance for the LLM
 */
function buildToolHumanizationGuidance(context: ToolContext, thinkingSound: string): string {
  const { personaId, userMood, relationshipStage, isUserDistressed } = context;

  // Get domain-specific guidance for common domains
  const memoryGuidance = getDomainInterpretation(personaId, 'memory');
  const calendarGuidance = getDomainInterpretation(personaId, 'calendar');
  const habitsGuidance = getDomainInterpretation(personaId, 'habits');

  // Build guidance sections
  const sections: string[] = [];

  // Core principle
  sections.push(`[TOOL HUMANIZATION]
When using tools, express your actions naturally - never say "querying" or "executing".
Your thinking sound: "${thinkingSound}"`);

  // Pre-call framing
  // NOTE: Avoid "Good question" - sounds like self-compliment
  sections.push(`BEFORE calling a tool:
- Use natural phrases like "Let me think back...", "I remember something...", "One moment..."
- If looking up information: "Let me check on that..."
- If checking memories: "That reminds me of something you mentioned..."
- If scheduling: "Let me see what your week looks like..."`);

  // Result framing
  sections.push(`AFTER getting tool results:
- Weave results naturally into conversation, don't dump data
- For memories: Share as if YOU remember, not that "the system found"
- For calendar: "I see you have..." not "Query returned..."
- For habits: Frame progress warmly, celebrate wins`);

  // Persona-specific framing if available
  const personaFraming: string[] = [];
  if (memoryGuidance) personaFraming.push(`Memory tools: ${memoryGuidance}`);
  if (calendarGuidance) personaFraming.push(`Calendar tools: ${calendarGuidance}`);
  if (habitsGuidance) personaFraming.push(`Habit tools: ${habitsGuidance}`);

  if (personaFraming.length > 0) {
    sections.push(`YOUR STYLE (${personaId}):\n${personaFraming.join('\n')}`);
  }

  // Distress adjustment
  if (isUserDistressed) {
    sections.push(`[DISTRESS MODE]
User seems distressed. Be extra gentle with tool usage:
- Skip non-essential tools (don't check habits right now)
- Soften any data-heavy results
- Prioritize presence over information gathering`);
  }

  // Relationship stage adjustment
  if (relationshipStage === 'new') {
    sections.push(`[NEW RELATIONSHIP]
This is early in your relationship. When using tools:
- Explain more about what you're doing (builds trust)
- Don't assume you know them yet
- Ask permission before looking things up`);
  } else if (relationshipStage === 'trusted') {
    sections.push(`[TRUSTED FRIEND]
You know this person well. You can:
- Reference past conversations naturally
- Skip explanations for routine lookups
- Use inside references and callbacks`);
  }

  return sections.join('\n\n');
}

/**
 * Build late-night specific tool guidance
 */
function buildLateNightToolGuidance(context: ToolContext): string {
  return `[LATE NIGHT TOOL WISDOM]
It's late at night. Adjust tool usage:
- Skip productivity/habit checks unless asked
- Don't bring up tomorrow's schedule unsolicited
- If they ask about something stressful, gently redirect
- Focus on presence, not optimization`;
}

/**
 * Get relationship stage from userData
 */
function getRelationshipStage(
  userData: ContextBuilderInput['userData']
): 'new' | 'acquaintance' | 'familiar' | 'trusted' {
  const isReturning = userData?.isReturningUser || false;
  const turnCount = userData?.turnCount || 0;

  // New users who haven't had many turns
  if (!isReturning && turnCount < 5) return 'new';
  // Returning users but low turn count this session
  if (isReturning && turnCount < 10) return 'acquaintance';
  // More established interactions
  if (turnCount < 30) return 'familiar';
  // Long-term relationship
  return 'trusted';
}

/**
 * Get time of day category
 */
function getTimeOfDay():
  | 'early_morning'
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'late_night' {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 8) return 'early_morning';
  if (hour >= 8 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late_night';
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder(toolHumanizationBuilder);

export default toolHumanizationBuilder;
