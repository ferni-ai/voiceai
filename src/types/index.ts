/**
 * Types Module
 *
 * Central export for all type definitions used across the voice AI system.
 *
 * Structure:
 * - user-profile.ts: Legacy monolithic UserProfile (maintained for backward compatibility)
 * - profile/*: New bounded context aggregates (preferred for new code)
 * - branded.ts: Branded/nominal types for IDs (compile-time safety)
 * - relationship-stages.ts: Canonical relationship stage definitions
 * - result.ts / result-utils.ts: Functional error handling
 * - schemas.ts: Zod validation schemas (runtime safety)
 * - events.ts: Domain event types
 * - api.ts: API request/response types
 * - utils.ts: Type utilities (DeepPartial, etc.)
 *
 * Philosophy: Make illegal states unrepresentable at compile time,
 * validate external data at runtime.
 */

// ============================================================================
// LEGACY USER PROFILE (for backward compatibility)
// ============================================================================

// Legacy UserProfile (maintained for backward compatibility)
// This is the primary export - existing code relies on these types
export * from './user-profile.js';

// ============================================================================
// BRANDED/NOMINAL TYPES
// ============================================================================

// Branded types prevent mixing up different ID types at compile time
export {
  createEventId,
  createGoalId,
  createMemoryId,
  createOrganizationId,
  createPersonaId,
  createRoomId,
  createSessionId,
  createToolId,
  createTurnId,
  // Factory functions
  createUserId,
  isSessionIdLike,
  // Type guards
  isUserIdLike,
  isValidPersonaId,
  unsafeAsEventId,
  unsafeAsGoalId,
  unsafeAsMemoryId,
  unsafeAsOrganizationId,
  unsafeAsPersonaId,
  unsafeAsRoomId,
  unsafeAsSessionId,
  unsafeAsStripeCustomerId,
  unsafeAsStripeSubscriptionId,
  unsafeAsToolId,
  // Unsafe coercion (use at system boundaries)
  unsafeAsUserId,
  // Brand utility
  type Brand,
  type EventId,
  type GoalId,
  type MemoryId,
  type OrganizationId,
  type PersonaId,
  type RoomId,
  type SessionId,
  type StripeCustomerId,
  type StripeSubscriptionId,
  type ToolId,
  type TurnId,
  // ID types
  type UserId,
} from './branded.js';

// ============================================================================
// RELATIONSHIP STAGES (Canonical definitions)
// ============================================================================

export {
  STAGE_DESCRIPTIONS,
  // Constants
  STAGE_LEVELS,
  STAGE_THRESHOLDS,
  calculateStage,
  fromHumanizingStage,
  // Conversion utilities
  fromLegacyStage,
  getNextStage,
  getPreviousStage,
  getProgressToNextStage,
  // Comparison utilities
  isAtLeast,
  isDeeperThan,
  isHumanizingRelationshipStage,
  isLegacyRelationshipStage,
  // Type guards
  isRelationshipStage,
  meetsStageRequirements,
  toHumanizingStage,
  toLegacyStage,
  type HumanizingRelationshipStage,
  // Legacy types (for migration)
  type LegacyRelationshipStage,
  // Calculation
  type RelationshipMetrics,
  // Canonical type
  type RelationshipStage,
  type StageThresholds,
} from './relationship-stages.js';

// ============================================================================
// RESULT TYPES (Functional error handling)
// ============================================================================

// Result types for error handling
export * from './result.js';

// Result type utilities for testing and pipelines
export {
  assertFailureType,
  assertSuccessEquals,
  executeAll,
  expectFailure,
  expectSuccess,
  mockFailure,
  mockSuccess,
  pipe,
  resultMatchers,
  retryResult,
  tryCatch,
  tryCatchAsync,
  wrapWithResult,
} from './result-utils.js';

// ============================================================================
// TYPE UTILITIES
// ============================================================================

export {
  assert,
  // Assertion utilities
  assertDefined,
  assertNonEmptyString,
  createTimestamp,
  exhaustiveCheck,
  hasTag,
  isNonEmptyArray,
  isNonEmptyString,
  omit,
  pick,
  timestampToDate,
  typedEntries,
  typedFromEntries,
  // Object helpers
  typedKeys,
  type AnyFunction,
  // Array utilities
  type ArrayElement,
  type AsyncFunction,
  // Function utilities
  type AsyncReturnType,
  // Deep utilities
  type DeepPartial,
  type DeepReadonly,
  type DeepRequired,
  // Literal utilities
  type ElementOf,
  type Equals,
  type ExcludeUnion,
  // Union utilities
  type ExtractUnion,
  type FirstParameter,
  // Conditional utilities
  type If,
  type JsonArray,
  type JsonObject,
  // JSON utilities
  type JsonPrimitive,
  type JsonValue,
  type Jsonify,
  type KeysOf,
  type KeysOfType,
  type NonEmptyArray,
  // String utilities
  type NonEmptyString,
  // Nullability
  type Nullable,
  type NullableOnly,
  type OmitByValue,
  type Optional,
  type PartialBy,
  // Object utilities
  type PickByValue,
  type RequiredBy,
  // Tagged unions
  type Tagged,
  // Timestamp utilities
  type Timestamp,
  type ValuesOf,
} from './utils.js';

// ============================================================================
// DOMAIN EVENTS
// ============================================================================

export {
  // Factory helpers
  createBaseEvent,
  createSessionEvent,
  createUserEvent,
  // Type guards
  isConversationEvent,
  isGoalEvent,
  isHabitEvent,
  isLearningEvent,
  isMemoryEvent,
  isProductivityEvent,
  isRelationshipEvent,
  isSessionEvent,
  isSubscriptionEvent,
  isToolEvent,
  isUserEvent,
  isWellnessEvent,
  // Base types
  type BaseEvent,
  type ConversationEndedEvent,
  type ConversationEvent,
  // Conversation events
  type ConversationStartedEvent,
  // Union type
  type DomainEvent,
  // Error events
  type ErrorOccurredEvent,
  // Exercise event
  type ExerciseLoggedEvent,
  // Focus events
  type FocusSessionEndedEvent,
  type FocusSessionStartedEvent,
  type GoalAchievedEvent,
  // Goal events
  type GoalCreatedEvent,
  type GoalEvent,
  type GoalProgressUpdatedEvent,
  // Habit events
  type HabitBrokenEvent,
  type HabitCreatedEvent,
  type HabitEvent,
  type HabitLoggedEvent,
  type HabitStreakEvent,
  type KeyMomentRecordedEvent,
  // Learning events
  type LearningEvent,
  type LearningSessionEvent,
  // Memory events
  type MemoryCreatedEvent,
  type MemoryEvent,
  type MemoryReferencedEvent,
  // Milestone events
  type MilestoneAchievedEvent,
  // Mindfulness event
  type MindfulnessEvent,
  // Mood event
  type MoodCheckInEvent,
  type PersonaHandoffEvent,
  // Productivity events
  type ProductivityEvent,
  type ProductivityInsightEvent,
  type RelationshipEvent,
  // Relationship events
  type RelationshipStageChangedEvent,
  // Routine event
  type RoutineCompletedEvent,
  type SessionEvent,
  type SessionLimitReachedEvent,
  // Skill event
  type SkillProgressEvent,
  // Sleep event
  type SleepLoggedEvent,
  type StorySharedEvent,
  // Subscription events
  type SubscriptionChangedEvent,
  type SubscriptionEvent,
  // Task events
  type TaskCompletedEvent,
  type TaskCreatedEvent,
  type ToolEvent,
  type ToolFeedbackEvent,
  // Tool events
  type ToolInvokedEvent,
  type TurnCompletedEvent,
  type UserEvent,
  // Wellness events
  type WellnessEvent,
  type WellnessInsightEvent,
} from './events.js';

// ============================================================================
// API TYPES
// ============================================================================

export {
  // Error codes
  API_ERROR_CODES,
  HTTP_STATUS,
  apiError,
  // Factory functions
  apiSuccess,
  isApiError,
  // Type guards
  isApiSuccess,
  paginatedResponse,
  validationError,
  type AgentListResponse,
  type ApiError,
  type ApiErrorCode,
  type ApiMeta,
  type ApiResponse,
  // Response types
  type ApiSuccess,
  // Batch operations
  type BatchRequest,
  type BatchResponse,
  type FilterOperator,
  type FilterParam,
  type HealthCheckResponse,
  type HttpStatusCode,
  type ListQueryParams,
  type PaginatedResponse,
  type PaginationMeta,
  // Pagination
  type PaginationParams,
  type SessionStartRequest,
  type SessionStartResponse,
  // Sorting & filtering
  type SortDirection,
  type SortParam,
  // Specific API types
  type UserProfileResponse,
} from './api.js';

// ============================================================================
// BOUNDED CONTEXT AGGREGATES (New architecture)
// ============================================================================

// Export under a namespace to avoid conflicts with legacy types
export * as ProfileAggregates from './profile/index.js';

// Also export the composite type directly (it's new and doesn't conflict)
export { createCompositeUserProfile } from './profile/index.js';
export type { CompositeUserProfile } from './profile/index.js';

// Migration utilities (profile format)
export {
  ensureCompositeProfile,
  isCompositeProfile,
  isLegacyProfile,
  migrateUserProfile,
  toLegacyProfile,
} from './profile/migration.js';

// ============================================================================
// ADVANCED MIGRATION UTILITIES
// ============================================================================

// Full profile migration with adapter pattern
export {
  createUnifiedProfile,
  detectProfileFormat,
  diffProfiles,
  mergeProfileUpdate,
  migrateProfileBatch,
  migrateToComposite,
  migrateToLegacy,
  needsMigration,
  UnifiedProfileAdapter,
  type BatchMigrationResult,
  type ProfileFormat,
} from './migration/index.js';

// ============================================================================
// OPENAPI SCHEMA GENERATION
// ============================================================================

export {
  createStandardResponses,
  jsonContent,
  OpenAPIDocumentBuilder,
  schemaRef,
  zodToOpenAPI,
  type OpenAPIDocument,
  type OpenAPIOperation,
  type OpenAPIParameter,
  type OpenAPIPathItem,
  type OpenAPISchema,
} from './openapi/index.js';

// ============================================================================
// FIRESTORE CONVERTERS
// ============================================================================

export {
  convertDatesForFirestore,
  convertDocuments,
  convertTimestampsToDate,
  createFirestoreConverter,
  createGoalConverter,
  createMemoryConverter,
  createNestedUpdate,
  createOrganizationConverter,
  createPartialUpdate,
  createSessionConverter,
  createUserProfileConverter,
  prepareBatchData,
  safeParseFromFirestore,
  toBrandedId,
  validateForFirestore,
  type ConverterOptions,
  type FirestoreConverter,
} from './firestore/index.js';

// ============================================================================
// DOMAIN-SPECIFIC TYPES (Re-exports for convenience)
// ============================================================================

// Humanizing types
export type { MoodState } from './humanizing-types.js';

// Monetization types
export {
  DEFAULT_TIP_CONFIG,
  EXAMPLE_PARTNERS,
  ORGANIZATION_PLANS,
  SPONSORED_MESSAGES,
  THANK_YOU_MESSAGES,
  VALUE_CAPTURE_PROMPTS,
  createDefaultMonetizationData,
} from './monetization.js';
export type {
  FerniFund,
  FundContribution,
  Organization,
  OrganizationInvite,
  OrganizationPlan,
  OrganizationPlanConfig,
  Partner,
  PartnerCategory,
  PartnerReferral,
  SponsoredConversation,
  TipJarConfig,
  TipTransaction,
  UserMonetizationData,
  ValueEvent,
  ValueType,
} from './monetization.js';

// Subscription types
export {
  FREE_SESSION_DURATION_MS,
  LIMIT_MESSAGES,
  SESSION_GRACE_MS,
  SESSION_WARNING_MS,
  TIER_CONFIGS,
  calculateUsageStatus,
  createDefaultCosmetics,
  createDefaultSubscription,
  createFreshUsage,
  formatPrice,
  getAnnualSavingsPercent,
  getCurrentPeriod,
  getLimitMessage,
  getStripePriceId,
  getTierPrice,
  needsUsageReset,
} from './subscription.js';
export type {
  BillingFrequency,
  CosmeticItem,
  CosmeticRarity,
  CosmeticType,
  MonthlyUsage,
  SubscriptionData,
  SubscriptionStatus,
  SubscriptionTier,
  TierConfig,
  UsageStatus,
  UserCosmetics,
} from './subscription.js';

// Personal journey types
export type {
  AnnualPattern,
  CommonPattern,
  CommunityWisdomEntry,
  DeliveryRecord,
  JourneyMoment,
  JourneyMomentType,
  JourneySnapshot,
  LifeChapter,
  LifeChapters,
  PersonalJourneyData,
  PersonalJourneyInjection,
  PersonalJourneyInjectionType,
  RhythmMilestone,
  RhythmMilestoneType,
  Season,
  SeasonalMemory,
  SeasonalSnapshot,
  TimeAnchoredMemory,
  TransitionSignals,
  UserRhythm,
} from './personal-journey.js';

// Personal themes
export { PERSONAL_THEMES, extractPersonalThemes, type PersonalTheme } from './personal-themes.js';

// Optimization types
export type {
  Evidence,
  FeedbackRecord,
  FeedbackSummary,
  FeedbackType,
  ImpactAssessment,
  ImplementationGuide,
  Recommendation,
  RecommendationType,
} from './optimization-types.js';
