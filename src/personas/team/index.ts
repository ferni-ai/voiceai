/**
 * Team Index
 *
 * Central exports for team configuration, packages, and prompt injection.
 */

// Core Types - export specific types to avoid conflicts
export type {
  RoleId,
  CharacterId,
  TeamMember,
  HandoffTemplate,
  TeamCoordination,
  TeamConfig,
} from './types.js';

// Package Types (for team marketplace) - rename conflicting TeamMember
export type {
  TeamPackageManifest,
  TeamMember as PackageTeamMember,
  TeamRole,
  TeamRouting,
  TopicRoute,
  IntentRoute,
  EmotionRoute,
  TeamPricing,
  PricingTier,
  TrialConfig,
  PackageMetadata,
  PackageCategory,
  MarketplaceListing,
  TeamInstance,
  TeamLicense,
  TeamInstanceConfig,
  TeamInstanceState,
  TeamSharedContext,
  HandoffRecord,
  MemberActivity,
  TeamHandoffContext,
} from './package-types.js';

export { FINANCIAL_WELLNESS_TEAM } from './package-types.js';

// Team configuration
export {
  DEFAULT_TEAM_CONFIG,
  DEFAULT_TEAM_MEMBERS,
  DEFAULT_HANDOFF_TEMPLATES,
  DEFAULT_TEAM_COORDINATION,
  getTeamMemberByRole,
  getTeamMemberByCharacter,
  getHandoffTemplates,
  getRandomHandoffPhrase,
  getCoordinatorId,
  isTeamEnabled,
} from './team-config.js';

// Prompt injection
export {
  generateTeammatesSection,
  generateHandoffSection,
  generateCoordinationSection,
  createTeamContext,
  injectTeamContext,
} from './prompt-injection.js';
