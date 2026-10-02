/**
 * Transcendent systems - configuration and handle types. Extracted from systems/index.ts.
 */

export interface TranscendentSystemsConfig {
  /** Enable breath synchronization */
  breathSync?: boolean;

  /** Enable micro-expressions */
  expressions?: boolean;

  /** Enable signature moments */
  moments?: boolean;

  /** Enable emotional color system */
  emotionalColor?: boolean;

  /** Enable physics-based animations (weight, mass, springs) */
  physics?: boolean;

  /** Enable overlapping action (staggered animations) */
  overlappingAction?: boolean;

  /** Enable secondary actions (reactions to primary actions) */
  secondaryAction?: boolean;

  /** Enable micro-interactions (0.1-0.3s magic moments) */
  microInteractions?: boolean;

  /** Enable contextual spacing (semantic relationship-based spacing) */
  contextualSpacing?: boolean;

  /** Enable voice typography (type that responds to speaking state) */
  voiceTypography?: boolean;

  /** Enable imperfection engine (organic variation for handcrafted feel) */
  imperfection?: boolean;

  /** Container element for avatar (for expression player binding) */
  avatarContainer?: HTMLElement | null;

  /** Container element for auto-binding secondary actions */
  interactiveContainer?: HTMLElement | null;

  /** Log initialization */
  debug?: boolean;
}

export interface TranscendentSystems {
  isInitialized: boolean;
  config: TranscendentSystemsConfig;
  destroy: () => void;
}
