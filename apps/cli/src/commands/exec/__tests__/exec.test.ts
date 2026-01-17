/**
 * Executive Command Tests
 *
 * Tests for the Better Than Human executive intelligence system:
 * - exec.ts - Unified executive dashboard
 * - better-than-human.ts - Cross-functional pattern detection
 * - proactive-outreach.ts - Scheduled outreach system
 * - unified-knowledge-context.ts - Institutional memory
 * - scheduler.ts - Cron job management
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { getExecutiveMetrics, ExecutiveMetrics } from '../exec.js';

describe('Executive Dashboard', () => {
  describe('getExecutiveMetrics', () => {
    // Cache metrics once since getExecutiveMetrics() runs slow execSync commands
    let metrics: ExecutiveMetrics;

    beforeAll(() => {
      metrics = getExecutiveMetrics();
    }, 60000); // 60 second timeout for initial data fetch

    it('returns metrics for all C-suite roles', () => {
      expect(metrics).toHaveProperty('ceo');
      expect(metrics).toHaveProperty('cto');
      expect(metrics).toHaveProperty('cio');
      expect(metrics).toHaveProperty('cpo');
      expect(metrics).toHaveProperty('cmo');
      expect(metrics).toHaveProperty('csco');
    });

    it('CEO metrics have required fields', () => {
      expect(metrics.ceo).toHaveProperty('companyHealth');
      expect(metrics.ceo).toHaveProperty('okrProgress');
      expect(metrics.ceo).toHaveProperty('pendingDecisions');
      expect(metrics.ceo).toHaveProperty('alerts');
      expect(Array.isArray(metrics.ceo.alerts)).toBe(true);
    });

    it('CTO metrics have required fields', () => {
      expect(metrics.cto).toHaveProperty('systemHealth');
      expect(metrics.cto).toHaveProperty('techDebtScore');
      expect(metrics.cto).toHaveProperty('openIncidents');
      expect(metrics.cto).toHaveProperty('securityScore');
      expect(metrics.cto).toHaveProperty('alerts');
      expect(Array.isArray(metrics.cto.alerts)).toBe(true);
    });

    it('CTO metrics pulls real data from codebase', () => {
      // CTO metrics should have reasonable ranges based on real data
      expect(metrics.cto.systemHealth).toBeGreaterThanOrEqual(50);
      expect(metrics.cto.systemHealth).toBeLessThanOrEqual(100);
      expect(metrics.cto.techDebtScore).toBeGreaterThanOrEqual(0);
      expect(metrics.cto.techDebtScore).toBeLessThanOrEqual(50);
      expect(metrics.cto.securityScore).toBeGreaterThanOrEqual(50);
      expect(metrics.cto.securityScore).toBeLessThanOrEqual(100);
    });

    it('CIO metrics have required fields', () => {
      expect(metrics.cio).toHaveProperty('complianceScore');
      expect(metrics.cio).toHaveProperty('dataRiskScore');
      expect(metrics.cio).toHaveProperty('accessReviewsPending');
      expect(metrics.cio).toHaveProperty('vendorsExpiringSoon');
      expect(metrics.cio).toHaveProperty('alerts');
    });

    it('CPO metrics have required fields', () => {
      expect(metrics.cpo).toHaveProperty('featureVelocity');
      expect(metrics.cpo).toHaveProperty('userSatisfaction');
      expect(metrics.cpo).toHaveProperty('activeExperiments');
      expect(metrics.cpo).toHaveProperty('churnRisk');
      expect(metrics.cpo).toHaveProperty('alerts');
    });

    it('CMO metrics have required fields', () => {
      expect(metrics.cmo).toHaveProperty('campaignROAS');
      expect(metrics.cmo).toHaveProperty('socialEngagement');
      expect(metrics.cmo).toHaveProperty('seoHealth');
      expect(metrics.cmo).toHaveProperty('brandSentiment');
      expect(metrics.cmo).toHaveProperty('alerts');
    });

    it('CSCO metrics have required fields', () => {
      expect(metrics.csco).toHaveProperty('operationalEfficiency');
      expect(metrics.csco).toHaveProperty('costOptimization');
      expect(metrics.csco).toHaveProperty('vendorHealth');
      expect(metrics.csco).toHaveProperty('slaCompliance');
      expect(metrics.csco).toHaveProperty('alerts');
    });
  });
});
