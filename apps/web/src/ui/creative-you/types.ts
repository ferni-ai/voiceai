/**
 * Creative You - Type Definitions
 *
 * Shared types for all Creative You UI components.
 */

export interface VideoRecommendation {
  video: {
    id: string;
    title: string;
    channelTitle: string;
    thumbnailUrl: string;
    durationSeconds: number;
  };
  reason: string;
  discussionPrompts: string[];
  mood: 'learn' | 'chill' | 'inspire' | 'reflect';
  /** Superhuman touch - the "Better Than Human" detail */
  superhumanTouch?: string | null;
}

export interface PodcastRecommendation {
  episode: {
    id: string;
    title: string;
    podcastTitle: string;
    summary?: string;
    duration: number;
  };
  reason: string;
  estimatedListenTime: string;
  mood: 'learn' | 'chill' | 'inspire' | 'reflect';
  /** Superhuman touch - the "Better Than Human" detail */
  superhumanTouch?: string | null;
}

export interface CreativeDNA {
  personalityLabel: string;
  personalityDescription: string;
  topTopics: Array<{ topic: string; score: number }>;
  totalVideosWatched: number;
  totalPodcastsListened: number;
  totalInsightsSaved: number;
  learningStyle: string;
}

export interface LearningTrack {
  id: string;
  title: string;
  description: string;
  totalDuration: number;
  episodes: Array<{
    id: string;
    title: string;
    podcastTitle?: string;
    duration?: number;
  }>;
}

export interface IntelligentRecommendation {
  content: VideoRecommendation | PodcastRecommendation;
  contentType: 'video' | 'podcast';
  relevanceScore: number;
  personalizedReason: string;
  connectionToConversations: string | null;
  suggestedTiming: 'now' | 'later' | 'weekend';
  /** Superhuman touch - the "Better Than Human" detail */
  superhumanTouch?: string | null;
}

export type ContentMood = 'learn' | 'chill' | 'inspire' | 'reflect';

