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
 * @module intelligence/context-builders/deep-understanding-synthesis
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  BuilderCategory,
  createCriticalInjection,
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
  currentEmotion: string,
  emotionIntensity: number
): string | null {
  const sources = injections.map(i => i.source.replace('deep_', ''));

  const hasEnergyIssue = sources.includes('energy');
  const hasResistance = sources.includes('resistance');
  const hasRepair = sources.includes('repair') || sources.includes('repair_full');
  const hasTension = sources.includes('tension');

  if (hasRepair) {
    return 'User may feel misunderstood. Priority: repair connection before continuing.';
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

  if (!state.emotionTrajectory.includes(currentEmotion)) {
    state.emotionTrajectory.push(currentEmotion);
  }

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
    const negativeEmotions = ['sad', 'anxious', 'angry', 'fear', 'frustration'];
    const positiveEmotions = ['joy', 'content', 'hopeful', 'excited'];

    const negativeCount = emotions.filter(e => negativeEmotions.includes(e)).length;
    const positiveCount = emotions.filter(e => positiveEmotions.includes(e)).length;

    if (negativeCount >= 2 && !emotions.includes(currentEmotion)) {
      injections.push(
        createHighInjection(
          'deep_trajectory',
          `[EMOTIONAL PATTERN] User has been through challenging emotions recently (${emotions.slice(0, 2).join(', ')}). Be extra supportive.`,
          { category: 'deep-understanding' }
        )
      );
    } else if (positiveCount >= 2) {
      injections.push(
        createHintInjection(
          'deep_trajectory',
          `[POSITIVE MOMENTUM] User showing positive emotional trend. Build on this energy.`,
          { category: 'deep-understanding' }
        )
      );
    }
  }

  // ============================================================================
  // 3. TOPIC DEPTH ANALYSIS
  // ============================================================================

  if (runFullAnalysis && state.topicsDiscussed.length > 0) {
    const heavyTopics = ['loss', 'grief', 'death', 'divorce', 'breakup', 'job loss', 'health', 'anxiety', 'depression'];
    const heavyDiscussed = state.topicsDiscussed.filter(t =>
      heavyTopics.some(ht => t.toLowerCase().includes(ht))
    );

    if (heavyDiscussed.length > 0 && turnCount > 5) {
      injections.push(
        createStandardInjection(
          'deep_topics',
          `[HEAVY TOPICS] User has touched on: ${heavyDiscussed.join(', ')}. Approach with care and don't push.`,
          { category: 'deep-understanding' }
        )
      );
    }
  }

  // ============================================================================
  // 4. REPAIR DETECTION
  // ============================================================================

  const repairSignals = /\b(no,? (that's not|i meant)|actually|let me clarify|what i meant was|you misunderstood|that's not what i)\b/i;
  if (repairSignals.test(userText)) {
    injections.push(
      createHighInjection(
        'deep_repair',
        `[REPAIR NEEDED] User may be correcting a misunderstanding. Acknowledge and clarify before continuing.`,
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
    injections.push(
      createHintInjection(
        'deep_energy',
        `[LOW ENERGY] User giving brief responses. Consider: check in on how they're feeling, or offer to wrap up.`,
        { category: 'deep-understanding' }
      )
    );
  } else if (wordCount > 100) {
    injections.push(
      createHintInjection(
        'deep_energy',
        `[HIGH ENGAGEMENT] User sharing extensively. Listen fully before responding, match their depth.`,
        { category: 'deep-understanding' }
      )
    );
  }

  // ============================================================================
  // SYNTHESIS
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

  log.info({
    userId,
    turnCount,
    injectionsCount: injections.length,
    runFullAnalysis,
  }, '🧠 Deep understanding complete');

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

export const deepUnderstandingSynthesisBuilder: ContextBuilder = {
  name: 'deep_understanding_synthesis',
  description: 'Synthesizes deep understanding signals into contextual guidance',
  priority: 25,
  category: BuilderCategory.COGNITIVE,
  build: buildDeepUnderstandingSynthesis,
};

registerContextBuilder(deepUnderstandingSynthesisBuilder);

// ============================================================================
// PUBLIC API
// ============================================================================

export function recordSilenceDuration(sessionId: string, durationMs: number): void {
  const state = getState(sessionId);
  state.lastSilenceDuration = durationMs;
}

export function recordLastAIResponse(sessionId: string, response: string): void {
  const state = getState(sessionId);
  state.lastAIResponse = response;
}

export function clearSessionState(sessionId: string): void {
  sessionState.delete(sessionId);
}

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
