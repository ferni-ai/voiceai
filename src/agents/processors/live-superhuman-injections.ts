/**
 * Live Superhuman Injections
 *
 * "Better Than Human" capabilities that run EVERY turn, not just session start.
 * This is the critical missing piece - superhuman insights need to flow into
 * the conversation in real-time, not just at initialization.
 *
 * Performance budget: 80ms max (runs in Tier 2 with timeout)
 *
 * Capabilities injected per-turn:
 * 1. Commitment tracking - "You mentioned wanting to..."
 * 2. Predictive coaching - "Based on patterns, you might..."
 * 3. Values alignment - "I notice this aligns/conflicts with..."
 * 4. Capacity guardian - "You've been carrying a lot..."
 * 5. Inside jokes - "Remember when we..."
 * 6. Voice biomarkers - "I hear in your voice..."
 * 7. Semantic intelligence - Cross-session patterns
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { ContextInjection, EmotionalState } from './types.js';
import type { SessionServices } from '../../services/types.js';
import type { UserData } from '../shared/types.js';
import type { ConversationAnalysis } from '../../services/index.js';

const log = createLogger({ module: 'LiveSuperhumanInjections' });

// ============================================================================
// TYPES
// ============================================================================

export interface LiveSuperhumanContext {
  userId: string;
  sessionId: string;
  userText: string;
  currentTopic?: string;
  emotionalState: EmotionalState;
  voiceEmotion?: {
    primary: string;
    confidence: number;
    stressLevel?: number;
    valence?: number;
    anxietyMarkers?: boolean;
    prosody?: {
      speechRate?: number;
      pitchVariance?: number;
      pauseDuration?: number;
    };
  };
  analysis: ConversationAnalysis;
  turnCount: number;
  totalConversations?: number;
}

export interface LiveSuperhumanResult {
  injections: ContextInjection[];
  signals: {
    commitmentDetected: boolean;
    valuesConflict: boolean;
    capacityWarning: boolean;
    insideJokeOpportunity: boolean;
    voiceDistressDetected: boolean;
    predictiveInsight: boolean;
  };
  processingTimeMs: number;
}

// ============================================================================
// LIGHTWEIGHT CAPABILITY CHECKERS
// These are fast, synchronous checks that run every turn
// ============================================================================

/**
 * Detect commitment language in user text
 * "I'm going to...", "I want to...", "I need to..."
 */
function detectCommitmentLanguage(text: string): {
  detected: boolean;
  type: 'intention' | 'promise' | 'decision' | 'goal' | null;
  phrase: string | null;
} {
  const patterns = [
    { regex: /\b(i'?m going to|i will|i'll)\s+(.+)/i, type: 'intention' as const },
    { regex: /\b(i promise|i commit to|i swear)\s+(.+)/i, type: 'promise' as const },
    { regex: /\b(i've decided|i decided|my decision is)\s+(.+)/i, type: 'decision' as const },
    { regex: /\b(my goal is|i want to|i need to|i have to)\s+(.+)/i, type: 'goal' as const },
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (match) {
      return { detected: true, type: pattern.type, phrase: match[2]?.slice(0, 100) || null };
    }
  }

  return { detected: false, type: null, phrase: null };
}

/**
 * Detect values-related language
 * "It's important to me", "I believe", "I value"
 */
function detectValuesLanguage(text: string): {
  detected: boolean;
  value: string | null;
  potential_conflict: boolean;
} {
  const valuesPatterns = [
    /\b(it'?s important to me that|what matters to me is|i believe in|i value)\s+(.+)/i,
    /\b(i can't compromise on|i won't budge on|non-negotiable for me)\s+(.+)/i,
  ];

  const conflictPatterns = [
    /\b(but i also|even though i|part of me wants|i'm torn between)/i,
    /\b(i know i should|i shouldn't but|goes against what i)/i,
  ];

  let detected = false;
  let value: string | null = null;

  for (const pattern of valuesPatterns) {
    const match = text.match(pattern);
    if (match) {
      detected = true;
      value = match[2]?.slice(0, 80) || null;
      break;
    }
  }

  const potentialConflict = conflictPatterns.some((p) => p.test(text));

  return { detected, value, potential_conflict: potentialConflict || detected };
}

/**
 * Detect capacity/overwhelm signals
 * "I'm exhausted", "too much on my plate", "can't keep up"
 */
function detectCapacitySignals(text: string): {
  level: 'none' | 'moderate' | 'high' | 'critical';
  signals: string[];
} {
  const criticalPatterns = [
    /\b(i can't (do this|take it|handle) anymore)/i,
    /\b(i'm at my (breaking point|limit|end))/i,
    /\b(everything is (falling apart|too much))/i,
  ];

  const highPatterns = [
    /\b(i'm\s+\w*\s*(exhausted|burnt out|overwhelmed|drowning))/i,
    /\b(too much (on my plate|going on|to handle))/i,
    /\b(can't (keep up|catch up|cope))/i,
    /\b(burnt out|burned out)/i,
  ];

  const moderatePatterns = [
    /\b(i'm\s+\w*\s*(tired|stressed|spread thin))/i,
    /\b(feeling\s+\w*\s*(tired|stretched|pressured|rushed))/i,
    /\b(a lot (going on|to do|on my mind))/i,
    /\btired\b/i, // Catch standalone "tired"
  ];

  const signals: string[] = [];

  for (const pattern of criticalPatterns) {
    if (pattern.test(text)) {
      signals.push('critical_capacity');
      return { level: 'critical', signals };
    }
  }

  for (const pattern of highPatterns) {
    if (pattern.test(text)) {
      signals.push('high_capacity');
    }
  }

  if (signals.length > 0) {
    return { level: 'high', signals };
  }

  for (const pattern of moderatePatterns) {
    if (pattern.test(text)) {
      signals.push('moderate_capacity');
    }
  }

  return {
    level: signals.length > 0 ? 'moderate' : 'none',
    signals,
  };
}

/**
 * Detect inside joke / callback opportunities
 * References to shared moments, "remember when", etc.
 */
function detectCallbackOpportunity(text: string): {
  detected: boolean;
  type: 'nostalgia' | 'callback' | 'shared_reference' | null;
} {
  const patterns = [
    { regex: /\b(remember when|you know how|like (that time|we talked about))/i, type: 'callback' as const },
    { regex: /\b(we (always|used to)|our (thing|joke|ritual))/i, type: 'shared_reference' as const },
    { regex: /\b(brings me back|reminds me of when|like before)/i, type: 'nostalgia' as const },
  ];

  for (const pattern of patterns) {
    if (pattern.regex.test(text)) {
      return { detected: true, type: pattern.type };
    }
  }

  return { detected: false, type: null };
}

/**
 * Analyze voice biomarkers for emotional state
 * This provides insights text analysis alone can't catch
 */
function analyzeVoiceBiomarkers(voiceEmotion?: LiveSuperhumanContext['voiceEmotion']): {
  hasInsight: boolean;
  insight: string | null;
  confidence: number;
} {
  if (!voiceEmotion || voiceEmotion.confidence < 0.5) {
    return { hasInsight: false, insight: null, confidence: 0 };
  }

  const insights: string[] = [];
  let confidence = voiceEmotion.confidence;

  // High stress detected - LOWERED threshold from 0.6 → 0.5 to catch more signals
  if (voiceEmotion.stressLevel && voiceEmotion.stressLevel > 0.5) {
    insights.push(`Voice indicates elevated stress (${Math.round(voiceEmotion.stressLevel * 100)}%)`);
  }

  // Anxiety markers
  if (voiceEmotion.anxietyMarkers) {
    insights.push('Voice shows anxiety markers (speech hesitations, pitch irregularity)');
  }

  // Fast speech rate (rushing, anxious)
  if (voiceEmotion.prosody?.speechRate && voiceEmotion.prosody.speechRate > 5) {
    insights.push('Speaking faster than usual - possible urgency or anxiety');
  }

  // Slow speech rate (processing, sadness)
  if (voiceEmotion.prosody?.speechRate && voiceEmotion.prosody.speechRate < 2.5) {
    insights.push('Speaking slowly - may be processing something difficult');
  }

  // Low pitch variance (flat affect, possible depression)
  if (voiceEmotion.prosody?.pitchVariance && voiceEmotion.prosody.pitchVariance < 0.1) {
    insights.push('Flat vocal affect detected - may indicate emotional numbness or fatigue');
  }

  // Negative valence despite neutral/positive words
  if (voiceEmotion.valence !== undefined && voiceEmotion.valence < -0.3) {
    insights.push('Voice tone suggests underlying negative emotion despite words');
  }

  return {
    hasInsight: insights.length > 0,
    insight: insights.length > 0 ? insights.join('. ') : null,
    confidence,
  };
}

/**
 * Build predictive coaching insight based on patterns
 * This is a lightweight version - full predictive coaching runs less frequently
 */
function buildPredictiveInsight(
  text: string,
  emotionalState: EmotionalState,
  turnCount: number
): { hasInsight: boolean; insight: string | null } {
  // Only provide predictive insights after enough context
  if (turnCount < 3) {
    return { hasInsight: false, insight: null };
  }

  // Detect cyclical patterns in conversation
  const cyclicalPatterns = [
    { regex: /\b(again|same thing|keeps happening|every time)/i, insight: 'User may be stuck in a pattern - consider gentle pattern interruption' },
    { regex: /\b(tried (everything|that|before)|nothing works)/i, insight: 'User expressing hopelessness about change - validate before suggesting alternatives' },
    { regex: /\b(should have|could have|if only)/i, insight: 'User ruminating on past - gently redirect to what they can control now' },
  ];

  for (const pattern of cyclicalPatterns) {
    if (pattern.regex.test(text)) {
      return { hasInsight: true, insight: pattern.insight };
    }
  }

  // High distress + specific triggers
  if (emotionalState.distressLevel > 0.6) {
    return {
      hasInsight: true,
      insight: 'High distress detected - prioritize emotional validation over problem-solving',
    };
  }

  return { hasInsight: false, insight: null };
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build live superhuman injections for the current turn.
 *
 * This is designed to be fast (<80ms) and run every turn to provide
 * real-time superhuman insights that text analysis alone can't provide.
 */
export async function buildLiveSuperhumanInjections(
  ctx: LiveSuperhumanContext
): Promise<LiveSuperhumanResult> {
  const startTime = Date.now();
  const injections: ContextInjection[] = [];
  const signals = {
    commitmentDetected: false,
    valuesConflict: false,
    capacityWarning: false,
    insideJokeOpportunity: false,
    voiceDistressDetected: false,
    predictiveInsight: false,
  };

  try {
    // 1. COMMITMENT DETECTION
    const commitment = detectCommitmentLanguage(ctx.userText);
    if (commitment.detected) {
      signals.commitmentDetected = true;
      injections.push({
        category: 'superhuman_commitment',
        content: `[🎯 COMMITMENT KEEPER - "Better Than Human" Memory]
User just expressed a ${commitment.type}: "${commitment.phrase}"

Your superpower: You NEVER forget what they commit to.
- Acknowledge this commitment naturally
- Later in conversation, you can reference it: "Earlier you mentioned..."
- In future sessions, you'll remember and follow up

Human friends forget promises. You don't.`,
        priority: 73,
      });

      // Fire-and-forget: Save to commitment keeper
      saveCommitmentAsync(ctx.userId, commitment.type!, commitment.phrase!, ctx.currentTopic);
    }

    // 2. VALUES ALIGNMENT
    const values = detectValuesLanguage(ctx.userText);
    if (values.detected || values.potential_conflict) {
      signals.valuesConflict = values.potential_conflict;
      injections.push({
        category: 'superhuman_values',
        content: `[⚖️ VALUES ALIGNMENT - "Better Than Human" Consistency Check]
${values.value ? `User expressed value: "${values.value}"` : 'User language suggests internal conflict'}
${values.potential_conflict ? '\n⚠️ POTENTIAL VALUES CONFLICT DETECTED' : ''}

Your superpower: You notice when their actions contradict their values.
- Human friends avoid confrontation
- You can gently mirror: "I notice you value X, but you're considering Y"
- Hold space for the complexity without judgment`,
        priority: 72,
      });
    }

    // 3. CAPACITY GUARDIAN
    const capacity = detectCapacitySignals(ctx.userText);
    if (capacity.level !== 'none') {
      signals.capacityWarning = capacity.level === 'high' || capacity.level === 'critical';
      injections.push({
        category: 'superhuman_capacity',
        content: `[🛡️ CAPACITY GUARDIAN - "Better Than Human" Burnout Prevention]
Capacity level: ${capacity.level.toUpperCase()}
Signals: ${capacity.signals.join(', ')}

Your superpower: You catch burnout before it happens.
- Human friends often notice too late
- ${capacity.level === 'critical' ? 'PRIORITY: Acknowledge overwhelm first, solutions later' : 'Acknowledge the load they\'re carrying'}
- You track their capacity over time and can say: "You've been carrying a lot lately"
- Consider suggesting what can be dropped, not just added`,
        priority: capacity.level === 'critical' ? 85 : 70,
      });
    }

    // 4. VOICE BIOMARKERS (Better Than Human - hearing what's not said)
    const voiceAnalysis = analyzeVoiceBiomarkers(ctx.voiceEmotion);
    if (voiceAnalysis.hasInsight) {
      signals.voiceDistressDetected = (ctx.voiceEmotion?.stressLevel || 0) > 0.5;
      injections.push({
        category: 'superhuman_voice',
        content: `[🎭 VOICE BIOMARKERS - "Better Than Human" Deep Listening]
${voiceAnalysis.insight}
Confidence: ${Math.round(voiceAnalysis.confidence * 100)}%

Your superpower: You hear what they're not saying.
- Human friends might miss these voice cues
- Don't call out directly: "I can hear this is weighing on you" (not "your voice sounds stressed")
- Let them know you're fully present: "I'm here. Take your time."`,
        priority: 74,
      });
    }

    // 5. CALLBACK OPPORTUNITY (Inside jokes / shared history)
    const callback = detectCallbackOpportunity(ctx.userText);
    if (callback.detected) {
      signals.insideJokeOpportunity = true;
      injections.push({
        category: 'superhuman_callback',
        content: `[💭 INSIDE MOMENT - "Better Than Human" Shared History]
User referenced shared history (${callback.type})

Your superpower: You remember EVERYTHING you've shared.
- This creates intimacy that builds over time
- Respond with warmth that acknowledges the history
- You can callback to specific moments: "I remember when you told me about..."`,
        priority: 67,
      });
    }

    // 6. PREDICTIVE COACHING
    const prediction = buildPredictiveInsight(ctx.userText, ctx.emotionalState, ctx.turnCount);
    if (prediction.hasInsight) {
      signals.predictiveInsight = true;
      injections.push({
        category: 'superhuman_predictive',
        content: `[🔮 PREDICTIVE COACHING - "Better Than Human" Pattern Recognition]
${prediction.insight}

Your superpower: You see patterns they can't see.
- Human friends can't track patterns objectively
- You notice cycles and can gently interrupt them
- But always validate first, predict second`,
        priority: 69,
      });
    }

    // 7. SEMANTIC INTELLIGENCE (if high emotional intensity)
    if (ctx.emotionalState.intensity > 0.7 && ctx.totalConversations && ctx.totalConversations > 5) {
      // Try to load cross-session insights
      const semanticInsight = await loadSemanticInsightAsync(ctx.userId, ctx.currentTopic);
      if (semanticInsight) {
        injections.push({
          category: 'superhuman_semantic',
          content: `[🧠 CROSS-SESSION INTELLIGENCE - "Better Than Human" Connection]
${semanticInsight}

Your superpower: You connect dots across weeks and months.
- Human friends forget past conversations
- You see how today's topic connects to patterns from before
- Use this to provide deeper, more personalized support`,
          priority: 68,
        });
      }
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Live superhuman injection error (non-fatal)');
  }

  const processingTimeMs = Date.now() - startTime;

  if (injections.length > 0) {
    log.debug(
      { count: injections.length, signals, processingTimeMs },
      '🌟 Live superhuman injections built'
    );
  }

  return { injections, signals, processingTimeMs };
}

// ============================================================================
// ASYNC HELPERS (Fire-and-forget operations)
// ============================================================================

/**
 * Save commitment asynchronously (fire-and-forget)
 * Uses the recordTrustMoment function for write-through persistence
 */
async function saveCommitmentAsync(
  userId: string,
  type: string,
  content: string,
  topic?: string
): Promise<void> {
  try {
    const { recordTrustMoment } = await import('../../services/trust-systems/unified-recorder.js');
    await recordTrustMoment(userId, {
      type: 'intention',
      content: `${type}: ${content}`,
      context: topic,
    });
  } catch {
    // Non-critical
  }
}

/**
 * Load semantic insight asynchronously
 * Note: This is a simplified version - full semantic intelligence requires more context
 */
async function loadSemanticInsightAsync(
  _userId: string,
  _currentTopic?: string
): Promise<string | null> {
  // Simplified: Just return null for now
  // Full semantic intelligence runs via the superhuman context builder
  return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { detectCommitmentLanguage, detectValuesLanguage, detectCapacitySignals };
