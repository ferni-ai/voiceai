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
const CURATED_VIDEOS: CuratedVideo[] = [
  // TED Talks - Inspiration
  {
    youtubeId: 'H14bBuluwB8',
    title: 'Do schools kill creativity?',
    channelTitle: 'TED',
    category: 'ted-talk',
    durationSeconds: 1140,
    topics: ['creativity', 'education', 'potential'],
    mood: 'inspire',
    discussionPrompts: [
      'When did you feel most creative as a child?',
      'Has school or work ever stifled your creativity?',
      'What would you create if you had no fear of failure?',
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
    discussionPrompts: [
      'When has being vulnerable led to deeper connection?',
      "What's something you've been afraid to share?",
      'How do you define courage in your own life?',
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
    discussionPrompts: [
      "What's your 'why' - what gets you out of bed?",
      'Who has inspired you with their leadership?',
      'How do you communicate your purpose to others?',
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
    discussionPrompts: [
      'What does this video change about how you see reality?',
      "What's the most mind-blowing scientific concept you know?",
      'How comfortable are you with uncertainty?',
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
    discussionPrompts: [
      'How does this perspective change how you treat others?',
      'What do you believe happens after death?',
      'If this story were true, what would you do differently?',
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
    discussionPrompts: [
      "What's one thing you've been putting off?",
      'What excuses do you make most often?',
      'What would 5-second courage look like for you?',
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
    discussionPrompts: [
      'How do you currently handle emotional pain?',
      "What's a failure you've been ruminating on?",
      'How can you be kinder to yourself this week?',
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
    discussionPrompts: [
      'Where do your best ideas come from?',
      'How do you create space for creative thinking?',
      'Who do you collaborate with on ideas?',
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
    discussionPrompts: [
      'When have you found value in being alone?',
      'What do you avoid thinking about when alone?',
      'How can solitude help you grow?',
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
    discussionPrompts: [
      'How does your posture change when you feel confident?',
      'When have you "faked it til you made it"?',
      'What power pose could you try before your next challenge?',
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
    discussionPrompts: [
      'Do you believe happiness leads to success, or vice versa?',
      'What makes you genuinely happy at work?',
      'How could you practice gratitude daily?',
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
    discussionPrompts: [
      'What motivates you intrinsically vs extrinsically?',
      'How do you stay motivated when things get hard?',
      'What goal have you achieved through pure discipline?',
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
    discussionPrompts: [
      'Does the vastness of the universe make you feel small or free?',
      'How do you create meaning in your life?',
      'What would you do if nothing really mattered?',
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
    discussionPrompts: [
      'Do you believe we are alone in the universe?',
      'What explanation for the Fermi Paradox seems most likely to you?',
      'How would confirmed alien life change your worldview?',
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
    discussionPrompts: [
      'What is the relationship between your brain and your mind?',
      'Do you think AI could ever be conscious?',
      'When do you feel most present and aware?',
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
    discussionPrompts: [
      'Do you recognize any patterns in your relationship choices?',
      'What role did your childhood play in your attachment style?',
      'How could self-awareness improve your relationships?',
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
    discussionPrompts: [
      'How has your definition of love changed over time?',
      'What is the most important element of love to you?',
      'How do you express love to others?',
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
    discussionPrompts: [
      'Which procrastination monkey do you relate to most?',
      'What do you procrastinate on the most?',
      "What's your panic monster moment been?",
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
    discussionPrompts: [
      'How many hours of sleep do you typically get?',
      'What prevents you from getting better sleep?',
      'What sleep habit could you change starting tonight?',
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
    discussionPrompts: [
      'What music helps you focus best?',
      'Where is your ideal place to work or think?',
      'How does music affect your mood?',
    ],
    thumbnailUrl: 'https://img.youtube.com/vi/lTRiuFIWV54/maxresdefault.jpg',
  },
];

// ============================================================================
// VIDEO SERVICE
// ============================================================================

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
  } = {}
): VideoRecommendation[] {
  const { mood, topic, maxResults = 5, recentTopics = [] } = options;

  let videos = [...CURATED_VIDEOS];

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
  const videos = CURATED_VIDEOS.filter((v) => v.category === category).slice(
    0,
    maxResults
  );
  return videos.map(curatedToYouTubeVideo);
}

/**
 * Get daily video pick based on day of week and user preferences
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

  const recommendations = getVideoRecommendations(userId, {
    mood,
    recentTopics: userPreferences?.favoriteTopics,
    maxResults: 1,
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
export function startWatchSession(
  userId: string,
  videoId: string
): WatchSession | null {
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
export function completeWatchSession(
  userId: string,
  sessionId: string
): WatchSession | null {
  const userSessions = watchSessionStore.get(userId);
  if (!userSessions) return null;

  const session = userSessions.find((s) => s.id === sessionId);
  if (!session) return null;

  session.completedAt = new Date().toISOString();
  session.percentWatched = 100;

  log.info(
    { userId, sessionId, videoTitle: session.video.title },
    '📺 Watch session completed'
  );
  return session;
}

/**
 * Start a discussion after watching
 */
export function startDiscussion(
  userId: string,
  sessionId: string
): WatchSession | null {
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
export function addDiscussionInsight(
  userId: string,
  sessionId: string,
  insight: string
): boolean {
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
export function getWatchHistory(
  userId: string,
  limit: number = 20
): WatchSession[] {
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

  return insights.sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  );
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

function getRecommendationReason(
  video: CuratedVideo,
  recentTopics: string[]
): string {
  // Find matching topic
  const matchingTopic = recentTopics.find((t) =>
    video.topics.some((vt) => vt.toLowerCase().includes(t.toLowerCase()))
  );

  if (matchingTopic) {
    return `Based on your interest in ${matchingTopic}`;
  }

  // Category-based reasons
  const categoryReasons: Record<VideoCategory, string[]> = {
    'ted-talk': [
      'A thought-provoking TED talk for you',
      'This talk might shift your perspective',
    ],
    documentary: ['A fascinating documentary to explore'],
    educational: ['Something interesting to learn today'],
    'music-video': ['Some music to set the mood'],
    'podcast-clip': ['A great conversation clip'],
    tutorial: ['A helpful tutorial you might enjoy'],
    inspiration: ['Some inspiration for your day'],
    mindfulness: ['A mindful moment for you'],
    creativity: ['Fuel for your creative mind'],
    science: ['Expand your understanding'],
    philosophy: ['Food for thought'],
    'self-improvement': ['Something to help you grow'],
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

