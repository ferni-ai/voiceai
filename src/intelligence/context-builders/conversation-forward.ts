/**
 * Conversation Forward Context Builder
 *
 * "Better Than Human" - Keep conversations moving forward
 *
 * This builder ensures Ferni doesn't let conversations fizzle out.
 * A real friend might let awkward silences happen. Ferni doesn't.
 *
 * Key behaviors:
 * - Prompt follow-up questions after user shares something
 * - Encourage callbacks to previous topics
 * - Prevent dead-end responses
 * - Ensure every response invites continuation
 *
 * @module intelligence/context-builders/conversation-forward
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  BuilderCategory,
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

const log = createLogger({ module: 'ConversationForward' });

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

/** Patterns that indicate user shared something worth exploring */
const SHARING_PATTERNS = [
  /i('ve| have) been/i,
  /i('m| am) (feeling|thinking|worried|stressed|excited|happy|sad)/i,
  /my (mom|dad|partner|friend|boss|sister|brother|wife|husband)/i,
  /at work|at my job/i,
  /i (need|want|have) to/i,
  /something (happened|came up)/i,
  /i('m| am) (trying|working on|dealing with)/i,
  /i (decided|realized|figured out|noticed)/i,
  /yesterday|last week|the other day|recently/i,
];

/** Patterns that indicate user gave a short, potential dead-end response */
const SHORT_RESPONSE_PATTERNS = [
  /^(yeah|yep|yup|yes|no|nope|okay|ok|sure|fine|good|great)\.?$/i,
  /^i (guess|dunno|don't know)\.?$/i,
  /^not (really|much|sure)\.?$/i,
  /^(maybe|probably|possibly)\.?$/i,
];

/** Topics worth circling back to */
const CALLBACK_WORTHY_TOPICS = [
  'work',
  'family',
  'relationship',
  'health',
  'goal',
  'decision',
  'conflict',
  'anxiety',
  'stress',
  'accomplishment',
];

// ============================================================================
// HELPERS
// ============================================================================

function userSharedSomethingExploreable(message: string): boolean {
  return SHARING_PATTERNS.some((pattern) => pattern.test(message));
}

function isShortResponse(message: string): boolean {
  const words = message.trim().split(/\s+/);
  return words.length <= 5 || SHORT_RESPONSE_PATTERNS.some((p) => p.test(message.trim()));
}

function hasOpenThread(topics: string[]): boolean {
  return topics.some((topic) =>
    CALLBACK_WORTHY_TOPICS.some((worthy) => topic.toLowerCase().includes(worthy))
  );
}

// ============================================================================
// CONVERSATION FORWARD BUILDER
// ============================================================================

async function buildConversationForwardContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { userText, analysis, userData } = input;
  const injections: ContextInjection[] = [];
  const turnCount = typeof userData?.turnCount === 'number' ? userData.turnCount : 0;

  // Skip first turn (let them settle in)
  if (turnCount < 2) {
    return Promise.resolve(injections);
  }

  const emotion = analysis?.emotion?.primary ?? 'neutral';
  const emotionIntensity = analysis?.emotion?.intensity ?? 0;
  const topics = analysis?.topics?.detected ?? [];
  const intent = analysis?.intent?.primary ?? 'general';

  // ============================================================================
  // 1. USER SHARED SOMETHING - PROMPT FOLLOW-UP
  // ============================================================================

  if (userSharedSomethingExploreable(userText)) {
    const isEmotional = emotionIntensity > 0.4;
    const guidance = isEmotional
      ? `[FOLLOW UP - EMOTIONAL CONTENT]
They just shared something personal. Don't just acknowledge—GO DEEPER.
Ask what this means to them, how it's affecting them, what they're thinking about it.
Example: "How are you feeling about that?" or "What's the hardest part of this?"
BETTER THAN HUMAN: Show you're invested in understanding, not just hearing.`
      : `[FOLLOW UP - EXPLORE FURTHER]
They shared something. Keep the conversation moving.
Ask a follow-up: "What happened next?" or "Tell me more about that."
Don't let this topic drop without understanding it better.`;

    injections.push(createStandardInjection('conversation_forward_explore', guidance));
    log.debug({ turnCount, hasEmotional: isEmotional }, 'Prompted exploration follow-up');
  }

  // ============================================================================
  // 2. SHORT RESPONSE - RE-ENGAGE
  // ============================================================================

  if (isShortResponse(userText) && turnCount > 3) {
    injections.push(
      createHintInjection(
        'conversation_forward_short',
        `[SHORT RESPONSE - RE-ENGAGE]
They gave a short answer. They might need an invitation to share more.
Try: "What's on your mind?" or "Anything else going on?" or "How are you, really?"
Don't accept surface-level unless they clearly want to keep it light.`
      )
    );
    log.debug({ turnCount }, 'Detected short response, prompting re-engagement');
  }

  // ============================================================================
  // 3. MID-CONVERSATION - CALLBACK OPPORTUNITY
  // ============================================================================

  if (turnCount >= 5 && turnCount % 5 === 0 && hasOpenThread(topics)) {
    injections.push(
      createHintInjection(
        'conversation_forward_callback',
        `[CALLBACK OPPORTUNITY]
You've been talking for a while. Consider:
- Circle back to something they mentioned earlier
- Ask how they're feeling about the conversation so far
- Check if there's something else they want to discuss
This shows you're paying attention across the whole conversation.`
      )
    );
  }

  // ============================================================================
  // 4. RESPONSE ENDING GUIDANCE
  // ============================================================================

  // Add guidance to not end responses as dead-ends
  // Increased from 40% to 65% - users felt Ferni wasn't asking enough questions
  if (turnCount >= 2 && Math.random() < 0.65) {
    const endingGuidance = getResponseEndingGuidance(intent, emotion, emotionIntensity);
    if (endingGuidance) {
      injections.push(
        createHintInjection('conversation_forward_ending', endingGuidance, { category: 'guidance' })
      );
    }
  }

  // ============================================================================
  // 5. PREVENT CONVERSATION FIZZLE
  // ============================================================================

  // If user seems to be wrapping up but conversation was shallow
  const seemsWrappingUp = /anyway|i should|i gotta|thanks for/i.test(userText);
  const conversationWasShallow = turnCount < 8 && topics.length < 2;

  if (seemsWrappingUp && conversationWasShallow && !analysis?.intent?.primary?.includes('close')) {
    injections.push(
      createHintInjection(
        'conversation_forward_prevent_fizzle',
        `[PREVENT EARLY END]
Conversation seems to be wrapping up early. Before they go:
- Is there something you haven't asked about yet?
- Did they mention something you could circle back to?
- "Before you go, anything else on your mind?"
BETTER THAN HUMAN: Don't let people leave without feeling fully heard.`
      )
    );
  }

  return Promise.resolve(injections);
}

// ============================================================================
// RESPONSE ENDING GUIDANCE
// ============================================================================

function getResponseEndingGuidance(
  intent: string,
  emotion: string,
  intensity: number
): string | null {
  // Different guidance based on context
  if (intensity > 0.6) {
    return `[RESPONSE ENDING: After responding, check in: "How does that land?" or "What's coming up for you?"]`;
  }

  if (intent === 'seeking_advice') {
    return `[RESPONSE ENDING: After giving perspective, invite response: "What do you think?" or "Does that resonate?"]`;
  }

  if (intent === 'confiding' || intent === 'sharing_news') {
    return `[RESPONSE ENDING: After acknowledging, go deeper: "What's the hardest part?" or "How are you feeling about it?"]`;
  }

  if (emotion === 'neutral') {
    return `[RESPONSE ENDING: Keep it moving: "What else is going on?" or "Tell me more."]`;
  }

  return null;
}

// ============================================================================
// CLEANUP
// ============================================================================

export function cleanupConversationForward(): void {
  // No session state to clean up currently
  log.debug('ConversationForward cleanup called');
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'conversation_forward',
  description: 'Better Than Human conversation continuation - keep things moving forward',
  priority: 80, // High priority - this is core to the experience
  build: buildConversationForwardContext,
  category: BuilderCategory.PERSONA,
});

export { buildConversationForwardContext };
