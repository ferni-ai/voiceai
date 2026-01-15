/**
 * Meaningful Silence System - Type Definitions
 *
 * Types for the meaningful silence response system.
 */

import type {
  QuestionContext,
  GeneratedQuestion,
} from '../../intelligence/coaching/dynamic-questions.js';

// ============================================================================
// CONTEXT TYPES
// ============================================================================

/**
 * Context for generating meaningful silence responses
 */
export interface SilenceContext {
  /** How many seconds of silence */
  silenceDurationSeconds: number;
  /** Turn count in the conversation */
  turnCount: number;
  /** Topics discussed this session */
  topicsDiscussed: string[];
  /** Last thing the user said (to reference back) */
  lastUserMessage?: string;
  /** Last thing the agent said */
  lastAgentMessage?: string;
  /** Emotional tone of recent conversation */
  recentEmotionalTone?: 'heavy' | 'light' | 'neutral';
  /** User's name if known */
  userName?: string;
  /** Were we in the middle of something? */
  wasDiscussingTopic?: string;
  /** Key moments or details the user shared */
  memorableMoments?: string[];
  /** Current hour (0-23) for time-aware responses */
  currentHour?: number;
  /** Is it a weekend? */
  isWeekend?: boolean;
  /** How many silence responses have we already given? */
  silenceResponseCount?: number;
  /** 🎮 Is a game currently active? If so, silence means "thinking" not "disengaged" */
  isGameActive?: boolean;
  /** 🎮 What game type is active? */
  activeGameType?: string;
  /** Session ID for usage tracking (avoids repetition) */
  sessionId?: string;
  /** 🎵 Is music currently playing? */
  isMusicPlaying?: boolean;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Types of silence responses
 */
export type SilenceResponseType =
  | 'comfortable_presence' // Just let them know you're here
  | 'memory_callback' // Reference something they shared
  | 'story_offering' // Offer to share a relevant story
  | 'micro_story' // Share a tiny, human moment (1-2 sentences)
  | 'thoughtful_question' // Ask something meaningful
  | 'music_offering' // Offer to play some music
  | 'music_conversation' // Start a conversation about music taste
  | 'game_suggestion' // Suggest a fun music game
  | 'gentle_observation' // Share an observation about life
  | 'gentle_humor' // Light humor (persona-appropriate)
  | 'time_aware' // Acknowledge the time of day
  | 'topic_specific' // Response related to what they were discussing
  | 'warm_check_in'; // Genuine "how are you" energy

/**
 * A meaningful silence response
 */
export interface SilenceResponse {
  type: SilenceResponseType;
  text: string;
  /** Whether this response invites a reply or just offers presence */
  invitesReply: boolean;
}

/**
 * Extended silence response with intent metadata
 */
export interface SilenceResponseWithIntent extends SilenceResponse {
  /** The intent behind the question (for thoughtful questions) */
  intent?: string;
}

// ============================================================================
// LLM INSTRUCTION TYPES
// ============================================================================

/**
 * LLM instructions for silence responses
 */
export interface LLMSilenceInstructions {
  /** Instructions for generateReply() */
  instructions: string;
  /** Whether to allow interruptions */
  allowInterruptions: boolean;
  /** Fallback text if LLM fails */
  fallback: string;
  /** Type of silence response */
  type: SilenceResponseType;
  /** Whether this invites a reply */
  invitesReply: boolean;
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

export type { QuestionContext, GeneratedQuestion };
