/**
 * Life Chapter Detector
 *
 * Recognizes and honors the phases/chapters of someone's life.
 * Enables moments like:
 * - "It feels like you're entering a new chapter. I'm here for it."
 * - "This growth chapter has been something, hasn't it?"
 * - "The person I'm talking to now is different from who started this chapter."
 *
 * Philosophy: Life has chapters. Recognizing them helps people
 * see their own story. This is narrative awareness, not diagnosis.
 *
 * @module services/personal-journey/chapter-detector
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { JourneyMoment, LifeChapters } from './types.js';

const log = createLogger({ module: 'ChapterDetector' });

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Common life chapter themes
 */
const CHAPTER_THEMES = {
  // Growth chapters
  growth: ['growing', 'learning', 'developing', 'expanding', 'becoming'],
  healing: ['healing', 'recovering', 'processing', 'working through', 'letting go'],
  transition: ['changing', 'shifting', 'moving', 'transitioning', 'starting over'],

  // Life events
  career: ['work', 'job', 'career', 'promotion', 'business', 'professional'],
  relationship: ['love', 'partner', 'dating', 'marriage', 'divorce', 'breakup'],
  family: ['family', 'parent', 'child', 'baby', 'kids', 'caregiving'],
  health: ['health', 'fitness', 'wellness', 'diagnosis', 'recovery', 'body'],
  financial: ['money', 'finances', 'debt', 'savings', 'investing', 'budget'],
  creative: ['creative', 'art', 'writing', 'music', 'project', 'creating'],
  spiritual: ['meaning', 'purpose', 'spiritual', 'faith', 'values', 'belief'],
  education: ['learning', 'school', 'degree', 'studying', 'training', 'skill'],

  // Emotional chapters
  discovery: ['discovering', 'realizing', 'understanding', 'seeing', 'clarity'],
  acceptance: ['accepting', 'making peace', 'coming to terms', 'embracing'],
  rebuilding: ['rebuilding', 'starting over', 'fresh start', 'new beginning'],
};

/**
 * Transition indicators
 */
const TRANSITION_SIGNALS = {
  beginning: [
    'starting',
    'beginning',
    'new',
    'first time',
    'about to',
    'planning to',
    'thinking about',
    'considering',
    'want to',
    'going to',
    'decided to',
  ],
  middle: [
    'in the middle of',
    'working on',
    'currently',
    'ongoing',
    'still',
    'continuing',
    'processing',
    'dealing with',
    'going through',
  ],
  ending: [
    'finishing',
    'ending',
    'closing',
    'wrapping up',
    'completed',
    'done with',
    'moving on',
    'leaving behind',
    'letting go',
    'final',
    'last',
  ],
};

/**
 * Chapter reflection messages
 */
const CHAPTER_MESSAGES = {
  transitionBeginning: [
    "It feels like you're entering a new chapter. <break time='200ms'/> I'm here for it.",
    "Something new is beginning for you, isn't it? <break time='200ms'/> I can feel it.",
    "A new chapter is starting. <break time='200ms'/> That's exciting and scary, I know.",
  ],
  transitionEnding: [
    "This chapter is coming to a close, isn't it? <break time='200ms'/> What a journey it's been.",
    "I can feel this chapter wrapping up. <break time='200ms'/> How are you feeling about it?",
    "Something's ending... <break time='200ms'/> and that's okay. That's how stories work.",
  ],
  growthReflection: [
    "The person I'm talking to now is different from who started this chapter. <break time='200ms'/> In a good way.",
    "You've changed since this chapter began. <break time='200ms'/> Can you feel it?",
    "This chapter has shaped you. <break time='200ms'/> I've watched it happen.",
  ],
  themeRecognition: [
    "So much of what we talk about lately is about {theme}. <break time='200ms'/> That's meaningful.",
    "I've noticed {theme} keeps coming up. <break time='200ms'/> It's clearly on your mind.",
    "This chapter seems to be about {theme}. <break time='200ms'/> Would you say that's true?",
  ],
  chapterAcknowledgment: [
    "You're in a {theme} chapter right now. <break time='200ms'/> How does that feel to name it?",
    "This {theme} chapter... <break time='200ms'/> it's significant, isn't it?",
    "If I had to name this chapter of your life, I'd call it your {theme} chapter.",
  ],
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const chapterCache = new Map<string, LifeChapters>();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Detect theme from text
 */
function detectThemeFromText(text: string): string | null {
  const lower = text.toLowerCase();

  for (const [theme, keywords] of Object.entries(CHAPTER_THEMES)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return theme;
      }
    }
  }

  return null;
}

/**
 * Detect transition type from text
 */
function detectTransitionFromText(text: string): 'beginning' | 'middle' | 'ending' | null {
  const lower = text.toLowerCase();

  // Check ending first (more specific)
  for (const signal of TRANSITION_SIGNALS.ending) {
    if (lower.includes(signal)) return 'ending';
  }

  // Check beginning
  for (const signal of TRANSITION_SIGNALS.beginning) {
    if (lower.includes(signal)) return 'beginning';
  }

  // Check middle
  for (const signal of TRANSITION_SIGNALS.middle) {
    if (lower.includes(signal)) return 'middle';
  }

  return null;
}

/**
 * Calculate theme confidence from frequency
 */
function calculateThemeConfidence(
  theme: string,
  recentTopics: string[],
  recentEmotions: string[]
): number {
  let matches = 0;
  const keywords = CHAPTER_THEMES[theme as keyof typeof CHAPTER_THEMES] || [];

  for (const topic of recentTopics) {
    for (const keyword of keywords) {
      if (topic.toLowerCase().includes(keyword)) {
        matches++;
        break;
      }
    }
  }

  for (const emotion of recentEmotions) {
    for (const keyword of keywords) {
      if (emotion.toLowerCase().includes(keyword)) {
        matches++;
        break;
      }
    }
  }

  const total = recentTopics.length + recentEmotions.length;
  return total > 0 ? matches / total : 0;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Create empty chapters structure
 */
function createEmptyChapters(userId: string): LifeChapters {
  return {
    userId,
    updatedAt: new Date(),
    pastChapters: [],
    transitionSignals: {
      isInTransition: false,
      confidence: 0,
    },
  };
}

/**
 * Get or create chapters for user
 */
export function getChapters(userId: string): LifeChapters {
  let chapters = chapterCache.get(userId);
  if (!chapters) {
    chapters = createEmptyChapters(userId);
    chapterCache.set(userId, chapters);
  }
  return chapters;
}

/**
 * Initialize from persisted data
 */
export function initializeChapters(userId: string, persistedData?: Partial<LifeChapters>): void {
  if (persistedData) {
    const chapters = {
      ...createEmptyChapters(userId),
      ...persistedData,
      userId,
    };
    chapterCache.set(userId, chapters);
    log.debug('Initialized chapters from persisted data', {
      userId,
      hasCurrentChapter: !!chapters.currentChapter,
      pastChaptersCount: chapters.pastChapters.length,
    });
  }
}

/**
 * Update chapter detection based on conversation analysis
 *
 * Call this after conversations with:
 * - Recent topics discussed
 * - Recent emotions detected
 * - Any explicit life event mentions
 */
export function updateChapterDetection(
  userId: string,
  data: {
    recentTopics: string[];
    recentEmotions: string[];
    conversationText?: string;
  }
): void {
  const chapters = getChapters(userId);
  const now = new Date();

  // Detect themes from recent conversations
  const themeScores = new Map<string, number>();

  for (const themeName of Object.keys(CHAPTER_THEMES)) {
    const confidence = calculateThemeConfidence(themeName, data.recentTopics, data.recentEmotions);
    if (confidence > 0.2) {
      themeScores.set(themeName, confidence);
    }
  }

  // Find dominant theme
  let dominantTheme: string | null = null;
  let maxConfidence = 0;

  for (const [theme, score] of themeScores.entries()) {
    if (score > maxConfidence) {
      maxConfidence = score;
      dominantTheme = theme;
    }
  }

  // Detect transition signals from conversation text
  let transitionType: 'beginning' | 'middle' | 'ending' | null = null;
  if (data.conversationText) {
    transitionType = detectTransitionFromText(data.conversationText);
  }

  // Update current chapter or detect new one
  if (dominantTheme && maxConfidence > 0.3) {
    if (!chapters.currentChapter) {
      // Start new chapter
      chapters.currentChapter = {
        id: generateId(),
        theme: dominantTheme,
        startedApprox: now,
        dominantEmotions: data.recentEmotions.slice(0, 5),
        keyTopics: data.recentTopics.slice(0, 10),
        challenges: [],
        growth: [],
      };
      log.info('Detected new chapter', { userId, theme: dominantTheme });
    } else if (chapters.currentChapter.theme !== dominantTheme && maxConfidence > 0.5) {
      // Theme has shifted significantly - might be a new chapter
      // Archive current chapter
      chapters.currentChapter.endedApprox = now;
      chapters.currentChapter.summary = `A ${chapters.currentChapter.theme} chapter spanning from ${chapters.currentChapter.startedApprox.toLocaleDateString()} to ${now.toLocaleDateString()}`;
      chapters.pastChapters.push(chapters.currentChapter);

      // Start new chapter
      chapters.currentChapter = {
        id: generateId(),
        theme: dominantTheme,
        startedApprox: now,
        dominantEmotions: data.recentEmotions.slice(0, 5),
        keyTopics: data.recentTopics.slice(0, 10),
        challenges: [],
        growth: [],
      };

      chapters.transitionSignals = {
        isInTransition: true,
        transitionType: 'beginning',
        fromChapter: chapters.pastChapters[chapters.pastChapters.length - 1].theme,
        toChapter: dominantTheme,
        confidence: maxConfidence,
        detectedAt: now,
      };

      log.info('Chapter transition detected', {
        userId,
        from: chapters.transitionSignals.fromChapter,
        to: dominantTheme,
      });
    } else {
      // Update existing chapter
      chapters.currentChapter.keyTopics = [
        ...new Set([...chapters.currentChapter.keyTopics, ...data.recentTopics]),
      ].slice(0, 20);
      chapters.currentChapter.dominantEmotions = [
        ...new Set([...chapters.currentChapter.dominantEmotions, ...data.recentEmotions]),
      ].slice(0, 10);
    }
  }

  // Update transition signals
  if (transitionType) {
    chapters.transitionSignals = {
      isInTransition: true,
      transitionType,
      confidence: 0.6,
      detectedAt: now,
    };

    if (chapters.currentChapter) {
      if (transitionType === 'beginning') {
        chapters.transitionSignals.toChapter = chapters.currentChapter.theme;
      } else if (transitionType === 'ending') {
        chapters.transitionSignals.fromChapter = chapters.currentChapter.theme;
      }
    }
  }

  // Decay transition signals over time (7 days)
  if (chapters.transitionSignals.detectedAt) {
    const daysSinceDetection =
      (now.getTime() - chapters.transitionSignals.detectedAt.getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceDetection > 7) {
      chapters.transitionSignals.isInTransition = false;
    }
  }

  chapters.updatedAt = now;
  chapterCache.set(userId, chapters);
}

/**
 * Record a challenge in the current chapter
 */
export function recordChapterChallenge(userId: string, challenge: string): void {
  const chapters = getChapters(userId);

  if (chapters.currentChapter) {
    if (!chapters.currentChapter.challenges.includes(challenge)) {
      chapters.currentChapter.challenges.push(challenge);
      chapters.updatedAt = new Date();
      chapterCache.set(userId, chapters);
    }
  }
}

/**
 * Record growth in the current chapter
 */
export function recordChapterGrowth(userId: string, growth: string): void {
  const chapters = getChapters(userId);

  if (chapters.currentChapter) {
    if (!chapters.currentChapter.growth.includes(growth)) {
      chapters.currentChapter.growth.push(growth);
      chapters.updatedAt = new Date();
      chapterCache.set(userId, chapters);
    }
  }
}

// ============================================================================
// INSIGHT GENERATION
// ============================================================================

/**
 * Get chapter-related journey moments
 */
export function getChapterMoments(userId: string): JourneyMoment[] {
  const chapters = getChapters(userId);
  const moments: JourneyMoment[] = [];

  // 1. Transition moments
  if (chapters.transitionSignals.isInTransition && chapters.transitionSignals.confidence > 0.5) {
    const type = chapters.transitionSignals.transitionType;

    if (type === 'beginning') {
      const template =
        CHAPTER_MESSAGES.transitionBeginning[
          Math.floor(Math.random() * CHAPTER_MESSAGES.transitionBeginning.length)
        ];

      moments.push({
        id: `transition_beginning_${Date.now()}`,
        type: 'chapter_transition',
        priority: 7,
        content: template,
        context: {
          transitionType: 'beginning',
          toChapter: chapters.transitionSignals.toChapter,
        },
        source: 'chapter-detector',
        requiresRelationshipStage: 'established',
      });
    } else if (type === 'ending') {
      const template =
        CHAPTER_MESSAGES.transitionEnding[
          Math.floor(Math.random() * CHAPTER_MESSAGES.transitionEnding.length)
        ];

      moments.push({
        id: `transition_ending_${Date.now()}`,
        type: 'chapter_transition',
        priority: 7,
        content: template,
        context: {
          transitionType: 'ending',
          fromChapter: chapters.transitionSignals.fromChapter,
        },
        source: 'chapter-detector',
        requiresRelationshipStage: 'established',
      });
    }
  }

  // 2. Current chapter theme recognition
  if (chapters.currentChapter) {
    const chapter = chapters.currentChapter;
    const daysInChapter = Math.floor(
      (new Date().getTime() - chapter.startedApprox.getTime()) / (24 * 60 * 60 * 1000)
    );

    // Only surface after being in chapter for at least 2 weeks
    if (daysInChapter >= 14) {
      const template =
        CHAPTER_MESSAGES.themeRecognition[
          Math.floor(Math.random() * CHAPTER_MESSAGES.themeRecognition.length)
        ];
      const message = template.replace(/{theme}/g, chapter.theme);

      moments.push({
        id: `chapter_theme_${chapter.id}`,
        type: 'chapter_reflection',
        priority: 5,
        content: message,
        context: {
          theme: chapter.theme,
          daysInChapter,
          keyTopics: chapter.keyTopics,
        },
        source: 'chapter-detector',
        requiresRelationshipStage: 'deep',
      });
    }

    // 3. Growth reflection (if growth has been recorded)
    if (chapter.growth.length >= 2 && daysInChapter >= 30) {
      const template =
        CHAPTER_MESSAGES.growthReflection[
          Math.floor(Math.random() * CHAPTER_MESSAGES.growthReflection.length)
        ];

      moments.push({
        id: `chapter_growth_${chapter.id}`,
        type: 'growth_mirror',
        priority: 8,
        content: template,
        context: {
          theme: chapter.theme,
          growthAreas: chapter.growth,
          daysInChapter,
        },
        source: 'chapter-detector',
        requiresRelationshipStage: 'deep',
      });
    }
  }

  // 4. Past chapter reflections (for comparison)
  if (chapters.pastChapters.length > 0) {
    const recentPastChapter = chapters.pastChapters[chapters.pastChapters.length - 1];

    // If we're in a new chapter and past chapter had challenges that current chapter might contrast with
    if (chapters.currentChapter && chapters.currentChapter.theme !== recentPastChapter.theme) {
      // Low probability - special reflection moment
      if (Math.random() < 0.1) {
        moments.push({
          id: `past_chapter_contrast_${recentPastChapter.id}`,
          type: 'chapter_reflection',
          priority: 6,
          content: `Your ${recentPastChapter.theme} chapter taught you something, didn't it? <break time='200ms'/> I can see how it's shaping this ${chapters.currentChapter.theme} chapter.`,
          context: {
            pastTheme: recentPastChapter.theme,
            currentTheme: chapters.currentChapter.theme,
          },
          source: 'chapter-detector',
          requiresRelationshipStage: 'deep',
        });
      }
    }
  }

  return moments;
}

/**
 * Get chapter context for greetings
 */
export function getChapterGreetingContext(userId: string): {
  hasChapterInsight: boolean;
  insight?: string;
  insightType?: 'transition' | 'growth' | 'theme';
} {
  const chapters = getChapters(userId);

  // Transition moment (higher probability - it's significant)
  if (chapters.transitionSignals.isInTransition && Math.random() < 0.2) {
    if (chapters.transitionSignals.transitionType === 'beginning') {
      return {
        hasChapterInsight: true,
        insight: "New chapter energy today. <break time='200ms'/> I feel it.",
        insightType: 'transition',
      };
    } else if (chapters.transitionSignals.transitionType === 'ending') {
      return {
        hasChapterInsight: true,
        insight:
          "Something's wrapping up for you, isn't it? <break time='200ms'/> I'm here for the transition.",
        insightType: 'transition',
      };
    }
  }

  // Growth acknowledgment (low probability - special moment)
  if (
    chapters.currentChapter &&
    chapters.currentChapter.growth &&
    chapters.currentChapter.growth.length >= 2 &&
    Math.random() < 0.05
  ) {
    return {
      hasChapterInsight: true,
      insight:
        "You're different than when this chapter started. <break time='200ms'/> In a good way.",
      insightType: 'growth',
    };
  }

  return { hasChapterInsight: false };
}

/**
 * Get current chapter summary for context
 */
export function getCurrentChapterSummary(userId: string): {
  hasChapter: boolean;
  theme?: string;
  daysInChapter?: number;
  isInTransition?: boolean;
  transitionType?: string;
} {
  const chapters = getChapters(userId);

  if (!chapters.currentChapter) {
    return { hasChapter: false };
  }

  return {
    hasChapter: true,
    theme: chapters.currentChapter.theme,
    daysInChapter: Math.floor(
      (new Date().getTime() - chapters.currentChapter.startedApprox.getTime()) /
        (24 * 60 * 60 * 1000)
    ),
    isInTransition: chapters.transitionSignals.isInTransition,
    transitionType: chapters.transitionSignals.transitionType,
  };
}

/**
 * Get data for persistence
 */
export function getChaptersForPersistence(userId: string): LifeChapters | null {
  return chapterCache.get(userId) || null;
}

/**
 * Clear cache
 */
export function clearChapterCache(userId: string): void {
  chapterCache.delete(userId);
  log.debug('Cleared chapter cache', { userId });
}
