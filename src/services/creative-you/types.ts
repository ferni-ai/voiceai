/**
 * Creative You - Type Definitions
 *
 * Types for the Creative You engagement system:
 * - Video discovery and watch together
 * - Podcast integration
 * - Learning journeys
 * - Creative DNA tracking
 *
 * @module CreativeYou
 */

// ============================================================================
// CREATIVE DNA
// ============================================================================

export interface CreativeDNA {
  userId: string;

  // Personality
  personalityType: CreativePersonalityType;
  personalityLabel: string;
  personalityDescription: string;

  // Interests
  topTopics: TopicInterest[];
  learningStyles: LearningStyle[];
  contentPreferences: ContentPreference[];

  // Behavioral traits
  traits: CreativeTrait[];

  // Consumption patterns
  avgWatchDuration: number; // minutes
  preferredContentLength: 'short' | 'medium' | 'long';
  peakLearningHours: number[];
  weeklyEngagementMinutes: number;

  // Journey
  totalVideosWatched: number;
  totalPodcastsListened: number;
  totalInsightsSaved: number;
  journeysCompleted: number;
  journeysInProgress: number;

  // Dates
  firstContentDate: Date | null;
  lastContentDate: Date | null;
  updatedAt: Date;
}

export type CreativePersonalityType =
  | 'curious-builder'
  | 'deep-diver'
  | 'practical-learner'
  | 'inspiration-seeker'
  | 'systematic-student'
  | 'social-learner'
  | 'creative-explorer'
  | 'wisdom-collector';

export interface TopicInterest {
  topic: string;
  displayName: string;
  interestScore: number; // 0-100
  contentConsumed: number;
  lastEngaged: Date;
  trend: 'growing' | 'stable' | 'cooling';
}

export interface LearningStyle {
  style: 'visual' | 'auditory' | 'reading' | 'kinesthetic';
  preference: number; // 0-100
  basedOn: string; // What data this was derived from
}

export interface ContentPreference {
  type: ContentType;
  preference: number; // 0-100
  avgCompletionRate: number;
}

export interface CreativeTrait {
  trait: CreativeTraitType;
  displayName: string;
  confidence: number;
  explanation: string;
}

export type CreativeTraitType =
  | 'voracious-learner'
  | 'depth-seeker'
  | 'breadth-explorer'
  | 'note-taker'
  | 'discusser'
  | 'implementer'
  | 'sharer'
  | 'collector'
  | 'consistent-learner'
  | 'binge-learner';

// ============================================================================
// VIDEO / WATCH TOGETHER
// ============================================================================

export type ContentType = 'video' | 'podcast' | 'article' | 'course' | 'short-form';

export interface VideoContent {
  id: string;
  source: 'youtube' | 'vimeo' | 'ted';
  sourceId: string; // Platform-specific ID

  // Metadata
  title: string;
  description: string;
  channelName: string;
  channelId: string;
  thumbnailUrl: string;
  duration: number; // seconds
  publishedAt: Date;

  // Categorization
  topics: string[];
  category: VideoCategory;
  difficulty: 'beginner' | 'intermediate' | 'advanced';

  // Engagement
  viewCount?: number;
  likeCount?: number;

  // Ferni-specific
  ferniRating?: number; // 0-5 curated quality
  ferniTags: string[];
  suitableFor: string[]; // Persona IDs
}

export type VideoCategory =
  | 'educational'
  | 'inspirational'
  | 'tutorial'
  | 'documentary'
  | 'interview'
  | 'music-video'
  | 'creative'
  | 'wellness';

export interface WatchSession {
  id: string;
  userId: string;
  videoId: string;
  video: VideoContent;

  // Session state
  status: 'watching' | 'paused' | 'completed' | 'abandoned';
  startedAt: Date;
  endedAt?: Date;
  watchDuration: number; // actual seconds watched
  completionPercentage: number;

  // Interaction
  savedMoments: SavedMoment[];
  ferniComments: FerniComment[];
  discussionPoints: string[];

  // Context
  personaId: string;
  mood?: string;
  conversationBefore?: string;
}

export interface SavedMoment {
  id: string;
  timestamp: number; // seconds into video
  note: string;
  savedAt: Date;
  highlighted: boolean;
}

export interface FerniComment {
  timestamp: number;
  comment: string;
  type: 'insight' | 'question' | 'connection' | 'encouragement';
}

export interface VideoRecommendation {
  video: VideoContent;
  reason: string;
  confidence: number;
  basedOn: 'conversation' | 'history' | 'topic' | 'mood' | 'journey';
  personaId: string;
}

// ============================================================================
// PODCASTS
// ============================================================================

export interface Podcast {
  id: string;
  source: 'spotify' | 'apple' | 'rss';
  sourceId: string;

  // Metadata
  title: string;
  description: string;
  author: string;
  imageUrl: string;
  website?: string;

  // Categorization
  topics: string[];
  style: PodcastStyle;
  avgEpisodeLength: number; // minutes

  // Ferni-specific
  ferniRating?: number;
  ferniTags: string[];
  episodeCount: number;
}

export type PodcastStyle =
  | 'interview'
  | 'narrative'
  | 'educational'
  | 'conversational'
  | 'news'
  | 'storytelling'
  | 'meditation';

export interface PodcastEpisode {
  id: string;
  podcastId: string;
  source: 'spotify' | 'apple' | 'rss';
  sourceId: string;

  // Metadata
  title: string;
  description: string;
  duration: number; // seconds
  publishedAt: Date;
  audioUrl?: string;

  // Ferni-specific
  summary?: string; // AI-generated summary
  keyTopics: string[];
  discussionPrompts: string[];
}

export interface PodcastListenSession {
  id: string;
  userId: string;
  episodeId: string;
  episode: PodcastEpisode;

  // Progress
  status: 'listening' | 'paused' | 'completed';
  currentPosition: number; // seconds
  completionPercentage: number;

  // Timestamps
  startedAt: Date;
  lastPlayedAt: Date;
  completedAt?: Date;

  // Notes
  savedClips: SavedClip[];
  discussedWith?: string; // Persona ID
}

export interface SavedClip {
  startTime: number;
  endTime: number;
  note: string;
  savedAt: Date;
}

export interface PodcastSubscription {
  userId: string;
  podcastId: string;
  podcast: Podcast;
  subscribedAt: Date;
  notificationsEnabled: boolean;
  episodesListened: number;
  lastListenedAt?: Date;
}

// ============================================================================
// LEARNING JOURNEYS
// ============================================================================

export interface LearningJourney {
  id: string;
  slug: string;

  // Metadata
  title: string;
  description: string;
  tagline: string;
  imageUrl: string;

  // Structure
  modules: JourneyModule[];
  totalDuration: number; // estimated minutes
  difficulty: 'beginner' | 'intermediate' | 'advanced';

  // Topics
  primaryTopic: string;
  topics: string[];
  outcomes: string[]; // What you'll learn

  // Ferni-specific
  guidedBy: string; // Primary persona ID
  contributors: string[]; // Other persona IDs

  // Stats
  enrollmentCount: number;
  completionRate: number;
  avgRating: number;
}

export interface JourneyModule {
  id: string;
  order: number;
  title: string;
  description: string;
  duration: number; // minutes

  // Content
  contentItems: JourneyContentItem[];

  // Reflection
  reflectionPrompts: string[];
  discussionQuestions: string[];
}

export interface JourneyContentItem {
  id: string;
  type: 'video' | 'podcast' | 'reading' | 'exercise' | 'discussion';
  title: string;
  description?: string;
  duration: number; // minutes

  // Content reference
  videoId?: string;
  podcastEpisodeId?: string;
  articleUrl?: string;
  exerciseInstructions?: string;
}

export interface UserJourneyProgress {
  userId: string;
  journeyId: string;

  // Status
  status: 'not-started' | 'in-progress' | 'completed' | 'paused';
  enrolledAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  lastActivityAt: Date;

  // Progress
  currentModuleIndex: number;
  currentItemIndex: number;
  completedItems: string[]; // Item IDs
  progressPercentage: number;

  // Engagement
  timeSpent: number; // minutes
  notesCount: number;
  discussionCount: number;

  // Reflection
  reflections: JourneyReflection[];
}

export interface JourneyReflection {
  moduleId: string;
  prompt: string;
  response: string;
  discussedWith: string; // Persona ID
  createdAt: Date;
}

// ============================================================================
// SAVED INSIGHTS
// ============================================================================

export interface SavedInsight {
  id: string;
  userId: string;

  // Content
  type: 'quote' | 'idea' | 'note' | 'highlight' | 'connection';
  content: string;
  source?: string;
  author?: string;

  // Context
  fromVideo?: string;
  fromPodcast?: string;
  fromJourney?: string;
  fromConversation?: string;

  // Organization
  topics: string[];
  isFavorite: boolean;

  // Timestamps
  savedAt: Date;
  lastReviewedAt?: Date;
}

export interface InsightCollection {
  userId: string;
  totalInsights: number;
  favoriteCount: number;
  byTopic: Record<string, number>;
  recentInsights: SavedInsight[];
  topQuotes: SavedInsight[];
}

// ============================================================================
// SHAREABLE CARDS - CREATIVE
// ============================================================================

export type CreativeCardType =
  | 'creative-profile'
  | 'learning-progress'
  | 'insight-collection'
  | 'journey-complete'
  | 'weekly-learning';

export interface CreativeProfileCardData {
  type: 'creative-profile';
  personalityLabel: string;
  personalityDescription: string;
  topTopics: Array<{ name: string; score: number }>;
  videosWatched: number;
  podcastsListened: number;
  insightsSaved: number;
}

export interface LearningProgressCardData {
  type: 'learning-progress';
  journeyTitle: string;
  progressPercentage: number;
  modulesCompleted: number;
  totalModules: number;
  timeSpent: number;
}

export interface InsightCollectionCardData {
  type: 'insight-collection';
  title: string; // e.g., "My Week in Ideas"
  quotes: Array<{
    content: string;
    author: string;
  }>;
  totalInsights: number;
  weekOf: Date;
}

export interface JourneyCompleteCardData {
  type: 'journey-complete';
  journeyTitle: string;
  completedAt: Date;
  timeSpent: number;
  keyTakeaway: string;
}

// ============================================================================
// CREATIVE GAMES
// ============================================================================

export interface QuoteThatSourceGame {
  rounds: QuoteThatSourceRound[];
  currentRound: number;
  score: number;
  correctAnswers: number;
}

export interface QuoteThatSourceRound {
  quote: string;
  correctAuthor: string;
  wrongAuthors: string[];
  category: 'business' | 'philosophy' | 'science' | 'arts' | 'general';
  difficulty: 'easy' | 'medium' | 'hard';
  funFact?: string;
}

export interface IdeaRemixGame {
  concept1: string;
  concept2: string;
  userCombination?: string;
  aiSuggestion?: string;
  discussionPoints: string[];
}

export interface ThirtySecondPitchGame {
  topic: string;
  learnedFrom?: string; // Video/podcast reference
  userPitch?: string;
  feedback?: string;
  score?: number;
}

// ============================================================================
// DAILY CHALLENGES - CREATIVE
// ============================================================================

export interface CreativeDailyChallenge {
  id: string;
  date: string;
  type: CreativeChallengeType;

  // Content
  title: string;
  description: string;
  instructions: string;

  // Challenge specifics
  videoId?: string;
  podcastEpisodeId?: string;
  discussionPrompt?: string;
  quoteChallenge?: QuoteThatSourceRound;

  // Rewards
  xpReward: number;
  streakBonus: boolean;
}

export type CreativeChallengeType =
  | 'watch-discuss'
  | 'podcast-challenge'
  | 'quote-game'
  | 'idea-remix'
  | 'pitch-practice'
  | 'learning-sprint'
  | 'insight-share';

// ============================================================================
// RECOMMENDATIONS ENGINE
// ============================================================================

export interface ContentRecommendation {
  id: string;
  type: 'video' | 'podcast' | 'journey';
  contentId: string;

  // Why recommended
  reason: string;
  confidence: number;
  basedOn: RecommendationSource;

  // Context
  mood?: string;
  recentTopics?: string[];
  timeOfDay?: string;
  availableMinutes?: number;

  // Persona
  suggestedBy: string; // Persona ID
  suggestedAt: Date;
}

export type RecommendationSource =
  | 'conversation' // Something they mentioned
  | 'watch-history' // Similar to what they watched
  | 'topic-interest' // Topic they're exploring
  | 'mood-based' // Current emotional state
  | 'journey-related' // Part of active journey
  | 'trending' // Popular with similar users
  | 'seasonal' // Timely content
  | 'persona-pick'; // Curated by persona
