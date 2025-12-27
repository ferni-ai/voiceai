/**
 * Monetization Persistence Layer
 *
 * Firestore persistence for all monetization data:
 * - Tips
 * - Value Capture events
 * - Ferni Fund contributions
 * - Growth Journey progress
 * - B2B Organizations
 *
 * Uses the unified persistence layer for efficient batched writes.
 */

import { createLogger } from '../../utils/safe-logger.js';
import { createPersistenceStore, type PersistenceStore } from '../persistence/index.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'MonetizationPersistence' });

// ============================================================================
// TYPES
// ============================================================================

export interface UserTipData {
  tips: TipRecord[];
  totalTipsCents: number;
  tipCount: number;
  lastTipAt?: string;
}

export interface TipRecord {
  id: string;
  amountCents: number;
  message?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  stripePaymentId?: string;
  createdAt: string;
  completedAt?: string;
}

export interface UserValueCaptureData {
  events: ValueCaptureRecord[];
  totalContributedCents: number;
  eventCount: number;
}

export interface ValueCaptureRecord {
  id: string;
  type: string;
  estimatedValueCents?: number;
  contributionCents?: number;
  stripePaymentId?: string;
  status: 'detected' | 'contributed' | 'declined';
  createdAt: string;
  contributedAt?: string;
}

export interface UserFundData {
  contributions: FundContributionRecord[];
  totalContributedCents: number;
  conversationsSponsored: number;
  isRecurring: boolean;
  recurringFrequency?: 'weekly' | 'monthly';
}

export interface FundContributionRecord {
  id: string;
  amountCents: number;
  message?: string;
  stripePaymentId?: string;
  conversationsSponsored: number;
  createdAt: string;
}

export interface UserJourneyData {
  seasonId: string;
  isCompanion: boolean;
  conversationCount: number;
  weeksTogetherCount: number;
  goalsAchievedCount: number;
  celebratedMilestones: string[];
  startedAt: string;
  lastActivityAt: string;
}

export interface OrganizationData {
  id: string;
  name: string;
  plan: 'starter' | 'growth' | 'enterprise';
  seatCount: number;
  activeSeats: number;
  adminUserIds: string[];
  memberUserIds: string[];
  status: 'active' | 'suspended' | 'canceled';
  stripeSubscriptionId?: string;
  config?: {
    welcomeMessage?: string;
    allowedPersonas?: string[];
    customPrompts?: Record<string, string>;
    companyValues?: string[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface GlobalFundStats {
  totalBalanceCents: number;
  totalContributedCents: number;
  totalContributors: number;
  conversationsSponsored: number;
  conversationsRemaining: number;
}

// ============================================================================
// PERSISTENCE STORES
// ============================================================================

// User-specific stores (under bogle_users/{userId}/...)
let tipStore: PersistenceStore<UserTipData> | null = null;
let valueCaptureStore: PersistenceStore<UserValueCaptureData> | null = null;
let userFundStore: PersistenceStore<UserFundData> | null = null;
let journeyStore: PersistenceStore<UserJourneyData> | null = null;

// Global stores (root collections)
let organizationStore: PersistenceStore<OrganizationData> | null = null;
let globalFundStore: PersistenceStore<GlobalFundStats> | null = null;

/**
 * Initialize all monetization persistence stores
 */
export function initMonetizationPersistence(): void {
  log.info('Initializing monetization persistence...');

  // User-specific stores
  tipStore = createPersistenceStore<UserTipData>({
    collection: 'monetization_tips',
    syncIntervalMs: 3000,
  });

  valueCaptureStore = createPersistenceStore<UserValueCaptureData>({
    collection: 'monetization_value_capture',
    syncIntervalMs: 3000,
  });

  userFundStore = createPersistenceStore<UserFundData>({
    collection: 'monetization_fund_contributions',
    syncIntervalMs: 3000,
  });

  journeyStore = createPersistenceStore<UserJourneyData>({
    collection: 'monetization_journey',
    syncIntervalMs: 5000,
  });

  // Global stores
  organizationStore = createPersistenceStore<OrganizationData>({
    collection: 'monetization_organizations',
    useRootCollection: true,
    syncIntervalMs: 5000,
  });

  globalFundStore = createPersistenceStore<GlobalFundStats>({
    collection: 'monetization_fund_global',
    documentId: 'stats',
    useRootCollection: true,
    syncIntervalMs: 10000,
  });

  log.info('Monetization persistence initialized');
}

// ============================================================================
// TIP PERSISTENCE
// ============================================================================

export async function getUserTips(userId: string): Promise<UserTipData> {
  if (!tipStore) initMonetizationPersistence();
  const data = await tipStore!.get(userId);
  return data ?? { tips: [], totalTipsCents: 0, tipCount: 0 };
}

export async function saveTip(userId: string, tip: TipRecord): Promise<void> {
  if (!tipStore) initMonetizationPersistence();
  const data = await getUserTips(userId);

  // Check if tip already exists (update) or new (add)
  const existingIndex = data.tips.findIndex((t) => t.id === tip.id);
  if (existingIndex >= 0) {
    data.tips[existingIndex] = tip;
  } else {
    data.tips.push(tip);
  }

  // Update totals if completed
  if (tip.status === 'completed') {
    data.totalTipsCents = data.tips
      .filter((t) => t.status === 'completed')
      .reduce((sum, t) => sum + t.amountCents, 0);
    data.tipCount = data.tips.filter((t) => t.status === 'completed').length;
    data.lastTipAt = tip.completedAt;
  }

  tipStore!.set(userId, data);
}

// ============================================================================
// VALUE CAPTURE PERSISTENCE
// ============================================================================

export async function getUserValueCapture(userId: string): Promise<UserValueCaptureData> {
  if (!valueCaptureStore) initMonetizationPersistence();
  const data = await valueCaptureStore!.get(userId);
  return data ?? { events: [], totalContributedCents: 0, eventCount: 0 };
}

export async function saveValueEvent(userId: string, event: ValueCaptureRecord): Promise<void> {
  if (!valueCaptureStore) initMonetizationPersistence();
  const data = await getUserValueCapture(userId);

  const existingIndex = data.events.findIndex((e) => e.id === event.id);
  if (existingIndex >= 0) {
    data.events[existingIndex] = event;
  } else {
    data.events.push(event);
  }

  if (event.status === 'contributed' && event.contributionCents) {
    data.totalContributedCents = data.events
      .filter((e) => e.status === 'contributed')
      .reduce((sum, e) => sum + (e.contributionCents ?? 0), 0);
    data.eventCount = data.events.filter((e) => e.status === 'contributed').length;
  }

  valueCaptureStore!.set(userId, data);
}

// ============================================================================
// FERNI FUND PERSISTENCE
// ============================================================================

export async function getUserFundData(userId: string): Promise<UserFundData> {
  if (!userFundStore) initMonetizationPersistence();
  const data = await userFundStore!.get(userId);
  return (
    data ?? {
      contributions: [],
      totalContributedCents: 0,
      conversationsSponsored: 0,
      isRecurring: false,
    }
  );
}

export async function saveFundContribution(
  userId: string,
  contribution: FundContributionRecord
): Promise<void> {
  if (!userFundStore) initMonetizationPersistence();
  const data = await getUserFundData(userId);

  data.contributions.push(contribution);
  data.totalContributedCents += contribution.amountCents;
  data.conversationsSponsored += contribution.conversationsSponsored;

  userFundStore!.set(userId, data);

  // Also update global stats
  await updateGlobalFundStats(contribution.amountCents, contribution.conversationsSponsored);
}

export async function getGlobalFundStats(): Promise<GlobalFundStats> {
  if (!globalFundStore) initMonetizationPersistence();
  const data = await globalFundStore!.get('global');
  return (
    data ?? {
      totalBalanceCents: 0,
      totalContributedCents: 0,
      totalContributors: 0,
      conversationsSponsored: 0,
      conversationsRemaining: 0,
    }
  );
}

async function updateGlobalFundStats(
  amountCents: number,
  conversationsSponsored: number
): Promise<void> {
  if (!globalFundStore) initMonetizationPersistence();
  const stats = await getGlobalFundStats();

  stats.totalContributedCents += amountCents;
  stats.totalBalanceCents += amountCents;
  stats.conversationsSponsored += conversationsSponsored;
  stats.conversationsRemaining += conversationsSponsored;

  await globalFundStore!.setImmediate('global', stats);
}

// ============================================================================
// JOURNEY PERSISTENCE
// ============================================================================

export async function getUserJourney(userId: string): Promise<UserJourneyData | null> {
  if (!journeyStore) initMonetizationPersistence();
  return journeyStore!.get(userId);
}

export async function saveUserJourney(userId: string, journey: UserJourneyData): Promise<void> {
  if (!journeyStore) initMonetizationPersistence();
  journey.lastActivityAt = new Date().toISOString();
  journeyStore!.set(userId, journey);
}

export async function createUserJourney(
  userId: string,
  seasonId: string
): Promise<UserJourneyData> {
  const journey: UserJourneyData = {
    seasonId,
    isCompanion: false,
    conversationCount: 0,
    weeksTogetherCount: 0,
    goalsAchievedCount: 0,
    celebratedMilestones: [],
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  };

  await saveUserJourney(userId, journey);
  return journey;
}

export async function recordJourneyConversation(userId: string): Promise<UserJourneyData> {
  let journey = await getUserJourney(userId);
  if (!journey) {
    journey = await createUserJourney(userId, getCurrentSeasonId());
  }

  journey.conversationCount++;
  journey.lastActivityAt = new Date().toISOString();

  // Calculate weeks together
  const startDate = new Date(journey.startedAt);
  const now = new Date();
  journey.weeksTogetherCount = Math.floor(
    (now.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );

  await saveUserJourney(userId, journey);
  return journey;
}

export async function recordJourneyGoal(userId: string): Promise<UserJourneyData> {
  let journey = await getUserJourney(userId);
  if (!journey) {
    journey = await createUserJourney(userId, getCurrentSeasonId());
  }

  journey.goalsAchievedCount++;
  await saveUserJourney(userId, journey);
  return journey;
}

export async function celebrateJourneyMilestone(
  userId: string,
  milestoneId: string
): Promise<void> {
  const journey = await getUserJourney(userId);
  if (!journey) return;

  if (!journey.celebratedMilestones.includes(milestoneId)) {
    journey.celebratedMilestones.push(milestoneId);
    await saveUserJourney(userId, journey);
  }
}

function getCurrentSeasonId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  // Spring: Mar-May, Summer: Jun-Aug, Fall: Sep-Nov, Winter: Dec-Feb
  if (month >= 2 && month <= 4) return `spring-${year}`;
  if (month >= 5 && month <= 7) return `summer-${year}`;
  if (month >= 8 && month <= 10) return `fall-${year}`;
  return `winter-${month === 11 ? year : year - 1}`;
}

// ============================================================================
// ORGANIZATION PERSISTENCE
// ============================================================================

export async function getOrganization(orgId: string): Promise<OrganizationData | null> {
  if (!organizationStore) initMonetizationPersistence();
  return organizationStore!.get(orgId);
}

export async function saveOrganization(org: OrganizationData): Promise<void> {
  if (!organizationStore) initMonetizationPersistence();
  org.updatedAt = new Date().toISOString();
  await organizationStore!.setImmediate(org.id, org);
}

export async function createOrganization(params: {
  name: string;
  plan: 'starter' | 'growth' | 'enterprise';
  seatCount: number;
  adminUserId: string;
  config?: OrganizationData['config'];
}): Promise<OrganizationData> {
  const org: OrganizationData = {
    id: `org_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name: params.name,
    plan: params.plan,
    seatCount: params.seatCount,
    activeSeats: 1,
    adminUserIds: [params.adminUserId],
    memberUserIds: [params.adminUserId],
    status: 'active',
    config: params.config,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveOrganization(org);
  log.info({ orgId: org.id, name: org.name, plan: org.plan }, 'Organization created');
  return org;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const monetizationPersistence = {
  init: initMonetizationPersistence,

  // Tips
  getUserTips,
  saveTip,

  // Value Capture
  getUserValueCapture,
  saveValueEvent,

  // Ferni Fund
  getUserFundData,
  saveFundContribution,
  getGlobalFundStats,

  // Journey
  getUserJourney,
  saveUserJourney,
  createUserJourney,
  recordJourneyConversation,
  recordJourneyGoal,
  celebrateJourneyMilestone,

  // Organizations
  getOrganization,
  saveOrganization,
  createOrganization,
};

export default monetizationPersistence;
