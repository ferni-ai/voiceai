/**
 * Contextual Partnerships Service
 *
 * Affiliate/referral system that ONLY recommends products when
 * genuinely helpful in context. This is NOT advertising.
 *
 * Philosophy: "Ferni would recommend this even if we weren't getting paid."
 *
 * Key principles:
 * 1. Only recommend when contextually perfect
 * 2. User should never feel "sold to"
 * 3. We only partner with products we'd genuinely recommend
 * 4. Recommendations are conversational, not promotional
 * 5. User feedback affects partner quality scores
 */

import {
  EXAMPLE_PARTNERS,
  type Partner,
  type PartnerCategory,
  type PartnerReferral,
} from '../../types/monetization.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ContextualPartnerships' });

// ============================================================================
// IN-MEMORY STORAGE (Replace with DB in production)
// ============================================================================

const partners: Map<string, Partner> = new Map();
const referrals: Map<string, PartnerReferral> = new Map();

// Initialize with example partners
function initializePartners(): void {
  EXAMPLE_PARTNERS.forEach((example, index) => {
    const partner: Partner = {
      id: `partner_${index}`,
      name: example.name ?? '',
      description: example.description ?? '',
      category: example.category ?? 'mental_health',
      affiliateUrl: `https://partner.example.com/${example.name?.toLowerCase()}?ref=ferni`,
      commissionType: 'percentage',
      commissionValue: 20, // 20%
      triggerKeywords: example.triggerKeywords ?? [],
      appropriateContexts: [],
      introductionTemplates: example.introductionTemplates ?? [],
      isActive: true,
      qualityScore: 85, // Start at 85/100
      createdAt: new Date(),
    };
    partners.set(partner.id, partner);
  });
}

initializePartners();

// ============================================================================
// PARTNER MATCHING
// ============================================================================

/**
 * Find partners that might be relevant based on conversation content
 */
export function findRelevantPartners(params: {
  message: string;
  conversationContext?: string;
  excludePartnerIds?: string[];
}): Partner[] {
  const { message, conversationContext = '', excludePartnerIds = [] } = params;
  const combinedText = `${message} ${conversationContext}`.toLowerCase();

  const matches: Partner[] = [];

  for (const partner of partners.values()) {
    // Skip inactive or excluded partners
    if (!partner.isActive || excludePartnerIds.includes(partner.id)) continue;

    // Skip low quality partners
    if (partner.qualityScore < 70) continue;

    // Check if any trigger keywords match
    const keywordMatch = partner.triggerKeywords.some((keyword) =>
      combinedText.includes(keyword.toLowerCase())
    );

    if (keywordMatch) {
      matches.push(partner);
    }
  }

  // Sort by quality score
  return matches.sort((a, b) => b.qualityScore - a.qualityScore);
}

/**
 * Get the best partner recommendation for a context
 */
export function getBestPartnerRecommendation(params: {
  message: string;
  conversationContext?: string;
  recentRecommendations?: string[];
}): { partner: Partner; introduction: string } | null {
  const { message, conversationContext, recentRecommendations = [] } = params;

  const relevantPartners = findRelevantPartners({
    message,
    conversationContext,
    excludePartnerIds: recentRecommendations,
  });

  if (relevantPartners.length === 0) return null;

  // Get top partner
  const partner = relevantPartners[0];

  // Get a random introduction template
  const introduction =
    partner.introductionTemplates[Math.floor(Math.random() * partner.introductionTemplates.length)];

  return { partner, introduction };
}

// ============================================================================
// RECOMMENDATION RULES
// ============================================================================

/**
 * Should we show a partner recommendation?
 *
 * This is intentionally conservative. We'd rather miss a recommendation
 * opportunity than annoy users or feel salesy.
 */
export function shouldShowRecommendation(params: {
  conversationTurnCount: number;
  recommendationsShownThisSession: number;
  recommendationsShownTotal: number;
  daysSinceLastRecommendation: number;
  userEngagementLevel: 'low' | 'medium' | 'high';
  topicIsAppropriate: boolean;
}): boolean {
  const {
    conversationTurnCount,
    recommendationsShownThisSession,
    daysSinceLastRecommendation,
    userEngagementLevel,
    topicIsAppropriate,
  } = params;

  // Never in first few turns
  if (conversationTurnCount < 5) return false;

  // Maximum 1 per session
  if (recommendationsShownThisSession >= 1) return false;

  // Minimum 3 days between recommendations
  if (daysSinceLastRecommendation < 3) return false;

  // Only when topic is actually appropriate
  if (!topicIsAppropriate) return false;

  // Only for engaged users (they're actually listening)
  if (userEngagementLevel === 'low') return false;

  // With all conditions met, still only 30% of the time
  return Math.random() < 0.3;
}

// ============================================================================
// REFERRAL TRACKING
// ============================================================================

/**
 * Record a referral (when recommendation is shown)
 */
export function recordReferral(params: {
  partnerId: string;
  userId: string;
  conversationId: string;
  triggerContext: string;
}): PartnerReferral {
  const { partnerId, userId, conversationId, triggerContext } = params;

  const referral: PartnerReferral = {
    id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    partnerId,
    userId,
    conversationId,
    triggerContext,
    clicked: false,
    converted: false,
    createdAt: new Date(),
  };

  referrals.set(referral.id, referral);

  log.info(
    {
      referralId: referral.id,
      partnerId,
      userId,
    },
    'Referral recorded'
  );

  return referral;
}

/**
 * Record a click on a referral link
 */
export function recordClick(referralId: string): void {
  const referral = referrals.get(referralId);
  if (referral) {
    referral.clicked = true;
    referral.clickedAt = new Date();

    log.info({ referralId }, 'Referral clicked');
  }
}

/**
 * Record a conversion (partner webhook)
 */
export function recordConversion(referralId: string, commissionCents: number): void {
  const referral = referrals.get(referralId);
  if (referral) {
    referral.converted = true;
    referral.convertedAt = new Date();
    referral.commissionCents = commissionCents;

    log.info({ referralId, commissionCents }, 'Referral converted');
  }
}

// ============================================================================
// PARTNER QUALITY
// ============================================================================

/**
 * Update partner quality score based on user feedback
 */
export function updatePartnerQuality(partnerId: string, feedback: 'helpful' | 'not_helpful'): void {
  const partner = partners.get(partnerId);
  if (!partner) return;

  // Adjust score based on feedback
  const adjustment = feedback === 'helpful' ? 2 : -5;
  partner.qualityScore = Math.max(0, Math.min(100, partner.qualityScore + adjustment));

  // Deactivate if quality too low
  if (partner.qualityScore < 50) {
    partner.isActive = false;
    log.warn(
      { partnerId, qualityScore: partner.qualityScore },
      'Partner deactivated due to low quality'
    );
  }

  log.debug(
    {
      partnerId,
      feedback,
      newScore: partner.qualityScore,
    },
    'Partner quality updated'
  );
}

/**
 * Get user feedback prompt for a recommendation
 */
export function getFeedbackPrompt(): string {
  return 'Was that recommendation helpful? (Just curious - helps me get better at this)';
}

// ============================================================================
// PARTNER MANAGEMENT
// ============================================================================

/**
 * Add a new partner
 */
export function addPartner(partner: Omit<Partner, 'id' | 'createdAt' | 'qualityScore'>): Partner {
  const newPartner: Partner = {
    ...partner,
    id: `partner_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    qualityScore: 80, // Start slightly lower than existing
    createdAt: new Date(),
  };

  partners.set(newPartner.id, newPartner);

  log.info({ partnerId: newPartner.id, name: newPartner.name }, 'Partner added');

  return newPartner;
}

/**
 * Get all active partners
 */
export function getActivePartners(): Partner[] {
  return Array.from(partners.values()).filter((p) => p.isActive);
}

/**
 * Get partners by category
 */
export function getPartnersByCategory(category: PartnerCategory): Partner[] {
  return Array.from(partners.values()).filter((p) => p.category === category && p.isActive);
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Get partnership analytics
 */
export function getPartnershipStats(): {
  totalReferrals: number;
  totalClicks: number;
  totalConversions: number;
  totalCommissionCents: number;
  clickThroughRate: number;
  conversionRate: number;
  topPartners: Array<{ partner: Partner; referrals: number; conversions: number }>;
} {
  const allReferrals = Array.from(referrals.values());
  const clicks = allReferrals.filter((r) => r.clicked);
  const conversions = allReferrals.filter((r) => r.converted);

  // Calculate by partner
  const partnerStats = new Map<string, { referrals: number; conversions: number }>();
  for (const referral of allReferrals) {
    const stats = partnerStats.get(referral.partnerId) ?? { referrals: 0, conversions: 0 };
    stats.referrals++;
    if (referral.converted) stats.conversions++;
    partnerStats.set(referral.partnerId, stats);
  }

  const topPartners = Array.from(partnerStats.entries())
    .map(([partnerId, stats]) => ({
      partner: partners.get(partnerId)!,
      ...stats,
    }))
    .filter((p) => p.partner)
    .sort((a, b) => b.conversions - a.conversions)
    .slice(0, 10);

  return {
    totalReferrals: allReferrals.length,
    totalClicks: clicks.length,
    totalConversions: conversions.length,
    totalCommissionCents: conversions.reduce((sum, r) => sum + (r.commissionCents ?? 0), 0),
    clickThroughRate: allReferrals.length > 0 ? clicks.length / allReferrals.length : 0,
    conversionRate: clicks.length > 0 ? conversions.length / clicks.length : 0,
    topPartners,
  };
}

// ============================================================================
// NATURAL LANGUAGE INTEGRATION
// ============================================================================

/**
 * Get a natural way to introduce a partner in conversation
 * These should feel like genuine recommendations, not ads
 */
export function getNaturalIntroduction(partner: Partner, context: string): string {
  // Pick a template
  const template =
    partner.introductionTemplates[Math.floor(Math.random() * partner.introductionTemplates.length)];

  // If no template, generate a generic one
  if (!template) {
    return `Have you heard of ${partner.name}? ${partner.description} It might help with what you're describing.`;
  }

  return template;
}

/**
 * Get the disclosure message (for transparency)
 */
export function getDisclosure(): string {
  return '(I should mention - if you check them out through my link, it helps support Ferni. But I only recommend things I genuinely think could help you.)';
}

// ============================================================================
// EXPORTS
// ============================================================================

export const contextualPartnerships = {
  // Matching
  findRelevant: findRelevantPartners,
  getBestRecommendation: getBestPartnerRecommendation,
  shouldShow: shouldShowRecommendation,

  // Tracking
  recordReferral,
  recordClick,
  recordConversion,

  // Quality
  updateQuality: updatePartnerQuality,
  getFeedbackPrompt,

  // Management
  addPartner,
  getActivePartners,
  getPartnersByCategory,

  // Analytics
  getStats: getPartnershipStats,

  // Integration
  getNaturalIntroduction,
  getDisclosure,
};

export default contextualPartnerships;
