/**
 * Deep Understanding Synthesis Context Builder
 *
 * Synthesizes deep understanding signals into contextual guidance:
 * - Silence patterns
 * - Emotion trajectory
 * - Topic depth
 * - Repair detection
 * - Energy/pacing
 *
 * This is the "Better Than Human" core - superhuman emotional intelligence
 * that notices patterns humans miss.
 *
 * @module intelligence/context-builders/deep-understanding-synthesis
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  BuilderCategory,
  createHighInjection,
  createStandardInjection,
  createHintInjection,
  registerContextBuilder,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

const log = createLogger({ module: 'DeepUnderstandingSynthesis' });

// ============================================================================
// TYPES
// ============================================================================

interface DeepUnderstandingState {
  lastSilenceDuration?: number;
  lastPersonMentioned?: string;
  lastAIResponse?: string;
  emotionTrajectory: string[];
  topicsDiscussed: string[];
  turnsSinceDeepCheck: number;
}

const sessionState = new Map<string, DeepUnderstandingState>();

function getState(sessionId: string): DeepUnderstandingState {
  let state = sessionState.get(sessionId);
  if (!state) {
    state = {
      emotionTrajectory: [],
      topicsDiscussed: [],
      turnsSinceDeepCheck: 0,
    };
    sessionState.set(sessionId, state);
  }
  return state;
}

// ============================================================================
// HELPERS
// ============================================================================

function shouldRunFullAnalysis(turnCount: number, emotionIntensity: number): boolean {
  if (emotionIntensity > 0.7) return true;
  if (turnCount % 4 === 0) return true;
  if (turnCount <= 3) return true;
  return false;
}

function synthesizeInsights(
  injections: ContextInjection[],
  _currentEmotion: string,
  emotionIntensity: number
): string | null {
  const sources = injections.map(i => i.source.replace('deep_', ''));

  const hasEnergyIssue = sources.includes('energy');
  const hasResistance = sources.includes('resistance');
  const hasRepair = sources.includes('repair') || sources.includes('repair_full');
  const hasTension = sources.includes('tension');
  const hasNegativeTrajectory = sources.includes('trajectory') && 
    injections.some(i => i.source === 'deep_trajectory' && i.content.includes('challenging'));

  if (hasRepair) {
    return 'User may feel misunderstood. Priority: repair connection before continuing.';
  }

  if (hasNegativeTrajectory && hasEnergyIssue) {
    return 'User showing signs of exhaustion and difficult emotions. Be extra gentle and focus on small wins.';
  }

  if (hasResistance && hasTension) {
    return 'User avoiding something related to a relationship. Give space, don\'t push.';
  }

  if (hasEnergyIssue && emotionIntensity > 0.7) {
    return 'User seems depleted but emotionally activated. Keep response brief and supportive.';
  }

  if (sources.length >= 4) {
    return 'Multiple patterns detected - this is a complex moment. Listen more than advise.';
  }

  return null;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

async function buildDeepUnderstandingSynthesis(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { services, userText, analysis, userData } = input;

  const userId = services?.userProfile?.id || services?.userId;
  const sessionId = services?.sessionId || 'unknown';
  const turnCount = userData?.turnCount || 0;
  const emotionIntensity = analysis?.emotion?.intensity || 0.5;
  const currentEmotion = analysis?.emotion?.primary || 'neutral';
  const currentTopics = analysis?.topics?.detected || [];

  if (!userId) {
    return [];
  }

  const injections: ContextInjection[] = [];
  const state = getState(sessionId);

  // Track emotion trajectory
  if (currentEmotion && !state.emotionTrajectory.includes(currentEmotion)) {
    state.emotionTrajectory.push(currentEmotion);
    // Keep last 10 emotions
    if (state.emotionTrajectory.length > 10) {
      state.emotionTrajectory.shift();
    }
  }

  // Track topics
  for (const topic of currentTopics) {
    if (!state.topicsDiscussed.includes(topic)) {
      state.topicsDiscussed.push(topic);
    }
  }

  const runFullAnalysis = shouldRunFullAnalysis(turnCount, emotionIntensity);

  log.debug({
    userId,
    turnCount,
    emotionIntensity,
    runFullAnalysis,
  }, '🧠 Deep understanding synthesis');

  // ============================================================================
  // 1. SILENCE INTELLIGENCE
  // ============================================================================

  if (state.lastSilenceDuration && state.lastSilenceDuration > 2000) {
    const silenceSeconds = Math.round(state.lastSilenceDuration / 1000);
    let silenceGuidance: string | null = null;

    if (silenceSeconds > 5 && emotionIntensity > 0.6) {
      silenceGuidance = `[SILENCE] User paused ${silenceSeconds}s before responding. With high emotion, this may indicate processing something heavy. Give them space.`;
    } else if (silenceSeconds > 3) {
      silenceGuidance = `[SILENCE] User paused ${silenceSeconds}s - may be thinking carefully. Acknowledge their thoughtfulness.`;
    }

    if (silenceGuidance) {
      injections.push(
        createStandardInjection('deep_silence', silenceGuidance, { category: 'deep-understanding' })
      );
      log.debug({ silenceSeconds }, '🤫 Silence insight');
    }
  }

  // ============================================================================
  // 2. EMOTION TRAJECTORY ANALYSIS
  // ============================================================================

  if (state.emotionTrajectory.length >= 3) {
    const emotions = state.emotionTrajectory.slice(-3);
    const negativeEmotions = ['sadness', 'anxiety', 'anger', 'fear', 'frustration', 'disgust'];
    const positiveEmotions = ['joy', 'trust', 'anticipation', 'surprise'];

    const negativeCount = emotions.filter(e => negativeEmotions.includes(e)).length;
    const positiveCount = emotions.filter(e => positiveEmotions.includes(e)).length;

    if (negativeCount >= 2) {
      injections.push(
        createHighInjection(
          'deep_trajectory',
          `[EMOTIONAL PATTERN] User has been experiencing challenging emotions (${emotions.filter(e => negativeEmotions.includes(e)).join(', ')}). Be extra supportive and validate their feelings.`,
          { category: 'deep-understanding' }
        )
      );
    } else if (positiveCount >= 2) {
      injections.push(
        createHintInjection(
          'deep_trajectory',
          `[POSITIVE MOMENTUM] User showing positive emotional trend. Build on this energy and celebrate with them.`,
          { category: 'deep-understanding' }
        )
      );
    }
  }

  // ============================================================================
  // 3. TOPIC DEPTH ANALYSIS
  // ============================================================================

  if (runFullAnalysis && state.topicsDiscussed.length > 0) {
    const heavyTopics = ['loss', 'grief', 'death', 'divorce', 'breakup', 'job loss', 'health', 'anxiety', 'depression', 'loneliness', 'failure'];
    const heavyDiscussed = state.topicsDiscussed.filter(t =>
      heavyTopics.some(ht => t.toLowerCase().includes(ht))
    );

    if (heavyDiscussed.length > 0 && turnCount > 5) {
      injections.push(
        createStandardInjection(
          'deep_topics',
          `[HEAVY TOPICS] User has touched on: ${heavyDiscussed.join(', ')}. Approach with care and don't push for more than they're ready to share.`,
          { category: 'deep-understanding' }
        )
      );
    }
  }

  // ============================================================================
  // 4. REPAIR DETECTION (misunderstanding signals)
  // ============================================================================

  const repairSignals = /\b(no,? (that's not|i meant)|actually|let me clarify|what i meant was|you misunderstood|that's not what i|i didn't mean|not exactly|not quite)\b/i;
  if (repairSignals.test(userText)) {
    injections.push(
      createHighInjection(
        'deep_repair',
        `[REPAIR NEEDED] User may be correcting a misunderstanding. Acknowledge, apologize briefly, and clarify your understanding before continuing.`,
        { category: 'deep-understanding' }
      )
    );
    log.info('🔧 Repair signal detected');
  }

  // ============================================================================
  // 5. ENERGY/PACING DETECTION
  // ============================================================================

  const wordCount = userText.split(/\s+/).length;
  const hasQuestions = (userText.match(/\?/g) || []).length;

  if (wordCount < 10 && hasQuestions === 0 && turnCount > 3) {
    // Short responses may indicate low energy or disengagement
    injections.push(
      createHintInjection(
        'deep_energy',
        `[LOW ENERGY] User giving brief responses. Consider: check in on how they're feeling, or offer to wrap up if they're tired.`,
        { category: 'deep-understanding' }
      )
    );
  } else if (wordCount > 100) {
    // Very long response indicates high engagement
    injections.push(
      createHintInjection(
        'deep_energy',
        `[HIGH ENGAGEMENT] User sharing extensively. Listen fully before responding and match their depth.`,
        { category: 'deep-understanding' }
      )
    );
  }

  // ============================================================================
  // 6. PEOPLE MENTIONED (relational context)
  // ============================================================================

  const peoplePatterns = /\b(my (wife|husband|partner|girlfriend|boyfriend|mom|dad|mother|father|sister|brother|son|daughter|friend|boss|coworker|therapist|doctor))\b/i;
  const peopleMatch = userText.match(peoplePatterns);
  if (peopleMatch) {
    const person = peopleMatch[1];
    if (state.lastPersonMentioned !== person) {
      state.lastPersonMentioned = person;
      injections.push(
        createHintInjection(
          'deep_relational',
          `[RELATIONSHIP CONTEXT] User mentioned "${person}". Remember this relationship for context and ask thoughtful follow-ups about them.`,
          { category: 'deep-understanding' }
        )
      );
    }
  }

  // ============================================================================
  // 7. VULNERABILITY DETECTION
  // ============================================================================

  const vulnerabilitySignals = /\b(never told anyone|between us|embarrassed|ashamed|scared to admit|hard to say|don't usually share|first time saying)\b/i;
  if (vulnerabilitySignals.test(userText)) {
    injections.push(
      createHighInjection(
        'deep_vulnerability',
        `[VULNERABILITY] User is sharing something deeply personal. Honor their trust with warmth and discretion. Don't probe further unless they lead.`,
        { category: 'deep-understanding' }
      )
    );
  }

  // ============================================================================
  // SYNTHESIS: Combined Insight
  // ============================================================================

  if (injections.length >= 3 && runFullAnalysis) {
    const synthesis = synthesizeInsights(injections, currentEmotion, emotionIntensity);
    if (synthesis) {
      injections.unshift(
        createHighInjection(
          'deep_synthesis',
          `[DEEP UNDERSTANDING] ${synthesis}`,
          { category: 'deep-understanding' }
        )
      );
    }
  }

  state.turnsSinceDeepCheck = runFullAnalysis ? 0 : state.turnsSinceDeepCheck + 1;

  if (injections.length > 0) {
    log.info({
      userId,
      turnCount,
      injectionsCount: injections.length,
      sources: injections.map(i => i.source),
    }, '🧠 Deep understanding complete');
  }

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

export const deepUnderstandingSynthesisBuilder: ContextBuilder = {
  name: 'deep_understanding_synthesis',
  description: 'Synthesizes deep understanding signals into contextual guidance',
  priority: 25, // High priority - runs early
  category: BuilderCategory.COGNITIVE,
  build: buildDeepUnderstandingSynthesis,
};

registerContextBuilder(deepUnderstandingSynthesisBuilder);

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Record silence duration for next analysis
 */
export function recordSilenceDuration(sessionId: string, durationMs: number): void {
  const state = getState(sessionId);
  state.lastSilenceDuration = durationMs;
}

/**
 * Record AI response for repair detection
 */
export function recordLastAIResponse(sessionId: string, response: string): void {
  const state = getState(sessionId);
  state.lastAIResponse = response;
}

/**
 * Clear session state (on session end)
 */
export function clearSessionState(sessionId: string): void {
  sessionState.delete(sessionId);
}

/**
 * Get session insights summary
 */
export function getSessionInsightsSummary(sessionId: string): {
  emotionTrajectory: string[];
  topicsDiscussed: string[];
  turnsSinceDeepCheck: number;
} {
  const state = getState(sessionId);
  return {
    emotionTrajectory: [...state.emotionTrajectory],
    topicsDiscussed: [...state.topicsDiscussed],
    turnsSinceDeepCheck: state.turnsSinceDeepCheck,
  };
}

export { buildDeepUnderstandingSynthesis };

