export type HumanizationSignalType =
  | 'breakthrough'
  | 'vulnerability'
  | 'disengagement'
  | 'high_engagement'
  | 'mind_change'
  | 'memory_callback'
  | 'running_joke'
  | 'physical_presence'
  | 'spontaneous_thought'
  | 'mood_drift'
  | 'silence_moment'
  | 'anticipation'
  | 'evidence_presented'
  | 'topic_weight_shift'
  | 'relationship_milestone'
  | 'repair_needed'
  | 'aftercare_needed'
  | 'subtext_detected'
  | 'emotional_arc_peak'
  | 'emotional_arc_release'
  // Superhuman signals
  | 'concern_detected'
  | 'proactive_memory'
  | 'voice_state_detected'
  | 'need_predicted'
  | 'emotional_trajectory'
  // 🌟 Better Than Human signals
  | 'emotional_bond_deepen'
  | 'protective_instinct'
  | 'spontaneous_delight'
  | 'inside_joke_callback'
  | 'superhuman_observation'
  | 'visible_vulnerability'
  | 'temporal_insight'
  | 'meta_relationship_moment'
  | 'somatic_presence'
  | 'anticipatory_presence'
  // Conversation repair & subtext signals
  | 'repair_needed'
  | 'aftercare_needed'
  | 'subtext_detected';

export interface HumanizationSignalPayload {
  signalType: HumanizationSignalType;
  content?: string;
  memoryAge?: string;
  topic?: string;
  intensity?: number;
  mood?: {
    energy: number;
    engagement: number;
    emotionalLoad: number;
  };
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  silenceDuration?: number;
  silenceReason?: 'processing' | 'emotional' | 'invitation' | 'presence';
  // Superhuman signal data
  concernLevel?: 'none' | 'mild' | 'moderate' | 'elevated' | 'crisis';
  concernType?: string;
  recommendedApproach?: string;
  voiceState?: string;
  predictedNeed?: string;
  emotionalTrajectory?: string;
  memoryType?: string;
  // 🌟 Better Than Human signal data
  bondType?: 'warmth' | 'trust' | 'protectiveness' | 'admiration' | 'concern';
  bondLevel?: number;
  protectionTrigger?: string;
  delightType?: string;
  jokePhase?: 'new' | 'established' | 'legacy';
  jokeContent?: string;
  observationType?: 'linguistic' | 'behavioral' | 'emotional' | 'relationship';
  observationContent?: string;
  vulnerabilityType?: string;
  temporalInsight?: string;
  metaRelationshipType?: string;
  somaticCue?: string;
  // Generic metadata for extensibility
  metadata?: Record<string, unknown>;
}

export interface MemoryCallbackPayload {
  quotedPhrase: string;
  context: string;
  whenMentioned: string;
  emotionalWeight: 'light' | 'medium' | 'heavy';
}

export interface ConversationRhythmPayload {
  userPacing: 'rapid' | 'moderate' | 'slow' | 'contemplative';
  avgTurnLength: number;
  pausePattern: 'frequent_short' | 'occasional_long' | 'flowing' | 'hesitant';
  energyTrend: 'rising' | 'stable' | 'falling' | 'oscillating';
}

export interface EmotionalArcPayload {
  phase: 'opening' | 'building' | 'peak' | 'release' | 'closing';
  intensity: number;
  dominantEmotion: string;
  turnsSincePeak?: number;
}
