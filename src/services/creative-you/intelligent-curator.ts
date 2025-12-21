/**
 * 🧠 Intelligent Content Curator
 *
 * Makes Creative You content recommendations intelligent based on:
 * - User conversation topics (from TopicTracker)
 * - Emotional patterns (from UserLearningEngine)
 * - User profile data
 * - Creative DNA evolution
 * - Time of day, day of week
 * - Conversation context
 *
 * ✨ "MORE THAN HUMAN" FEATURES:
 * - Connects content to conversations naturally
 * - Detects optimal mood for content
 * - Surfaces patterns the user might not notice
 * - Generates personalized learning tracks
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { UserProfile } from '../../types/user-profile.js';
import type { VideoCategory, VideoRecommendation, YouTubeVideo } from './youtube-integration.js';
import type { PodcastCategory, PodcastRecommendation, LearningTrack } from './podcast-discovery.js';
import type { CreativeDNA, LearningStyle } from './creative-dna.js';
import { CURATED_VIDEOS, getVideoRecommendations } from './youtube-integration.js';
import {
  CURATED_EPISODES,
  CURATED_PODCASTS,
  getPodcastRecommendations,
} from './podcast-discovery.js';
import { getCreativeDNA } from './creative-dna.js';
import {
  discoverVideosForTopic,
  discoveredToRecommendation,
  isYouTubeApiAvailable,
} from './youtube-api-client.js';
import {
  generateSuperhumanCopy,
  getMemoryEnhancedReasons,
  type PersonalizedCopyContext,
} from './better-than-human-memory.js';

const log = getLogger();

// Cache for superhuman memory lookups (per request)
let superhumanMemoryCache: Map<string, PersonalizedCopyContext> | null = null;

// ============================================================================
// TYPES
// ============================================================================

export interface UserContext {
  userId: string;
  profile?: UserProfile | null;
  recentTopics: string[];
  recentEmotions: Array<{ emotion: string; intensity: number }>;
  currentMood?: 'learn' | 'chill' | 'inspire' | 'reflect';
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: number; // 0 = Sunday
  conversationCount: number;
  lastConversationTopics?: string[];
}

export interface IntelligentRecommendation {
  content: VideoRecommendation | PodcastRecommendation;
  contentType: 'video' | 'podcast';
  relevanceScore: number;
  personalizedReason: string;
  connectionToConversations: string | null;
  suggestedTiming: 'now' | 'later' | 'weekend';
}

export interface GeneratedLearningTrack {
  id: string;
  title: string;
  description: string;
  episodes: Array<{
    type: 'video' | 'podcast';
    id: string;
    title: string;
    duration: number;
    reason: string;
  }>;
  totalDuration: number;
  basedOn: string[]; // Topics/interests that generated this
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedWeeks: number;
}

// ============================================================================
// TOPIC TO CONTENT MAPPING
// ============================================================================

/**
 * Maps conversation topics to content categories and keywords
 */
const TOPIC_TO_CONTENT_MAP: Record<
  string,
  {
    videoCategories: VideoCategory[];
    podcastCategories: PodcastCategory[];
    searchKeywords: string[];
    preferredMood: ('learn' | 'chill' | 'inspire' | 'reflect')[];
  }
> = {
  // Emotional/Personal topics
  anxiety: {
    videoCategories: ['mindfulness', 'self-improvement', 'ted-talk'],
    podcastCategories: ['mindfulness', 'psychology', 'self-improvement'],
    searchKeywords: ['anxiety', 'calm', 'stress', 'peace', 'breathing'],
    preferredMood: ['chill', 'reflect'],
  },
  stress: {
    videoCategories: ['mindfulness', 'self-improvement'],
    podcastCategories: ['mindfulness', 'health', 'psychology'],
    searchKeywords: ['stress', 'relaxation', 'burnout', 'balance'],
    preferredMood: ['chill', 'reflect'],
  },
  relationships: {
    videoCategories: ['ted-talk', 'philosophy'],
    podcastCategories: ['psychology', 'self-improvement'],
    searchKeywords: ['relationships', 'connection', 'communication', 'love'],
    preferredMood: ['reflect', 'learn'],
  },
  career: {
    videoCategories: ['ted-talk', 'self-improvement', 'tutorial'],
    podcastCategories: ['business', 'interview', 'self-improvement'],
    searchKeywords: ['career', 'leadership', 'success', 'work'],
    preferredMood: ['inspire', 'learn'],
  },
  productivity: {
    videoCategories: ['educational', 'self-improvement', 'tutorial'],
    podcastCategories: ['self-improvement', 'business', 'science'],
    searchKeywords: ['productivity', 'focus', 'habits', 'time management'],
    preferredMood: ['learn', 'inspire'],
  },
  creativity: {
    videoCategories: ['creativity', 'ted-talk', 'documentary'],
    podcastCategories: ['creativity', 'interview', 'storytelling'],
    searchKeywords: ['creativity', 'innovation', 'art', 'design'],
    preferredMood: ['inspire', 'learn'],
  },
  health: {
    videoCategories: ['educational', 'self-improvement'],
    podcastCategories: ['health', 'science'],
    searchKeywords: ['health', 'fitness', 'nutrition', 'sleep'],
    preferredMood: ['learn'],
  },
  finances: {
    videoCategories: ['educational', 'self-improvement'],
    podcastCategories: ['business', 'education'],
    searchKeywords: ['money', 'investing', 'financial', 'savings'],
    preferredMood: ['learn'],
  },
  purpose: {
    videoCategories: ['ted-talk', 'philosophy', 'inspiration'],
    podcastCategories: ['philosophy', 'self-improvement'],
    searchKeywords: ['purpose', 'meaning', 'life', 'fulfillment'],
    preferredMood: ['reflect', 'inspire'],
  },
  growth: {
    videoCategories: ['ted-talk', 'self-improvement', 'educational'],
    podcastCategories: ['self-improvement', 'psychology'],
    searchKeywords: ['growth', 'learning', 'potential', 'mindset'],
    preferredMood: ['inspire', 'learn'],
  },

  // Technical/Interest topics
  technology: {
    videoCategories: ['educational', 'documentary', 'tutorial'],
    podcastCategories: ['technology', 'science', 'education'],
    searchKeywords: ['technology', 'AI', 'innovation', 'future'],
    preferredMood: ['learn'],
  },
  science: {
    videoCategories: ['science', 'documentary', 'educational'],
    podcastCategories: ['science', 'education'],
    searchKeywords: ['science', 'research', 'discovery', 'nature'],
    preferredMood: ['learn'],
  },
  philosophy: {
    videoCategories: ['philosophy', 'ted-talk'],
    podcastCategories: ['philosophy', 'education'],
    searchKeywords: ['philosophy', 'ethics', 'existence', 'wisdom'],
    preferredMood: ['reflect', 'learn'],
  },
};

// ============================================================================
// INTELLIGENT CURATOR
// ============================================================================

/**
 * Main intelligent content curator class
 */
export class IntelligentContentCurator {
  private userContext: UserContext;

  constructor(context: UserContext) {
    this.userContext = context;
  }

  /**
   * Get personalized content recommendations
   */
  async getRecommendations(
    options: {
      count?: number;
      preferVideos?: boolean;
      preferPodcasts?: boolean;
      maxDuration?: number; // minutes
      includeFresh?: boolean; // Include fresh YouTube content
    } = {}
  ): Promise<IntelligentRecommendation[]> {
    const { count = 5, preferVideos, preferPodcasts, maxDuration, includeFresh = false } = options;

    const recommendations: IntelligentRecommendation[] = [];

    // 0. Preload "Better Than Human" memory for user's topics (fire-and-forget if fails)
    try {
      superhumanMemoryCache = await getMemoryEnhancedReasons(
        this.userContext.userId,
        this.userContext.recentTopics
      );
    } catch {
      superhumanMemoryCache = null;
    }

    // 1. Determine optimal mood based on context
    const optimalMood = this.determineOptimalMood();

    // 2. Get relevant content categories from recent topics
    const relevantCategories = this.getRelevantCategories();

    // 3. Get video recommendations if not preferring podcasts only
    if (!preferPodcasts) {
      const videos = this.getPersonalizedVideos(optimalMood, relevantCategories, maxDuration);
      for (const video of videos) {
        const { personalizedReason, connectionToConversations } =
          this.generatePersonalizedReasonWithMemory(video, 'video');
        recommendations.push({
          content: video,
          contentType: 'video',
          relevanceScore: this.calculateRelevanceScore(video, 'video'),
          personalizedReason,
          connectionToConversations,
          suggestedTiming: this.suggestTiming(video, 'video'),
        });
      }
    }

    // 4. Get podcast recommendations if not preferring videos only
    if (!preferVideos) {
      const podcasts = this.getPersonalizedPodcasts(optimalMood, relevantCategories, maxDuration);
      for (const podcast of podcasts) {
        const { personalizedReason, connectionToConversations } =
          this.generatePersonalizedReasonWithMemory(podcast, 'podcast');
        recommendations.push({
          content: podcast,
          contentType: 'podcast',
          relevanceScore: this.calculateRelevanceScore(podcast, 'podcast'),
          personalizedReason,
          connectionToConversations,
          suggestedTiming: this.suggestTiming(podcast, 'podcast'),
        });
      }
    }

    // 5. Optionally include fresh YouTube content
    if (includeFresh && !preferPodcasts) {
      const freshContent = await this.discoverFreshContent({
        topics: this.userContext.recentTopics,
        maxResults: 2,
      });
      recommendations.push(...freshContent);
    }

    // 6. Sort by relevance and return top results
    recommendations.sort((a, b) => b.relevanceScore - a.relevanceScore);

    log.info(
      {
        userId: this.userContext.userId,
        count: recommendations.length,
        optimalMood,
        topTopics: this.userContext.recentTopics.slice(0, 3),
        includedFresh: includeFresh,
      },
      '🧠 Generated intelligent recommendations'
    );

    return recommendations.slice(0, count);
  }

  /**
   * Generate a personalized learning track based on user interests
   */
  generatePersonalizedLearningTrack(): GeneratedLearningTrack | null {
    const { recentTopics, userId } = this.userContext;

    if (recentTopics.length === 0) {
      return null;
    }

    // Find the most discussed topic
    const primaryTopic = recentTopics[0];
    const mapping = TOPIC_TO_CONTENT_MAP[primaryTopic];

    if (!mapping) {
      return null;
    }

    // Collect relevant episodes
    const trackEpisodes: GeneratedLearningTrack['episodes'] = [];
    let totalDuration = 0;

    // Add relevant videos
    for (const video of CURATED_VIDEOS) {
      if (
        mapping.videoCategories.includes(video.category) ||
        video.topics.some((t) => mapping.searchKeywords.includes(t.toLowerCase()))
      ) {
        trackEpisodes.push({
          type: 'video',
          id: video.youtubeId,
          title: video.title,
          duration: Math.round(video.durationSeconds / 60),
          reason: `Explores ${video.topics.slice(0, 2).join(' and ')}`,
        });
        totalDuration += Math.round(video.durationSeconds / 60);

        if (trackEpisodes.length >= 3) break; // Limit videos per track
      }
    }

    // Add relevant podcast episodes
    for (const episode of CURATED_EPISODES) {
      const podcast = CURATED_PODCASTS.find((p) => p.id === episode.podcastId);
      if (
        (podcast && mapping.podcastCategories.includes(podcast.category)) ||
        episode.topics.some((t) => mapping.searchKeywords.includes(t.toLowerCase()))
      ) {
        trackEpisodes.push({
          type: 'podcast',
          id: episode.id,
          title: episode.title,
          duration: episode.durationMinutes,
          reason: episode.summary?.slice(0, 100) || episode.description,
        });
        totalDuration += episode.durationMinutes;

        if (trackEpisodes.filter((e) => e.type === 'podcast').length >= 4) break;
      }
    }

    if (trackEpisodes.length < 3) {
      return null; // Not enough content for a track
    }

    // Generate track metadata
    const track: GeneratedLearningTrack = {
      id: `dynamic-${primaryTopic}-${Date.now()}`,
      title: this.generateTrackTitle(primaryTopic),
      description: this.generateTrackDescription(primaryTopic, trackEpisodes.length),
      episodes: trackEpisodes,
      totalDuration,
      basedOn: recentTopics.slice(0, 3),
      difficulty: this.estimateDifficulty(trackEpisodes),
      estimatedWeeks: Math.ceil(totalDuration / 120), // ~2 hours per week
    };

    log.info(
      {
        userId,
        trackId: track.id,
        episodeCount: trackEpisodes.length,
        totalDuration,
        basedOn: track.basedOn,
      },
      '🎓 Generated personalized learning track'
    );

    return track;
  }

  /**
   * Discover fresh content from YouTube API (supplements curated content)
   */
  async discoverFreshContent(
    options: {
      topics?: string[];
      maxResults?: number;
    } = {}
  ): Promise<IntelligentRecommendation[]> {
    if (!isYouTubeApiAvailable()) {
      log.debug('YouTube API not available, using curated content only');
      return [];
    }

    const { topics = this.userContext.recentTopics, maxResults = 3 } = options;
    const recommendations: IntelligentRecommendation[] = [];

    // Try to discover content for each topic
    for (const topic of topics.slice(0, 2)) {
      // Limit to 2 topics to control API usage
      const discovered = await discoverVideosForTopic(topic, {
        maxResults: 2,
        trustedChannelsOnly: true, // Safety first
        minViews: 50000,
        durationFilter: 'medium',
      });

      for (const video of discovered) {
        const videoRec = discoveredToRecommendation(video, topic);
        recommendations.push({
          content: videoRec,
          contentType: 'video',
          relevanceScore: video.relevanceScore,
          personalizedReason: `Just found this while thinking about ${topic}. Had to share.`,
          connectionToConversations: `Remember when we talked about ${topic}? This feels connected.`,
          suggestedTiming: 'later',
        });
      }
    }

    return recommendations.slice(0, maxResults);
  }

  /**
   * Get content that connects to a specific conversation topic
   */
  getContentForTopic(topic: string): IntelligentRecommendation[] {
    const mapping = TOPIC_TO_CONTENT_MAP[topic.toLowerCase()];
    const recommendations: IntelligentRecommendation[] = [];

    if (!mapping) {
      // Fallback: search all content by keyword
      return this.searchByKeyword(topic);
    }

    // Get videos matching this topic
    const matchingVideos = CURATED_VIDEOS.filter(
      (v) =>
        mapping.videoCategories.includes(v.category) ||
        v.topics.some((t) => mapping.searchKeywords.includes(t.toLowerCase()))
    ).slice(0, 3);

    for (const video of matchingVideos) {
      const videoRec: VideoRecommendation = {
        video: {
          id: video.youtubeId,
          title: video.title,
          description: '',
          channelId: '',
          channelTitle: video.channelTitle,
          thumbnailUrl: video.thumbnailUrl,
          duration: '',
          durationSeconds: video.durationSeconds,
          publishedAt: '',
          viewCount: 0,
          likeCount: 0,
          category: video.category,
          tags: video.topics,
        },
        reason: `This made me think of what you said about ${topic}.`,
        discussionPrompts: video.discussionPrompts,
        relevantTopic: topic,
        mood: video.mood,
      };

      recommendations.push({
        content: videoRec,
        contentType: 'video',
        relevanceScore: 0.9, // High relevance since it's topic-specific
        personalizedReason: `This made me think of what you said about ${topic}.`,
        connectionToConversations: `Remember when ${topic} came up? This feels like the next piece.`,
        suggestedTiming: 'now',
      });
    }

    return recommendations;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private determineOptimalMood(): 'learn' | 'chill' | 'inspire' | 'reflect' {
    const { timeOfDay, dayOfWeek, recentEmotions, currentMood } = this.userContext;

    // If explicitly set, use that
    if (currentMood) return currentMood;

    // Check recent emotions
    if (recentEmotions.length > 0) {
      const avgEmotion = recentEmotions[0];
      if (['sad', 'anxious', 'stressed'].includes(avgEmotion.emotion)) {
        return 'chill';
      }
      if (['frustrated', 'confused'].includes(avgEmotion.emotion)) {
        return 'inspire';
      }
      if (['curious', 'excited'].includes(avgEmotion.emotion)) {
        return 'learn';
      }
    }

    // Time-based defaults
    if (timeOfDay === 'morning') return 'inspire';
    if (timeOfDay === 'night') return 'reflect';
    if (dayOfWeek === 0 || dayOfWeek === 6) return 'chill'; // Weekend

    return 'learn'; // Default workday
  }

  private getRelevantCategories(): {
    videoCategories: VideoCategory[];
    podcastCategories: PodcastCategory[];
  } {
    const videoCategories = new Set<VideoCategory>();
    const podcastCategories = new Set<PodcastCategory>();

    for (const topic of this.userContext.recentTopics) {
      const mapping = TOPIC_TO_CONTENT_MAP[topic.toLowerCase()];
      if (mapping) {
        mapping.videoCategories.forEach((c) => videoCategories.add(c));
        mapping.podcastCategories.forEach((c) => podcastCategories.add(c));
      }
    }

    // Add defaults if empty
    if (videoCategories.size === 0) {
      videoCategories.add('ted-talk');
      videoCategories.add('educational');
    }
    if (podcastCategories.size === 0) {
      podcastCategories.add('self-improvement');
      podcastCategories.add('psychology');
    }

    return {
      videoCategories: Array.from(videoCategories),
      podcastCategories: Array.from(podcastCategories),
    };
  }

  private getPersonalizedVideos(
    mood: 'learn' | 'chill' | 'inspire' | 'reflect',
    categories: { videoCategories: VideoCategory[] },
    maxDuration?: number
  ): VideoRecommendation[] {
    return getVideoRecommendations(this.userContext.userId, {
      mood,
      recentTopics: this.userContext.recentTopics,
      maxResults: 5,
    });
  }

  private getPersonalizedPodcasts(
    mood: 'learn' | 'chill' | 'inspire' | 'reflect',
    categories: { podcastCategories: PodcastCategory[] },
    maxDuration?: number
  ): PodcastRecommendation[] {
    return getPodcastRecommendations(this.userContext.userId, {
      mood,
      recentTopics: this.userContext.recentTopics,
      maxResults: 5,
      maxDuration,
    });
  }

  private calculateRelevanceScore(
    content: VideoRecommendation | PodcastRecommendation,
    type: 'video' | 'podcast'
  ): number {
    let score = 0.5; // Base score

    // Topic match bonus
    const contentTopics =
      type === 'video'
        ? (content as VideoRecommendation).video.tags
        : (content as PodcastRecommendation).episode.topics;

    for (const topic of this.userContext.recentTopics) {
      if (contentTopics.some((t) => t.toLowerCase().includes(topic.toLowerCase()))) {
        score += 0.15;
      }
    }

    // Mood match bonus
    if (content.mood === this.determineOptimalMood()) {
      score += 0.1;
    }

    // Recency penalty (don't recommend same content)
    // TODO: Check watch history

    return Math.min(score, 1.0);
  }

  /**
   * Generate personalized reason WITH superhuman memory integration
   * Uses the Better Than Human memory system for specific time references
   */
  private generatePersonalizedReasonWithMemory(
    content: VideoRecommendation | PodcastRecommendation,
    type: 'video' | 'podcast'
  ): { personalizedReason: string; connectionToConversations: string | null } {
    const contentTopics =
      type === 'video'
        ? (content as VideoRecommendation).video.tags
        : (content as PodcastRecommendation).episode.topics;

    // Find matching recent topic
    const matchingTopic = this.userContext.recentTopics.find((topic) =>
      contentTopics.some((t) => t.toLowerCase().includes(topic.toLowerCase()))
    );

    // Try to get superhuman memory for this topic
    if (matchingTopic && superhumanMemoryCache) {
      const memoryContext = superhumanMemoryCache.get(matchingTopic.toLowerCase());
      if (memoryContext && memoryContext.superhumanTouch) {
        // We have specific memory! Use it.
        return {
          personalizedReason: memoryContext.personalizedReason,
          connectionToConversations: memoryContext.connectionToConversations,
        };
      }
    }

    // Fallback to non-memory personalized reason
    const personalizedReason = this.generatePersonalizedReason(content, type);
    const connectionToConversations = this.findConversationConnection(content, type);

    return { personalizedReason, connectionToConversations };
  }

  private generatePersonalizedReason(
    content: VideoRecommendation | PodcastRecommendation,
    type: 'video' | 'podcast'
  ): string {
    const contentTopics =
      type === 'video'
        ? (content as VideoRecommendation).video.tags
        : (content as PodcastRecommendation).episode.topics;

    // Find matching recent topic
    const matchingTopic = this.userContext.recentTopics.find((topic) =>
      contentTopics.some((t) => t.toLowerCase().includes(topic.toLowerCase()))
    );

    // Brand-compliant copy - sounds like a friend, not an algorithm
    if (matchingTopic) {
      const topicPhrases = [
        `Remember when we talked about ${matchingTopic}? This made me think of you.`,
        `This reminded me of what you said about ${matchingTopic}.`,
        `You've been on my mind since we talked about ${matchingTopic}.`,
        `I keep coming back to what you shared about ${matchingTopic}. This feels connected.`,
      ];
      return topicPhrases[Math.floor(Math.random() * topicPhrases.length)];
    }

    // Time-based reason (warm, not clinical)
    const { timeOfDay, conversationCount } = this.userContext;
    if (timeOfDay === 'morning' && content.mood === 'inspire') {
      return 'Something to spark your morning.';
    }
    if (timeOfDay === 'night' && content.mood === 'reflect') {
      return "It's late. Something quieter for your evening.";
    }
    if (timeOfDay === 'night' && content.mood === 'learn') {
      return "Night owl mode? I've got something good.";
    }
    if (timeOfDay === 'afternoon' && content.mood === 'chill') {
      return 'Afternoon slump? This might help.';
    }

    // Relationship depth (Better Than Human - we track history)
    if (conversationCount > 10) {
      const deepPhrases = [
        "I've noticed you keep exploring ideas like this. There's a reason...",
        "After everything we've talked about, this felt right.",
        "This connects to something I've been wanting to share with you.",
      ];
      return deepPhrases[Math.floor(Math.random() * deepPhrases.length)];
    }

    // Warm fallback - never generic
    const warmFallbacks = [
      'Something that made me think of you.',
      "I found this and thought you'd appreciate it.",
      'This landed with me. Curious what you think.',
    ];
    return warmFallbacks[Math.floor(Math.random() * warmFallbacks.length)];
  }

  private findConversationConnection(
    content: VideoRecommendation | PodcastRecommendation,
    type: 'video' | 'podcast'
  ): string | null {
    const contentTopics =
      type === 'video'
        ? (content as VideoRecommendation).video.tags
        : (content as PodcastRecommendation).episode.topics;

    for (const topic of this.userContext.recentTopics) {
      if (contentTopics.some((t) => t.toLowerCase().includes(topic.toLowerCase()))) {
        // Check if we have superhuman memory for more specific connection
        if (superhumanMemoryCache) {
          const memoryContext = superhumanMemoryCache.get(topic.toLowerCase());
          if (memoryContext?.connectionToConversations) {
            return memoryContext.connectionToConversations;
          }
        }
        // Fallback to generic but still warm
        return `Remember when ${topic} came up? This feels like the next piece.`;
      }
    }

    return null;
  }

  private suggestTiming(
    content: VideoRecommendation | PodcastRecommendation,
    type: 'video' | 'podcast'
  ): 'now' | 'later' | 'weekend' {
    const duration =
      type === 'video'
        ? (content as VideoRecommendation).video.durationSeconds / 60
        : (content as PodcastRecommendation).episode.duration / 60;

    const { timeOfDay, dayOfWeek } = this.userContext;

    // Short content = now
    if (duration < 15) return 'now';

    // Long content on weekday evening = weekend
    if (duration > 45 && dayOfWeek >= 1 && dayOfWeek <= 5 && timeOfDay === 'evening') {
      return 'weekend';
    }

    // Medium content = later
    if (duration > 30) return 'later';

    return 'now';
  }

  private searchByKeyword(keyword: string): IntelligentRecommendation[] {
    const recommendations: IntelligentRecommendation[] = [];
    const lowerKeyword = keyword.toLowerCase();

    // Search videos
    const matchingVideos = CURATED_VIDEOS.filter(
      (v) =>
        v.title.toLowerCase().includes(lowerKeyword) ||
        v.topics.some((t) => t.toLowerCase().includes(lowerKeyword))
    );

    for (const video of matchingVideos.slice(0, 2)) {
      const videoRec: VideoRecommendation = {
        video: {
          id: video.youtubeId,
          title: video.title,
          description: '',
          channelId: '',
          channelTitle: video.channelTitle,
          thumbnailUrl: video.thumbnailUrl,
          duration: '',
          durationSeconds: video.durationSeconds,
          publishedAt: '',
          viewCount: 0,
          likeCount: 0,
          category: video.category,
          tags: video.topics,
        },
        reason: `You've been exploring ${keyword}. This feels connected.`,
        discussionPrompts: video.discussionPrompts,
        mood: video.mood,
      };

      recommendations.push({
        content: videoRec,
        contentType: 'video',
        relevanceScore: 0.7,
        personalizedReason: `Something about ${keyword} that might land with you.`,
        connectionToConversations: null,
        suggestedTiming: 'now',
      });
    }

    return recommendations;
  }

  private generateTrackTitle(topic: string): string {
    const titles: Record<string, string> = {
      anxiety: 'Finding Calm: Your Peace Journey',
      stress: 'Stress Less, Live More',
      productivity: 'Peak Performance Path',
      creativity: 'Unlock Your Creative Mind',
      relationships: 'Building Deeper Connections',
      career: 'Career Catalyst',
      health: 'Wellness Foundations',
      purpose: 'Discovering Your Why',
      growth: 'The Growth Mindset Journey',
      philosophy: 'Big Questions, Deep Thinking',
    };

    return titles[topic] || `Exploring ${topic.charAt(0).toUpperCase() + topic.slice(1)}`;
  }

  private generateTrackDescription(topic: string, episodeCount: number): string {
    return `A ${episodeCount}-part journey I put together after what we talked about. ${topic.charAt(0).toUpperCase() + topic.slice(1)} keeps coming up - there's something there.`;
  }

  private estimateDifficulty(
    episodes: GeneratedLearningTrack['episodes']
  ): 'beginner' | 'intermediate' | 'advanced' {
    // Simple heuristic based on content
    const hasPhilosophy = episodes.some((e) => e.title.toLowerCase().includes('philosophy'));
    const hasScience = episodes.some((e) => e.title.toLowerCase().includes('neuroscience'));

    if (hasPhilosophy && hasScience) return 'advanced';
    if (hasPhilosophy || hasScience) return 'intermediate';
    return 'beginner';
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create an intelligent curator from user context
 */
export function createIntelligentCurator(
  userId: string,
  options: {
    profile?: UserProfile | null;
    recentTopics?: string[];
    recentEmotions?: Array<{ emotion: string; intensity: number }>;
    currentMood?: 'learn' | 'chill' | 'inspire' | 'reflect';
  } = {}
): IntelligentContentCurator {
  const now = new Date();
  const hour = now.getHours();

  let timeOfDay: UserContext['timeOfDay'];
  if (hour >= 5 && hour < 12) timeOfDay = 'morning';
  else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
  else timeOfDay = 'night';

  const context: UserContext = {
    userId,
    profile: options.profile,
    recentTopics: options.recentTopics || [],
    recentEmotions: options.recentEmotions || [],
    currentMood: options.currentMood,
    timeOfDay,
    dayOfWeek: now.getDay(),
    conversationCount: 0, // Would come from profile
  };

  return new IntelligentContentCurator(context);
}

/**
 * Get intelligent recommendations for a user
 */
export async function getIntelligentRecommendations(
  userId: string,
  recentTopics: string[],
  options: {
    count?: number;
    mood?: 'learn' | 'chill' | 'inspire' | 'reflect';
    preferVideos?: boolean;
    preferPodcasts?: boolean;
  } = {}
): Promise<IntelligentRecommendation[]> {
  const curator = createIntelligentCurator(userId, {
    recentTopics,
    currentMood: options.mood,
  });

  return curator.getRecommendations({
    count: options.count,
    preferVideos: options.preferVideos,
    preferPodcasts: options.preferPodcasts,
  });
}

/**
 * Generate a personalized learning track for a user
 */
export function generateLearningTrackForUser(
  userId: string,
  recentTopics: string[]
): GeneratedLearningTrack | null {
  const curator = createIntelligentCurator(userId, { recentTopics });
  return curator.generatePersonalizedLearningTrack();
}

// Re-export for convenience
export { CURATED_VIDEOS } from './youtube-integration.js';
export { CURATED_EPISODES, CURATED_PODCASTS } from './podcast-discovery.js';
