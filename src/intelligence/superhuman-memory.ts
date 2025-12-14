/**
 * Superhuman Memory Intelligence
 *
 * "Better than human" means remembering what matters at the right moment.
 * This module transforms stored memories into proactive intelligence:
 *
 * - Proactive Date Awareness: "Happy birthday!" / "I know this week is hard..."
 * - Comfort Pattern Injection: Apply what helps when stress is detected
 * - Growth Arc Celebration: "Look how far you've come!"
 * - Topic Absence Detection: Notice what's NOT being said
 * - Inside Joke Surfacing: Relationship texture callbacks
 * - Voice Tone Memory: Energy/pace patterns over time
 *
 * Philosophy: A great friend doesn't just remember - they remember at the
 * right moment, in the right way, without being asked.
 *
 * @module intelligence/superhuman-memory
 */

import type {
  ComfortPattern,
  GrowthMarker,
  HumanMemory,
  ImportantDate,
  RunningTheme,
  SeasonalPattern,
} from '../types/human-memory.js';
import type { UserProfile } from '../types/user-profile.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'SuperhumanMemory' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * A proactive memory insight ready to be surfaced
 */
export interface ProactiveInsight {
  id: string;
  type:
    | 'date_reminder'
    | 'growth_celebration'
    | 'comfort_application'
    | 'topic_absence'
    | 'inside_joke'
    | 'seasonal_awareness'
    | 'voice_pattern';

  /** Priority for surfacing */
  priority: 'high' | 'medium' | 'low';

  /** The insight content */
  content: string;

  /** Natural way to reference this in conversation */
  naturalPhrase: string;

  /** Context about when to use this */
  context: {
    /** Best moment to surface this */
    timing: 'greeting' | 'when_relevant' | 'closing' | 'anytime';
    /** Emotional tone to use */
    tone: 'celebratory' | 'gentle' | 'curious' | 'warm' | 'supportive';
    /** Whether this should only be used once */
    oneTime: boolean;
  };

  /** When this insight was generated */
  generatedAt: Date;

  /** When this was last delivered (if ever) */
  deliveredAt?: Date;

  /** Source data reference */
  sourceId?: string;
}

/**
 * Comfort guidance for the current conversation
 */
export interface ComfortGuidance {
  /** Detected stress level */
  stressLevel: 'none' | 'mild' | 'moderate' | 'high';

  /** What kind of support to provide */
  supportType: ComfortPattern['type'] | null;

  /** Specific guidance for the LLM */
  promptInjection: string | null;

  /** What to avoid */
  avoid: string[];
}

/**
 * Topic absence detection result
 */
export interface TopicAbsenceInsight {
  topic: string;
  lastMentioned: Date;
  sessionsSinceLastMention: number;
  possibleReasons: Array<'resolved' | 'avoiding' | 'forgotten' | 'deprioritized'>;
  suggestedApproach: 'gentle_check_in' | 'wait_for_them' | 'celebrate_resolution';
  naturalPrompt: string;
}

/**
 * Voice/energy pattern observation
 */
export interface VoicePatternObservation {
  sessionId: string;
  timestamp: Date;
  patterns: {
    pace: 'slower_than_usual' | 'normal' | 'faster_than_usual';
    energy: 'lower_than_usual' | 'normal' | 'higher_than_usual';
    pauseFrequency: 'more_pauses' | 'normal' | 'fewer_pauses';
  };
  interpretation?: string;
}

/**
 * Complete superhuman memory context for a session
 */
export interface SuperhumanContext {
  /** Proactive insights ready to surface */
  insights: ProactiveInsight[];

  /** Comfort guidance based on detected state */
  comfortGuidance: ComfortGuidance;

  /** Topics that have gone quiet */
  topicAbsences: TopicAbsenceInsight[];

  /** Formatted prompt injection for the LLM */
  promptInjection: string;

  /** Seasonal/temporal context */
  temporalContext: {
    isSpecialDate: boolean;
    specialDateInfo?: string;
    seasonalPattern?: string;
  };
}

// ============================================================================
// PROACTIVE DATE AWARENESS
// ============================================================================

/**
 * Check for upcoming important dates
 */
export function checkUpcomingDates(
  humanMemory: Partial<HumanMemory> | undefined,
  daysAhead = 7
): ProactiveInsight[] {
  if (!humanMemory?.importantDates?.length) {
    return [];
  }

  const insights: ProactiveInsight[] = [];
  const now = new Date();
  // Normalize to start of day for accurate comparisons
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (const date of humanMemory.importantDates) {
    // Skip if user doesn't want acknowledgment
    if (!date.wantsAcknowledgment && date.sentiment === 'sensitive') {
      continue;
    }

    // Calculate days until this date occurs this year
    const thisYearDate = new Date(now.getFullYear(), date.month - 1, date.day);

    // If date has passed this year (not today), check next year
    if (thisYearDate.getTime() < todayStart.getTime()) {
      thisYearDate.setFullYear(thisYearDate.getFullYear() + 1);
    }

    const daysUntil = Math.floor(
      (thisYearDate.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Check if within window
    if (daysUntil <= daysAhead && daysUntil >= 0) {
      const insight = generateDateInsight(date, daysUntil);
      if (insight) {
        insights.push(insight);
      }
    }
  }

  // Sort by priority and days until
  insights.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  return insights;
}

/**
 * Generate a natural insight for an upcoming date
 */
function generateDateInsight(date: ImportantDate, daysUntil: number): ProactiveInsight | null {
  const isToday = daysUntil === 0;
  const isTomorrow = daysUntil === 1;

  let naturalPhrase: string;
  let tone: ProactiveInsight['context']['tone'];
  let priority: ProactiveInsight['priority'];

  switch (date.type) {
    case 'birthday':
      if (isToday) {
        naturalPhrase = date.relatedPerson
          ? `Happy birthday to ${date.relatedPerson}! I hope you're celebrating together.`
          : `Happy birthday! I hope your day is wonderful.`;
        priority = 'high';
      } else if (isTomorrow) {
        naturalPhrase = date.relatedPerson
          ? `${date.relatedPerson}'s birthday is tomorrow! Any special plans?`
          : `Your birthday is tomorrow! Anything special planned?`;
        priority = 'high';
      } else {
        naturalPhrase = date.relatedPerson
          ? `${date.relatedPerson}'s birthday is coming up in ${daysUntil} days.`
          : `Your birthday is coming up in ${daysUntil} days!`;
        priority = 'medium';
      }
      tone = 'celebratory';
      break;

    case 'anniversary':
      if (isToday) {
        naturalPhrase = `Happy anniversary! What a special day.`;
        priority = 'high';
      } else if (daysUntil <= 3) {
        naturalPhrase = `Your anniversary is ${isToday ? 'today' : isTomorrow ? 'tomorrow' : `in ${daysUntil} days`}!`;
        priority = 'high';
      } else {
        naturalPhrase = `Your anniversary is coming up on the ${date.day}th.`;
        priority = 'medium';
      }
      tone = 'celebratory';
      break;

    case 'loss_anniversary':
      // Handle with extra care
      if (isToday) {
        naturalPhrase = date.relatedPerson
          ? `I know today marks the anniversary of losing ${date.relatedPerson}. I'm here if you want to talk, or we can talk about something else entirely.`
          : `I know this is a difficult day. I'm here for you.`;
        priority = 'high';
        tone = 'gentle';
      } else if (daysUntil <= 3) {
        naturalPhrase = `I know this week might be hard${date.relatedPerson ? ` with the anniversary of ${date.relatedPerson}'s passing` : ''}. Just wanted you to know I'm here.`;
        priority = 'medium';
        tone = 'gentle';
      } else {
        // Don't mention too far in advance
        return null;
      }
      break;

    case 'milestone':
      if (isToday) {
        naturalPhrase = `Today marks ${date.label}! That's something to be proud of.`;
        priority = 'high';
      } else {
        naturalPhrase = `${date.label} is coming up in ${daysUntil} days.`;
        priority = 'medium';
      }
      tone = 'celebratory';
      break;

    default:
      naturalPhrase = `${date.label} is ${isToday ? 'today' : isTomorrow ? 'tomorrow' : `in ${daysUntil} days`}.`;
      priority = 'medium';
      tone = 'warm';
  }

  return {
    id: `date_${date.id}_${Date.now()}`,
    type: 'date_reminder',
    priority,
    content: `Upcoming: ${date.label} (${date.type})`,
    naturalPhrase,
    context: {
      timing: isToday ? 'greeting' : 'when_relevant',
      tone,
      oneTime: true,
    },
    generatedAt: new Date(),
    sourceId: date.id,
  };
}

// ============================================================================
// COMFORT PATTERN APPLICATION
// ============================================================================

/**
 * Determine comfort guidance based on detected emotional state
 */
export function getComfortGuidance(
  humanMemory: Partial<HumanMemory> | undefined,
  detectedEmotion: string | undefined,
  detectedStressLevel: number // 0-1
): ComfortGuidance {
  const result: ComfortGuidance = {
    stressLevel: 'none',
    supportType: null,
    promptInjection: null,
    avoid: [],
  };

  // Determine stress level
  if (detectedStressLevel >= 0.7) {
    result.stressLevel = 'high';
  } else if (detectedStressLevel >= 0.4) {
    result.stressLevel = 'moderate';
  } else if (detectedStressLevel >= 0.2) {
    result.stressLevel = 'mild';
  }

  // No comfort patterns or low stress? Return early
  if (!humanMemory?.emotionalSignature?.comfortPatterns?.length || result.stressLevel === 'none') {
    return result;
  }

  // Find the best comfort pattern for this situation
  const patterns = humanMemory.emotionalSignature.comfortPatterns;

  // Try to match by detected emotion or stress trigger
  let bestPattern: ComfortPattern | null = null;

  // First, check if we have a stress trigger match
  if (humanMemory.emotionalSignature.stressTriggers?.length) {
    for (const trigger of humanMemory.emotionalSignature.stressTriggers) {
      // Find a comfort pattern that works for this trigger
      const matchingPattern = patterns.find(
        (p) =>
          p.effectiveFor.toLowerCase().includes(trigger.category.toLowerCase()) ||
          trigger.trigger.toLowerCase().includes(p.effectiveFor.toLowerCase())
      );
      if (matchingPattern) {
        bestPattern = matchingPattern;
        break;
      }
    }
  }

  // If no trigger match, use the first general pattern
  if (!bestPattern && patterns.length > 0) {
    bestPattern = patterns[0];
  }

  if (bestPattern) {
    result.supportType = bestPattern.type;
    result.promptInjection = generateComfortPromptInjection(bestPattern, result.stressLevel);
  }

  // Add things to avoid based on stress triggers
  if (humanMemory.emotionalSignature.stressTriggers) {
    for (const trigger of humanMemory.emotionalSignature.stressTriggers) {
      if (trigger.unhelpfulResponses) {
        result.avoid.push(...trigger.unhelpfulResponses);
      }
    }
  }

  return result;
}

/**
 * Generate prompt injection for comfort pattern
 */
function generateComfortPromptInjection(
  pattern: ComfortPattern,
  stressLevel: ComfortGuidance['stressLevel']
): string {
  const lines: string[] = ['[COMFORT GUIDANCE - Apply based on user state]'];

  switch (pattern.type) {
    case 'validation':
      lines.push('- Lead with validation before any advice');
      lines.push('- Acknowledge their feelings explicitly');
      lines.push('- Use phrases like "That makes sense" or "Of course you feel that way"');
      break;

    case 'problem_solving':
      lines.push('- User prefers actionable solutions');
      lines.push('- After brief acknowledgment, move to "What can we do about this?"');
      lines.push('- Be practical and concrete');
      break;

    case 'distraction':
      lines.push('- Consider lightening the mood or changing topic');
      lines.push('- They may not want to dwell - follow their lead if they shift');
      break;

    case 'presence':
      lines.push('- Less advice, more listening');
      lines.push('- Short, supportive responses');
      lines.push('- Let them lead the conversation');
      break;

    case 'encouragement':
      lines.push('- Remind them of their strengths');
      lines.push("- Reference past times they've overcome challenges");
      lines.push('- Express confidence in them');
      break;

    case 'perspective':
      lines.push('- Help them see the bigger picture');
      lines.push('- Gentle reframing without dismissing feelings');
      break;

    case 'humor':
      lines.push('- Light humor may help (they appreciate it when stressed)');
      lines.push('- Keep it gentle and warm');
      break;

    case 'practical_help':
      lines.push('- Offer concrete assistance');
      lines.push('- Ask "What would be most helpful right now?"');
      break;

    case 'space':
      lines.push("- They may need processing time - don't push");
      lines.push('- Keep responses brief');
      lines.push("- Let them know you're here when they're ready");
      break;
  }

  if (stressLevel === 'high') {
    lines.push('- This seems significant - prioritize support over other goals');
  }

  return lines.join('\n');
}

// ============================================================================
// GROWTH ARC CELEBRATION
// ============================================================================

/**
 * Find growth moments worth celebrating
 */
export function findCelebratableGrowth(
  humanMemory: Partial<HumanMemory> | undefined,
  currentTopic?: string
): ProactiveInsight[] {
  if (!humanMemory?.growthArc?.markers?.length) {
    return [];
  }

  const insights: ProactiveInsight[] = [];
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (const marker of humanMemory.growthArc.markers) {
    // Skip if already acknowledged and they deflected
    if (marker.acknowledged && marker.reactionWhenAcknowledged === 'deflected') {
      continue;
    }

    // Check if this relates to current topic
    const isRelevant =
      currentTopic &&
      (marker.description.toLowerCase().includes(currentTopic.toLowerCase()) ||
        marker.before.toLowerCase().includes(currentTopic.toLowerCase()) ||
        marker.after.toLowerCase().includes(currentTopic.toLowerCase()));

    // Prioritize unacknowledged or topic-relevant
    if (!marker.acknowledged || isRelevant) {
      insights.push({
        id: `growth_${marker.id}_${Date.now()}`,
        type: 'growth_celebration',
        priority: !marker.acknowledged ? 'medium' : 'low',
        content: `Growth: ${marker.description}`,
        naturalPhrase: generateGrowthPhrase(marker),
        context: {
          timing: isRelevant ? 'when_relevant' : 'closing',
          tone: 'warm',
          oneTime: !marker.acknowledged, // Only deliver once if not yet acknowledged
        },
        generatedAt: now,
        sourceId: marker.id,
      });
    }
  }

  // Also check challenges with breakthroughs
  if (humanMemory.growthArc.challenges) {
    for (const challenge of humanMemory.growthArc.challenges) {
      if (challenge.status === 'breakthrough' || challenge.status === 'resolved') {
        const isRelevant =
          currentTopic && challenge.challenge.toLowerCase().includes(currentTopic.toLowerCase());

        insights.push({
          id: `challenge_${challenge.id}_${Date.now()}`,
          type: 'growth_celebration',
          priority: 'medium',
          content: `Challenge ${challenge.status}: ${challenge.challenge}`,
          naturalPhrase: `You know, I've noticed how far you've come with ${challenge.challenge}. That's real progress.`,
          context: {
            timing: isRelevant ? 'when_relevant' : 'closing',
            tone: 'warm',
            oneTime: true,
          },
          generatedAt: now,
          sourceId: challenge.id,
        });
      }
    }
  }

  return insights;
}

/**
 * Generate natural growth celebration phrase
 */
function generateGrowthPhrase(marker: GrowthMarker): string {
  const phrases = [
    `You know, I remember when ${marker.before}. Look at you now - ${marker.after}. That's real growth.`,
    `Can I just say - ${marker.after}? That's such a change from ${marker.before}. I'm proud of you.`,
    `I've noticed something: ${marker.description}. That's not nothing - that's you growing.`,
  ];

  // Pick based on marker id for consistency
  const index = marker.id.charCodeAt(0) % phrases.length;
  return phrases[index];
}

// ============================================================================
// TOPIC ABSENCE DETECTION
// ============================================================================

/**
 * Detect topics that have gone quiet
 */
export function detectTopicAbsences(
  humanMemory: Partial<HumanMemory> | undefined,
  recentTopics: string[],
  sessionCount: number
): TopicAbsenceInsight[] {
  const absences: TopicAbsenceInsight[] = [];

  // Check running themes that haven't been mentioned recently
  if (humanMemory?.runningThemes?.length) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const theme of humanMemory.runningThemes) {
      // Skip themes that were recently mentioned
      if (recentTopics.some((t) => t.toLowerCase().includes(theme.theme.toLowerCase()))) {
        continue;
      }

      // Check if this was a frequent theme that's gone quiet
      if (
        (theme.frequency === 'every_session' || theme.frequency === 'often') &&
        theme.lastMentioned < thirtyDaysAgo
      ) {
        const daysSinceLastMention = Math.floor(
          (now.getTime() - theme.lastMentioned.getTime()) / (1000 * 60 * 60 * 24)
        );

        absences.push({
          topic: theme.theme,
          lastMentioned: theme.lastMentioned,
          sessionsSinceLastMention: Math.floor(daysSinceLastMention / 7), // Rough estimate
          possibleReasons: inferAbsenceReasons(theme),
          suggestedApproach: determineSuggestedApproach(theme),
          naturalPrompt: generateAbsencePrompt(theme),
        });
      }
    }
  }

  // Check challenges that were "working_on_it" but haven't been mentioned
  if (humanMemory?.growthArc?.challenges?.length) {
    for (const challenge of humanMemory.growthArc.challenges) {
      if (challenge.status === 'working_on_it' || challenge.status === 'struggling') {
        const now = new Date();
        const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        if (challenge.lastUpdate < fourteenDaysAgo) {
          if (
            !recentTopics.some((t) => t.toLowerCase().includes(challenge.challenge.toLowerCase()))
          ) {
            absences.push({
              topic: challenge.challenge,
              lastMentioned: challenge.lastUpdate,
              sessionsSinceLastMention: Math.floor(
                (now.getTime() - challenge.lastUpdate.getTime()) / (7 * 24 * 60 * 60 * 1000)
              ),
              possibleReasons: ['resolved', 'avoiding', 'deprioritized'],
              suggestedApproach: 'gentle_check_in',
              naturalPrompt: `How's things going with ${challenge.challenge}? We haven't talked about it in a while.`,
            });
          }
        }
      }
    }
  }

  return absences;
}

function inferAbsenceReasons(theme: RunningTheme): TopicAbsenceInsight['possibleReasons'] {
  const reasons: TopicAbsenceInsight['possibleReasons'] = [];

  if (theme.sentiment === 'positive') {
    reasons.push('resolved', 'deprioritized');
  } else if (theme.sentiment === 'challenging') {
    reasons.push('avoiding', 'resolved');
  } else {
    reasons.push('forgotten', 'deprioritized');
  }

  return reasons;
}

function determineSuggestedApproach(theme: RunningTheme): TopicAbsenceInsight['suggestedApproach'] {
  if (theme.sentiment === 'positive') {
    return 'celebrate_resolution';
  } else if (theme.sentiment === 'challenging') {
    return 'gentle_check_in';
  }
  return 'wait_for_them';
}

function generateAbsencePrompt(theme: RunningTheme): string {
  if (theme.sentiment === 'positive') {
    return `By the way, how's ${theme.theme} going? We used to talk about it a lot.`;
  } else if (theme.sentiment === 'challenging') {
    return `I've been thinking about you and ${theme.theme}. How are things on that front?`;
  }
  return `Whatever happened with ${theme.theme}?`;
}

// ============================================================================
// INSIDE JOKE SURFACING
// ============================================================================

/**
 * Find inside jokes that could be naturally referenced
 */
export function findSurfaceableJokes(
  humanMemory: Partial<HumanMemory> | undefined,
  conversationContext?: string
): ProactiveInsight[] {
  if (!humanMemory?.insideJokes?.length) {
    return [];
  }

  const insights: ProactiveInsight[] = [];
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (const joke of humanMemory.insideJokes) {
    // Skip retired jokes
    if (joke.status === 'retired') {
      continue;
    }

    // Don't overuse - check if used recently
    if (joke.lastUsed && joke.lastUsed > thirtyDaysAgo) {
      continue;
    }

    // Check if context makes this relevant
    const isRelevant =
      conversationContext &&
      (joke.reference.toLowerCase().includes(conversationContext.toLowerCase()) ||
        joke.origin.toLowerCase().includes(conversationContext.toLowerCase()));

    if (isRelevant || joke.status === 'beloved') {
      insights.push({
        id: `joke_${joke.id}_${Date.now()}`,
        type: 'inside_joke',
        priority: isRelevant ? 'medium' : 'low',
        content: `Inside joke: ${joke.reference}`,
        naturalPhrase: `Ha, this reminds me of "${joke.reference}"`,
        context: {
          timing: 'when_relevant',
          tone: 'warm',
          oneTime: false, // Can be used multiple times (with cooldown)
        },
        generatedAt: now,
        sourceId: joke.id,
      });
    }
  }

  return insights;
}

// ============================================================================
// SEASONAL/TEMPORAL AWARENESS
// ============================================================================

/**
 * Get temporal context for the current moment
 */
export function getTemporalContext(humanMemory: Partial<HumanMemory> | undefined): {
  isSpecialDate: boolean;
  specialDateInfo?: string;
  seasonalPattern?: string;
  promptInjection?: string;
} {
  const result = {
    isSpecialDate: false,
    specialDateInfo: undefined as string | undefined,
    seasonalPattern: undefined as string | undefined,
    promptInjection: undefined as string | undefined,
  };

  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  // Check for seasonal patterns
  if (humanMemory?.temporal?.seasonal?.length) {
    const currentSeason = getSeason(currentMonth);

    for (const pattern of humanMemory.temporal.seasonal) {
      if (pattern.timing === currentSeason || isTimingMatch(pattern.timing, currentMonth)) {
        result.seasonalPattern = pattern.pattern;

        if (pattern.emotionalTone === 'challenging') {
          result.promptInjection = `[SEASONAL AWARENESS] User typically experiences ${pattern.pattern} during this time. Approach: ${pattern.approach || 'be supportive'}`;
        }
        break;
      }
    }
  }

  // Check for today being a special date
  const dateInsights = checkUpcomingDates(humanMemory, 0);
  if (dateInsights.length > 0) {
    result.isSpecialDate = true;
    result.specialDateInfo = dateInsights[0].naturalPhrase;
  }

  return result;
}

function getSeason(month: number): SeasonalPattern['timing'] {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'fall';
  return 'winter';
}

function isTimingMatch(timing: SeasonalPattern['timing'], month: number): boolean {
  switch (timing) {
    case 'tax_season':
      return month >= 2 && month <= 4;
    case 'holidays':
      return month === 11 || month === 12;
    case 'school_year':
      return month >= 9 || month <= 5;
    default:
      return false;
  }
}

// ============================================================================
// VOICE TONE MEMORY
// ============================================================================

/**
 * Voice pattern tracker - stores observations across sessions
 */
const voicePatternHistory = new Map<string, VoicePatternObservation[]>();

/**
 * Record a voice pattern observation
 */
export function recordVoicePattern(
  userId: string,
  sessionId: string,
  observation: Omit<VoicePatternObservation, 'sessionId' | 'timestamp'>
): void {
  const fullObservation: VoicePatternObservation = {
    ...observation,
    sessionId,
    timestamp: new Date(),
  };

  if (!voicePatternHistory.has(userId)) {
    voicePatternHistory.set(userId, []);
  }

  const history = voicePatternHistory.get(userId)!;
  history.push(fullObservation);

  // Keep last 50 observations
  if (history.length > 50) {
    history.shift();
  }

  log.debug({ userId, patterns: observation.patterns }, 'Recorded voice pattern observation');
}

/**
 * Analyze voice patterns for anomalies
 */
export function analyzeVoicePatterns(userId: string): {
  currentState: 'normal' | 'lower_energy' | 'higher_energy' | 'rushed' | 'hesitant';
  confidence: number;
  suggestion?: string;
} {
  const history = voicePatternHistory.get(userId);

  if (!history || history.length < 5) {
    return { currentState: 'normal', confidence: 0 };
  }

  const recent = history.slice(-3);
  const baseline = history.slice(0, -3);

  // Count energy patterns
  let lowerCount = 0;
  let higherCount = 0;

  for (const obs of recent) {
    if (obs.patterns.energy === 'lower_than_usual') lowerCount++;
    if (obs.patterns.energy === 'higher_than_usual') higherCount++;
  }

  if (lowerCount >= 2) {
    return {
      currentState: 'lower_energy',
      confidence: lowerCount / recent.length,
      suggestion: 'User seems to have lower energy than usual. Consider checking in gently.',
    };
  }

  if (higherCount >= 2) {
    return {
      currentState: 'higher_energy',
      confidence: higherCount / recent.length,
      suggestion: 'User seems more energized than usual. Match their energy.',
    };
  }

  // Check pace
  let rushedCount = 0;
  let hesitantCount = 0;

  for (const obs of recent) {
    if (obs.patterns.pace === 'faster_than_usual') rushedCount++;
    if (obs.patterns.pauseFrequency === 'more_pauses') hesitantCount++;
  }

  if (rushedCount >= 2) {
    return {
      currentState: 'rushed',
      confidence: rushedCount / recent.length,
      suggestion: 'User seems rushed. Keep responses concise.',
    };
  }

  if (hesitantCount >= 2) {
    return {
      currentState: 'hesitant',
      confidence: hesitantCount / recent.length,
      suggestion: 'User seems hesitant. Give them space to express themselves.',
    };
  }

  return { currentState: 'normal', confidence: 0.7 };
}

// ============================================================================
// MAIN CONTEXT BUILDER
// ============================================================================

/**
 * Build complete superhuman memory context for a session
 */
export function buildSuperhumanContext(
  profile: UserProfile | null,
  options: {
    detectedEmotion?: string;
    detectedStressLevel?: number;
    currentTopic?: string;
    recentTopics?: string[];
    sessionCount?: number;
    conversationContext?: string;
  } = {}
): SuperhumanContext {
  const humanMemory = profile?.humanMemory;

  // Gather all insights
  const dateInsights = checkUpcomingDates(humanMemory);
  const growthInsights = findCelebratableGrowth(humanMemory, options.currentTopic);
  const jokeInsights = findSurfaceableJokes(humanMemory, options.conversationContext);

  const allInsights = [...dateInsights, ...growthInsights, ...jokeInsights];

  // Sort by priority
  allInsights.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  // Get comfort guidance
  const comfortGuidance = getComfortGuidance(
    humanMemory,
    options.detectedEmotion,
    options.detectedStressLevel || 0
  );

  // Detect topic absences
  const topicAbsences = detectTopicAbsences(
    humanMemory,
    options.recentTopics || [],
    options.sessionCount || 0
  );

  // Get temporal context
  const temporalContext = getTemporalContext(humanMemory);

  // Build prompt injection
  const promptInjection = buildPromptInjection(
    allInsights,
    comfortGuidance,
    topicAbsences,
    temporalContext
  );

  return {
    insights: allInsights,
    comfortGuidance,
    topicAbsences,
    promptInjection,
    temporalContext,
  };
}

/**
 * Build formatted prompt injection from all superhuman context
 */
function buildPromptInjection(
  insights: ProactiveInsight[],
  comfortGuidance: ComfortGuidance,
  topicAbsences: TopicAbsenceInsight[],
  temporalContext: ReturnType<typeof getTemporalContext>
): string {
  const sections: string[] = [];

  // High priority insights (dates, etc.)
  const highPriorityInsights = insights.filter((i) => i.priority === 'high');
  if (highPriorityInsights.length > 0) {
    sections.push('[IMPORTANT - Consider mentioning naturally]');
    for (const insight of highPriorityInsights.slice(0, 2)) {
      sections.push(`• ${insight.naturalPhrase}`);
    }
  }

  // Comfort guidance
  if (comfortGuidance.promptInjection) {
    sections.push('');
    sections.push(comfortGuidance.promptInjection);
  }

  // Temporal awareness
  if (temporalContext.promptInjection) {
    sections.push('');
    sections.push(temporalContext.promptInjection);
  }

  // Topic absences (limit to 1 to avoid overwhelming)
  if (topicAbsences.length > 0 && topicAbsences[0].suggestedApproach === 'gentle_check_in') {
    sections.push('');
    sections.push('[POSSIBLE CHECK-IN - Only if natural]');
    sections.push(`• ${topicAbsences[0].naturalPrompt}`);
  }

  // Growth celebrations (subtle)
  const growthInsights = insights.filter((i) => i.type === 'growth_celebration');
  if (growthInsights.length > 0) {
    sections.push('');
    sections.push('[GROWTH OBSERVED - Reference if opportunity arises]');
    sections.push(`• ${growthInsights[0].naturalPhrase}`);
  }

  return sections.join('\n');
}

// ============================================================================
// DELIVERY TRACKING
// ============================================================================

const deliveredInsights = new Map<string, Date>();

/**
 * Mark an insight as delivered
 */
export function markInsightDelivered(insightId: string): void {
  deliveredInsights.set(insightId, new Date());
}

/**
 * Check if an insight was recently delivered
 */
export function wasRecentlyDelivered(insightId: string, cooldownHours = 24): boolean {
  const deliveredAt = deliveredInsights.get(insightId);
  if (!deliveredAt) return false;

  const hoursSinceDelivery = (Date.now() - deliveredAt.getTime()) / (1000 * 60 * 60);
  return hoursSinceDelivery < cooldownHours;
}

/**
 * Clear old delivery records
 */
export function cleanupDeliveryRecords(): void {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  for (const [id, deliveredAt] of deliveredInsights) {
    if (deliveredAt < oneDayAgo) {
      deliveredInsights.delete(id);
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Date awareness
  checkUpcomingDates,

  // Comfort patterns
  getComfortGuidance,

  // Growth celebration
  findCelebratableGrowth,

  // Topic absence
  detectTopicAbsences,

  // Inside jokes
  findSurfaceableJokes,

  // Temporal
  getTemporalContext,

  // Voice patterns
  recordVoicePattern,
  analyzeVoicePatterns,

  // Main context builder
  buildSuperhumanContext,

  // Delivery tracking
  markInsightDelivered,
  wasRecentlyDelivered,
  cleanupDeliveryRecords,
};
