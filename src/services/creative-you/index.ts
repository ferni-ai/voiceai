/**
 * 🎨 Creative You Service Index
 *
 * Export all Creative You services:
 * - YouTube integration
 * - Podcast discovery
 * - Creative DNA tracking
 */

// YouTube Integration
export {
  getVideoRecommendations,
  getVideoById,
  getVideosByCategory,
  getDailyVideoPick,
  startWatchSession,
  updateWatchProgress,
  completeWatchSession,
  startDiscussion,
  addDiscussionInsight,
  getWatchHistory,
  getSavedInsights,
  getYouTubeEmbedUrl,
  getYouTubeWatchUrl,
  type YouTubeVideo,
  type VideoCategory,
  type VideoRecommendation,
  type WatchSession,
  type VideoSearchOptions,
} from './youtube-integration.js';

// Podcast Discovery
export {
  getPodcastRecommendations,
  getPodcastById,
  getEpisodeById,
  getDailyPodcastPick,
  getPodcastsByCategory,
  getLearningTracks,
  getLearningTrackById,
  type Podcast,
  type PodcastEpisode,
  type PodcastCategory,
  type PodcastRecommendation,
  type LearningTrack,
} from './podcast-discovery.js';

// Creative DNA
export {
  getCreativeDNA,
  updateCreativeDNA,
  saveInsight,
  getInsights,
  deleteInsight,
  getCreativeJourneyStats,
  getCreativeProfileCardData,
  type CreativeDNA,
  type LearningStyle,
  type EngagementPattern,
  type CreativeInsight,
  type CreativeJourneyStats,
  type CreativeProfileCardData,
} from './creative-dna.js';

// Intelligent Curator (AI-powered recommendations)
export {
  IntelligentContentCurator,
  createIntelligentCurator,
  getIntelligentRecommendations,
  generateLearningTrackForUser,
  type UserContext,
  type IntelligentRecommendation,
  type GeneratedLearningTrack,
} from './intelligent-curator.js';

// Curated Content (for direct access)
export { CURATED_VIDEOS } from './youtube-integration.js';
export { CURATED_PODCASTS, CURATED_EPISODES } from './podcast-discovery.js';

// YouTube API (Live Content Discovery)
export {
  discoverVideosForTopic,
  discoveredToRecommendation,
  searchYouTubeVideos,
  isYouTubeApiAvailable,
  clearYouTubeCache,
  TRUSTED_CHANNELS,
  TOPIC_SEARCH_QUERIES,
} from './youtube-api-client.js';

// Conversation Integration (connects talk → content)
export {
  recordConversationTopics,
  getUserTopTopics,
  getTopicFrequency,
  shouldSuggestContent,
  getEndOfConversationSuggestion,
  getPersonalizedCreativeYouContent,
  type ConversationContentContext,
  type ContentSuggestion,
} from './conversation-integration.js';

// Better Than Human Memory (superhuman recall)
export {
  getSuperhumanMemoryContext,
  generateSuperhumanCopy,
  getMemoryEnhancedReasons,
  type SuperhumanMemoryContext,
  type PersonalizedCopyContext,
} from './better-than-human-memory.js';

// Identity Card Generator (shareable Creative DNA cards)
export {
  generateIdentityCardData,
  generateIdentityCardHTML,
  generateShareableCardData,
  parseShareableCardData,
  generateOGMetaTags,
  getPersonalityStyles,
  type IdentityCardData,
  type IdentityCardStyles,
} from './identity-card-generator.js';

// Types (from types.ts)
export * from './types.js';
