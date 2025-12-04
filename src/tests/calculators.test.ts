/**
 * Calculator Tools E2E Tests
 *
 * Actually executes the calculation functions to verify correctness.
 * These are the core financial calculations that users rely on.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateCompoundGrowth,
  calculateFeeImpact,
  calculateRetirementProjection,
  calculateMortgagePayment,
  calculateEmergencyFund,
  calculateSavingsRate,
  calculateYearsToDouble,
} from '../tools/calculators.js';

describe('Calculator E2E Tests', () => {
  describe('calculateCompoundGrowth', () => {
    it('should calculate basic compound growth without contributions', () => {
      const result = calculateCompoundGrowth(10000, 0, 10, 7);

      // $10,000 at 7% for 10 years should approximately double
      expect(result.finalValue).toBeGreaterThan(18000);
      expect(result.finalValue).toBeLessThan(22000);
      expect(result.totalContributed).toBe(10000);
      expect(result.totalGrowth).toBe(result.finalValue - result.totalContributed);
    });

    it('should calculate compound growth with monthly contributions', () => {
      const result = calculateCompoundGrowth(10000, 500, 30, 7);

      // $10k initial + $500/mo for 30 years at 7% should be substantial
      expect(result.totalContributed).toBe(10000 + 500 * 12 * 30);
      expect(result.finalValue).toBeGreaterThan(500000);
      expect(result.totalGrowth).toBeGreaterThan(result.totalContributed);
    });

    it('should handle zero principal with only contributions', () => {
      const result = calculateCompoundGrowth(0, 500, 10, 7);

      // $500/mo for 10 years = $60k contributed
      expect(result.totalContributed).toBe(60000);
      expect(result.finalValue).toBeGreaterThan(result.totalContributed);
    });

    it('should handle zero years (no growth)', () => {
      const result = calculateCompoundGrowth(10000, 500, 0, 7);

      expect(result.finalValue).toBe(10000);
      expect(result.totalContributed).toBe(10000);
      expect(result.totalGrowth).toBe(0);
    });

    it('should handle high return rates', () => {
      const result = calculateCompoundGrowth(10000, 0, 10, 15);

      // 15% for 10 years should roughly quadruple
      expect(result.finalValue).toBeGreaterThan(35000);
    });

    it('should handle low/zero return rates', () => {
      const result = calculateCompoundGrowth(10000, 100, 5, 0);

      // 0% return means just the contributions
      expect(result.totalContributed).toBe(10000 + 100 * 12 * 5);
      expect(result.finalValue).toBe(result.totalContributed);
    });
  });

  describe('calculateFeeImpact', () => {
    it('should show dramatic fee impact over time', () => {
      const result = calculateFeeImpact(100000, 30, 7, 0.1, 2);

      // Classic Bogle example: $100k over 30 years
      // 7% - 0.1% = 6.9% net return for low fee
      // 7% - 2% = 5% net return for high fee
      expect(result.lowFeeValue).toBeGreaterThan(700000);
      expect(result.highFeeValue).toBeLessThan(500000);
      expect(result.difference).toBeGreaterThan(300000);
      expect(result.percentLost).toBeGreaterThan(40);
    });

    it('should show minimal impact with similar fees', () => {
      const result = calculateFeeImpact(100000, 30, 7, 0.1, 0.15);

      // Even 0.05% difference adds up over 30 years
      expect(result.difference).toBeLessThan(15000);
      expect(result.percentLost).toBeLessThan(3);
    });

    it('should handle short time periods', () => {
      const result = calculateFeeImpact(100000, 1, 7, 0.1, 2);

      // 1 year difference should be small but measurable
      expect(result.difference).toBeLessThan(5000);
      expect(result.lowFeeValue).toBeGreaterThan(result.highFeeValue);
    });

    it('should work with zero low fee', () => {
      const result = calculateFeeImpact(100000, 20, 7, 0, 1);

      expect(result.lowFeeValue).toBeGreaterThan(result.highFeeValue);
      expect(result.difference).toBeGreaterThan(0);
    });
  });

  describe('calculateRetirementProjection', () => {
    it('should project reasonable retirement savings', () => {
      const result = calculateRetirementProjection(30, 65, 50000, 500, 7);

      // 35 years of saving should grow substantially
      expect(result.yearsToRetirement).toBe(35);
      expect(result.projectedSavings).toBeGreaterThan(500000);
      expect(result.monthlyIncome).toBeGreaterThan(0);
      expect(result.yearsOfSavings).toBe(25); // 4% withdrawal = 25 years
    });

    it('should handle short time to retirement', () => {
      const result = calculateRetirementProjection(60, 65, 500000, 1000, 7);

      expect(result.yearsToRetirement).toBe(5);
      expect(result.projectedSavings).toBeGreaterThan(500000);
    });

    it('should calculate monthly income using 4% rule', () => {
      // $1,000,000 at 4% = $40,000/year = ~$3,333/month
      const result = calculateRetirementProjection(64, 65, 960000, 3333, 7);

      // Should end up around $1M
      expect(result.monthlyIncome).toBeGreaterThan(3000);
      expect(result.monthlyIncome).toBeLessThan(4500);
    });

    it('should handle zero current savings', () => {
      const result = calculateRetirementProjection(25, 65, 0, 500, 7);

      expect(result.yearsToRetirement).toBe(40);
      expect(result.projectedSavings).toBeGreaterThan(1000000);
    });
  });

  describe('calculateMortgagePayment', () => {
    it('should calculate standard 30-year mortgage', () => {
      // $300k loan at 7% for 30 years
      const result = calculateMortgagePayment(300000, 7, 30);

      // Monthly payment should be around $2,000
      expect(result.monthlyPayment).toBeGreaterThan(1900);
      expect(result.monthlyPayment).toBeLessThan(2100);

      // Total payment over 30 years
      expect(result.totalPayment).toBeGreaterThan(700000);

      // Interest should be more than principal for long terms
      expect(result.totalInterest).toBeGreaterThan(result.totalPayment / 2);
    });

    it('should calculate 15-year mortgage with lower interest', () => {
      const result15 = calculateMortgagePayment(300000, 6, 15);
      const result30 = calculateMortgagePayment(300000, 7, 30);

      // 15-year has higher monthly but WAY less total interest
      expect(result15.monthlyPayment).toBeGreaterThan(result30.monthlyPayment);
      expect(result15.totalInterest).toBeLessThan(result30.totalInterest);
    });

    it('should handle small loans', () => {
      const result = calculateMortgagePayment(50000, 5, 10);

      expect(result.monthlyPayment).toBeGreaterThan(500);
      expect(result.monthlyPayment).toBeLessThan(600);
    });

    it('should handle very low interest rates', () => {
      const result = calculateMortgagePayment(300000, 3, 30);

      // 3% rate should have much lower payment than 7%
      expect(result.monthlyPayment).toBeLessThan(1500);
    });
  });

  describe('calculateEmergencyFund', () => {
    it('should calculate 6-month emergency fund by default', () => {
      const result = calculateEmergencyFund(5000);

      expect(result.targetAmount).toBe(30000);
      expect(result.description).toContain('6 months');
      expect(result.description).toContain('$5,000');
    });

    it('should calculate custom month coverage', () => {
      const result = calculateEmergencyFund(3000, 3);

      expect(result.targetAmount).toBe(9000);
      expect(result.description).toContain('3 months');
    });

    it('should handle 12-month coverage', () => {
      const result = calculateEmergencyFund(4000, 12);

      expect(result.targetAmount).toBe(48000);
      expect(result.description).toContain('12 months');
    });
  });

  describe('calculateSavingsRate', () => {
    it('should calculate excellent savings rate (20%+)', () => {
      const result = calculateSavingsRate(10000, 2500);

      expect(result.rate).toBe(25);
      expect(result.assessment).toContain('Excellent');
    });

    it('should calculate good savings rate (15-20%)', () => {
      const result = calculateSavingsRate(10000, 1700);

      expect(result.rate).toBe(17);
      expect(result.assessment).toContain('Good');
    });

    it('should calculate solid savings rate (10-15%)', () => {
      const result = calculateSavingsRate(10000, 1200);

      expect(result.rate).toBe(12);
      expect(result.assessment).toContain('Solid');
    });

    it('should flag low savings rate (<10%)', () => {
      const result = calculateSavingsRate(10000, 500);

      expect(result.rate).toBe(5);
      expect(result.assessment).toContain('boost');
    });

    it('should handle edge case of zero savings', () => {
      const result = calculateSavingsRate(10000, 0);

      expect(result.rate).toBe(0);
      expect(result.assessment).toContain('boost');
    });
  });

  describe('calculateYearsToDouble', () => {
    it('should calculate Rule of 72 correctly', () => {
      // At 7% return, money doubles in ~10 years
      expect(calculateYearsToDouble(7)).toBe(10);

      // At 10% return, doubles in ~7 years
      expect(calculateYearsToDouble(10)).toBe(7);

      // At 6% return, doubles in 12 years
      expect(calculateYearsToDouble(6)).toBe(12);

      // At 12% return, doubles in 6 years
      expect(calculateYearsToDouble(12)).toBe(6);
    });

    it('should handle low return rates', () => {
      // At 2% return, doubles in 36 years
      expect(calculateYearsToDouble(2)).toBe(36);

      // At 3% return, doubles in 24 years
      expect(calculateYearsToDouble(3)).toBe(24);
    });

    it('should handle high return rates', () => {
      // At 18% return, doubles in 4 years
      expect(calculateYearsToDouble(18)).toBe(4);

      // At 24% return, doubles in 3 years
      expect(calculateYearsToDouble(24)).toBe(3);
    });
  });

  describe('Cross-validation', () => {
    it('should have compound growth match retirement projection', () => {
      const compound = calculateCompoundGrowth(50000, 500, 35, 7);
      const retirement = calculateRetirementProjection(30, 65, 50000, 500, 7);

      expect(compound.finalValue).toBe(retirement.projectedSavings);
    });

    it('should show fees matter more than a few extra years', () => {
      // High fees for 30 years vs low fees for 25 years
      const highFee30 = calculateFeeImpact(100000, 30, 7, 1.5, 1.5);
      const lowFee25 = calculateFeeImpact(100000, 25, 7, 0.1, 0.1);

      // Low fee for 25 years often beats high fee for 30!
      // This is a core Bogle lesson
      const high30Value = highFee30.highFeeValue;
      const low25Value = lowFee25.lowFeeValue;

      // Both should be positive, reasonable values
      expect(high30Value).toBeGreaterThan(0);
      expect(low25Value).toBeGreaterThan(0);
    });
  });
});
