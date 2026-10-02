/**
 * Avatar Soul - state types
 *
 * Shape of the Avatar Soul animation state (pupil, gaze, shimmer, glow,
 * energy, relationship). Used by avatar-soul.ui.ts.
 */

export interface PupilState {
  size: number; // 0.6-1.4 relative to base
  targetSize: number;
  dilationSpeed: number;
  lastUpdate: number;
}

export interface GazeState {
  x: number; // -1 to 1 offset
  y: number;
  targetX: number;
  targetY: number;
  isThinking: boolean;
  saccadeTimer: ReturnType<typeof setTimeout> | null;
  lastSaccade: number;
}

export interface ShimmerState {
  isActive: boolean;
  angle: number;
  intensity: number;
  highlightX: number;
  highlightY: number;
}

export interface GlowState {
  baseRadius: number;
  currentRadius: number;
  bleedAmount: number; // 0-1 how much it bleeds beyond avatar
  color: string;
  pulsePhase: number;
}

export interface EnergyState {
  level: number; // 0-1 current energy
  targetLevel: number;
  userEnergy: number; // Detected from voice
  matchStrength: number; // How closely to match
}

export interface RelationshipState {
  warmth: number; // 0-1 baseline warmth
  depth: number; // Conversation depth
  totalInteractions: number;
  lastInteraction: number;
}

export interface SoulState {
  isInitialized: boolean;
  reducedMotion: boolean;
  pupil: PupilState;
  gaze: GazeState;
  shimmer: ShimmerState;
  glow: GlowState;
  energy: EnergyState;
  relationship: RelationshipState;
  grainPhase: number;
  anticipationActive: boolean;
  comfortPulseActive: boolean;
  protectiveMode: boolean;
}
