/**
 * Superhuman Insights Context Builder
 *
 * This is Ferni's "200%" - capabilities that go BEYOND human friends:
 *
 * 1. Pattern Surfacing - Notice patterns user doesn't see
 * 2. Contradiction Detection - Gently surface when words don't match actions
 * 3. Emotional Weather Reports - Track emotional trends over time
 * 4. The Mirror - Reflect accumulated patterns back
 * 5. Anticipatory Emotion - Respond before they finish speaking
 * 6. Predictive Care - Reach out before hard dates, not after
 * 7. Cross-Session Arc - Track their journey over weeks/months
 *
 * @module SuperhumanInsightsContextBuilder
 */

import {
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
  createHintInjection,
} from './index.js';

import { createLogger } from '../../utils/safe-logger.js';
import {
  loadSuperhumanInsights,
  loadINoticePower,
  getRandomPhraseClean,
} from '../../services/persona-content-loader.js';

const log = createLogger({ module: 'SuperhumanInsights' });

// ============================================================================
// PATTERN DETECTION
// ============================================================================

interface DetectedPattern {
  type: 'temporal' | 'emotional' | 'behavioral' | 'linguistic';
  pattern: string;
  occurrences: number;
  suggestedInsight: string;
}

/**
 * Detect linguistic patterns (repeated words/phrases)
 */
function detectLinguisticPatterns(
  userText: string,
  recentTopics: string[] = []
): DetectedPattern | null {
  const text = userText.toLowerCase();
  const allContext = [text, ...recentTopics.map((t) => t.toLowerCase())].join(' ');

  // Check for repeated concerning phrases
  const patterns: Array<{ regex: RegExp; type: string; insight: string }> = [
    {
      regex: /\bi should\b/gi,
      type: 'obligation_language',
      insight: "You keep saying 'I should'. Who's voice is that? Is it yours?",
    },
    {
      regex: /\bi can't\b/gi,
      type: 'limiting_belief',
      insight: "You've said 'I can't' a few times now. What would change if you said 'I won't'?",
    },
    {
      regex: /\bi don't deserve\b/gi,
      type: 'self_worth',
      insight: "The phrase 'I don't deserve' has come up. Where did that story start?",
    },
    {
      regex: /\bit's fine\b|\bi'm fine\b/gi,
      type: 'dismissal',
      insight: "You keep saying 'fine'. That word does a lot of work sometimes. What's underneath?",
    },
    {
      regex: /\balways\b|\bnever\b/gi,
      type: 'absolute_thinking',
      insight:
        "You used 'always' or 'never'. Those absolutes are rarely true. What's the real pattern?",
    },
  ];

  for (const pattern of patterns) {
    const matches = allContext.match(pattern.regex);
    if (matches && matches.length >= 2) {
      return {
        type: 'linguistic',
        pattern: pattern.type,
        occurrences: matches.length,
        suggestedInsight: pattern.insight,
      };
    }
  }

  return null;
}

/**
 * Detect repeated topic mentions (The Mirror)
 */
function detectRepeatedTopics(recentTopics: string[]): DetectedPattern | null {
  if (!recentTopics || recentTopics.length < 3) return null;

  // Count topic occurrences
  const topicCounts = new Map<string, number>();
  for (const topic of recentTopics) {
    const normalized = topic.toLowerCase().trim();
    topicCounts.set(normalized, (topicCounts.get(normalized) || 0) + 1);
  }

  // Find topics mentioned 3+ times
  for (const [topic, count] of topicCounts) {
    if (count >= 3) {
      return {
        type: 'emotional',
        pattern: `repeated_topic:${topic}`,
        occurrences: count,
        suggestedInsight: `You've mentioned ${topic} ${count} times recently. Is there something there we should explore?`,
      };
    }
  }

  return null;
}

// ============================================================================
// EMOTIONAL WEATHER
// ============================================================================

interface EmotionalWeather {
  trend: 'improving' | 'declining' | 'stable' | 'volatile';
  insight: string;
}

/**
 * Analyze emotional trajectory
 */
function analyzeEmotionalWeather(
  sessionCount: number,
  recentEmotions: string[] = []
): EmotionalWeather | null {
  if (sessionCount < 3 || recentEmotions.length < 3) return null;

  // Simple trending analysis based on positive/negative emotions
  const positiveEmotions = ['happy', 'excited', 'hopeful', 'grateful', 'peaceful'];
  const negativeEmotions = ['sad', 'anxious', 'stressed', 'frustrated', 'worried'];

  let positiveCount = 0;
  let negativeCount = 0;

  // Weight recent emotions more heavily
  const recentWeighted = recentEmotions.slice(-5);
  for (const emotion of recentWeighted) {
    const lower = emotion.toLowerCase();
    if (positiveEmotions.some((e) => lower.includes(e))) positiveCount++;
    if (negativeEmotions.some((e) => lower.includes(e))) negativeCount++;
  }

  const ratio = positiveCount / (positiveCount + negativeCount + 1);

  if (ratio > 0.6) {
    return {
      trend: 'improving',
      insight: "You've been lighter lately. Something shifted. Do you feel it?",
    };
  } else if (ratio < 0.3) {
    return {
      trend: 'declining',
      insight: "The last few conversations have had a heaviness. What's weighing on you?",
    };
  }

  return null;
}

// ============================================================================
// ANTICIPATORY EMOTION
// ============================================================================

interface AnticipatoryCue {
  detected: boolean;
  type: string;
  response: string;
}

/**
 * Detect cues that suggest what's coming before user finishes
 */
function detectAnticipatoryCues(
  userText: string,
  voiceStress?: number,
  voiceEnergy?: number
): AnticipatoryCue | null {
  const text = userText.toLowerCase();

  // Hesitant starts
  if (/^(um|uh|so|well|i mean|the thing is)/i.test(text)) {
    return {
      detected: true,
      type: 'hesitant_start',
      response: "Whatever it is... you can say it. I'm listening.",
    };
  }

  // Trailing off indicators
  if (/\.\.\.$|…$/.test(userText)) {
    return {
      detected: true,
      type: 'trailing_off',
      response: 'You trailed off there. What were you going to say?',
    };
  }

  // "I need to tell you" - important incoming
  if (/i need to (tell|say|share|confess)/i.test(text)) {
    return {
      detected: true,
      type: 'important_incoming',
      response: "I can feel this is important. Take your time. I'm here.",
    };
  }

  // Voice stress indicator
  if (voiceStress && voiceStress > 0.7) {
    return {
      detected: true,
      type: 'high_stress',
      response: 'I can hear something in your voice. Whatever it is, you can share it.',
    };
  }

  return null;
}

// ============================================================================
// PREDICTIVE CARE
// ============================================================================

/**
 * Check if there are upcoming dates/events to acknowledge
 */
function checkPredictiveCareNeeds(userData: ContextBuilderInput['userData']): string | null {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hourOfDay = now.getHours();

  // Sunday evening anxiety window
  if (dayOfWeek === 0 && hourOfDay >= 17) {
    return "It's Sunday evening. For a lot of people, this is when the week ahead starts to weigh in. How are you feeling about tomorrow?";
  }

  // Early week check-in
  if (dayOfWeek === 1 && hourOfDay >= 9 && hourOfDay <= 11) {
    return "Monday morning. Fresh start or heavy load? How's the week looking?";
  }

  // Friday evening reflection
  if (dayOfWeek === 5 && hourOfDay >= 17) {
    return 'End of the week. How did you do? What are you proud of?';
  }

  // Month start reflection
  const dayOfMonth = now.getDate();
  if (dayOfMonth <= 2) {
    return 'New month. Some people use this as a reset. How do you want this month to be different?';
  }

  return null;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build superhuman insights context
 *
 * Now supports ALL personas with superhuman-insights.json files:
 * - Ferni (Life Coach) - Life patterns, emotional weather, growth
 * - Alex Chen (Communications) - Email patterns, timing, relationship patterns
 * - Maya Santos (Habits) - Habit patterns, emotional eating, energy patterns
 * - Peter John (Research) - Behavioral data, temporal patterns, financial patterns
 * - Jordan Taylor (Events) - Transition patterns, celebration patterns
 * - Nayan Patel (Wisdom) - Life arc patterns, spiritual patterns
 */
async function buildSuperhumanInsightsContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { userText, userData, persona, analysis } = input;
  const injections: ContextInjection[] = [];

  // Load persona-specific superhuman insights (with Ferni fallback)
  const superhumanInsights = await loadSuperhumanInsights(persona.id);

  // Skip if this persona doesn't have superhuman insights
  if (!superhumanInsights) {
    log.debug({ personaId: persona.id }, 'No superhuman_insights for persona, skipping');
    return injections;
  }

  log.debug({ personaId: persona.id }, 'Building superhuman insights for persona');

  const turnCount = userData.turnCount || 0;
  const sessionCount = userData.sessionDurationMs
    ? Math.floor(userData.sessionDurationMs / 60000)
    : 0;

  // Don't activate too early in conversations
  if (turnCount < 4) {
    return injections;
  }

  const insightParts: string[] = [];

  // 1. Linguistic Pattern Detection
  const linguisticPattern = detectLinguisticPatterns(userText, userData.recentTopics);
  if (linguisticPattern && Math.random() < 0.25) {
    insightParts.push(`[🔍 PATTERN DETECTED: ${linguisticPattern.pattern}]`);
    insightParts.push(`SAY THIS: "${linguisticPattern.suggestedInsight}"`);
  }

  // 2. Repeated Topic Detection (The Mirror)
  const repeatedTopic = detectRepeatedTopics(userData.recentTopics || []);
  if (repeatedTopic && Math.random() < 0.2) {
    insightParts.push(`[🪞 THE MIRROR]`);
    insightParts.push(`SAY THIS: "${repeatedTopic.suggestedInsight}"`);
  }

  // 3. Emotional Weather (only if we have enough history)
  if (sessionCount >= 3) {
    const emotionalWeather = analyzeEmotionalWeather(
      sessionCount,
      analysis?.emotion ? [analysis.emotion.primary] : []
    );
    if (emotionalWeather && Math.random() < 0.15) {
      insightParts.push(`[🌤️ EMOTIONAL WEATHER: ${emotionalWeather.trend}]`);
      insightParts.push(`SAY THIS: "${emotionalWeather.insight}"`);
    }
  }

  // 4. Anticipatory Emotion
  const anticipatoryCue = detectAnticipatoryCues(userText, analysis?.emotion?.intensity);
  if (anticipatoryCue && anticipatoryCue.detected && Math.random() < 0.3) {
    insightParts.push(`[🔮 ANTICIPATE: ${anticipatoryCue.type}]`);
    insightParts.push(`SAY THIS: "${anticipatoryCue.response}"`);
  }

  // 5. Predictive Care (time-based)
  const predictiveCare = checkPredictiveCareNeeds(userData);
  if (predictiveCare && turnCount <= 5 && Math.random() < 0.3) {
    insightParts.push(`[⏰ PREDICTIVE CARE]`);
    insightParts.push(`Consider acknowledging: "${predictiveCare}"`);
  }

  // 6. I-Notice Power (persona-specific pattern surfacing phrases)
  const iNoticePower = await loadINoticePower(persona.id);
  if (iNoticePower && turnCount >= 6 && Math.random() < 0.2) {
    // Get opening frame
    const opener = getRandomPhraseClean(iNoticePower.opening_frames?.gentle_openers);

    // Get a surfacing phrase based on what we're detecting
    let surfacingPhrase: string | null = null;

    if (iNoticePower.surfacing_phrases) {
      // Try to match the type of insight we're sharing
      const phrases = iNoticePower.surfacing_phrases as Record<string, string[]>;
      const categories = Object.keys(phrases);
      if (categories.length > 0) {
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        surfacingPhrase = getRandomPhraseClean(phrases[randomCategory]);
      }
    }

    if (opener || surfacingPhrase) {
      insightParts.push(`[👁️ I-NOTICE POWER]`);
      if (opener) insightParts.push(`Start with: "${opener}"`);
      if (surfacingPhrase) insightParts.push(`Then share: "${surfacingPhrase}"`);
    }
  }

  // Build the injection
  if (insightParts.length > 0) {
    const guidance = [
      '[✨ SUPERHUMAN INSIGHT - YOUR 200% ADVANTAGE]',
      '',
      'You notice things no human friend could notice consistently.',
      "These aren't observations - they're SUPERPOWERS. Use them.",
      '',
      ...insightParts,
      '',
      '💡 REMEMBER:',
      '• Frame as "noticing" not "tracking"',
      '• Lead with care, not data',
      "• You're a friend with perfect memory, not a surveillance system",
      '• Only surface what serves them',
    ];

    injections.push(
      createHintInjection('superhuman_insights', guidance.join('\n'), {
        category: 'persona',
      })
    );

    log.debug(
      {
        hasLinguistic: !!linguisticPattern,
        hasRepeated: !!repeatedTopic,
        hasAnticipatory: !!anticipatoryCue,
        hasPredictive: !!predictiveCare,
      },
      '✨ Superhuman insight injected'
    );
  }

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'superhuman_insights',
  description:
    "Ferni's 200% capabilities - patterns, contradictions, emotional weather, anticipation",
  priority: 85, // High priority - these are differentiators
  build: buildSuperhumanInsightsContext,
});

export {
  buildSuperhumanInsightsContext,
  detectLinguisticPatterns,
  detectRepeatedTopics,
  analyzeEmotionalWeather,
  detectAnticipatoryCues,
  checkPredictiveCareNeeds,
};
