/**
 * Persona Bundle Types - Main Entry Point
 *
 * Re-exports all types from modular files for backward compatibility.
 */

// Core manifest types
export type {
  PersonaBundleManifest,
  BundleIdentity,
  BundleLLMContext,
  BundleVoice,
  BundleSpeechCharacteristics,
  BundleHumanization,
  BundlePersonality,
  BundleRole,
  BundleTeam,
  BundleHandoffTransition,
  BundleCognitive,
  BundleToolDomain,
  BundleTools,
  BundleCapabilities,
  BundleContent,
  BundleMetadata,
} from './core.js';

// Marketplace types
export type { BundleMarketplaceConfig } from './marketplace.js';

// Emotional types
export type {
  BundleEmotionalConfig,
  EmotionalTone,
  ProgressiveLoadingConfig,
  ExtendedBundleManifest,
  BundleHooks,
} from './emotional.js';

// Content types (stories, knowledge, behaviors)
export type {
  BundleStory,
  StoryIndex,
  BundleStoryRef,
  BundleKnowledge,
  KnowledgeIndex,
  BundleKnowledgeRef,
  BundlePetPeeve,
  BundleGreetings,
  BundleBackchannels,
  BundleSilenceFillers,
  BundleCelebrations,
  BundleStorytelling,
  BundleCatchphrases,
  BundleThinkingSounds,
  BundleGoodbyes,
  BundleBehaviors,
} from './content.js';

// Cognitive types
export type { BundleCognitiveProfile, BundleMusicPreferences } from './cognitive.js';

// Extension types (V2, humanizing, Ferni 200%)
export type {
  // V2 types
  BundleGoodbyesV2,
  BundleEntrancesV2,
  BundleGreetingsV2,
  // Humanizing behaviors
  BundleVulnerability,
  BundleCulturalMoments,
  BundleMicroMoments,
  BundleOffDuty,
  BundleSensoryMoments,
  BundleConflictHandling,
  UserPushbackResponse,
  PersonaDisagreementConfig,
  RepairConfig,
  BoundaryConfig,
  MisunderstandingConfig,
  BundleRelationshipTransitions,
  // Voice & expression
  BundleVoiceExpressions,
  VoiceExpression,
  // Situational responses
  BundleSituationalResponses,
  SituationalResponse,
  DifficultMomentResponse,
  // Relationship stages
  BundleRelationshipStages,
  RelationshipStage,
  ProgressionTrigger,
  RegressionTrigger,
  // Memory patterns
  BundleMemoryPatterns,
  MemoryReferencePattern,
  NameUsageConfig,
  DetailCallback,
  // Persona modes
  BundlePersonaModes,
  PersonaMode,
  ModeTransition,
  // Contextual nuances
  BundleContextualNuances,
  TimeOfDayConfig,
  DayOfWeekConfig,
  SeasonalConfig,
  SpecialDateConfig,
  WeatherConfig,
  // Micro-expressions
  BundleMicroExpressions,
  PacingVariation,
  SilencePattern,
  // Story graph
  BundleStoryGraph,
  StoryArc,
  StoryReference,
  ContextTrigger,
  StoryTimingRules,
  // Prompt assembly
  BundlePromptAssembly,
  ConditionalModule,
  DynamicInjection,
  InstructionPriority,
  TokenBudget,
  // Quirks
  BundleQuirks,
  // Ferni 200% superhuman
  BundleEmotionalIntelligence,
  BundleEmotionDetection,
  BundlePhysicalPresence,
  BundleLateNightPresence,
  BundleSuperhumanInsights,
  BundleTrustPhrases,
  BundleINoticePower,
  BundleThinkingOfYou,
  BundleSelfDoubt,
  BundleSecretModes,
  BundleSecretFears,
  BundleAnticipation,
  BundleMortalityAwareness,
  // Inner world
  BundleInnerWorld,
  BundleSensoryWorld,
  // Extended types
  ExtendedBundleBehaviors,
  ExtendedBundleContent,
} from './extensions.js';

// Re-export helper functions
export { isGoodbyesV2, isEntrancesV2, isGreetingsV2 } from './extensions.js';

// Loaded bundle types
export type {
  LoadedPersonaBundle,
  BundleLoadOptions,
  DiscoveredBundle,
  BundleDiscoveryResult,
  ExtendedLoadedBundle,
} from './loaded.js';

// Command types (Phase 1: Agent Commands)
export type {
  BundleCommand,
  BundleCommandArgument,
  BundleCommandIndex,
  BundleCommandRef,
  BundleCommandFrontmatter,
  CommandExecutionContext,
  CommandExecutionResult,
  // Hooks types (Phase 4)
  BundleAgentHooks,
  BundleHook,
  HookEventType,
  HookExecutionContext,
  HookExecutionResult,
  // Local tools types (Phase 2)
  BundleLocalTool,
  BundleLocalToolsIndex,
  BundleLocalToolRef,
  // Theme types (Phase 3)
  BundleTheme,
  BundleSounds,
  BundleAssets,
  // MCP types (Phase 5)
  BundleMCPConfig,
  BundleMCPServer,
} from './commands.js';
