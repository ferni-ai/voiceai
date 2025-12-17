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

// Types (from types.ts)
export * from './types.js';
