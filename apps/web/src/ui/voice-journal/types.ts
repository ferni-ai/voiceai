/**
 * Voice Journal Types
 *
 * Shared types and interfaces for the voice journal feature.
 *
 * @module voice-journal/types
 */

import type { CustomAgent, CustomAgentMemory } from '../../services/custom-agent.service.js';

// ============================================================================
// TAB & UI TYPES
// ============================================================================

export type JournalTab = 'record' | 'history' | 'insights';

// ============================================================================
// PROMPT TYPES
// ============================================================================

export interface JournalPrompt {
  id: string;
  category: string;
  prompt: string;
  followUp?: string;
  difficulty: 'gentle' | 'moderate' | 'deep';
  estimatedMinutes: number;
}

// ============================================================================
// MOOD TYPES
// ============================================================================

export interface MoodOption {
  id: string;
  icon: string;  // SVG icon string
  label: string;
  score: number;
}

export interface MoodTrend {
  date: string;
  mood: string;
  moodScore: number;
}

// ============================================================================
// STATS TYPES
// ============================================================================

export interface JournalStats {
  totalEntries: number;
  currentStreak: number;
  longestStreak: number;
  avgMoodScore: number;
  topMoods: Array<{ mood: string; count: number }>;
  entriesByWeek: number[];
}

// ============================================================================
// STATE TYPES
// ============================================================================

export interface VoiceJournalState {
  modal: HTMLElement | null;
  currentAgent: CustomAgent | null;
  entries: CustomAgentMemory[];
  mediaRecorder: MediaRecorder | null;
  audioChunks: Blob[];
  isRecording: boolean;
  recordingStartTime: number | null;
  recordingDuration: number;
  animationFrameId: number | null;
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
  currentTab: JournalTab;
  currentPrompt: JournalPrompt | null;
  calendarMonth: Date;
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

export type { CustomAgent, CustomAgentMemory };

