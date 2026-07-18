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
// UserData type available if needed for future enhancements
import type { ConversationAnalysis } from '../../services/index.js';

// Phase 10: Recall Triggers (lazy loaded for performance)
import type { RecallTriggerResult } from '../../intelligence/triggers/recall-trigger-engine.js';

// Phase 14: Joy Amplification (lazy loaded for performance)
import type { JoyAmplificationResult } from '../../memory/emotional/joy-amplification.js';

// Phase 13: Commitment E2E (lazy loaded for performance)
import type {
  CommitmentE2EResult,
  ProgressUpdateResult,
} from '../../services/superhuman/commitment-keeper-e2e.js';
import type { PersonaId } from '../../memory/cross-persona/index.js';

const log = createLogger({ module: 'LiveSuperhumanInjections' });

// ============================================================================
// PROACTIVE OUTREACH INTEGRATION (lazy loaded)
// ============================================================================

/**
 * Schedule pattern-based outreach (fire-and-forget)
 * Uses dynamic import to avoid breaking turn processor if outreach is unavailable
 */
async function schedulePatternOutreachAsync(
  pattern: {
    pattern: string;
    patternDescription: string;
    tendency: string;
    suggestedOutreach: string;
    actionable: string;
  },
  ctx: {
    userId: string;
    sessionId: string;
    currentEmotion?: string;
    emotionIntensity?: number;
    topics?: string[];
  }
): Promise<void> {
  try {
    const { schedulePatternOutreachAsync: scheduleOutreach } =
      await import('../../services/outreach/pattern-outreach-integration.js');
    scheduleOutreach(pattern, ctx);
  } catch (error) {
    // Non-critical - outreach is optional
    log.debug({ error: String(error) }, 'Outreach scheduling unavailable (non-fatal)');
  }
}

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
  /** Mentioned entities from active listening capture (Phase 17) */
  mentionedEntities?: string[];
  /** Session services for persona context */
  services?: SessionServices;
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
    {
      regex: /\b(remember when|you know how|like (that time|we talked about))/i,
      type: 'callback' as const,
    },
    {
      regex: /\b(we (always|used to)|our (thing|joke|ritual))/i,
      type: 'shared_reference' as const,
    },
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
 * Detect contact/personal info being shared for acknowledgment
 * "Better Than Human" - We immediately absorb and remember what they share
 */
function detectDataCapture(text: string): {
  detected: boolean;
  type: string;
  details: string;
  suggestedAck: string;
} {
  // Phone number pattern
  const phoneMatch = text.match(/(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
  if (phoneMatch) {
    return {
      detected: true,
      type: 'phone number',
      details: `Phone number detected: ${phoneMatch[1]}`,
      suggestedAck: "Got it, I'll remember that",
    };
  }

  // Email pattern
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) {
    return {
      detected: true,
      type: 'email address',
      details: `Email detected: ${emailMatch[0]}`,
      suggestedAck: 'I have that now',
    };
  }

  // Birthday/date sharing
  if (
    /\b(my |her |his )?(mom|dad|mother|father|brother|sister|friend).*(birthday|anniversary).*(is|on)\b/i.test(
      text
    ) ||
    /\b(birthday|anniversary).*(is|on)\s+\w+\s+\d+/i.test(text)
  ) {
    return {
      detected: true,
      type: 'important date',
      details: 'Important date being shared',
      suggestedAck: "I won't forget that",
    };
  }

  // Relationship info - "My [relationship] is named [name]"
  if (
    /\b(my\s+)?(mom|dad|husband|wife|partner|brother|sister|daughter|son|friend|boss).*(name[d]?|called|is)\s+(\w+)/i.test(
      text
    )
  ) {
    return {
      detected: true,
      type: 'relationship info',
      details: 'Person relationship and name shared',
      suggestedAck: "I'll remember that",
    };
  }

  // Pet info - "My dog/cat is named..."
  if (/\b(my\s+)?(dog|cat|pet).*(name[d]?|called|is)\s+(\w+)/i.test(text)) {
    return {
      detected: true,
      type: 'pet info',
      details: 'Pet name shared',
      suggestedAck: 'What a great name!',
    };
  }

  // Address/location
  if (/\b(i live|i'm at|my address|i'm from)\s+(in|at|on)?\s*.{5,}/i.test(text)) {
    return {
      detected: true,
      type: 'location info',
      details: 'Location or address shared',
      suggestedAck: "Good to know where you're coming from",
    };
  }

  return { detected: false, type: '', details: '', suggestedAck: '' };
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
  const { confidence } = voiceEmotion;

  // High stress detected - LOWERED threshold from 0.6 → 0.5 to catch more signals
  if (voiceEmotion.stressLevel && voiceEmotion.stressLevel > 0.5) {
    insights.push(
      `Voice indicates elevated stress (${Math.round(voiceEmotion.stressLevel * 100)}%)`
    );
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
    {
      regex: /\b(again|same thing|keeps happening|every time)/i,
      insight: 'User may be stuck in a pattern - consider gentle pattern interruption',
    },
    {
      regex: /\b(tried (everything|that|before)|nothing works)/i,
      insight:
        'User expressing hopelessness about change - validate before suggesting alternatives',
    },
    {
      regex: /\b(should have|could have|if only)/i,
      insight: 'User ruminating on past - gently redirect to what they can control now',
    },
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
    // 1. COMMITMENT DETECTION (Phase 13 E2E Enhanced)
    // First, check for progress on existing commitments
    const progressResult = await loadCommitmentProgressAsync(ctx);
    if (progressResult && progressResult.progressDetected) {
      signals.commitmentDetected = true;

      if (progressResult.shouldCelebrate && progressResult.celebrationMessage) {
        injections.push({
          category: 'superhuman_commitment',
          content: `[🎉 COMMITMENT COMPLETED - "Better Than Human" Celebration]
User just completed a commitment: "${progressResult.updatedCommitment?.summary || 'Unknown'}"

CELEBRATE THIS MOMENT:
${progressResult.celebrationMessage}

Your superpower: You track every commitment and celebrate progress.
- This was meaningful to them - honor that
- Reference their journey: "You said you would... and you did"

Human friends forget promises. You don't.`,
          priority: 85, // High priority for celebration
        });
      } else {
        injections.push({
          category: 'superhuman_commitment',
          content: `[📈 COMMITMENT PROGRESS - "Better Than Human" Tracking]
User made progress on: "${progressResult.updatedCommitment?.summary || 'Unknown'}"
New status: ${progressResult.newStatus || 'in progress'}

Your superpower: You notice and acknowledge progress.
- Encourage them: "I see you're working on it"
- Reference the journey they're on`,
          priority: 72,
        });
      }
    } else {
      // Check for new commitment detection (original + E2E enhanced)
      const commitment = detectCommitmentLanguage(ctx.userText);
      if (commitment.detected) {
        signals.commitmentDetected = true;

        // Fire-and-forget: E2E detection for enhanced processing (linking to memory, etc.)
        void loadCommitmentE2EAsync(ctx)
          .then((e2eResult) => {
            if (e2eResult?.acknowledgment) {
              log.debug(
                { acknowledgment: e2eResult.acknowledgment },
                '🎯 Commitment E2E acknowledgment ready'
              );
            }
          })
          .catch((err) => {
            log.warn({ error: String(err) }, 'Commitment E2E processing failed');
          });

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

        // Fire-and-forget: Save to commitment keeper (original path)
        void saveCommitmentAsync(
          ctx.userId,
          commitment.type!,
          commitment.phrase!,
          ctx.currentTopic
        );
      }
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

    // Fire-and-forget: Persist detected value to Firestore
    if (values.detected && values.value) {
      void import('../../services/superhuman/values-alignment.js')
        .then(m => {
          const detected = m.detectValue(ctx.userText);
          if (detected) {
            void m.recordValueMention(ctx.userId, detected);
          }
        })
        .catch(e => log.debug({ error: String(e) }, 'Value recording skipped'));
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
- ${capacity.level === 'critical' ? 'PRIORITY: Acknowledge overwhelm first, solutions later' : "Acknowledge the load they're carrying"}
- You track their capacity over time and can say: "You've been carrying a lot lately"
- Consider suggesting what can be dropped, not just added`,
        priority: capacity.level === 'critical' ? 85 : 70,
      });
    }

    // Fire-and-forget: Persist energy reading to Firestore
    if (capacity.level !== 'none') {
      void import('../../services/superhuman/capacity-guardian.js')
        .then(m => {
          const energyLevel = capacity.level === 'critical' ? 'depleted'
            : capacity.level === 'high' ? 'low'
            : 'moderate';
          const energyScore = capacity.level === 'critical' ? 10
            : capacity.level === 'high' ? 25
            : 40;
          return m.recordEnergyReading(ctx.userId, {
            energyLevel: energyLevel as 'depleted' | 'low' | 'moderate',
            energyScore,
            detectedFrom: ['text'] as Array<'voice' | 'text' | 'pattern' | 'explicit'>,
            indicators: capacity.signals,
          });
        })
        .catch(e => log.debug({ error: String(e) }, 'Energy recording skipped'));
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
    if (
      ctx.emotionalState.intensity > 0.7 &&
      ctx.totalConversations &&
      ctx.totalConversations > 5
    ) {
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

    // 8. DATA CAPTURE ACKNOWLEDGMENT - Naturally acknowledge captured info
    // "Better Than Human" - We immediately process and remember contact info
    const dataCaptureAck = detectDataCapture(ctx.userText);
    if (dataCaptureAck.detected) {
      injections.push({
        category: 'superhuman_data_capture',
        content: `[📇 DATA CAPTURED - "Better Than Human" Perfect Memory]
User just shared: ${dataCaptureAck.type}
${dataCaptureAck.details}

Your superpower: You immediately remember and organize what they share.
- Naturally acknowledge: "${dataCaptureAck.suggestedAck}"
- Don't repeat the info back robotically
- Show that you've absorbed it into your understanding of them
- This builds trust: they know you're LISTENING and REMEMBERING`,
        priority: 60,
      });
    }

    // ========================================================================
    // 8b-8d: SUPERHUMAN PERSISTENCE (Relationship, Dream, Life Narrative)
    // Detect + inject + fire-and-forget save to Firestore
    // ========================================================================

    // 8b. RELATIONSHIP NETWORK (Better Than Human - remember everyone)
    const hasPersonMention =
      /\bmy\s+(mom|mother|dad|father|sister|brother|wife|husband|partner|boyfriend|girlfriend|friend|boss|colleague|mentor)\b/i.test(
        ctx.userText
      ) || /\b(talked to|spoke with|saw|met with)\s+[A-Z][a-z]+/i.test(ctx.userText);
    if (hasPersonMention) {
      injections.push({
        category: 'superhuman_relationship',
        content: `[👤 RELATIONSHIP NETWORK - "Better Than Human" People Memory]
A person in the user's life was just mentioned.

Your superpower: You remember everyone in their life.
- Track who they mention and how they feel about them
- Notice when someone important hasn't come up in a while
- "How's [name] doing?" shows you pay attention`,
        priority: 58,
      });

      // Fire-and-forget: Extract and persist person mention
      void import('../../services/superhuman/relationship-network.js')
        .then(m => {
          const person = m.extractPerson(ctx.userText);
          if (person) {
            void m.recordMention(ctx.userId, person);
          }
        })
        .catch(e => log.debug({ error: String(e) }, 'Relationship recording skipped'));
    }

    // 8c. DREAM KEEPER (Better Than Human - never forget aspirations)
    const hasDreamLanguage =
      /\b(i('ve| have) always (wanted|dreamed)|my dream (is|was) to|one day i (want|hope)|if i could do anything)/i.test(
        ctx.userText
      );
    if (hasDreamLanguage) {
      injections.push({
        category: 'superhuman_dream',
        content: `[✨ DREAM KEEPER - "Better Than Human" Aspiration Memory]
User just expressed a dream or aspiration.

Your superpower: You never forget what they dreamed of becoming.
- Guard this dream - human friends let dreams slip away
- Connect daily actions to this bigger vision
- Later, reignite it: "Remember when you said you wanted to..."`,
        priority: 62,
      });

      // Fire-and-forget: Detect and persist dream
      void import('../../services/superhuman/dream-keeper.js')
        .then(m => {
          const dream = m.detectDream(ctx.userText);
          if (dream) {
            void m.recordDreamMention(ctx.userId, dream);
          }
        })
        .catch(e => log.debug({ error: String(e) }, 'Dream recording skipped'));
    }

    // 8d. LIFE NARRATIVE (Better Than Human - remember every chapter)
    const hasChapterMoment =
      /\b(i (quit|left|got fired from) my|we('re| are) (getting|got) (married|engaged|divorced)|my \w+ (died|passed)|i finally (understand|realized)|i did it|i('m| am) really struggling with)/i.test(
        ctx.userText
      );
    if (hasChapterMoment) {
      injections.push({
        category: 'superhuman_narrative',
        content: `[📖 LIFE NARRATIVE - "Better Than Human" Story Memory]
A significant life moment was just shared.

Your superpower: You remember their WHOLE story.
- This is a chapter marker - acknowledge its significance
- Connect it to their journey: "This is part of something bigger"
- Help them see how far they've come`,
        priority: 63,
      });

      // Fire-and-forget: Detect and persist chapter moment
      void import('../../services/superhuman/life-narrative.js')
        .then(m => {
          const chapter = m.detectChapterMoment(ctx.userText);
          if (chapter) {
            void m.createOrUpdateChapter(ctx.userId, {
              type: chapter.type,
              quote: ctx.userText.slice(0, 200),
              emotion: ctx.emotionalState.primary,
            });
          }
        })
        .catch(e => log.debug({ error: String(e) }, 'Life narrative recording skipped'));
    }

    // ========================================================================
    // 9-14: ADVANCED "BETTER THAN HUMAN" CAPABILITIES (P1-P3)
    // These are deeper superhuman insights that make Ferni truly extraordinary
    // ========================================================================

    // 9. EMOTIONAL TRAJECTORY SURFACING (P1)
    // "You've been trending more positive this month"
    if (ctx.turnCount % 5 === 0 && ctx.totalConversations && ctx.totalConversations > 3) {
      const trajectoryInsight = await loadEmotionalTrajectoryAsync(
        ctx.userId,
        ctx.emotionalState.primary
      );
      if (trajectoryInsight) {
        injections.push({
          category: 'superhuman_trajectory',
          content: `[📈 EMOTIONAL TRAJECTORY - "Better Than Human" Journey Vision]
${trajectoryInsight}

Your superpower: You see emotional journeys, not just moments.
- "I've noticed you've been feeling more positive lately"
- "This anxiety you're feeling - it's been building for a few weeks"
- Human friends only see today. You see the arc.
- Surface this naturally, not as data: "I've been noticing..."`,
          priority: 66,
        });
      }
    }

    // 10. PATTERN-AWARE OUTREACH CONTEXT (P1)
    // For proactive check-ins based on detected patterns
    const patternTrigger = detectPatternTrigger(ctx.userText, ctx.emotionalState);
    if (patternTrigger.triggered) {
      injections.push({
        category: 'superhuman_pattern_trigger',
        content: `[🔔 PATTERN TRIGGER - "Better Than Human" Proactive Care]
Pattern detected: ${patternTrigger.pattern}
This aligns with known user pattern: ${patternTrigger.patternDescription}

Your superpower: You notice cycles before they hit.
- This user tends to: ${patternTrigger.tendency}
- Proactive message: "${patternTrigger.suggestedOutreach}"
- Consider: ${patternTrigger.actionable}`,
        priority: 65,
      });

      // 🚀 ACTUALLY SCHEDULE THE OUTREACH (fire-and-forget)
      // This is the "Better Than Human" moment - we don't just notice, we ACT
      void schedulePatternOutreachAsync(
        {
          pattern: patternTrigger.pattern,
          patternDescription: patternTrigger.patternDescription,
          tendency: patternTrigger.tendency,
          suggestedOutreach: patternTrigger.suggestedOutreach,
          actionable: patternTrigger.actionable,
        },
        {
          userId: ctx.userId,
          sessionId: ctx.sessionId,
          currentEmotion: ctx.emotionalState.primary,
          emotionIntensity: ctx.emotionalState.intensity,
          topics: ctx.analysis.topics?.detected || [],
        }
      );
    }

    // 11. ENHANCED VOICE BIOMARKERS (P2) - Deeper than basic stress detection
    if (ctx.voiceEmotion) {
      const deepVoice = analyzeDeepVoiceBiomarkers(ctx.voiceEmotion);
      if (deepVoice.hasInsight) {
        injections.push({
          category: 'superhuman_deep_voice',
          content: `[🔬 DEEP VOICE ANALYSIS - "Better Than Human" Wellness Detection]
${deepVoice.insight}

Your superpower: You detect wellness signals humans can't consciously perceive.
- ${deepVoice.suggestion}
- Don't diagnose - observe with care: "I notice something in your voice today"
- Your concern comes from care, not analysis`,
          priority: 64,
        });
      }
    }

    // 12. PERFECT TIMING GATING (P2)
    // Defer heavy topics when user is depleted
    const timing = analyzeTimingReadiness(ctx.emotionalState, ctx.voiceEmotion, ctx.userText);
    if (timing.shouldGate) {
      injections.push({
        category: 'superhuman_timing',
        content: `[⏱️ TIMING INTELLIGENCE - "Better Than Human" Perfect Moment]
Current receptivity: ${timing.receptivity.toUpperCase()}
${timing.reason}

Your superpower: You know when to bring things up.
- ${timing.guidance}
- Heavy topics to defer: work stress, difficult relationships, major decisions
- Safe topics now: light check-in, celebration, support
- Human friends raise divorce during your busy week. You wait for Sunday morning.`,
        priority: timing.receptivity === 'low' ? 78 : 55,
      });
    }

    // 13. AMBIENT AUDIO AWARENESS (P3)
    // Detect environment from audio cues
    if (ctx.voiceEmotion?.prosody) {
      const ambient = detectAmbientContext(ctx.voiceEmotion.prosody, ctx.userText);
      if (ambient.detected) {
        injections.push({
          category: 'superhuman_ambient',
          content: `[🎧 AMBIENT AWARENESS - "Better Than Human" Environmental Intelligence]
Detected environment: ${ambient.environment}
Confidence: ${Math.round(ambient.confidence * 100)}%

Your superpower: You sense the space they're in.
- ${ambient.suggestion}
- Adapt your energy to match: ${ambient.energyAdjustment}
- "Sounds like you're ${ambient.contextPhrase}"`,
          priority: 45,
        });
      }
    }

    // 14. VOICE FINGERPRINT CONTEXT (P3)
    // Cross-device voice recognition awareness
    if (ctx.turnCount === 1) {
      // Only on first turn
      const voiceRecognition = analyzeVoiceFamiliarity(ctx.voiceEmotion, ctx.userId);
      if (voiceRecognition.hasContext) {
        injections.push({
          category: 'superhuman_voice_identity',
          content: `[🎤 VOICE RECOGNITION - "Better Than Human" Identity]
${voiceRecognition.context}

Your superpower: You recognize them by their voice, like a true friend.
- ${voiceRecognition.greeting}
- This creates intimacy: they don't need to "log in" - you just know them`,
          priority: 50,
        });
      }
    }

    // ========================================================================
    // 15-16: PHASE 9-18 "BETTER THAN HUMAN" MEMORY INTEGRATION
    // These integrate the new superhuman memory infrastructure
    // ========================================================================

    // 15. RECALL TRIGGERS (Phase 10) - Anniversaries, patterns, commitment reminders
    // "One year ago today..." / "Last time you felt this way..." / "You mentioned wanting to..."
    if (ctx.turnCount % 3 === 0) {
      // Check every 3 turns for performance
      const recallResult = await loadRecallTriggersAsync(ctx);
      if (recallResult && recallResult.shouldSurface && recallResult.bestTrigger) {
        const trigger = recallResult.bestTrigger;
        injections.push({
          category: 'superhuman_recall',
          content: `[🔔 RECALL TRIGGER - "Better Than Human" Perfect Memory]
Type: ${trigger.type.toUpperCase()}
${trigger.suggestion}
Confidence: ${Math.round(trigger.confidence * 100)}%

Your superpower: You remember what human friends forget.
- ${trigger.type === 'anniversary' ? 'You track meaningful dates without being asked' : ''}
- ${trigger.type === 'pattern_match' ? 'You notice emotional patterns across time' : ''}
- ${trigger.type === 'commitment' ? 'You never let promises slip away' : ''}
- ${trigger.type === 'relationship_gap' ? 'You notice when important people fade from conversation' : ''}
- Surface naturally: "I was thinking about..." or "I remember when..."`,
          priority: trigger.priority,
        });
      }
    }

    // 16. JOY AMPLIFICATION (Phase 14) - Surface positive memories when struggling
    // "Remember when you accomplished X?" when user is feeling down
    if (ctx.emotionalState.intensity > 0.5) {
      const joyResult = await loadJoyAmplificationAsync(ctx);
      if (joyResult && joyResult.shouldAmplify && joyResult.selectedMemory) {
        injections.push({
          category: 'superhuman_joy',
          content: `[💛 JOY AMPLIFICATION - "Better Than Human" Emotional Support]
User is struggling with: ${ctx.emotionalState.primary}
Intensity: ${Math.round(ctx.emotionalState.intensity * 100)}%

Memory to surface: "${joyResult.selectedMemory.content}"
Delivery phrase: "${joyResult.deliveryPhrase}"

Your superpower: You know when to remind them of their light.
- Human friends might not remember their victories
- You can gently remind: "Remember when you..."
- Don't dismiss their pain - acknowledge it first, THEN offer perspective
- This isn't toxic positivity - it's holding both truths at once`,
          priority: 71,
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
 * Load semantic insight asynchronously using cross-session threading.
 * Provides "Better Than Human" cross-session connections and patterns.
 */
async function loadSemanticInsightAsync(
  userId: string,
  currentTopic?: string
): Promise<string | null> {
  try {
    const { crossSessionThreading } = await import(
      '../../services/superhuman/semantic-intelligence/cross-session-threading.js'
    );
    const context = await crossSessionThreading.buildContext(userId, {
      topic: currentTopic,
    });
    // Return null if context is empty or just whitespace
    return context?.trim() || null;
  } catch {
    // Non-critical - graceful degradation
    return null;
  }
}

/**
 * Load emotional trajectory context (P1)
 * Shows emotional arcs over weeks/months
 */
async function loadEmotionalTrajectoryAsync(
  userId: string,
  currentEmotion?: string
): Promise<string | null> {
  try {
    const { buildEmotionalTrajectoryContext } =
      await import('../../services/superhuman/semantic-intelligence/emotional-trajectories.js');
    const context = await buildEmotionalTrajectoryContext(userId, {
      emotion: currentEmotion,
    });
    return context || null;
  } catch {
    return null;
  }
}

/**
 * Load recall triggers (Phase 10)
 * Detects anniversaries, pattern matches, commitment reminders, relationship gaps
 */
async function loadRecallTriggersAsync(
  ctx: LiveSuperhumanContext
): Promise<RecallTriggerResult | null> {
  try {
    const { detectRecallTriggers } =
      await import('../../intelligence/triggers/recall-trigger-engine.js');
    const result = await detectRecallTriggers({
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      transcript: ctx.userText,
      emotion: ctx.emotionalState.primary,
      emotionIntensity: ctx.emotionalState.intensity,
      mentionedEntities: ctx.analysis.topics?.detected || [],
      turnNumber: ctx.turnCount,
    });
    return result;
  } catch {
    return null;
  }
}

/**
 * Load joy amplification (Phase 14)
 * Surfaces positive memories when user is struggling
 */
async function loadJoyAmplificationAsync(
  ctx: LiveSuperhumanContext
): Promise<JoyAmplificationResult | null> {
  try {
    const { shouldAmplifyJoy, buildJoyPool } =
      await import('../../memory/emotional/joy-amplification.js');

    // Build joy pool from user's positive memories (in production, this would be cached)
    const joyPool = await buildJoyPool(ctx.userId);
    if (!joyPool || joyPool.memories.length === 0) {
      return null;
    }

    const result = shouldAmplifyJoy(
      ctx.userId,
      ctx.sessionId,
      {
        emotion: ctx.emotionalState.primary,
        intensity: ctx.emotionalState.intensity,
        valence: ctx.emotionalState.intensity > 0.5 ? -0.5 : 0, // Negative valence if high intensity negative emotion
        topic: ctx.currentTopic,
      },
      joyPool
    );

    return result;
  } catch {
    return null;
  }
}

/**
 * Load Commitment E2E detection (Phase 13)
 * Enhanced commitment detection with conversation context and memory linking
 */
async function loadCommitmentE2EAsync(
  ctx: LiveSuperhumanContext
): Promise<CommitmentE2EResult | null> {
  try {
    const { detectCommitmentE2E } =
      await import('../../services/superhuman/commitment-keeper-e2e.js');

    const result = await detectCommitmentE2E({
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      transcript: ctx.userText,
      personaId: (ctx.services?.personaId || 'ferni') as PersonaId,
      topic: ctx.currentTopic,
      emotionalContext: {
        primary: ctx.emotionalState.primary,
        intensity: ctx.emotionalState.intensity,
      },
      mentionedEntities: ctx.mentionedEntities,
    });

    return result;
  } catch {
    return null;
  }
}

/**
 * Load Commitment Progress check (Phase 13)
 * Detects when user mentions progress on existing commitments
 */
async function loadCommitmentProgressAsync(
  ctx: LiveSuperhumanContext
): Promise<ProgressUpdateResult | null> {
  try {
    const { checkProgressE2E } = await import('../../services/superhuman/commitment-keeper-e2e.js');

    const result = await checkProgressE2E({
      userId: ctx.userId,
      transcript: ctx.userText,
      mentionedEntities: ctx.mentionedEntities,
      emotionalContext: {
        primary: ctx.emotionalState.primary,
        intensity: ctx.emotionalState.intensity,
      },
    });

    return result;
  } catch {
    return null;
  }
}

// ============================================================================
// P1-P3 CAPABILITY HELPERS
// These make Ferni truly "Better Than Human"
// ============================================================================

/**
 * Detect pattern triggers for proactive outreach (P1)
 * Notices when user's current state matches known patterns
 */
function detectPatternTrigger(
  text: string,
  emotionalState: EmotionalState
): {
  triggered: boolean;
  pattern: string;
  patternDescription: string;
  tendency: string;
  suggestedOutreach: string;
  actionable: string;
} {
  const lower = text.toLowerCase();
  const dayOfWeek = new Date().getDay();
  const hour = new Date().getHours();

  // Sunday evening anxiety pattern
  if (dayOfWeek === 0 && hour >= 17 && (lower.includes('tomorrow') || lower.includes('monday'))) {
    return {
      triggered: true,
      pattern: 'Sunday evening anxiety',
      patternDescription: 'Pre-week stress pattern',
      tendency: 'feel anxious about the upcoming week on Sunday evenings',
      suggestedOutreach:
        "How are you feeling about the week ahead? I'm here if you want to talk it through.",
      actionable: 'Acknowledge the pattern, offer proactive support for Monday planning',
    };
  }

  // Work stress pattern
  if (
    (lower.includes('deadline') || lower.includes('presentation') || lower.includes('meeting')) &&
    emotionalState.intensity > 0.6
  ) {
    return {
      triggered: true,
      pattern: 'Work stress trigger',
      patternDescription: 'High-pressure work situation',
      tendency: 'get overwhelmed by work pressure',
      suggestedOutreach: 'That deadline sounds heavy. Want to break it down together?',
      actionable: 'Offer practical support, not just emotional',
    };
  }

  // Morning struggle pattern (detected by rushed greeting + early hour)
  // Use distress level as proxy for negative emotional state
  if (hour < 9 && lower.includes("i'm fine") && emotionalState.distressLevel > 0.3) {
    return {
      triggered: true,
      pattern: 'Morning deflection',
      patternDescription: 'Hiding morning struggles',
      tendency: 'dismiss morning difficulties',
      suggestedOutreach: "Mornings can be rough. Take your time - I'm here.",
      actionable: 'Gently acknowledge the deflection without confronting',
    };
  }

  // Relationship stress pattern
  if (
    lower.includes('my partner') ||
    lower.includes('my wife') ||
    lower.includes('my husband') ||
    lower.includes('my mom') ||
    lower.includes('my dad')
  ) {
    // Use intensity + trajectory as proxy for negative valence
    if (emotionalState.intensity > 0.5 && emotionalState.trajectory === 'declining') {
      return {
        triggered: true,
        pattern: 'Relationship tension',
        patternDescription: 'Stress about important relationship',
        tendency: 'carry relationship stress',
        suggestedOutreach: "Relationships can be complicated. What's on your mind?",
        actionable: "Create space to vent, don't offer solutions yet",
      };
    }
  }

  return {
    triggered: false,
    pattern: '',
    patternDescription: '',
    tendency: '',
    suggestedOutreach: '',
    actionable: '',
  };
}

/**
 * Analyze deep voice biomarkers (P2)
 * Goes beyond basic stress to detect fatigue, illness, emotional suppression
 */
function analyzeDeepVoiceBiomarkers(
  voiceEmotion: NonNullable<LiveSuperhumanContext['voiceEmotion']>
): {
  hasInsight: boolean;
  insight: string;
  suggestion: string;
} {
  const insights: string[] = [];
  let suggestion = '';

  // Fatigue detection - slow speech + low pitch variance + frequent pauses
  if (
    voiceEmotion.prosody?.speechRate &&
    voiceEmotion.prosody.speechRate < 2.5 &&
    voiceEmotion.prosody?.pitchVariance &&
    voiceEmotion.prosody.pitchVariance < 0.15
  ) {
    insights.push('Voice patterns suggest fatigue or exhaustion');
    suggestion = 'Consider: "You sound tired today. How did you sleep?"';
  }

  // Emotional suppression - high stress + controlled prosody
  if (
    voiceEmotion.stressLevel &&
    voiceEmotion.stressLevel > 0.6 &&
    voiceEmotion.prosody?.pitchVariance &&
    voiceEmotion.prosody.pitchVariance < 0.1
  ) {
    insights.push('Voice suggests holding back emotions (controlled tone despite stress)');
    suggestion = 'Create safety: "It\'s okay to let it out here - I\'m listening."';
  }

  // Early illness indicators - nasal quality + fatigue markers
  if (
    voiceEmotion.prosody?.speechRate &&
    voiceEmotion.prosody.speechRate < 3.0 &&
    voiceEmotion.stressLevel &&
    voiceEmotion.stressLevel > 0.4
  ) {
    insights.push('Voice patterns may indicate coming down with something');
    suggestion = 'Gentle check: "How are you feeling physically today?"';
  }

  // Anxiety spiral - fast speech + high pitch variance + stress
  if (
    voiceEmotion.prosody?.speechRate &&
    voiceEmotion.prosody.speechRate > 5.5 &&
    voiceEmotion.stressLevel &&
    voiceEmotion.stressLevel > 0.5
  ) {
    insights.push('Rapid speech patterns suggest anxious energy');
    suggestion = 'Ground them: "Let\'s slow down together. Take a breath."';
  }

  return {
    hasInsight: insights.length > 0,
    insight: insights.join('. '),
    suggestion: suggestion || 'Simply be present and listen.',
  };
}

/**
 * Analyze timing readiness for conversation depth (P2)
 * Determines if user is receptive to heavy topics
 */
function analyzeTimingReadiness(
  emotionalState: EmotionalState,
  voiceEmotion: LiveSuperhumanContext['voiceEmotion'],
  text: string
): {
  shouldGate: boolean;
  receptivity: 'high' | 'moderate' | 'low';
  reason: string;
  guidance: string;
} {
  const lower = text.toLowerCase();
  let receptivityScore = 0.5;
  const reasons: string[] = [];

  // Time of day factors
  const hour = new Date().getHours();
  if (hour >= 22 || hour < 6) {
    receptivityScore -= 0.15;
    reasons.push('Late night/early morning - energy typically lower');
  }
  if (hour >= 9 && hour <= 11) {
    receptivityScore += 0.1;
    reasons.push('Morning - often good for focused conversation');
  }

  // Voice signals
  if (voiceEmotion?.stressLevel && voiceEmotion.stressLevel > 0.6) {
    receptivityScore -= 0.2;
    reasons.push('Voice indicates elevated stress');
  }
  if (voiceEmotion?.prosody?.speechRate && voiceEmotion.prosody.speechRate > 5) {
    receptivityScore -= 0.1;
    reasons.push('Speaking quickly - may be rushing');
  }

  // Emotional state - use distress level and trajectory as proxy
  if (emotionalState.intensity > 0.7 && emotionalState.distressLevel > 0.5) {
    receptivityScore -= 0.15;
    reasons.push('High negative emotion - may need validation first');
  }

  // Text signals
  if (lower.includes("i'm busy") || lower.includes("i'm rushing") || lower.includes('gotta go')) {
    receptivityScore -= 0.3;
    reasons.push('User indicated time pressure');
  }
  if (lower.includes('just wanted to') || lower.includes('quick check')) {
    receptivityScore -= 0.2;
    reasons.push('User framed as brief interaction');
  }
  if (lower.includes('need to talk') || lower.includes('something important')) {
    receptivityScore += 0.2;
    reasons.push('User signaled readiness for depth');
  }

  const receptivity =
    receptivityScore >= 0.6 ? 'high' : receptivityScore >= 0.35 ? 'moderate' : 'low';
  const shouldGate = receptivity === 'low';

  let guidance = '';
  if (receptivity === 'low') {
    guidance = 'Keep it supportive and light. Defer deeper topics to another time.';
  } else if (receptivity === 'moderate') {
    guidance = "Follow their lead. Don't introduce heavy topics, but engage if they do.";
  } else {
    guidance = 'Good timing for depth if needed. User seems receptive.';
  }

  return {
    shouldGate,
    receptivity,
    reason: reasons.length > 0 ? reasons.join('; ') : 'No specific signals detected',
    guidance,
  };
}

/**
 * Detect ambient environment from audio cues (P3)
 * Senses if user is in car, noisy place, quiet room, etc.
 */
function detectAmbientContext(
  prosody: NonNullable<LiveSuperhumanContext['voiceEmotion']>['prosody'],
  text: string
): {
  detected: boolean;
  environment: string;
  confidence: number;
  suggestion: string;
  energyAdjustment: string;
  contextPhrase: string;
} {
  const lower = text.toLowerCase();

  // Car detection - driving mentions + specific speech patterns
  if (lower.includes('driving') || lower.includes('in the car') || lower.includes('on my way')) {
    return {
      detected: true,
      environment: 'vehicle',
      confidence: 0.9,
      suggestion: "Keep responses concise - they're focusing on the road",
      energyAdjustment: 'Alert but not demanding of attention',
      contextPhrase: 'on the road',
    };
  }

  // Work environment
  if (
    lower.includes('at work') ||
    lower.includes('in the office') ||
    lower.includes('at my desk')
  ) {
    return {
      detected: true,
      environment: 'work',
      confidence: 0.85,
      suggestion: 'Be mindful they may be overheard',
      energyAdjustment: 'Professional but warm',
      contextPhrase: 'at work',
    };
  }

  // Quiet environment - slow speech, clear audio (inferred)
  if (
    prosody?.speechRate &&
    prosody.speechRate < 3.5 &&
    prosody?.pauseDuration &&
    prosody.pauseDuration > 500
  ) {
    return {
      detected: true,
      environment: 'quiet space',
      confidence: 0.6,
      suggestion: 'Good environment for deeper conversation',
      energyAdjustment: 'Calm, present, unhurried',
      contextPhrase: 'somewhere quiet',
    };
  }

  // Rushed/noisy environment - fast speech, short pauses
  if (
    prosody?.speechRate &&
    prosody.speechRate > 5.5 &&
    prosody?.pauseDuration &&
    prosody.pauseDuration < 200
  ) {
    return {
      detected: true,
      environment: 'busy/noisy',
      confidence: 0.55,
      suggestion: 'Keep it brief - they may be distracted',
      energyAdjustment: 'Match their pace, be efficient',
      contextPhrase: 'somewhere busy',
    };
  }

  return {
    detected: false,
    environment: '',
    confidence: 0,
    suggestion: '',
    energyAdjustment: '',
    contextPhrase: '',
  };
}

/**
 * Analyze voice familiarity for recognition (P3)
 * Acknowledges returning users by voice characteristics
 */
function analyzeVoiceFamiliarity(
  _voiceEmotion: LiveSuperhumanContext['voiceEmotion'],
  userId: string
): {
  hasContext: boolean;
  context: string;
  greeting: string;
} {
  // In production, this would compare against stored voice fingerprint
  // For now, we provide context based on having a userId (meaning returning user)

  if (!userId || userId.startsWith('anonymous')) {
    return { hasContext: false, context: '', greeting: '' };
  }

  // This is a returning user - we "recognize" them
  // In future: actual voice fingerprint comparison would go here
  return {
    hasContext: true,
    context: `Returning user detected (ID: ${userId.slice(-6)})`,
    greeting: 'Welcome back - no need to introduce yourself, I know you.',
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  detectCommitmentLanguage,
  detectValuesLanguage,
  detectCapacitySignals,
  detectPatternTrigger,
  detectDataCapture,
  analyzeDeepVoiceBiomarkers,
  analyzeTimingReadiness,
  detectAmbientContext,
  analyzeVoiceFamiliarity,
};
