/**
 * 📺 YouTube Integration Service
 *
 * Integration with YouTube Data API v3 for video discovery and recommendations.
 * Powers the "Watch Together" experience in Creative You.
 *
 * ✨ "MORE THAN HUMAN" FEATURES:
 * - Curated educational content, not algorithm-driven
 * - Recommendations based on conversations, not clicks
 * - Quality over quantity (limited daily suggestions)
 * - Discussion prompts for each video
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  channelId: string;
  channelTitle: string;
  thumbnailUrl: string;
  duration: string; // ISO 8601 duration (PT5M30S)
  durationSeconds: number;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  category: VideoCategory;
  tags: string[];
}

export type VideoCategory =
  | 'ted-talk'
  | 'documentary'
  | 'educational'
  | 'music-video'
  | 'podcast-clip'
  | 'tutorial'
  | 'inspiration'
  | 'mindfulness'
  | 'creativity'
  | 'science'
  | 'philosophy'
  | 'self-improvement';

export interface VideoRecommendation {
  video: YouTubeVideo;
  reason: string; // Why Ferni picked this
  discussionPrompts: string[]; // Questions to discuss after
  relevantTopic?: string; // From user's conversations
  mood: 'learn' | 'chill' | 'inspire' | 'reflect';
}

export interface WatchSession {
  id: string;
  userId: string;
  video: YouTubeVideo;
  startedAt: string;
  completedAt?: string;
  watchDurationSeconds: number;
  percentWatched: number;
  discussion?: {
    startedAt: string;
    notes: string[];
    insights: string[];
  };
}

export interface VideoSearchOptions {
  query: string;
  category?: VideoCategory;
  maxResults?: number;
  durationFilter?: 'short' | 'medium' | 'long'; // <4min, 4-20min, >20min
  orderBy?: 'relevance' | 'date' | 'viewCount' | 'rating';
}

// ============================================================================
// CURATED CHANNELS - Quality content sources
// ============================================================================

const CURATED_CHANNELS: Record<VideoCategory, string[]> = {
  'ted-talk': [
    'UCAuUUnT6oDeKwE6v1NGQxug', // TED
    'UCsT0YIqwnpJCM-mx7-gSA4Q', // TEDx Talks
  ],
  documentary: [
    'UC9-y-6csu5WGm29I7JiwpnA', // Computerphile
    'UCsooa4yRKGN_zEE8iknghZA', // TED-Ed
  ],
  educational: [
    'UCsooa4yRKGN_zEE8iknghZA', // TED-Ed
    'UCWOA1ZGywLbqmigxE4Qlvuw', // Kurzgesagt
    'UC6nSFpj9HTCZ5t-N3Rm3-HA', // Vsauce
    'UCsXVk37bltHxD1rDPwtNM8Q', // Kurzgesagt
  ],
  'music-video': [
    'UCX6OQ3DkcsbYNE6H8uQQuVA', // MrSuicideSheep (chill music)
  ],
  'podcast-clip': [
    'UCGLupLv3TQX5bFYR0JIg9Tw', // Huberman Lab
    'UCzQUP1qoWDoEbmsQxvdjxgQ', // Joe Rogan Clips
  ],
  tutorial: [
    'UCW5YeuERMmlnqo4oq8vGKuA', // Traversy Media
    'UC8butISFwT-Wl7EV0hUK0BQ', // freeCodeCamp
  ],
  inspiration: [
    'UCsT0YIqwnpJCM-mx7-gSA4Q', // TEDx Talks
    'UCvjgEDvShRsADYJq4rPuxTA', // Goalcast
  ],
  mindfulness: [
    'UCN4vyryy6O4GlIXcXTIuZQQ', // Headspace
  ],
  creativity: [
    'UCHnyfMqiRRG1u-2MsSQLbXA', // Veritasium
  ],
  science: [
    'UC6nSFpj9HTCZ5t-N3Rm3-HA', // Vsauce
    'UCWOA1ZGywLbqmigxE4Qlvuw', // Kurzgesagt
  ],
  philosophy: [
    'UCJ0-OtVpF0wOKEqT2Z1HEtA', // School of Life
  ],
  'self-improvement': [
    'UCGLupLv3TQX5bFYR0JIg9Tw', // Huberman Lab
    'UCJ0-OtVpF0wOKEqT2Z1HEtA', // School of Life
  ],
};

// ============================================================================
// CURATED VIDEO DATABASE - Hand-picked quality content
// ============================================================================

interface CuratedVideo {
  youtubeId: string;
  title: string;
  channelTitle: string;
  category: VideoCategory;
  durationSeconds: number;
  topics: string[];
  mood: 'learn' | 'chill' | 'inspire' | 'reflect';
  discussionPrompts: string[];
  thumbnailUrl: string;
}

// Pre-curated high-quality videos (no API needed for these)
// Exported for use by intelligent curator
export const CURATED_VIDEOS: CuratedVideo[] = [
  // TED Talks - Inspiration
  {
    youtubeId: 'H14bBuluwB8',
    title: 'Do schools kill creativity?',
    channelTitle: 'TED',
    category: 'ted-talk',
    durationSeconds: 1140,
    topics: ['creativity', 'education', 'potential'],
    mood: 'inspire',
    // Ferni voice: curious friend, not interview questions
    discussionPrompts: [
      'What part made you pause?',
      'Does this change how you see your own creativity?',
      "What would you do differently if nobody was watching?",
    ],
    thumbnailUrl: 'https://img.youtube.com/vi/H14bBuluwB8/maxresdefault.jpg',
  },
  {
    youtubeId: 'iCvmsMzlF7o',
    title: 'The power of vulnerability',
    channelTitle: 'TED',
    category: 'ted-talk',
    durationSeconds: 1200,
    topics: ['vulnerability', 'connection', 'courage', 'emotions'],
    mood: 'reflect',
    // Ferni voice: gentle curiosity
    discussionPrompts: [
      "What landed for you?",
      "When's the last time you let yourself be truly seen?",
      "What would you push back on?",
    ],
    thumbnailUrl: 'https://img.youtube.com/vi/iCvmsMzlF7o/maxresdefault.jpg',
  },
  {
    youtubeId: 'arj7oStGLkU',
    title: 'How great leaders inspire action',
    channelTitle: 'TED',
    category: 'ted-talk',
    durationSeconds: 1080,
    topics: ['leadership', 'purpose', 'motivation', 'communication'],
    mood: 'inspire',
    // Ferni voice: personal reflection
    discussionPrompts: [
      "Does this land differently than you expected?",
      "Who came to mind while you watched?",
      "What's the why behind what you're working on?",
    ],
    thumbnailUrl: 'https://img.youtube.com/vi/arj7oStGLkU/maxresdefault.jpg',
  },

  // Educational - Science
  {
    youtubeId: 'JQVmkDUkZT4',
    title: 'What Is Something?',
    channelTitle: 'Kurzgesagt',
    category: 'science',
    durationSeconds: 540,
    topics: ['physics', 'philosophy', 'existence', 'quantum'],
    mood: 'learn',
    // Ferni voice: wonder and curiosity
    discussionPrompts: [
      'What part stuck with you?',
      'Does knowing this change anything for you?',
      "What would you want to ask the scientists?",
    ],
    thumbnailUrl: 'https://img.youtube.com/vi/JQVmkDUkZT4/maxresdefault.jpg',
  },
  {
    youtubeId: 'h6fcK_fRYaI',
    title: 'The Egg - A Short Story',
    channelTitle: 'Kurzgesagt',
    category: 'philosophy',
    durationSeconds: 480,
    topics: ['meaning', 'life', 'perspective', 'spirituality'],
    mood: 'reflect',
    // Ferni voice: philosophical friend
    discussionPrompts: [
      'What hit you hardest?',
      'Who does this remind you of?',
      "What would change if you lived as though this were true?",
    ],
    thumbnailUrl: 'https://img.youtube.com/vi/h6fcK_fRYaI/maxresdefault.jpg',
  },

  // Self-Improvement
  {
    youtubeId: 'BHY0FxzoKZE',
    title: 'How to Stop Screwing Yourself Over',
    channelTitle: 'TEDx Talks',
    category: 'self-improvement',
    durationSeconds: 1320,
    topics: ['habits', 'motivation', 'change', 'action'],
    mood: 'inspire',
    // Ferni voice: direct but warm
    discussionPrompts: [
      "What's one thing you keep not starting?",
      "What excuse just popped into your head?",
      "What would you do right now if I wasn't here?",
    ],
    thumbnailUrl: 'https://img.youtube.com/vi/BHY0FxzoKZE/maxresdefault.jpg',
  },

  // Mindfulness
  {
    youtubeId: 'rqoxYKtEWEc',
    title: 'How to practice emotional first aid',
    channelTitle: 'TED',
    category: 'mindfulness',
    durationSeconds: 1020,
    topics: ['emotions', 'mental-health', 'self-care', 'resilience'],
    mood: 'reflect',
    // Ferni voice: gentle presence
    discussionPrompts: [
      "What's something you've been carrying alone?",
      "Where do you go when you're hurting?",
      "What would you tell a friend going through this?",
    ],
    thumbnailUrl: 'https://img.youtube.com/vi/rqoxYKtEWEc/maxresdefault.jpg',
  },

  // Creativity
  {
    youtubeId: 'nJPERZDfyWc',
    title: 'Where good ideas come from',
    channelTitle: 'TED',
    category: 'creativity',
    durationSeconds: 1020,
    topics: ['innovation', 'creativity', 'ideas', 'collaboration'],
    mood: 'learn',
    // Ferni voice: playful curiosity
    discussionPrompts: [
      "When was the last time an idea hit you out of nowhere?",
      "What gets your mind wandering in the best way?",
      "Who do you think with?",
    ],
    thumbnailUrl: 'https://img.youtube.com/vi/nJPERZDfyWc/maxresdefault.jpg',
  },

  // Philosophy
  {
    youtubeId: 'wHWbZmg2hzU',
    title: 'Why We Need to Be Lonely',
    channelTitle: 'The School of Life',
    category: 'philosophy',
    durationSeconds: 360,
    topics: ['loneliness', 'self-discovery', 'growth', 'solitude'],
    mood: 'reflect',
    // Ferni voice: thoughtful friend
    discussionPrompts: [
      "What do you discover when you're alone?",
      "What thoughts show up in the quiet?",
      "When does solitude feel like a gift vs. a punishment?",
    ],
    thumbnailUrl: 'https://img.youtube.com/vi/wHWbZmg2hzU/maxresdefault.jpg',
  },

  // More TED Talks
  {
    youtubeId: 'Lp7E973zozc',
    title: 'Your body language may shape who you are',
    channelTitle: 'TED',
    category: 'ted-talk',
    durationSeconds: 1260,
    topics: ['confidence', 'body-language', 'presence', 'psychology'],
    mood: 'inspire',
    // Ferni voice: practical exploration
    discussionPrompts: [
      "What does your body do when you're nervous?",
      "When have you surprised yourself by showing up bigger?",
      "What would change if you took up more space?",
    ],
    thumbnailUrl: 'https://img.youtube.com/vi/Lp7E973zozc/maxresdefault.jpg',
  },
  {
    youtubeId: '_J6-3l3hCm0',
    title: 'The happy secret to better work',
    channelTitle: 'TED',
    category: 'ted-talk',
    durationSeconds: 750,
    topics: ['happiness', 'productivity', 'mindset', 'success'],
    mood: 'inspire',
    // Ferni voice: light and curious
    discussionPrompts: [
      "Which comes first for you - happy or successful?",
      "What's one thing that genuinely lights you up?",
      "What if you've had it backwards this whole time?",
    ],
    thumbnailUrl: 'https://img.youtube.com/vi/_J6-3l3hCm0/maxresdefault.jpg',
  },
  {
    youtubeId: 'UF8uR6Z6KLc',
    title: 'The psychology of self-motivation',
    channelTitle: 'TEDx Talks',
    category: 'self-improvement',
    durationSeconds: 930,
    topics: ['motivation', 'psychology', 'goals', 'discipline'],
    mood: 'learn',
    // Ferni voice: supportive exploration
    discussionPrompts: [
      "What actually gets you moving?",
      "When does discipline feel good vs. grinding?",
      "What's the difference between your real goals and what you think you should want?",
    ],
    thumbnailUrl: 'https://img.youtube.com/vi/UF8uR6Z6KLc/maxresdefault.jpg',
  },

  // More Science
  {
    youtubeId: 'MBRqu0YOH14',
    title: 'Optimistic Nihilism',
    channelTitle: 'Kurzgesagt',
    category: 'philosophy',
    durationSeconds: 370,
    topics: ['meaning', 'nihilism', 'optimism', 'existence'],
    mood: 'reflect',
    // Ferni voice: existential but warm
    discussionPrompts: [
      "Does this freak you out or free you?",
      "If nothing matters, what would you choose to matter?",
      "What part made you feel something?",
    ],
    thumbnailUrl: 'https://img.youtube.com/vi/MBRqu0YOH14/maxresdefault.jpg',
  },
  {
    youtubeId: 'GoJsr4IwCm4',
    title: 'The Fermi Paradox — Where Are All The Aliens?',
    channelTitle: 'Kurzgesagt',
    category: 'science',
    durationSeconds: 370,
    topics: ['space', 'aliens', 'fermi-paradox', 'universe'],
    mood: 'learn',
    // Ferni voice: wonder
    discussionPrompts: [
      "What do you hope is out there?",
      "Which explanation feels most unsettling to you?",
      "How does looking up at the sky feel different now?",
    ],
    thumbnailUrl: 'https://img.youtube.com/vi/GoJsr4IwCm4/maxresdefault.jpg',
  },
  {
    youtubeId: 'rN7pkFNEg5c',
    title: 'What Is Consciousness?',
    channelTitle: 'Kurzgesagt',
    category: 'science',
    durationSeconds: 540,
    topics: ['consciousness', 'mind', 'brain', 'philosophy'],
    mood: 'learn',
    // Ferni voice: philosophical curiosity
    discussionPrompts: [
      "Does this make you question what 'you' even is?",
      "When do you feel most like yourself?",
      "What would it mean if you're not the narrator of your own story?",
    ],
    thumbnailUrl: 'https://img.youtube.com/vi/rN7pkFNEg5c/maxresdefault.jpg',
  },

  // More School of Life
  {
    youtubeId: 'jJ6K_f7oSdg',
    title: 'Why We Pick Difficult Partners',
    channelTitle: 'The School of Life',
    category: 'philosophy',
    durationSeconds: 300,
    topics: ['relationships', 'love', 'psychology', 'attachment'],
    mood: 'reflect',
    // Ferni voice: compassionate inquiry
    discussionPrompts: [
      "Did anything here hit uncomfortably close?",
      "What patterns keep showing up for you?",
      "Who taught you what love looks like?",
    ],
    thumbnailUrl: 'https://img.youtube.com/vi/jJ6K_f7oSdg/maxresdefault.jpg',
  },
  {
    youtubeId: 'GhHfQUlpj9o',
    title: 'What is Love?',
    channelTitle: 'The School of Life',
    category: 'philosophy',
    durationSeconds: 420,
    topics: ['love', 'relationships', 'philosophy', 'emotions'],
    mood: 'reflect',
    // Ferni voice: deep curiosity
    discussionPrompts: [
      "What did this stir up for you?",
      "How has what you want from love changed?",
      "What would you disagree with here?",
    ],
    thumbnailUrl: 'https://img.youtube.com/vi/GhHfQUlpj9o/maxresdefault.jpg',
  },

  // Documentary style
  {
    youtubeId: 'qPKd99Pa2iU',
    title: 'Inside the Mind of a Procrastinator',
    channelTitle: 'TED',
    category: 'ted-talk',
    durationSeconds: 840,
    topics: ['procrastination', 'productivity', 'psychology', 'humor'],
    mood: 'learn',
    // Ferni voice: playful recognition
    discussionPrompts: [
      "Okay, real talk - did you cringe at any part?",
      "What's been sitting on your to-do list the longest?",
      "What would actually get you to start?",
    ],
    thumbnailUrl: 'https://img.youtube.com/vi/qPKd99Pa2iU/maxresdefault.jpg',
  },

  // Health & Wellness
  {
    youtubeId: '5MuIMqhT8DM',
    title: 'Sleep is your superpower',
    channelTitle: 'TED',
    category: 'science',
    durationSeconds: 1170,
    topics: ['sleep', 'health', 'brain', 'wellness'],
    mood: 'learn',
    // Ferni voice: caring and practical
    discussionPrompts: [
      "How did you sleep last night, honestly?",
      "What gets in the way of rest for you?",
      "What's one thing you could try tonight?",
    ],
    thumbnailUrl: 'https://img.youtube.com/vi/5MuIMqhT8DM/maxresdefault.jpg',
  },

  // Chill / Music
  {
    youtubeId: 'lTRiuFIWV54',
    title: 'lofi hip hop radio - beats to relax/study to',
    channelTitle: 'Lofi Girl',
    category: 'music-video',
    durationSeconds: 3600,
    topics: ['relaxation', 'focus', 'music', 'ambiance'],
    mood: 'chill',
    // Ferni voice: present moment
    discussionPrompts: [
      "How are you feeling right now?",
      "What would make this moment better?",
      "What are you working on?",
    ],
    thumbnailUrl: 'https://img.youtube.com/vi/lTRiuFIWV54/maxresdefault.jpg',
  },
];

// ============================================================================
// VIDEO SERVICE
// ============================================================================

/**
 * Categories that are "utility" content - not growth/reflection focused
 * These are fine to surface in general browsing, but shouldn't be daily picks
 */
const UTILITY_CATEGORIES: VideoCategory[] = ['music-video', 'tutorial'];

/**
 * Get curated video recommendations based on user context
 */
export function getVideoRecommendations(
  userId: string,
  options: {
    mood?: 'learn' | 'chill' | 'inspire' | 'reflect';
    topic?: string;
    maxResults?: number;
    recentTopics?: string[];
    excludeUtilityContent?: boolean; // Exclude music-video, tutorial, etc.
  } = {}
): VideoRecommendation[] {
  const { mood, topic, maxResults = 5, recentTopics = [], excludeUtilityContent = false } = options;

  let videos = [...CURATED_VIDEOS];

  // Exclude utility content if requested (for daily picks)
  if (excludeUtilityContent) {
    videos = videos.filter((v) => !UTILITY_CATEGORIES.includes(v.category));
  }

  // Filter by mood if specified
  if (mood) {
    videos = videos.filter((v) => v.mood === mood);
  }

  // Filter by topic if specified
  if (topic) {
    const topicLower = topic.toLowerCase();
    videos = videos.filter(
      (v) =>
        v.topics.some((t) => t.toLowerCase().includes(topicLower)) ||
        v.title.toLowerCase().includes(topicLower)
    );
  }

  // Prioritize videos related to recent conversation topics
  if (recentTopics.length > 0) {
    videos.sort((a, b) => {
      const aRelevance = recentTopics.filter((t) =>
        a.topics.some((at) => at.toLowerCase().includes(t.toLowerCase()))
      ).length;
      const bRelevance = recentTopics.filter((t) =>
        b.topics.some((bt) => bt.toLowerCase().includes(t.toLowerCase()))
      ).length;
      return bRelevance - aRelevance;
    });
  }

  // Shuffle to add variety (Fisher-Yates)
  for (let i = videos.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [videos[i], videos[j]] = [videos[j], videos[i]];
  }

  // Take top results
  const selected = videos.slice(0, maxResults);

  // Convert to recommendations
  return selected.map((video) => ({
    video: curatedToYouTubeVideo(video),
    reason: getRecommendationReason(video, recentTopics),
    discussionPrompts: video.discussionPrompts,
    relevantTopic: recentTopics.find((t) =>
      video.topics.some((vt) => vt.toLowerCase().includes(t.toLowerCase()))
    ),
    mood: video.mood,
  }));
}

/**
 * Get video by ID
 */
export function getVideoById(videoId: string): YouTubeVideo | null {
  const curated = CURATED_VIDEOS.find((v) => v.youtubeId === videoId);
  if (curated) {
    return curatedToYouTubeVideo(curated);
  }
  return null;
}

/**
 * Get videos by category
 */
export function getVideosByCategory(
  category: VideoCategory,
  maxResults: number = 5
): YouTubeVideo[] {
  const videos = CURATED_VIDEOS.filter((v) => v.category === category).slice(0, maxResults);
  return videos.map(curatedToYouTubeVideo);
}

/**
 * Get daily video pick based on day of week and user preferences
 *
 * BRAND PRINCIPLE: Daily picks should be GROWTH content - things that
 * spark reflection, learning, or inspiration. Not utility content like
 * background music or ambient streams.
 */
export function getDailyVideoPick(
  userId: string,
  userPreferences?: {
    favoriteTopics?: string[];
    preferredDuration?: 'short' | 'medium' | 'long';
    mood?: 'learn' | 'chill' | 'inspire' | 'reflect';
  }
): VideoRecommendation | null {
  const dayOfWeek = new Date().getDay();

  // Different moods for different days
  const dailyMoods: Record<number, 'learn' | 'chill' | 'inspire' | 'reflect'> = {
    0: 'reflect', // Sunday - reflective
    1: 'learn', // Monday - learning
    2: 'inspire', // Tuesday - inspiration
    3: 'learn', // Wednesday - learning
    4: 'inspire', // Thursday - inspiration
    5: 'chill', // Friday - chill
    6: 'chill', // Saturday - chill
  };

  const mood = userPreferences?.mood || dailyMoods[dayOfWeek];

  // Get recommendations but EXCLUDE utility content
  // Daily picks should be growth content, not background noise
  const recommendations = getVideoRecommendations(userId, {
    mood,
    recentTopics: userPreferences?.favoriteTopics,
    maxResults: 5, // Get more to filter
    excludeUtilityContent: true, // Exclude music-video, tutorial, etc.
  });

  return recommendations[0] || null;
}

// ============================================================================
// WATCH SESSION MANAGEMENT
// ============================================================================

// In-memory store (would be Firestore in production)
const watchSessionStore = new Map<string, WatchSession[]>();

/**
 * Start a watch session
 */
export function startWatchSession(userId: string, videoId: string): WatchSession | null {
  const video = getVideoById(videoId);
  if (!video) {
    log.warn({ videoId }, '📺 Video not found for watch session');
    return null;
  }

  const session: WatchSession = {
    id: `watch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    video,
    startedAt: new Date().toISOString(),
    watchDurationSeconds: 0,
    percentWatched: 0,
  };

  const userSessions = watchSessionStore.get(userId) || [];
  userSessions.push(session);
  watchSessionStore.set(userId, userSessions);

  log.info({ userId, videoId: video.id, sessionId: session.id }, '📺 Watch session started');
  return session;
}

/**
 * Update watch progress
 */
export function updateWatchProgress(
  userId: string,
  sessionId: string,
  watchDurationSeconds: number
): WatchSession | null {
  const userSessions = watchSessionStore.get(userId);
  if (!userSessions) return null;

  const session = userSessions.find((s) => s.id === sessionId);
  if (!session) return null;

  session.watchDurationSeconds = watchDurationSeconds;
  session.percentWatched = Math.min(
    100,
    Math.round((watchDurationSeconds / session.video.durationSeconds) * 100)
  );

  return session;
}

/**
 * Complete a watch session
 */
export function completeWatchSession(userId: string, sessionId: string): WatchSession | null {
  const userSessions = watchSessionStore.get(userId);
  if (!userSessions) return null;

  const session = userSessions.find((s) => s.id === sessionId);
  if (!session) return null;

  session.completedAt = new Date().toISOString();
  session.percentWatched = 100;

  log.info({ userId, sessionId, videoTitle: session.video.title }, '📺 Watch session completed');
  return session;
}

/**
 * Start a discussion after watching
 */
export function startDiscussion(userId: string, sessionId: string): WatchSession | null {
  const userSessions = watchSessionStore.get(userId);
  if (!userSessions) return null;

  const session = userSessions.find((s) => s.id === sessionId);
  if (!session) return null;

  session.discussion = {
    startedAt: new Date().toISOString(),
    notes: [],
    insights: [],
  };

  return session;
}

/**
 * Add insight from discussion
 */
export function addDiscussionInsight(userId: string, sessionId: string, insight: string): boolean {
  const userSessions = watchSessionStore.get(userId);
  if (!userSessions) return false;

  const session = userSessions.find((s) => s.id === sessionId);
  if (!session || !session.discussion) return false;

  session.discussion.insights.push(insight);
  return true;
}

/**
 * Get user's watch history
 */
export function getWatchHistory(userId: string, limit: number = 20): WatchSession[] {
  const userSessions = watchSessionStore.get(userId) || [];
  return userSessions
    .filter((s) => s.completedAt)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
    .slice(0, limit);
}

/**
 * Get user's saved insights
 */
export function getSavedInsights(userId: string): Array<{
  videoTitle: string;
  insight: string;
  savedAt: string;
}> {
  const userSessions = watchSessionStore.get(userId) || [];
  const insights: Array<{ videoTitle: string; insight: string; savedAt: string }> = [];

  for (const session of userSessions) {
    if (session.discussion?.insights) {
      for (const insight of session.discussion.insights) {
        insights.push({
          videoTitle: session.video.title,
          insight,
          savedAt: session.discussion.startedAt,
        });
      }
    }
  }

  return insights.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
}

// ============================================================================
// HELPERS
// ============================================================================

function curatedToYouTubeVideo(curated: CuratedVideo): YouTubeVideo {
  return {
    id: curated.youtubeId,
    title: curated.title,
    description: '', // Would come from API
    channelId: '', // Would come from API
    channelTitle: curated.channelTitle,
    thumbnailUrl: curated.thumbnailUrl,
    duration: formatDuration(curated.durationSeconds),
    durationSeconds: curated.durationSeconds,
    publishedAt: '', // Would come from API
    viewCount: 0, // Would come from API
    likeCount: 0, // Would come from API
    category: curated.category,
    tags: curated.topics,
  };
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `PT${hours}H${minutes}M${secs}S`;
  }
  return `PT${minutes}M${secs}S`;
}

/**
 * Generate a recommendation reason that feels like a thoughtful friend
 *
 * BRAND PRINCIPLES:
 * - Never generic ("This is cool", "Check this out")
 * - Always intentional (why THIS video for THIS person)
 * - Ferni voice: warm, grounded, like someone who knows you
 */
function getRecommendationReason(video: CuratedVideo, recentTopics: string[]): string {
  // Find matching topic - use warm, friend-like language
  const matchingTopic = recentTopics.find((t) =>
    video.topics.some((vt) => vt.toLowerCase().includes(t.toLowerCase()))
  );

  if (matchingTopic) {
    const topicPhrases = [
      `This came to mind when you mentioned ${matchingTopic}.`,
      `Remember when we talked about ${matchingTopic}? Watch this.`,
      `Something about ${matchingTopic} that might land with you.`,
      `I keep thinking about what you said about ${matchingTopic}. This connects.`,
    ];
    return topicPhrases[Math.floor(Math.random() * topicPhrases.length)];
  }

  // Category-based reasons (intentional, not generic)
  const categoryReasons: Record<VideoCategory, string[]> = {
    'ted-talk': [
      'This talk stuck with me. Curious what you think.',
      'One of those talks that shifts how you see things.',
      "I've been sitting with this one. Worth your time.",
    ],
    documentary: ['I keep coming back to this one.', 'Worth the watch. Take your time with it.'],
    educational: ['This one made me pause and think.', 'You might find this useful.'],
    'music-video': [
      'Good for when you need to think.',
      'Background for wherever you are right now.',
    ],
    'podcast-clip': ['Caught this and thought of you.', 'A conversation worth eavesdropping on.'],
    tutorial: ['Practical. Might actually help.', 'Step by step, no fluff.'],
    inspiration: [
      'Needed this today. Maybe you do too.',
      "A little spark for what you're working on.",
    ],
    mindfulness: [
      'Take a breath with this one.',
      'For when you need to slow down.',
      'A quieter moment.',
    ],
    creativity: ['Gets the wheels turning.', "Fuel for what you're building."],
    science: ['This one expanded how I think about things.', 'Changes how you see the world.'],
    philosophy: [
      'One to sit with.',
      'Food for thought. No easy answers.',
      'Made me think. Might do the same for you.',
    ],
    'self-improvement': ['For your journey.', 'Small idea, big ripple.'],
  };

  const reasons = categoryReasons[video.category];
  return reasons[Math.floor(Math.random() * reasons.length)];
}

// ============================================================================
// YOUTUBE EMBED URL GENERATOR
// ============================================================================

/**
 * Get YouTube embed URL for iframe
 */
export function getYouTubeEmbedUrl(
  videoId: string,
  options: {
    autoplay?: boolean;
    startTime?: number;
    enableControls?: boolean;
  } = {}
): string {
  const { autoplay = false, startTime = 0, enableControls = true } = options;

  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    controls: enableControls ? '1' : '0',
    rel: '0', // Don't show related videos from other channels
    modestbranding: '1', // Less YouTube branding
  });

  if (startTime > 0) {
    params.set('start', String(startTime));
  }

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

/**
 * Get YouTube watch URL (for external linking)
 */
export function getYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
