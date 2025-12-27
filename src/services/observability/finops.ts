/**
 * FinOps Service - Financial Operations Tracking
 *
 * Comprehensive cost tracking, attribution, and projection for Ferni AI.
 * Tracks per-user costs, calculates unit economics, and provides alerts.
 *
 * Key Metrics:
 * - Cost per conversation
 * - Cost per user (free vs paid)
 * - Unit economics (LTV:CAC, gross margin)
 * - Burn rate and runway projections
 *
 * @module services/observability/finops
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'FinOps' });

// ============================================================================
// PRICING CONSTANTS (Updated Dec 2024)
// ============================================================================

/**
 * Cost per unit for each service provider.
 * Keep these updated as pricing changes!
 */
export const PRICING = {
  // Gemini 2.0 Flash (our primary model)
  llm: {
    'gemini-2.0-flash-exp': { inputPer1KTokens: 0.000075, outputPer1KTokens: 0.0003 },
    'gemini-2.0-flash-live-001': { inputPer1KTokens: 0.000075, outputPer1KTokens: 0.0003 },
    'gemini-1.5-flash': { inputPer1KTokens: 0.000075, outputPer1KTokens: 0.0003 },
    'gemini-1.5-pro': { inputPer1KTokens: 0.00125, outputPer1KTokens: 0.005 },
    // Fallback for unknown models
    default: { inputPer1KTokens: 0.000075, outputPer1KTokens: 0.0003 },
  },

  // Cartesia TTS (primary voice synthesis)
  tts: {
    cartesia: { perCharacter: 0.000015 }, // $15/1M chars
    elevenlabs: { perCharacter: 0.00003 },
    default: { perCharacter: 0.000015 },
  },

  // Deepgram STT (primary transcription)
  stt: {
    deepgram: { perMinute: 0.0043 },
    whisper: { perMinute: 0.006 },
    default: { perMinute: 0.0043 },
  },

  // LiveKit (voice transport)
  livekit: {
    perMinute: 0.004, // Approximate
  },

  // Infrastructure (amortized)
  infrastructure: {
    gcePerHour: 0.1, // n1-standard-2 ~$73/mo = $0.10/hr
    firestorePerRead: 0.0000006, // $0.06/100K
    firestorePerWrite: 0.0000018, // $0.18/100K
    firestorePerGB: 0.18,
  },

  // ============================================================================
  // OPERATING OVERHEAD - The "true cost" beyond API calls
  // ============================================================================
  // This captures all the invisible costs that make Ferni possible:
  // - Cloud infrastructure (Firebase, Cloud Run, monitoring, storage)
  // - Development & maintenance time
  // - Support & operations
  // - Error handling, retries, redundancy
  overhead: {
    // Multiplier on API costs for cloud infrastructure overhead
    // API costs are typically 30-40% of total cloud bill
    // (networking, storage, monitoring, logging, build, etc.)
    cloudInfraMultiplier: 1.5, // 1.5x = API + 50% cloud overhead

    // Fixed per-minute overhead for session infrastructure
    // (LiveKit rooms, Firestore writes, monitoring, etc.)
    perMinuteInfra: 0.002, // $0.002/min = $0.12/hr session overhead

    // Operator cost - your time, monitoring, support
    // Small bootstrapped operation: ~$0.01 per conversation minute
    // This represents the human element keeping Ferni running
    operatorPerMinute: 0.01, // $0.01/min = $0.60/hr of your time

    // Minimum floor per conversation (covers fixed costs for very short convos)
    // Even a 1-minute call has setup/teardown costs
    minimumPerSession: 0.02, // $0.02 minimum per conversation
  },
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface CostEvent {
  id: string;
  timestamp: number;
  userId?: string;
  sessionId?: string;
  tier: 'free' | 'friend' | 'partner';
  service: 'llm' | 'tts' | 'stt' | 'livekit' | 'infra';
  provider: string;
  model?: string;
  units: number;
  unitType: 'tokens' | 'characters' | 'seconds' | 'minutes' | 'reads' | 'writes';
  cost: number;
}

export interface SessionCost {
  sessionId: string;
  userId?: string;
  tier: 'free' | 'friend' | 'partner';
  startTime: number;
  endTime?: number;
  durationMinutes: number;
  costs: {
    llm: number;
    tts: number;
    stt: number;
    livekit: number;
    infra: number;
  };
  /** Direct API costs only (what APIs charge us) */
  totalCost: number;

  // ============================================================================
  // TRUE COST - What it actually costs to run Ferni
  // ============================================================================
  /** API costs + cloud overhead (infrastructure beyond APIs) */
  cloudCost: number;
  /** Additional per-minute infrastructure overhead */
  infraOverhead: number;
  /** Operator costs (your time running things) */
  operatorCost: number;
  /**
   * TRUE COST: Everything combined - what this conversation actually cost.
   * This is what we show users in the cost transparency feature.
   * trueCost = max(minimum, (apiCost * cloudMultiplier) + infraOverhead + operatorCost)
   */
  trueCost: number;

  // Usage metrics
  tokenCount: number;
  ttsCharacters: number;
  sttMinutes: number;
}

export interface UserCostSummary {
  userId: string;
  tier: 'free' | 'friend' | 'partner';
  // Lifetime
  totalCost: number;
  totalSessions: number;
  avgCostPerSession: number;
  // This month
  monthCost: number;
  monthSessions: number;
  // Revenue (for paid users)
  monthRevenue: number;
  // Margin
  grossMargin: number; // (revenue - cost) / revenue
  // Flag if user is unprofitable
  isUnprofitable: boolean;
}

export interface FinOpsSnapshot {
  timestamp: number;

  // Real-time
  activeSessionCount: number;
  currentBurnRatePerHour: number;

  // Period costs
  costLast24h: number;
  costThisMonth: number;
  projectedMonthCost: number;

  // Per-unit economics
  avgCostPerConversation: number;
  avgCostPerFreeUser: number;
  avgCostPerPaidUser: number;
  avgRevenuePerPaidUser: number;

  // Unit economics
  grossMargin: number; // %
  contributionMargin: number; // Revenue - variable costs

  // Tier breakdown
  costByTier: {
    free: { cost: number; sessions: number; users: number };
    friend: { cost: number; sessions: number; users: number };
    partner: { cost: number; sessions: number; users: number };
  };

  // Service breakdown
  costByService: {
    llm: number;
    tts: number;
    stt: number;
    livekit: number;
    infra: number;
  };

  // Projections
  projectedBreakeven: Date | null; // When revenue = costs
  monthlyRecurringRevenue: number;
  runwayMonths: number | null; // If cash reserve known

  // ============== NEW: LTV:CAC & Power Users ==============

  /** LTV:CAC metrics */
  ltvCac: LTVCACMetrics;

  /** Detailed unit economics */
  unitEconomics: UnitEconomics;

  /** Power users (high cost, potential conversion targets or whales) */
  powerUsers: PowerUser[];

  /** Free tier cost as percentage of total */
  freeTierCostPercent: number;

  // Alerts
  alerts: FinOpsAlert[];
}

export interface FinOpsAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  type:
    | 'high_burn_rate'
    | 'unprofitable_user'
    | 'cost_spike'
    | 'margin_warning'
    | 'budget_exceeded';
  message: string;
  data?: Record<string, unknown>;
}

export interface FinOpsThresholds {
  maxCostPerFreeSession: number; // Alert if free session exceeds this
  maxMonthlyBurn: number; // Alert if monthly burn exceeds
  minGrossMargin: number; // Alert if margin drops below
  maxUnprofitableUsers: number; // Alert if too many users are unprofitable
  maxLTVCACRatio: number; // Target LTV:CAC ratio (3.0 is healthy)
  minLTVCACRatio: number; // Alert if LTV:CAC drops below (1.0 = breakeven)
  maxFreeTierCostPercent: number; // Alert if free tier > X% of total cost
  powerUserSessionThreshold: number; // Sessions/month to flag as power user
}

// ============================================================================
// LTV:CAC TRACKING
// ============================================================================

export interface LTVCACMetrics {
  /** Customer Acquisition Cost - how much we spend to get a paying user */
  cac: number;

  /** Average Customer Lifetime Value */
  ltv: number;

  /** LTV:CAC ratio - should be > 3.0 for healthy SaaS */
  ltvCACRatio: number;

  /** Payback period in months */
  paybackMonths: number;

  /** Revenue per dollar spent on acquisition */
  roiPercent: number;

  /** Data quality indicator */
  confidence: 'low' | 'medium' | 'high';
}

export interface PowerUser {
  userId: string;
  tier: 'free' | 'friend' | 'partner';
  monthSessions: number;
  monthCost: number;
  avgCostPerSession: number;
  /** For paid users: is cost > revenue? */
  isUnprofitable: boolean;
  /** For free users: cost equivalent to what tier? */
  costEquivalentTier: 'friend' | 'partner' | 'whale';
}

export interface UnitEconomics {
  /** Cost per free session (target: < $0.10) */
  costPerFreeSession: number;

  /** Cost per paid session (target: varies by tier) */
  costPerPaidSession: number;

  /** Revenue per paid session */
  revenuePerPaidSession: number;

  /** Contribution margin per paid session */
  marginPerPaidSession: number;

  /** Break-even sessions for free → friend conversion */
  breakEvenSessionsToConvert: number;

  /** Monthly cost if all free users converted (target scenario) */
  projectedCostAtFullConversion: number;
}

// ============================================================================
// STATE
// ============================================================================

const costEvents: CostEvent[] = [];
const sessionCosts: Map<string, SessionCost> = new Map();
const MAX_EVENTS = 50000;
const MAX_SESSIONS = 10000;

const DEFAULT_THRESHOLDS: FinOpsThresholds = {
  maxCostPerFreeSession: 0.15, // $0.15 max for 7-min free session
  maxMonthlyBurn: 5000, // $5K/mo warning
  minGrossMargin: 0.3, // 30% margin minimum
  maxUnprofitableUsers: 100, // Alert if >100 unprofitable users
  maxLTVCACRatio: 5.0, // Target (3.0 is healthy SaaS)
  minLTVCACRatio: 1.5, // Alert if below (1.0 = breakeven)
  maxFreeTierCostPercent: 0.6, // Alert if free tier > 60% of total cost
  powerUserSessionThreshold: 50, // Flag users with >50 sessions/month
};

let thresholds = { ...DEFAULT_THRESHOLDS };
let monthlyRevenue = 0; // Set via setMonthlyRevenue()
let cashReserve: number | null = null;

// LTV:CAC inputs (set via API)
let customerAcquisitionCost = 0; // CAC - set from marketing spend
let avgCustomerLifetimeMonths = 12; // Default 12 months
let churnRateMonthly = 0.05; // 5% monthly churn

// User cost tracking for power user detection
const userMonthlyCosts: Map<string, { cost: number; sessions: number; tier: string }> = new Map();

// ============================================================================
// COST RECORDING
// ============================================================================

/**
 * Record an LLM cost event.
 */
export function recordLLMCost(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  userId?: string;
  sessionId?: string;
  tier?: 'free' | 'friend' | 'partner';
}): void {
  const { model, inputTokens, outputTokens, userId, sessionId, tier = 'free' } = params;

  const pricing = PRICING.llm[model as keyof typeof PRICING.llm] || PRICING.llm.default;
  const cost =
    (inputTokens / 1000) * pricing.inputPer1KTokens +
    (outputTokens / 1000) * pricing.outputPer1KTokens;

  const event: CostEvent = {
    id: `llm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    userId,
    sessionId,
    tier,
    service: 'llm',
    provider: 'google',
    model,
    units: inputTokens + outputTokens,
    unitType: 'tokens',
    cost,
  };

  costEvents.push(event);
  updateSessionCost(sessionId, 'llm', cost, { tokenCount: inputTokens + outputTokens });
  trimEvents();

  log.debug({ model, tokens: inputTokens + outputTokens, cost: cost.toFixed(6) }, 'LLM cost');
}

/**
 * Record a TTS cost event.
 */
export function recordTTSCost(params: {
  provider?: string;
  characters: number;
  userId?: string;
  sessionId?: string;
  tier?: 'free' | 'friend' | 'partner';
}): void {
  const { provider = 'cartesia', characters, userId, sessionId, tier = 'free' } = params;

  const pricing = PRICING.tts[provider as keyof typeof PRICING.tts] || PRICING.tts.default;
  const cost = characters * pricing.perCharacter;

  const event: CostEvent = {
    id: `tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    userId,
    sessionId,
    tier,
    service: 'tts',
    provider,
    units: characters,
    unitType: 'characters',
    cost,
  };

  costEvents.push(event);
  updateSessionCost(sessionId, 'tts', cost, { ttsCharacters: characters });
  trimEvents();
}

/**
 * Record an STT cost event.
 */
export function recordSTTCost(params: {
  provider?: string;
  durationSeconds: number;
  userId?: string;
  sessionId?: string;
  tier?: 'free' | 'friend' | 'partner';
}): void {
  const { provider = 'deepgram', durationSeconds, userId, sessionId, tier = 'free' } = params;

  const pricing = PRICING.stt[provider as keyof typeof PRICING.stt] || PRICING.stt.default;
  const cost = (durationSeconds / 60) * pricing.perMinute;

  const event: CostEvent = {
    id: `stt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    userId,
    sessionId,
    tier,
    service: 'stt',
    provider,
    units: durationSeconds,
    unitType: 'seconds',
    cost,
  };

  costEvents.push(event);
  updateSessionCost(sessionId, 'stt', cost, { sttMinutes: durationSeconds / 60 });
  trimEvents();
}

/**
 * Record LiveKit transport cost.
 */
export function recordLiveKitCost(params: {
  durationMinutes: number;
  userId?: string;
  sessionId?: string;
  tier?: 'free' | 'friend' | 'partner';
}): void {
  const { durationMinutes, userId, sessionId, tier = 'free' } = params;

  const cost = durationMinutes * PRICING.livekit.perMinute;

  const event: CostEvent = {
    id: `lk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    userId,
    sessionId,
    tier,
    service: 'livekit',
    provider: 'livekit',
    units: durationMinutes,
    unitType: 'minutes',
    cost,
  };

  costEvents.push(event);
  updateSessionCost(sessionId, 'livekit', cost);
  trimEvents();
}

/**
 * Start tracking a new session.
 */
export function startSession(params: {
  sessionId: string;
  userId?: string;
  tier?: 'free' | 'friend' | 'partner';
}): void {
  const { sessionId, userId, tier = 'free' } = params;

  sessionCosts.set(sessionId, {
    sessionId,
    userId,
    tier,
    startTime: Date.now(),
    durationMinutes: 0,
    costs: { llm: 0, tts: 0, stt: 0, livekit: 0, infra: 0 },
    totalCost: 0,
    // True cost fields - calculated at session end
    cloudCost: 0,
    infraOverhead: 0,
    operatorCost: 0,
    trueCost: 0,
    // Usage metrics
    tokenCount: 0,
    ttsCharacters: 0,
    sttMinutes: 0,
  });

  trimSessions();
  log.debug({ sessionId, userId, tier }, 'Session started for cost tracking');
}

/**
 * End a session and calculate final costs.
 *
 * Calculates both direct API costs AND true operating costs:
 * - Direct API costs: What the APIs charge us
 * - Cloud overhead: Infrastructure beyond APIs (Firebase, monitoring, etc.)
 * - Operator costs: Human time keeping Ferni running
 * - Minimum floor: Even short convos have fixed costs
 */
export function endSession(sessionId: string): SessionCost | null {
  const session = sessionCosts.get(sessionId);
  if (!session) return null;

  session.endTime = Date.now();
  session.durationMinutes = (session.endTime - session.startTime) / 60000;

  // Add infrastructure cost (amortized per session - GCE compute)
  const infraCost = session.durationMinutes * (PRICING.infrastructure.gcePerHour / 60);
  session.costs.infra = infraCost;
  session.totalCost += infraCost;

  // ============================================================================
  // TRUE COST CALCULATION - What it actually costs to run this conversation
  // ============================================================================
  const { overhead } = PRICING;

  // 1. Cloud cost = API costs * cloud infrastructure multiplier
  //    (networking, monitoring, storage, builds, etc.)
  session.cloudCost = session.totalCost * overhead.cloudInfraMultiplier;

  // 2. Infrastructure overhead = per-minute cost for session infrastructure
  //    (LiveKit rooms, Firestore writes, logging, etc.)
  session.infraOverhead = session.durationMinutes * overhead.perMinuteInfra;

  // 3. Operator cost = your time running things
  //    (monitoring, support, maintenance, being on-call)
  session.operatorCost = session.durationMinutes * overhead.operatorPerMinute;

  // 4. TRUE COST = everything combined, with minimum floor
  const calculatedTrueCost = session.cloudCost + session.infraOverhead + session.operatorCost;
  session.trueCost = Math.max(overhead.minimumPerSession, calculatedTrueCost);

  log.info(
    {
      sessionId,
      tier: session.tier,
      duration: session.durationMinutes.toFixed(1),
      apiCost: session.totalCost.toFixed(4),
      trueCost: session.trueCost.toFixed(4),
    },
    'Session ended'
  );

  return session;
}

/**
 * Get session cost for a specific session (active or ended).
 * Used by user-facing cost transparency feature.
 */
export function getSessionCost(sessionId: string): SessionCost | null {
  return sessionCosts.get(sessionId) || null;
}

/**
 * Get session cost by userId (finds the most recent session).
 * Falls back to any active session for the user.
 */
export function getSessionCostByUserId(userId: string): SessionCost | null {
  // Find sessions for this user, sorted by start time (most recent first)
  const userSessions = Array.from(sessionCosts.values())
    .filter((s) => s.userId === userId)
    .sort((a, b) => b.startTime - a.startTime);

  return userSessions[0] || null;
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function updateSessionCost(
  sessionId: string | undefined,
  service: keyof SessionCost['costs'],
  cost: number,
  metrics?: Partial<Pick<SessionCost, 'tokenCount' | 'ttsCharacters' | 'sttMinutes'>>
): void {
  if (!sessionId) return;

  const session = sessionCosts.get(sessionId);
  if (!session) return;

  session.costs[service] += cost;
  session.totalCost += cost;

  if (metrics) {
    if (metrics.tokenCount) session.tokenCount += metrics.tokenCount;
    if (metrics.ttsCharacters) session.ttsCharacters += metrics.ttsCharacters;
    if (metrics.sttMinutes) session.sttMinutes += metrics.sttMinutes;
  }
}

function trimEvents(): void {
  if (costEvents.length > MAX_EVENTS) {
    costEvents.splice(0, costEvents.length - MAX_EVENTS);
  }
}

function trimSessions(): void {
  if (sessionCosts.size > MAX_SESSIONS) {
    // Remove oldest sessions
    const entries = Array.from(sessionCosts.entries());
    entries.sort((a, b) => a[1].startTime - b[1].startTime);
    const toRemove = entries.slice(0, entries.length - MAX_SESSIONS);
    for (const [key] of toRemove) {
      sessionCosts.delete(key);
    }
  }
}

// ============================================================================
// SNAPSHOT & ANALYTICS
// ============================================================================

/**
 * Get a comprehensive FinOps snapshot.
 */
export function getSnapshot(): FinOpsSnapshot {
  const now = Date.now();
  const last24h = now - 24 * 60 * 60 * 1000;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Filter events
  const eventsLast24h = costEvents.filter((e) => e.timestamp > last24h);
  const eventsThisMonth = costEvents.filter((e) => e.timestamp > monthStart.getTime());

  // Active sessions
  const activeSessions = Array.from(sessionCosts.values()).filter((s) => !s.endTime);

  // Cost totals
  const costLast24h = eventsLast24h.reduce((sum, e) => sum + e.cost, 0);
  const costThisMonth = eventsThisMonth.reduce((sum, e) => sum + e.cost, 0);

  // Project monthly cost
  const daysElapsed = (now - monthStart.getTime()) / (24 * 60 * 60 * 1000);
  const projectedMonthCost = daysElapsed > 0 ? (costThisMonth / daysElapsed) * 30 : 0;

  // By tier
  const costByTier = {
    free: { cost: 0, sessions: 0, users: new Set<string>() },
    friend: { cost: 0, sessions: 0, users: new Set<string>() },
    partner: { cost: 0, sessions: 0, users: new Set<string>() },
  };

  // Track per-user costs for power user detection
  const userCosts: Map<string, { cost: number; sessions: number; tier: string }> = new Map();

  for (const event of eventsThisMonth) {
    const tierData = costByTier[event.tier];
    tierData.cost += event.cost;
    if (event.userId) {
      tierData.users.add(event.userId);

      // Track per-user
      const existing = userCosts.get(event.userId) || { cost: 0, sessions: 0, tier: event.tier };
      existing.cost += event.cost;
      existing.tier = event.tier; // Update to latest tier
      userCosts.set(event.userId, existing);
    }
  }

  // Count sessions by tier and per-user
  for (const session of sessionCosts.values()) {
    if (session.startTime > monthStart.getTime()) {
      costByTier[session.tier].sessions++;

      // Track per-user sessions
      if (session.userId) {
        const existing = userCosts.get(session.userId) || {
          cost: 0,
          sessions: 0,
          tier: session.tier,
        };
        existing.sessions++;
        userCosts.set(session.userId, existing);
      }
    }
  }

  // By service
  const costByService = { llm: 0, tts: 0, stt: 0, livekit: 0, infra: 0 };
  for (const event of eventsThisMonth) {
    if (event.service in costByService) {
      costByService[event.service as keyof typeof costByService] += event.cost;
    }
  }

  // Unit economics
  const totalSessions =
    costByTier.free.sessions + costByTier.friend.sessions + costByTier.partner.sessions;
  const avgCostPerConversation = totalSessions > 0 ? costThisMonth / totalSessions : 0;

  const freeUserCount = costByTier.free.users.size || 1;
  const paidUserCount = costByTier.friend.users.size + costByTier.partner.users.size || 1;

  const avgCostPerFreeUser = costByTier.free.cost / freeUserCount;
  const avgCostPerPaidUser = (costByTier.friend.cost + costByTier.partner.cost) / paidUserCount;

  const avgRevenuePerPaidUser = paidUserCount > 0 ? monthlyRevenue / paidUserCount : 0;

  // Gross margin
  const grossMargin = monthlyRevenue > 0 ? (monthlyRevenue - costThisMonth) / monthlyRevenue : 0;
  const contributionMargin = monthlyRevenue - costThisMonth;

  // Burn rate
  const currentBurnRatePerHour = eventsLast24h.reduce((sum, e) => sum + e.cost, 0) / 24;

  // Runway
  const runwayMonths =
    cashReserve !== null && projectedMonthCost > 0 ? cashReserve / projectedMonthCost : null;

  // ============== LTV:CAC CALCULATION ==============
  const ltvCac = calculateLTVCAC({
    avgRevenuePerPaidUser,
    avgCostPerPaidUser,
    paidUserCount,
    churnRate: churnRateMonthly,
    cac: customerAcquisitionCost,
    lifetimeMonths: avgCustomerLifetimeMonths,
  });

  // ============== UNIT ECONOMICS ==============
  const costPerFreeSession =
    costByTier.free.sessions > 0 ? costByTier.free.cost / costByTier.free.sessions : 0;
  const paidSessions = costByTier.friend.sessions + costByTier.partner.sessions;
  const costPerPaidSession =
    paidSessions > 0 ? (costByTier.friend.cost + costByTier.partner.cost) / paidSessions : 0;
  const revenuePerPaidSession = paidSessions > 0 ? monthlyRevenue / paidSessions : 0;

  const unitEconomics: UnitEconomics = {
    costPerFreeSession,
    costPerPaidSession,
    revenuePerPaidSession,
    marginPerPaidSession: revenuePerPaidSession - costPerPaidSession,
    // How many sessions before free user "pays off" conversion
    breakEvenSessionsToConvert:
      costPerFreeSession > 0
        ? 10 / costPerFreeSession // $10 (friend tier) / cost per free session
        : 0,
    // What would it cost if all free users converted to friend?
    projectedCostAtFullConversion: costByTier.free.sessions * costPerPaidSession,
  };

  // ============== POWER USER DETECTION ==============
  const powerUsers = detectPowerUsers(userCosts, {
    friendRevenue: 10, // $10/mo
    partnerRevenue: 20, // $20/mo
    sessionThreshold: thresholds.powerUserSessionThreshold,
  });

  // Free tier cost percentage
  const freeTierCostPercent = costThisMonth > 0 ? costByTier.free.cost / costThisMonth : 0;

  // Alerts (enhanced)
  const alerts = generateAlerts({
    costThisMonth,
    projectedMonthCost,
    grossMargin,
    avgCostPerConversation,
    costByTier,
    ltvCac,
    freeTierCostPercent,
    powerUsers,
  });

  return {
    timestamp: now,
    activeSessionCount: activeSessions.length,
    currentBurnRatePerHour,
    costLast24h,
    costThisMonth,
    projectedMonthCost,
    avgCostPerConversation,
    avgCostPerFreeUser,
    avgCostPerPaidUser,
    avgRevenuePerPaidUser,
    grossMargin,
    contributionMargin,
    costByTier: {
      free: {
        cost: costByTier.free.cost,
        sessions: costByTier.free.sessions,
        users: costByTier.free.users.size,
      },
      friend: {
        cost: costByTier.friend.cost,
        sessions: costByTier.friend.sessions,
        users: costByTier.friend.users.size,
      },
      partner: {
        cost: costByTier.partner.cost,
        sessions: costByTier.partner.sessions,
        users: costByTier.partner.users.size,
      },
    },
    costByService,
    projectedBreakeven: null, // Would need historical data
    monthlyRecurringRevenue: monthlyRevenue,
    runwayMonths,
    // New fields
    ltvCac,
    unitEconomics,
    powerUsers,
    freeTierCostPercent,
    alerts,
  };
}

/**
 * Calculate LTV:CAC metrics
 */
function calculateLTVCAC(params: {
  avgRevenuePerPaidUser: number;
  avgCostPerPaidUser: number;
  paidUserCount: number;
  churnRate: number;
  cac: number;
  lifetimeMonths: number;
}): LTVCACMetrics {
  const {
    avgRevenuePerPaidUser,
    avgCostPerPaidUser,
    paidUserCount,
    churnRate,
    cac,
    lifetimeMonths,
  } = params;

  // Calculate LTV: Average revenue per user * expected lifetime
  // Using churn rate: Lifetime = 1 / churnRate (in months)
  const calculatedLifetime = churnRate > 0 ? 1 / churnRate : lifetimeMonths;
  const monthlyMargin = avgRevenuePerPaidUser - avgCostPerPaidUser;
  const ltv = monthlyMargin * calculatedLifetime;

  // LTV:CAC ratio
  const ltvCACRatio = cac > 0 ? ltv / cac : 0;

  // Payback period
  const paybackMonths = monthlyMargin > 0 && cac > 0 ? cac / monthlyMargin : 0;

  // ROI
  const roiPercent = cac > 0 ? ((ltv - cac) / cac) * 100 : 0;

  // Confidence based on data quality
  let confidence: 'low' | 'medium' | 'high' = 'low';
  if (paidUserCount >= 100 && cac > 0) {
    confidence = 'high';
  } else if (paidUserCount >= 10 && cac > 0) {
    confidence = 'medium';
  }

  return {
    cac,
    ltv,
    ltvCACRatio,
    paybackMonths,
    roiPercent,
    confidence,
  };
}

/**
 * Detect power users who consume disproportionate resources
 */
function detectPowerUsers(
  userCosts: Map<string, { cost: number; sessions: number; tier: string }>,
  params: { friendRevenue: number; partnerRevenue: number; sessionThreshold: number }
): PowerUser[] {
  const { friendRevenue, partnerRevenue, sessionThreshold } = params;
  const powerUsers: PowerUser[] = [];

  for (const [userId, data] of userCosts.entries()) {
    if (data.sessions < sessionThreshold) continue; // Not a power user

    const avgCostPerSession = data.sessions > 0 ? data.cost / data.sessions : 0;
    const tier = data.tier as 'free' | 'friend' | 'partner';

    // Determine revenue for this user
    let monthRevenue = 0;
    if (tier === 'friend') monthRevenue = friendRevenue;
    if (tier === 'partner') monthRevenue = partnerRevenue;

    const isUnprofitable = tier !== 'free' && data.cost > monthRevenue;

    // For free users, what tier would their cost match?
    let costEquivalentTier: 'friend' | 'partner' | 'whale' = 'friend';
    if (data.cost >= partnerRevenue) {
      costEquivalentTier = data.cost >= partnerRevenue * 2 ? 'whale' : 'partner';
    }

    powerUsers.push({
      userId,
      tier,
      monthSessions: data.sessions,
      monthCost: data.cost,
      avgCostPerSession,
      isUnprofitable,
      costEquivalentTier,
    });
  }

  // Sort by cost descending
  powerUsers.sort((a, b) => b.monthCost - a.monthCost);

  // Return top 20
  return powerUsers.slice(0, 20);
}

function generateAlerts(data: {
  costThisMonth: number;
  projectedMonthCost: number;
  grossMargin: number;
  avgCostPerConversation: number;
  costByTier: { free: { cost: number; sessions: number } };
  ltvCac: LTVCACMetrics;
  freeTierCostPercent: number;
  powerUsers: PowerUser[];
}): FinOpsAlert[] {
  const alerts: FinOpsAlert[] = [];

  // High burn rate
  if (data.projectedMonthCost > thresholds.maxMonthlyBurn) {
    alerts.push({
      id: `burn_${Date.now()}`,
      severity: data.projectedMonthCost > thresholds.maxMonthlyBurn * 2 ? 'critical' : 'warning',
      type: 'high_burn_rate',
      message: `Projected monthly burn ($${data.projectedMonthCost.toFixed(0)}) exceeds threshold ($${thresholds.maxMonthlyBurn})`,
      data: { projected: data.projectedMonthCost, threshold: thresholds.maxMonthlyBurn },
    });
  }

  // Low margin
  if (data.grossMargin < thresholds.minGrossMargin && data.grossMargin !== 0) {
    alerts.push({
      id: `margin_${Date.now()}`,
      severity: data.grossMargin < 0 ? 'critical' : 'warning',
      type: 'margin_warning',
      message: `Gross margin (${(data.grossMargin * 100).toFixed(1)}%) below minimum (${(thresholds.minGrossMargin * 100).toFixed(0)}%)`,
      data: { margin: data.grossMargin, threshold: thresholds.minGrossMargin },
    });
  }

  // High free tier cost
  const avgFreeCost =
    data.costByTier.free.sessions > 0
      ? data.costByTier.free.cost / data.costByTier.free.sessions
      : 0;
  if (avgFreeCost > thresholds.maxCostPerFreeSession) {
    alerts.push({
      id: `free_cost_${Date.now()}`,
      severity: 'warning',
      type: 'cost_spike',
      message: `Average free session cost ($${avgFreeCost.toFixed(3)}) exceeds threshold ($${thresholds.maxCostPerFreeSession})`,
      data: { avgCost: avgFreeCost, threshold: thresholds.maxCostPerFreeSession },
    });
  }

  // ============== NEW ALERTS ==============

  // LTV:CAC ratio too low (business model risk)
  if (data.ltvCac.ltvCACRatio > 0 && data.ltvCac.ltvCACRatio < thresholds.minLTVCACRatio) {
    alerts.push({
      id: `ltv_cac_${Date.now()}`,
      severity: data.ltvCac.ltvCACRatio < 1.0 ? 'critical' : 'warning',
      type: 'margin_warning',
      message: `LTV:CAC ratio (${data.ltvCac.ltvCACRatio.toFixed(2)}) below minimum (${thresholds.minLTVCACRatio}). Consider reducing CAC or increasing prices.`,
      data: { ltvCac: data.ltvCac.ltvCACRatio, threshold: thresholds.minLTVCACRatio },
    });
  }

  // Free tier consuming too much of total cost
  if (data.freeTierCostPercent > thresholds.maxFreeTierCostPercent) {
    alerts.push({
      id: `free_tier_${Date.now()}`,
      severity: data.freeTierCostPercent > 0.8 ? 'critical' : 'warning',
      type: 'budget_exceeded',
      message: `Free tier costs (${(data.freeTierCostPercent * 100).toFixed(0)}%) exceed threshold (${(thresholds.maxFreeTierCostPercent * 100).toFixed(0)}%). Consider soft caps or conversion incentives.`,
      data: {
        freeTierPercent: data.freeTierCostPercent,
        threshold: thresholds.maxFreeTierCostPercent,
      },
    });
  }

  // Power users - whales (free users costing more than partner tier)
  const whales = data.powerUsers.filter(
    (u) => u.tier === 'free' && u.costEquivalentTier === 'whale'
  );
  if (whales.length > 0) {
    alerts.push({
      id: `whales_${Date.now()}`,
      severity: 'info',
      type: 'unprofitable_user',
      message: `${whales.length} free user(s) costing more than 2x Partner tier ($40+/mo). Consider conversion outreach.`,
      data: { whaleCount: whales.length, topWhale: whales[0]?.userId },
    });
  }

  // Unprofitable paid users
  const unprofitablePaid = data.powerUsers.filter((u) => u.isUnprofitable);
  if (unprofitablePaid.length > thresholds.maxUnprofitableUsers) {
    alerts.push({
      id: `unprofitable_${Date.now()}`,
      severity: 'warning',
      type: 'unprofitable_user',
      message: `${unprofitablePaid.length} paid users are unprofitable (cost > revenue). Review usage patterns.`,
      data: { count: unprofitablePaid.length, threshold: thresholds.maxUnprofitableUsers },
    });
  }

  return alerts;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Set monthly recurring revenue (from Stripe metrics).
 */
export function setMonthlyRevenue(revenue: number): void {
  monthlyRevenue = revenue;
  log.info({ revenue }, 'MRR updated');
}

/**
 * Set cash reserve for runway calculations.
 */
export function setCashReserve(amount: number): void {
  cashReserve = amount;
  log.info({ amount }, 'Cash reserve updated');
}

/**
 * Update alert thresholds.
 */
export function setThresholds(newThresholds: Partial<FinOpsThresholds>): void {
  thresholds = { ...thresholds, ...newThresholds };
  log.info({ thresholds }, 'Thresholds updated');
}

/**
 * Get current thresholds.
 */
export function getThresholds(): FinOpsThresholds {
  return { ...thresholds };
}

/**
 * Set Customer Acquisition Cost (for LTV:CAC calculation).
 * Calculate this from: Marketing spend / New paying customers acquired
 */
export function setCAC(amount: number): void {
  customerAcquisitionCost = amount;
  log.info({ cac: amount }, 'CAC updated');
}

/**
 * Set expected customer lifetime in months.
 * Can also calculate from: 1 / monthly churn rate
 */
export function setCustomerLifetime(months: number): void {
  avgCustomerLifetimeMonths = months;
  log.info({ lifetimeMonths: months }, 'Customer lifetime updated');
}

/**
 * Set monthly churn rate (0-1).
 * Calculate from: Churned customers / Total customers at month start
 */
export function setChurnRate(rate: number): void {
  churnRateMonthly = Math.max(0, Math.min(1, rate));
  log.info({ churnRate: churnRateMonthly }, 'Churn rate updated');
}

/**
 * Get current LTV:CAC inputs for debugging.
 */
export function getLTVCACInputs(): {
  cac: number;
  lifetimeMonths: number;
  churnRate: number;
} {
  return {
    cac: customerAcquisitionCost,
    lifetimeMonths: avgCustomerLifetimeMonths,
    churnRate: churnRateMonthly,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const finops = {
  // Recording
  recordLLMCost,
  recordTTSCost,
  recordSTTCost,
  recordLiveKitCost,
  startSession,
  endSession,

  // Analytics
  getSnapshot,
  getSessionCost,
  getSessionCostByUserId,

  // Configuration - Basic
  setMonthlyRevenue,
  setCashReserve,
  setThresholds,
  getThresholds,

  // Configuration - LTV:CAC
  setCAC,
  setCustomerLifetime,
  setChurnRate,
  getLTVCACInputs,

  // Constants
  PRICING,
};

export default finops;
