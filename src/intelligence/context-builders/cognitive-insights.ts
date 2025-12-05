/**
 * Cognitive Insights Context Builder
 *
 * Surfaces cognitive insights that can be shared with users.
 * These are moments where the AI can transparently show
 * how it's adapting to the user.
 *
 * Examples:
 * - "I noticed you think analytically, so I'll show you the data"
 * - "Peter mentioned you prefer stories - let me share one"
 * - "I'm adjusting my pace because you seem stressed"
 *
 * This creates transparency and builds trust.
 */

import { registerContextBuilder, createHintInjection } from './index.js';
import type { ContextBuilderInput, ContextInjection } from './index.js';
import { getCognitiveProfile } from '../../personas/cognitive-profiles.js';
import { detectUserCognitiveStyle, type UserCognitiveStyle } from '../../personas/cognitive-advanced.js';

// Track what insights have been shared to avoid repetition
const sharedInsights: Map<string, Set<string>> = new Map();
const insightCooldowns: Map<string, number> = new Map();

// Minimum turns between sharing similar insights
const INSIGHT_COOLDOWN_TURNS = 8;

/**
 * Types of cognitive insights we can share
 */
type InsightType = 
  | 'style_match'
  | 'style_adapt'
  | 'voice_respond'
  | 'handoff_context'
  | 'learning'
  | 'empathy_shift';

interface CognitiveInsight {
  type: InsightType;
  message: string;
  shareablePhrase: string;
  confidence: number;
}

/**
 * Build cognitive insights context
 */
async function buildCognitiveInsightsContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];
  const personaId = input.persona?.id;
  const userId = input.services.userId || 'anonymous';
  const sessionKey = `${personaId}_${userId}`;
  const turnCount = input.userData.turnCount || 1;

  if (!personaId) {
    return injections;
  }

  // Initialize tracking
  if (!sharedInsights.has(sessionKey)) {
    sharedInsights.set(sessionKey, new Set());
  }
  const shared = sharedInsights.get(sessionKey)!;

  // Get persona profile
  const profile = getCognitiveProfile(personaId);
  if (!profile) {
    return injections;
  }

  // Get user's cognitive style
  const historyTracker = input.services.historyTracker;
  let userStyle: UserCognitiveStyle = 'unknown';

  if (historyTracker) {
    const turns = historyTracker.getSimpleTurns();
    const userMessages = turns.filter(t => t.role === 'user').map(t => t.content);
    if (userMessages.length >= 3) {
      const detected = detectUserCognitiveStyle(userMessages);
      userStyle = detected.primary;
    }
  }

  // Generate potential insights
  const insights = generateInsights(input, profile, userStyle, personaId);

  // Select one insight to potentially share (don't overwhelm)
  for (const insight of insights) {
    const insightKey = `${insight.type}_${insight.message.substring(0, 20)}`;

    // Check if already shared
    if (shared.has(insight.type)) continue;

    // Check cooldown
    const lastSharedTurn = insightCooldowns.get(`${sessionKey}_${insight.type}`) || 0;
    if (turnCount - lastSharedTurn < INSIGHT_COOLDOWN_TURNS) continue;

    // Probability of sharing (don't share too often)
    if (Math.random() > 0.25) continue;

    // Only share if confident
    if (insight.confidence < 0.6) continue;

    // Share the insight
    injections.push(
      createHintInjection(
        'cognitive-insight-share',
        `[SHAREABLE INSIGHT] You can transparently share: "${insight.shareablePhrase}"\n(Internal: ${insight.message})`,
        { category: 'cognitive-insight', confidence: insight.confidence }
      )
    );

    // Mark as shared
    shared.add(insight.type);
    insightCooldowns.set(`${sessionKey}_${insight.type}`, turnCount);

    // Only share one insight per turn
    break;
  }

  return injections;
}

/**
 * Generate potential cognitive insights
 */
function generateInsights(
  input: ContextBuilderInput,
  profile: ReturnType<typeof getCognitiveProfile>,
  userStyle: UserCognitiveStyle,
  personaId: string
): CognitiveInsight[] {
  const insights: CognitiveInsight[] = [];

  if (!profile) return insights;

  // ============================================================================
  // 1. STYLE MATCH INSIGHT - When user and persona styles align
  // ============================================================================
  const styleMap: Record<UserCognitiveStyle, string> = {
    analytical: 'analytical',
    emotional: 'empathetic',
    practical: 'pragmatic',
    narrative: 'narrative',
    systematic: 'systematic',
    intuitive: 'intuitive',
    unknown: '',
  };

  if (userStyle !== 'unknown' && styleMap[userStyle] === profile.reasoningStyle) {
    insights.push({
      type: 'style_match',
      message: `User's ${userStyle} style matches persona's ${profile.reasoningStyle} style`,
      shareablePhrase: getStyleMatchPhrase(personaId, userStyle),
      confidence: 0.7,
    });
  }

  // ============================================================================
  // 2. STYLE ADAPTATION INSIGHT - When adapting to user's style
  // ============================================================================
  if (userStyle !== 'unknown' && styleMap[userStyle] !== profile.reasoningStyle) {
    insights.push({
      type: 'style_adapt',
      message: `Adapting ${profile.reasoningStyle} style to user's ${userStyle} preference`,
      shareablePhrase: getStyleAdaptPhrase(personaId, userStyle, profile.reasoningStyle),
      confidence: 0.65,
    });
  }

  // ============================================================================
  // 3. VOICE RESPONSE INSIGHT - When responding to voice signals
  // ============================================================================
  const voiceEmotion = input.voiceEmotion;
  if (voiceEmotion && voiceEmotion.confidence > 0.7) {
    const stressEmotions = ['stressed', 'anxious', 'worried', 'overwhelmed', 'sad'];
    if (stressEmotions.includes(voiceEmotion.emotion.toLowerCase())) {
      insights.push({
        type: 'voice_respond',
        message: `Responding to detected ${voiceEmotion.emotion} in voice`,
        shareablePhrase: getVoiceResponsePhrase(personaId, voiceEmotion.emotion),
        confidence: 0.75,
      });
    }
  }

  // ============================================================================
  // 4. EMPATHY SHIFT INSIGHT - When shifting to empathetic mode
  // ============================================================================
  const emotion = input.analysis.emotion;
  if (emotion.needsSupport || (emotion.distressLevel && emotion.distressLevel > 0.6)) {
    if (profile.reasoningStyle !== 'empathetic') {
      insights.push({
        type: 'empathy_shift',
        message: 'Shifting from default style to empathetic approach',
        shareablePhrase: getEmpathyShiftPhrase(personaId),
        confidence: 0.7,
      });
    }
  }

  // ============================================================================
  // 5. LEARNING INSIGHT - When we've learned something about the user
  // ============================================================================
  if (input.userData.turnCount && input.userData.turnCount > 10) {
    insights.push({
      type: 'learning',
      message: 'Have learned user preferences over conversation',
      shareablePhrase: getLearningPhrase(personaId),
      confidence: 0.6,
    });
  }

  return insights;
}

// ============================================================================
// PHRASE GENERATORS - Persona-specific phrasing
// ============================================================================

function getStyleMatchPhrase(personaId: string, userStyle: UserCognitiveStyle): string {
  const phrases: Record<string, Record<UserCognitiveStyle, string>> = {
    'ferni': {
      analytical: "I notice we're both diving into the meaning behind things",
      emotional: "I can feel we're both leading with the heart here",
      practical: "We're both focused on what really matters",
      narrative: "I love that you think in stories too",
      systematic: "You've got a good structure going",
      intuitive: "I sense we're both trusting the deeper knowing",
      unknown: '',
    },
    'peter-john': {
      analytical: "I can tell you appreciate the data as much as I do",
      emotional: "I'm picking up on the importance of how this feels",
      practical: "You're focused on what works - I like that",
      narrative: "Ah, you like the story behind the numbers",
      systematic: "You've got a good systematic approach here",
      intuitive: "I see you're trusting your gut on this",
      unknown: '',
    },
    'maya-santos': {
      analytical: "I notice you're thinking this through carefully",
      emotional: "I can feel we're both connecting to the feelings here",
      practical: "You're focused on what you can actually do",
      narrative: "I hear the story you're telling yourself",
      systematic: "You've got good structure in your approach",
      intuitive: "You're trusting yourself on this",
      unknown: '',
    },
    'default': {
      analytical: "I can tell you think analytically",
      emotional: "I sense the emotional depth here",
      practical: "You're very action-oriented",
      narrative: "You think in stories",
      systematic: "You're very systematic",
      intuitive: "You trust your intuition",
      unknown: '',
    },
  };

  return (phrases[personaId] || phrases['default'])[userStyle] || '';
}

function getStyleAdaptPhrase(personaId: string, userStyle: UserCognitiveStyle, personaStyle: string): string {
  const adapts: Record<string, string> = {
    'ferni': "Let me frame this in a way that might resonate better with how you're thinking...",
    'peter-john': "I'll adjust my approach to connect with how you're processing this...",
    'alex-chen': "Let me organize this in a way that works for you...",
    'maya-santos': "I'm meeting you where you are on this...",
    'jordan-taylor': "Let me shift gears to match your energy...",
    'nayan-patel': "I'll find a different angle that might land better...",
    'default': "I'm adjusting my approach based on what I'm sensing from you...",
  };

  return adapts[personaId] || adapts['default'];
}

function getVoiceResponsePhrase(personaId: string, emotion: string): string {
  const responses: Record<string, string> = {
    'ferni': "I hear something in your voice - let's slow down a bit.",
    'peter-john': "I'm picking up on something beyond the words here.",
    'alex-chen': "Let me take a breath here with you.",
    'maya-santos': "I'm noticing how you're feeling in this moment.",
    'jordan-taylor': "Hey, let's pause for a second.",
    'nayan-patel': "There's weight in what you're sharing.",
    'default': "I'm paying attention to how you're feeling.",
  };

  return responses[personaId] || responses['default'];
}

function getEmpathyShiftPhrase(personaId: string): string {
  const shifts: Record<string, string> = {
    'ferni': "Let me set aside the solutions for a moment and just be here with you.",
    'peter-john': "Before the analysis - I just want to acknowledge what you're going through.",
    'alex-chen': "Forget the process for a second - how are YOU doing?",
    'maya-santos': "Let me just be with you in this.",
    'jordan-taylor': "Plans can wait - you matter more right now.",
    'nayan-patel': "Sometimes there's nothing to fix, just something to hold.",
    'default': "I'm putting everything else aside to be here with you.",
  };

  return shifts[personaId] || shifts['default'];
}

function getLearningPhrase(personaId: string): string {
  const learnings: Record<string, string> = {
    'ferni': "I feel like I'm getting to know how you think...",
    'peter-john': "I've been tracking what resonates with you...",
    'alex-chen': "I've got a good sense of your style now...",
    'maya-santos': "I'm learning what helps you...",
    'jordan-taylor': "I'm picking up on what clicks for you...",
    'nayan-patel': "Over our time together, I've come to understand...",
    'default': "I've been learning how you think...",
  };

  return learnings[personaId] || learnings['default'];
}

/**
 * Clear cognitive insights session state
 */
export function clearCognitiveInsightsSession(sessionKey: string): void {
  sharedInsights.delete(sessionKey);
  // Clear cooldowns for this session
  for (const key of insightCooldowns.keys()) {
    if (key.startsWith(sessionKey)) {
      insightCooldowns.delete(key);
    }
  }
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder({
  name: 'cognitive-insights',
  description: 'Shareable cognitive insights for transparency with users',
  priority: 50, // Lower priority - nice to have
  build: buildCognitiveInsightsContext,
});

export { buildCognitiveInsightsContext };
export default buildCognitiveInsightsContext;

