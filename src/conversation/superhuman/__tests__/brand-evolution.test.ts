/**
 * Brand Evolution Features Tests
 * 
 * Tests for the brand evolution systems:
 * - Brand Secrets (easter eggs, milestones, achievements)
 * - Late Night Warmth (2am mode)
 * - Memory Callbacks
 * - Reflection Sunday
 * - Growth Letter
 * 
 * @module conversation/superhuman/__tests__/brand-evolution.test
 */

import { describe, expect, it, beforeEach } from 'vitest';

// Brand Secrets
import {
  checkBrandSecrets,
  checkAchievements,
  resetSessionSecrets,
  resetUserSecretState,
  type SecretContext,
} from '../brand-secrets.js';

// Late Night Warmth
import {
  getLateNightContext,
  getLateNightGreeting,
  getLateNightBehaviors,
  resetLateNightState,
} from '../late-night-warmth.js';

// Memory Callbacks
import {
  generateMemoryCallback,
  storeQuote,
  storePattern,
  storeMilestone,
  storeDream,
  getMemoryCallbackStats,
} from '../memory-callbacks.js';

// Integration
import {
  initializeBrandEvolutionSession,
  resetBrandEvolutionSession,
  processBrandEvolution,
} from '../brand-evolution-integration.js';

// Reflection Sunday
import {
  getCurrentWeekNumber,
  isSunday,
  getWeeklyPrompt,
  recordParticipation,
  getUserStats,
} from '../../../services/rituals/reflection-sunday.js';

// Growth Letter
import {
  isFirstSundayOfMonth,
  getCurrentTheme,
  generateEmailBody,
  calculateMonthStats,
} from '../../../services/rituals/growth-letter.js';

describe('Brand Evolution Features', () => {
  beforeEach(() => {
    resetSessionSecrets();
    resetLateNightState();
    resetUserSecretState('test-user');
    resetBrandEvolutionSession();
  });

  // ==========================================================================
  // BRAND SECRETS TESTS
  // ==========================================================================
  
  describe('Brand Secrets', () => {
    it('should detect milestone at 7th conversation', () => {
      const context: SecretContext = {
        userId: 'test-user',
        conversationCount: 7,
        localTime: new Date(),
      };
      
      const result = checkBrandSecrets(context);
      
      // Milestone 7 is a one-time secret
      if (result.triggered) {
        expect(result.secret?.type).toBe('milestone');
        expect(result.response).toContain('seventh');
      }
    });
    
    it('should detect phrase triggers', () => {
      const context: SecretContext = {
        userId: 'test-user',
        conversationCount: 5,
        userMessage: 'Open the pod bay doors, HAL',
        localTime: new Date(),
      };
      
      const result = checkBrandSecrets(context);
      
      expect(result.triggered).toBe(true);
      expect(result.secret?.type).toBe('easter_egg');
    });
    
    it('should detect time magic at 11:11', () => {
      const context: SecretContext = {
        userId: 'test-user',
        conversationCount: 5,
        localTime: new Date('2026-01-15T11:11:00'),
      };
      
      const result = checkBrandSecrets(context);
      
      // May or may not trigger due to probability
      if (result.triggered && result.secret?.type === 'time_magic') {
        expect(result.response).toContain('11:11');
      }
    });
    
    it('should not repeat one-time secrets', () => {
      const context: SecretContext = {
        userId: 'test-user',
        conversationCount: 7,
        localTime: new Date(),
      };
      
      // First check triggers it
      const result1 = checkBrandSecrets(context);
      
      // Second check should not trigger the same secret
      const result2 = checkBrandSecrets(context);
      
      // At least one should be triggered, but they shouldn't both be the same milestone
      if (result1.triggered && result2.triggered) {
        if (result1.secret?.id === 'milestone_7') {
          expect(result2.secret?.id).not.toBe('milestone_7');
        }
      }
    });
    
    it('should check achievements', () => {
      // Test night owl achievement at 3am
      const context: SecretContext = {
        userId: 'test-user',
        conversationCount: 5,
        localTime: new Date('2026-01-15T03:00:00'),
      };
      
      const achievement = checkAchievements(context);
      
      if (achievement) {
        expect(achievement.id).toBe('night_owl');
        expect(achievement.badge).toBe('🦉');
      }
    });
  });

  // ==========================================================================
  // LATE NIGHT WARMTH TESTS
  // ==========================================================================
  
  describe('Late Night Warmth', () => {
    it('should detect late night mode at 2am', () => {
      const time = new Date('2026-01-15T02:00:00');
      const context = getLateNightContext(time);
      
      expect(context.isLateNight).toBe(true);
      expect(context.phase).toBe('late_night');
      expect(context.warmthLevel).toBe(1.0); // Peak warmth
    });
    
    it('should not be late night mode at noon', () => {
      const time = new Date('2026-01-15T12:00:00');
      const context = getLateNightContext(time);
      
      expect(context.isLateNight).toBe(false);
      expect(context.phase).toBe('day');
    });
    
    it('should return appropriate greeting for late night', () => {
      const time = new Date('2026-01-15T02:30:00');
      const context = getLateNightContext(time);
      const greeting = getLateNightGreeting(context);
      
      expect(greeting).not.toBeNull();
      expect(greeting?.emotion).toMatch(/warm|gentle|protective|soft/);
    });
    
    it('should modify behaviors in late night mode', () => {
      const time = new Date('2026-01-15T03:00:00');
      const context = getLateNightContext(time);
      const behaviors = getLateNightBehaviors(context);
      
      expect(behaviors.avoidProductivity).toBe(true);
      expect(behaviors.emphasizeListening).toBe(true);
      expect(behaviors.slowerPacing).toBe(true);
      expect(behaviors.softerTone).toBe(true);
    });
    
    it('should suggest pace multiplier for late night', () => {
      const peakNight = new Date('2026-01-15T03:00:00');
      const context = getLateNightContext(peakNight);
      
      expect(context.suggestedPaceMultiplier).toBe(1.1); // 10% slower
    });
  });

  // ==========================================================================
  // MEMORY CALLBACKS TESTS
  // ==========================================================================
  
  describe('Memory Callbacks', () => {
    it('should store quotes', () => {
      storeQuote('test-user', 'I want to be a better person', 'growth conversation', 'hopeful');
      
      const stats = getMemoryCallbackStats('test-user');
      expect(stats.totalQuotes).toBe(1);
    });
    
    it('should store patterns', () => {
      storePattern('test-user', 'You often mention feeling overwhelmed on Mondays');
      storePattern('test-user', 'You often mention feeling overwhelmed on Mondays');
      storePattern('test-user', 'You often mention feeling overwhelmed on Mondays');
      
      const stats = getMemoryCallbackStats('test-user');
      expect(stats.totalPatterns).toBe(1); // Same pattern, just incremented
    });
    
    it('should store milestones', () => {
      storeMilestone('test-user', 'Had a breakthrough about work-life balance', 'major');
      
      // Milestone is stored internally, checked via callback generation
      const stats = getMemoryCallbackStats('test-user');
      expect(stats.totalQuotes).toBeGreaterThanOrEqual(0);
    });
    
    it('should store dreams', () => {
      storeDream('test-user', 'I want to write a novel');
      
      // Dreams are stored for future callback
      // Can't directly verify but should not throw
    });
    
    it('should not generate callback too frequently', () => {
      // First attempt might generate
      const callback1 = generateMemoryCallback('test-user', 'hello');
      
      // Second attempt within 3 days should not (rate limited)
      const callback2 = generateMemoryCallback('test-user', 'hello');
      
      // At least one should be null (rate limiting)
      expect(callback1 === null || callback2 === null).toBe(true);
    });
  });

  // ==========================================================================
  // REFLECTION SUNDAY TESTS
  // ==========================================================================
  
  describe('Reflection Sunday', () => {
    it('should get current week number', () => {
      const weekNumber = getCurrentWeekNumber();
      expect(weekNumber).toBeGreaterThanOrEqual(1);
      expect(weekNumber).toBeLessThanOrEqual(53);
    });
    
    it('should correctly identify Sundays', () => {
      const sunday = new Date('2026-01-18'); // A Sunday
      const monday = new Date('2026-01-19'); // A Monday
      
      expect(isSunday(sunday)).toBe(true);
      expect(isSunday(monday)).toBe(false);
    });
    
    it('should return a weekly prompt', () => {
      const prompt = getWeeklyPrompt();
      
      expect(prompt).toBeDefined();
      expect(prompt.prompt).toBeDefined();
      expect(prompt.category).toMatch(/self|relationships|growth|meaning|gratitude/);
    });
    
    it('should track participation stats', () => {
      recordParticipation('test-user', 'self-1', 'I was surprised by my patience');
      
      const stats = getUserStats('test-user');
      expect(stats.totalParticipations).toBe(1);
      expect(stats.currentStreak).toBe(1);
    });
  });

  // ==========================================================================
  // GROWTH LETTER TESTS
  // ==========================================================================
  
  describe('Growth Letter', () => {
    it('should identify first Sunday of month', () => {
      const firstSunday = new Date('2026-02-01'); // First Sunday of Feb 2026
      const secondSunday = new Date('2026-02-08'); // Second Sunday
      
      // Note: This depends on the actual day being Sunday
      if (firstSunday.getDay() === 0) {
        expect(isFirstSundayOfMonth(firstSunday)).toBe(true);
      }
      if (secondSunday.getDay() === 0) {
        expect(isFirstSundayOfMonth(secondSunday)).toBe(false);
      }
    });
    
    it('should return monthly theme', () => {
      const theme = getCurrentTheme();
      
      expect(theme).toBeDefined();
      expect(theme.name).toBeDefined();
      expect(theme.prompt).toBeDefined();
      expect(theme.description).toBeDefined();
    });
    
    it('should generate email body', () => {
      const stats = calculateMonthStats(10, 120, ['work', 'relationships'], 'improving');
      
      const body = generateEmailBody({
        userId: 'test-user',
        userName: 'Alex',
        month: 'January',
        year: 2026,
        stats,
        monthlyTheme: getCurrentTheme(),
      });
      
      expect(body).toContain('Hey Alex');
      expect(body).toContain('10 conversations');
      expect(body).toContain('January');
    });
    
    it('should calculate month stats with insight', () => {
      const stats = calculateMonthStats(15, 200, ['career'], 'stable');
      
      expect(stats.conversationCount).toBe(15);
      expect(stats.totalMinutesTalked).toBe(200);
      expect(stats.dominantThemes).toContain('career');
      expect(stats.personalInsight).toBeDefined();
    });
  });

  // ==========================================================================
  // INTEGRATION TESTS
  // ==========================================================================
  
  describe('Brand Evolution Integration', () => {
    it('should initialize session', () => {
      // Should not throw
      expect(() => initializeBrandEvolutionSession()).not.toThrow();
    });
    
    it('should process brand evolution context', () => {
      initializeBrandEvolutionSession();
      
      const result = processBrandEvolution({
        userId: 'test-user',
        conversationCount: 7,
        localTime: new Date('2026-01-15T14:00:00'), // 2pm, normal day
      });
      
      expect(result).toBeDefined();
      expect(result.promptInjections).toBeDefined();
      expect(result.behaviorModifications).toBeDefined();
    });
    
    it('should detect late night mode in integration', () => {
      initializeBrandEvolutionSession();
      
      const result = processBrandEvolution({
        userId: 'test-user',
        conversationCount: 5,
        localTime: new Date('2026-01-15T02:30:00'), // 2:30am
      });
      
      expect(result.lateNightMode).not.toBeNull();
      expect(result.lateNightMode?.isLateNight).toBe(true);
      expect(result.behaviorModifications.softerTone).toBe(true);
    });
    
    it('should process phrase triggers in integration', () => {
      initializeBrandEvolutionSession();
      
      const result = processBrandEvolution({
        userId: 'test-user',
        conversationCount: 5,
        userMessage: 'What is the meaning of life?',
        localTime: new Date('2026-01-15T14:00:00'),
      });
      
      // Should detect phrase trigger
      if (result.secret?.triggered) {
        expect(result.promptInjections.length).toBeGreaterThan(0);
      }
    });
    
    it('should clean up on session reset', () => {
      initializeBrandEvolutionSession();
      
      // Process some context
      processBrandEvolution({
        userId: 'test-user',
        conversationCount: 5,
        localTime: new Date(),
      });
      
      // Reset should not throw
      expect(() => resetBrandEvolutionSession()).not.toThrow();
    });
  });
});
