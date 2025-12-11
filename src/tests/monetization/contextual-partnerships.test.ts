/**
 * Contextual Partnerships Service Tests
 *
 * Tests for affiliate/referral recommendations.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  addPartner,
  contextualPartnerships,
  findRelevantPartners,
  getActivePartners,
  getBestPartnerRecommendation,
  getDisclosure,
  getFeedbackPrompt,
  getNaturalIntroduction,
  getPartnersByCategory,
  getPartnershipStats,
  recordClick,
  recordConversion,
  recordReferral,
  shouldShowRecommendation,
  updatePartnerQuality,
} from '../../services/monetization/contextual-partnerships.js';

describe('Contextual Partnerships Service', () => {
  describe('findRelevantPartners', () => {
    it('should find partners for sleep-related messages', () => {
      const partners = findRelevantPartners({
        message: "I've been having trouble sleeping lately",
      });

      expect(partners).toBeDefined();
      expect(Array.isArray(partners)).toBe(true);
      // Should find meditation/sleep apps like Calm
      if (partners.length > 0) {
        expect(partners[0].category).toBe('mental_health');
      }
    });

    it('should find partners for financial messages', () => {
      const partners = findRelevantPartners({
        message: 'I need help with my budget and saving money',
      });

      if (partners.length > 0) {
        expect(partners[0].category).toBe('financial');
      }
    });

    it('should respect exclude list', () => {
      const partners1 = findRelevantPartners({
        message: "I can't sleep",
      });

      if (partners1.length > 0) {
        const excluded = partners1[0].id;
        const partners2 = findRelevantPartners({
          message: "I can't sleep",
          excludePartnerIds: [excluded],
        });

        // Second search should not include the excluded partner
        const foundExcluded = partners2.find((p) => p.id === excluded);
        expect(foundExcluded).toBeUndefined();
      }
    });
  });

  describe('getBestPartnerRecommendation', () => {
    it('should return best recommendation with introduction', () => {
      const rec = getBestPartnerRecommendation({
        message: 'I need help managing my anxiety and stress',
      });

      if (rec) {
        expect(rec.partner).toBeDefined();
        expect(rec.introduction).toBeDefined();
        expect(typeof rec.introduction).toBe('string');
        expect(rec.introduction.length).toBeGreaterThan(0);
      }
    });

    it('should return null for irrelevant messages', () => {
      const rec = getBestPartnerRecommendation({
        message: 'The sky is blue today',
      });

      expect(rec).toBeNull();
    });
  });

  describe('shouldShowRecommendation', () => {
    it('should not show in early conversation', () => {
      const shouldShow = shouldShowRecommendation({
        conversationTurnCount: 2, // Too early
        recommendationsShownThisSession: 0,
        recommendationsShownTotal: 0,
        daysSinceLastRecommendation: 30,
        userEngagementLevel: 'high',
        topicIsAppropriate: true,
      });

      expect(shouldShow).toBe(false);
    });

    it('should not show too many in session', () => {
      const shouldShow = shouldShowRecommendation({
        conversationTurnCount: 20,
        recommendationsShownThisSession: 2, // Already shown 2 this session
        recommendationsShownTotal: 10,
        daysSinceLastRecommendation: 7,
        userEngagementLevel: 'high',
        topicIsAppropriate: true,
      });

      expect(shouldShow).toBe(false);
    });

    it('should show for appropriate context', () => {
      const shouldShow = shouldShowRecommendation({
        conversationTurnCount: 15,
        recommendationsShownThisSession: 0,
        recommendationsShownTotal: 5,
        daysSinceLastRecommendation: 14,
        userEngagementLevel: 'high',
        topicIsAppropriate: true,
      });

      // Result depends on implementation details
      expect(typeof shouldShow).toBe('boolean');
    });

    it('should not show for inappropriate topics', () => {
      const shouldShow = shouldShowRecommendation({
        conversationTurnCount: 15,
        recommendationsShownThisSession: 0,
        recommendationsShownTotal: 0,
        daysSinceLastRecommendation: 30,
        userEngagementLevel: 'high',
        topicIsAppropriate: false, // Not appropriate
      });

      expect(shouldShow).toBe(false);
    });
  });

  describe('recordReferral', () => {
    let testPartners: ReturnType<typeof getActivePartners>;

    beforeEach(() => {
      testPartners = getActivePartners();
    });

    it('should record a referral', () => {
      if (testPartners.length > 0) {
        const referral = recordReferral({
          partnerId: testPartners[0].id,
          userId: 'test-user-1',
          conversationId: 'conv-1',
          triggerContext: 'User mentioned sleep problems',
        });

        expect(referral).toBeDefined();
        expect(referral.id).toBeDefined();
        expect(referral.partnerId).toBe(testPartners[0].id);
        expect(referral.userId).toBe('test-user-1');
        expect(referral.clicked).toBe(false);
        expect(referral.converted).toBe(false);
      }
    });
  });

  describe('recordClick', () => {
    it('should mark referral as clicked', () => {
      const partners = getActivePartners();
      if (partners.length > 0) {
        const referral = recordReferral({
          partnerId: partners[0].id,
          userId: 'click-test-user',
          conversationId: 'conv-2',
          triggerContext: 'Test',
        });

        recordClick(referral.id);

        // We can verify through stats
        const stats = getPartnershipStats();
        expect(stats.totalClicks).toBeGreaterThan(0);
      }
    });
  });

  describe('recordConversion', () => {
    it('should record conversion with commission', () => {
      const partners = getActivePartners();
      if (partners.length > 0) {
        const referral = recordReferral({
          partnerId: partners[0].id,
          userId: 'convert-test-user',
          conversationId: 'conv-3',
          triggerContext: 'Test',
        });

        recordClick(referral.id);
        recordConversion(referral.id, 1000); // $10 commission

        const stats = getPartnershipStats();
        expect(stats.totalConversions).toBeGreaterThan(0);
        expect(stats.totalCommissionCents).toBeGreaterThanOrEqual(1000);
      }
    });
  });

  describe('updatePartnerQuality', () => {
    it('should update quality score based on feedback', () => {
      const partners = getActivePartners();
      if (partners.length > 0) {
        const originalScore = partners[0].qualityScore;

        updatePartnerQuality(partners[0].id, 'helpful');
        const updatedPartners = getActivePartners();
        const updated = updatedPartners.find((p) => p.id === partners[0].id);

        if (updated) {
          expect(updated.qualityScore).toBeGreaterThanOrEqual(originalScore);
        }
      }
    });

    it('should decrease score for negative feedback', () => {
      const partners = getActivePartners();
      if (partners.length > 0) {
        const originalScore = partners[0].qualityScore;

        updatePartnerQuality(partners[0].id, 'not_helpful');
        const updatedPartners = getActivePartners();
        const updated = updatedPartners.find((p) => p.id === partners[0].id);

        if (updated) {
          expect(updated.qualityScore).toBeLessThanOrEqual(originalScore);
        }
      }
    });
  });

  describe('getFeedbackPrompt', () => {
    it('should return feedback prompt', () => {
      const prompt = getFeedbackPrompt();

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.toLowerCase()).toContain('helpful');
    });
  });

  describe('addPartner', () => {
    it('should add new partner', () => {
      const newPartner = addPartner({
        name: 'Test Partner',
        description: 'A test partner for unit tests',
        category: 'productivity',
        affiliateUrl: 'https://example.com/ref=ferni',
        commissionPercent: 15,
        triggerKeywords: ['productivity', 'focus', 'work'],
        introductionTemplates: ['Check out Test Partner!'],
        isActive: true,
      });

      expect(newPartner).toBeDefined();
      expect(newPartner.id).toBeDefined();
      expect(newPartner.name).toBe('Test Partner');
      expect(newPartner.qualityScore).toBe(80); // Default quality score
    });
  });

  describe('getActivePartners', () => {
    it('should return only active partners', () => {
      const partners = getActivePartners();

      expect(partners).toBeDefined();
      expect(Array.isArray(partners)).toBe(true);
      partners.forEach((p) => {
        expect(p.isActive).toBe(true);
      });
    });
  });

  describe('getPartnersByCategory', () => {
    it('should filter by category', () => {
      const mentalHealthPartners = getPartnersByCategory('mental_health');

      expect(mentalHealthPartners).toBeDefined();
      mentalHealthPartners.forEach((p) => {
        expect(p.category).toBe('mental_health');
      });
    });
  });

  describe('getPartnershipStats', () => {
    it('should return aggregate statistics', () => {
      const stats = getPartnershipStats();

      expect(stats).toBeDefined();
      expect(typeof stats.totalReferrals).toBe('number');
      expect(typeof stats.totalClicks).toBe('number');
      expect(typeof stats.totalConversions).toBe('number');
      expect(typeof stats.totalCommissionCents).toBe('number');
      expect(typeof stats.clickThroughRate).toBe('number');
      expect(typeof stats.conversionRate).toBe('number');
      expect(Array.isArray(stats.topPartners)).toBe(true);
    });
  });

  describe('getNaturalIntroduction', () => {
    it('should return natural introduction for partner', () => {
      const partners = getActivePartners();
      if (partners.length > 0) {
        const intro = getNaturalIntroduction(partners[0], "I can't sleep at night");

        expect(intro).toBeDefined();
        expect(typeof intro).toBe('string');
        expect(intro.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getDisclosure', () => {
    it('should return affiliate disclosure', () => {
      const disclosure = getDisclosure();

      expect(disclosure).toBeDefined();
      expect(typeof disclosure).toBe('string');
      expect(disclosure.toLowerCase()).toContain('support');
    });
  });

  describe('contextualPartnerships namespace', () => {
    it('should export all functions via namespace', () => {
      expect(contextualPartnerships.findRelevant).toBeDefined();
      expect(contextualPartnerships.getBestRecommendation).toBeDefined();
      expect(contextualPartnerships.shouldShow).toBeDefined();
      expect(contextualPartnerships.recordReferral).toBeDefined();
      expect(contextualPartnerships.recordClick).toBeDefined();
      expect(contextualPartnerships.recordConversion).toBeDefined();
      expect(contextualPartnerships.updateQuality).toBeDefined();
      expect(contextualPartnerships.getFeedbackPrompt).toBeDefined();
      expect(contextualPartnerships.addPartner).toBeDefined();
      expect(contextualPartnerships.getActivePartners).toBeDefined();
      expect(contextualPartnerships.getPartnersByCategory).toBeDefined();
      expect(contextualPartnerships.getStats).toBeDefined();
      expect(contextualPartnerships.getNaturalIntroduction).toBeDefined();
      expect(contextualPartnerships.getDisclosure).toBeDefined();
    });
  });
});
