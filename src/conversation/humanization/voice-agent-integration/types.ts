/**
 * Voice Agent Integration Types
 *
 * @module @ferni/humanization/voice-agent-integration/types
 */

import type { TurnGuidance, ResponseModification } from '../../advanced-humanization-integration.js';

export interface HumanizationSessionState {
  sessionId: string;
  userId: string;
  personaId: string;
  startTime: Date;
  turnCount: number;
  comfortLevel: number;
  relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  recentTopics: string[];
  isActive: boolean;
  advancedHumanization: {
    enabled: boolean;
    lastGuidance: TurnGuidance | null;
    lastModifications: ResponseModification | null;
  };
}

export interface VulnerabilityResult {
  isVulnerable: boolean;
  type?: 'deep_disclosure' | 'first_time_share' | 'emotional_admission' | 'asking_for_help';
  confidence: number;
}

export type { TurnGuidance, ResponseModification };
