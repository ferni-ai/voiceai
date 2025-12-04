/**
 * Context Builder Types
 */

import type { UserProfile } from '../../types/user-profile.js';
import type { PersonaConfig } from '../../personas/types.js';

export type EmotionValence = 'positive' | 'negative' | 'neutral';

export interface EmotionAnalysis {
  primary: string;
  intensity: number;
  secondaryEmotions?: string[];
  needsSupport?: boolean;
  isVenting?: boolean;
  isProcessing?: boolean;
  mentalHealthSignals?: string[];
  distressLevel?: number;
  confidence?: number;
  valence?: EmotionValence;
  markers?: string[];
  suggestedTone?: string;
}

export interface IntentAnalysis {
  primary: string;
  confidence: number;
  entities?: Record<string, unknown>;
  isQuestion?: boolean;
  isFollowUp?: boolean;
  requiresEmpathy?: boolean;
  suggestedApproach?: string[];
}

export interface TopicsAnalysis {
  detected: string[];
  isTopicShift?: boolean;
  currentTopic?: string;
}

export interface ConversationAnalysis {
  emotion: EmotionAnalysis;
  intent: IntentAnalysis;
  topics: TopicsAnalysis;
  state: {
    phase: string;
  };
}

export interface SessionServices {
  sessionId: string;
  userId?: string;
  sessionStartTime: number;
  userProfile: UserProfile | null;
}

export interface VoiceEmotionResult {
  emotion: string;
  confidence: number;
}

export interface ContextUserData {
  userName?: string;
  name?: string;
  isReturningUser?: boolean;
  turnCount?: number;
}

export interface ContextBuilderInput {
  userText: string;
  analysis: ConversationAnalysis;
  services: SessionServices;
  userData: ContextUserData;
  userProfile: UserProfile | null;
  persona: PersonaConfig;
  voiceEmotion?: VoiceEmotionResult;
}

export type ContextPriority = 'critical' | 'high' | 'standard' | 'hint';

export interface ContextInjection {
  id: string;
  source: string;
  content: string;
  priority: ContextPriority;
  category?: string;
  confidence?: number;
}

export interface ContextBuilder {
  name: string;
  description: string;
  priority: number;
  build: (input: ContextBuilderInput) => Promise<ContextInjection[]>;
}

export interface ContextBuilderMetrics {
  name: string;
  callCount: number;
  totalDurationMs: number;
  avgDurationMs: number;
  injectionsProduced: number;
  lastCallTimestamp?: number;
}

export type { UserProfile, PersonaConfig };
