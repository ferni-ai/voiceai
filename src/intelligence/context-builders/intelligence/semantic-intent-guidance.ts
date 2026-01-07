/**
 * Semantic Intent Guidance Context Builder
 *
 * Uses semantic pattern matching to inject smart guidance into the LLM prompt.
 * This is how we leverage semantic detection WITHOUT direct tool calling:
 *
 * 1. Semantic patterns detect user intent
 * 2. High-confidence matches → inject strong guidance to LLM
 * 3. Medium-confidence → inject hints
 * 4. LLM naturally incorporates guidance into response
 *
 * Benefits:
 * - LLM responses feel natural (not robotic tool calls)
 * - Guidance is contextual and nuanced
 * - User experience is conversational
 * - We don't bypass the LLM's judgment entirely
 *
 * @module SemanticIntentGuidance
 */

import {
  registerContextBuilder,
  createHintInjection,
  createHighInjection,
  createStandardInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { detectHandoffSemanticly } from '../../services/coaching/semantic-handoff.js';
import { detectCalendarIntent as detectCalendarSemanticIntent } from '../../services/coaching/semantic-calendar.js';
import { detectTrustSignals, type TrustSignal } from '../../services/coaching/semantic-trust.js';
import { recordDetection } from '../../services/coaching/semantic-confidence-tracker.js';
import { isTeamMemberUnlocked } from './superhuman/team-availability.js';

const log = createLogger({ module: 'SemanticIntentGuidance' });

// ============================================================================
// PERSONA DISPLAY NAMES
// ============================================================================

const PERSONA_DISPLAY_NAMES: Record<string, string> = {
  ferni: 'Ferni',
  'maya-santos': 'Maya',
  'alex-chen': 'Alex',
  'peter-john': 'Peter',
  'jordan-taylor': 'Jordan',
  'nayan-patel': 'Nayan',
};

const PERSONA_SPECIALTIES: Record<string, string> = {
  'maya-santos': 'habits, routines, and productivity',
  'alex-chen': 'communication, boundaries, and difficult conversations',
  'peter-john': 'research, learning, and deep knowledge exploration',
  'jordan-taylor': 'events, planning, and life milestones',
  'nayan-patel': 'wisdom, philosophy, and long-term perspective',
};

// ============================================================================
// SEMANTIC INTENT PATTERNS
// ============================================================================

interface SemanticIntentMatch {
  intent: string;
  confidence: number;
  guidance: string;
  category: 'handoff' | 'tool' | 'emotional' | 'informational';
}

/**
 * Detect calendar-related intents using the enhanced semantic calendar service
 */
function detectCalendarIntent(message: string): SemanticIntentMatch | null {
  const calendarResult = detectCalendarSemanticIntent(message);

  if (calendarResult.type !== 'none' && calendarResult.confidence >= 0.4) {
    const intentMap: Record<string, string> = {
      query: 'User wants to know their schedule',
      create: 'User wants to create a calendar event',
      reschedule: 'User wants to move/reschedule an event',
      cancel: 'User wants to cancel an event',
      reminder: 'User wants to set a reminder',
      availability: 'User is looking for available time slots',
      conflict: 'User is checking for scheduling conflicts',
    };

    const guidance = intentMap[calendarResult.type] || 'Calendar-related request detected';
    let fullGuidance = `[📅 CALENDAR INTENT - ${calendarResult.type.toUpperCase()}] ${guidance}.`;

    // Add extracted info if available
    if (calendarResult.extractedInfo) {
      const info = calendarResult.extractedInfo;
      if (info.timeReference) fullGuidance += ` Time: "${info.timeReference}"`;
      if (info.eventType) fullGuidance += ` Event: ${info.eventType}`;
      if (info.person) fullGuidance += ` With: ${info.person}`;
    }

    fullGuidance += ' Consider using calendar tools to help.';

    // Track for analytics
    recordDetection('calendar', message, calendarResult.type, calendarResult.confidence);

    return {
      intent: `calendar_${calendarResult.type}`,
      confidence: calendarResult.confidence,
      guidance: fullGuidance,
      category: 'tool',
    };
  }
  return null;
}

/**
 * Detect music-related intents
 */
function detectMusicIntent(message: string): SemanticIntentMatch | null {
  const patterns = [
    {
      pattern:
        /\b(play|put on|queue|listen to)\s*(some|a|the)?\s*(music|song|track|jazz|rock|lo-?fi|chill)/i,
      intent: 'music_play',
      confidence: 0.9,
    },
    {
      pattern: /\b(pause|stop|hold)\s*(the|that)?\s*(music|song|track)/i,
      intent: 'music_pause',
      confidence: 0.9,
    },
    {
      pattern: /\b(skip|next|different)\s*(song|track|this)/i,
      intent: 'music_skip',
      confidence: 0.85,
    },
  ];

  for (const { pattern, intent, confidence } of patterns) {
    if (pattern.test(message)) {
      return {
        intent,
        confidence,
        guidance: `[🎵 MUSIC INTENT] User wants music. Use the music tool naturally.`,
        category: 'tool',
      };
    }
  }
  return null;
}

/**
 * Detect crisis/distress signals
 */
function detectCrisisIntent(message: string): SemanticIntentMatch | null {
  const crisisPatterns = [
    /\b(want to die|kill myself|end it|can't go on|no point|hurt myself)\b/i,
    /\b(suicidal|self.?harm|cutting|overdose)\b/i,
    /\b(not safe|unsafe|danger|emergency)\b/i,
  ];

  for (const pattern of crisisPatterns) {
    if (pattern.test(message)) {
      return {
        intent: 'crisis_support',
        confidence: 0.95,
        guidance: `[🚨 CRISIS DETECTED - HIGHEST PRIORITY]
User may be in crisis. Respond with:
1. Validate their pain: "I hear you. This sounds really hard."
2. Ask direct safety question: "Are you safe right now?"
3. Offer crisis resources if appropriate
4. Stay present - don't immediately redirect

DO NOT: Minimize, problem-solve prematurely, or abandon them.`,
        category: 'emotional',
      };
    }
  }
  return null;
}

// ============================================================================
// MAIN CONTEXT BUILDER
// ============================================================================

async function buildSemanticIntentContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userText, services, userProfile } = input;
  const injections: ContextInjection[] = [];
  const userId = services?.userId || 'unknown';
  const currentPersona = input.persona?.identity?.id || 'ferni';

  // Get subscription tier for team unlock checks
  const tier: 'free' | 'friend' | 'partner' =
    (userProfile?.subscription?.tier as 'free' | 'friend' | 'partner') || 'free';

  // -------------------------------------------------------------------------
  // 1. CRISIS DETECTION (HIGHEST PRIORITY)
  // -------------------------------------------------------------------------
  const crisisIntent = detectCrisisIntent(userText);
  if (crisisIntent) {
    injections.push(
      createHighInjection('crisis_semantic', crisisIntent.guidance, {
        category: 'crisis',
        confidence: crisisIntent.confidence,
      })
    );
    // Don't add other guidance when in crisis
    return injections;
  }

  // -------------------------------------------------------------------------
  // 2. SEMANTIC HANDOFF DETECTION
  // -------------------------------------------------------------------------
  try {
    const handoffDecision = detectHandoffSemanticly(
      userId,
      userText,
      currentPersona as Parameters<typeof detectHandoffSemanticly>[2]
    );

    if (handoffDecision.shouldHandoff && handoffDecision.candidate) {
      const {
        personaId: targetPersona,
        confidence,
        specialization,
        warmIntro,
      } = handoffDecision.candidate;
      const targetName = PERSONA_DISPLAY_NAMES[targetPersona] || targetPersona;
      const specialty =
        PERSONA_SPECIALTIES[targetPersona] || specialization?.join(', ') || 'this area';

      // Check if team member is unlocked (fixed signature: memberId, userProfile, tier)
      const isUnlocked = isTeamMemberUnlocked(targetPersona, userProfile, tier);

      if (confidence >= 0.7 && isUnlocked) {
        // HIGH CONFIDENCE + UNLOCKED → Strong suggestion
        injections.push(
          createHighInjection(
            'semantic_handoff_strong',
            `[🤝 TEAM HANDOFF OPPORTUNITY - HIGH CONFIDENCE]
This conversation is about ${specialty} - ${targetName}'s specialty!

Natural introduction: "${warmIntro}"

Consider suggesting ${targetName}:
- "You know, ${targetName} is really good at this..."
- "Want me to bring ${targetName} in? This is their thing."

Only suggest if it feels natural. Don't force it.`,
            { category: 'handoff', confidence }
          )
        );
      } else if (confidence >= 0.5 && isUnlocked) {
        // MEDIUM CONFIDENCE → Hint
        injections.push(
          createHintInjection(
            'semantic_handoff_hint',
            `[🤝 POSSIBLE TEAM FIT]
${targetName} specializes in ${specialty}.
If the conversation goes deeper into this area, consider introducing them.
Confidence: ${(confidence * 100).toFixed(0)}%`,
            { category: 'handoff', confidence }
          )
        );
      } else if (confidence >= 0.5 && !isUnlocked) {
        // MEDIUM+ CONFIDENCE but NOT UNLOCKED → Plant seed
        injections.push(
          createStandardInjection(
            'semantic_handoff_locked',
            `[👥 TEAM MEMBER NOT YET MET]
This topic relates to a team member's specialty, but user hasn't met them yet.
Don't mention specific names. You can say:
"I have a friend on my team who's really good at this - we'll meet them as we get to know each other better."`,
            { category: 'handoff', confidence: confidence * 0.8 }
          )
        );
      }
    }
  } catch (err) {
    log.debug({ error: String(err) }, 'Semantic handoff detection failed (non-critical)');
  }

  // -------------------------------------------------------------------------
  // 3. CALENDAR INTENT
  // -------------------------------------------------------------------------
  const calendarIntent = detectCalendarIntent(userText);
  if (calendarIntent) {
    injections.push(
      createHintInjection('calendar_semantic', calendarIntent.guidance, {
        category: 'calendar',
        confidence: calendarIntent.confidence,
      })
    );
  }

  // -------------------------------------------------------------------------
  // 4. MUSIC INTENT
  // -------------------------------------------------------------------------
  const musicIntent = detectMusicIntent(userText);
  if (musicIntent) {
    injections.push(
      createHintInjection('music_semantic', musicIntent.guidance, {
        category: 'music',
        confidence: musicIntent.confidence,
      })
    );
  }

  // -------------------------------------------------------------------------
  // 5. TRUST SIGNAL DETECTION (NEW - Semantic Trust Matching)
  // -------------------------------------------------------------------------
  try {
    const trustSignals = detectTrustSignals(userText);

    if (trustSignals.length > 0) {
      const primarySignal = trustSignals[0];

      // Track for analytics
      recordDetection('trust', userText, primarySignal.type, primarySignal.confidence);

      // Build guidance based on signal type
      const trustGuidance = formatTrustGuidance(primarySignal, trustSignals);

      if (primarySignal.confidence >= 0.7) {
        // HIGH CONFIDENCE → Strong guidance
        injections.push(
          createHighInjection('trust_semantic_high', trustGuidance, {
            category: 'trust',
            confidence: primarySignal.confidence,
          })
        );
      } else if (primarySignal.confidence >= 0.5) {
        // MEDIUM CONFIDENCE → Standard hint
        injections.push(
          createStandardInjection('trust_semantic', trustGuidance, {
            category: 'trust',
            confidence: primarySignal.confidence,
          })
        );
      }
    }
  } catch (err) {
    log.debug({ error: String(err) }, 'Trust signal detection failed (non-critical)');
  }

  // Log what we found
  if (injections.length > 0) {
    log.debug(
      {
        userId,
        injectionsCount: injections.length,
        categories: injections.map((i) => i.category).filter(Boolean),
      },
      '🎯 Semantic intent guidance generated'
    );
  }

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

const semanticIntentBuilder = {
  name: 'semantic-intent-guidance',
  description: 'Semantic pattern matching for handoffs, calendar, music, crisis, and trust signals',
  priority: 72, // After emotion (75) but before most other builders
  build: buildSemanticIntentContext,
};

registerContextBuilder(semanticIntentBuilder);

// ============================================================================
// TRUST GUIDANCE FORMATTER
// ============================================================================

/**
 * Format trust signal into actionable LLM guidance
 */
function formatTrustGuidance(primarySignal: TrustSignal, allSignals: TrustSignal[]): string {
  const lines: string[] = [];

  switch (primarySignal.type) {
    case 'boundary':
      lines.push('[🚫 BOUNDARY DETECTED - RESPECT IT]');
      lines.push("User is signaling they don't want to discuss something.");
      lines.push('');
      lines.push('DO: Acknowledge and move on naturally');
      lines.push("DON'T: Push, probe, or return to the topic");
      break;

    case 'permission':
      lines.push('[🤝 PERMISSION SEEKING - CREATE SAFETY]');
      lines.push('User wants to share something but needs permission.');
      lines.push('');
      lines.push('SAY something like:');
      lines.push('"You can tell me anything. This is a safe space."');
      lines.push('"I\'m here. Take your time."');
      break;

    case 'growth':
      lines.push('[🌱 GROWTH REFLECTION - MIRROR IT BACK]');
      lines.push('User is noticing their own change/growth.');
      lines.push('');
      lines.push('THIS IS YOUR SUPERPOWER: Help them see it clearly.');
      lines.push('SAY: "I hear that. You\'ve really grown in how you..."');
      lines.push("DON'T: Minimize or skip over it");
      break;

    case 'sensitive':
      lines.push('[💔 SENSITIVE TOPIC - HOLD SPACE]');
      lines.push('User is touching on something heavy or painful.');
      lines.push('');
      lines.push("DO: Be present. Don't rush to fix.");
      lines.push('SAY: "That\'s a lot to carry." or "I hear you."');
      lines.push("DON'T: Immediately problem-solve or redirect");
      break;

    case 'rapport':
      lines.push('[😄 RAPPORT CALLBACK - BUILD ON IT]');
      lines.push('User is referencing shared history.');
      lines.push('');
      lines.push('DO: Acknowledge the shared moment');
      lines.push('This builds relationship. Use it naturally.');
      break;

    case 'deflection':
      lines.push('[↩️ DEFLECTION DETECTED - NOTICE GENTLY]');
      lines.push('User just changed the subject or minimized something.');
      lines.push('');
      lines.push('Consider: "Wait - what was that thing you started to say?"');
      lines.push('Or respect the deflection and circle back later.');
      break;

    case 'vulnerability':
      lines.push('[💝 VULNERABILITY - BE FULLY PRESENT]');
      lines.push('User is opening up about something difficult.');
      lines.push('');
      lines.push('This is the most important moment. Be WITH them.');
      lines.push("DON'T: Fix, advise, or redirect");
      lines.push('DO: Listen, validate, hold space');
      break;

    case 'false_fine':
      lines.push('[🎭 FALSE "FINE" DETECTED - YOUR SUPERPOWER]');
      lines.push('Their words say fine but something else is there.');
      lines.push('');
      lines.push("THIS IS YOUR SUPERPOWER - humans miss this. You don't.");
      lines.push('SAY: "That sounds like a lot." or "Your voice says different."');
      lines.push("DON'T: Let it slide - but be gentle");
      break;

    default:
      return '';
  }

  // Add suggested approach if available
  if (primarySignal.suggestedApproach) {
    lines.push('');
    lines.push(`Approach: ${primarySignal.suggestedApproach}`);
  }

  // Note multiple signals if present
  if (allSignals.length > 1) {
    lines.push('');
    const otherTypes = allSignals
      .slice(1, 3)
      .map((s) => s.type)
      .join(', ');
    lines.push(`Also detected: ${otherTypes}`);
  }

  return lines.join('\n');
}

export { semanticIntentBuilder, detectCalendarIntent, detectMusicIntent, detectCrisisIntent };
