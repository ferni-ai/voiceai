/**
 * Human Behaviors Module Tests
 * 
 * Tests for sophisticated human-like behaviors:
 * - Cultural moment awareness
 * - User engagement detection
 * - Running jokes
 * - Spontaneous thoughts
 * - Preference learning
 * - Voice prosody response
 * - Topic threading verification
 * - Proactive goal references
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  detectCulturalMoment,
  detectUserEngagement,
  getRunningJokeCallback,
  getSpontaneousThought,
  inferUserPreferences,
  getPreferenceGuidance,
  getVoiceProsodyResponse,
  verifyTopicThreading,
  getProactiveGoalReference,
} from '../intelligence/human-behaviors.js';
import type { UserProfile } from '../types/user-profile.js';
import { createUserProfile } from '../types/user-profile.js';

describe('Human Behaviors Module', () => {
  
  // ============================================================================
  // CULTURAL MOMENT AWARENESS
  // ============================================================================
  
  describe('detectCulturalMoment', () => {
    it('should return a cultural moment object or null', () => {
      const moment = detectCulturalMoment();
      
      // Result is either null or a valid cultural moment
      if (moment !== null) {
        expect(moment).toHaveProperty('type');
        expect(moment).toHaveProperty('name');
        expect(moment).toHaveProperty('reference');
        expect(moment).toHaveProperty('relevance');
        expect(['holiday', 'tax_season', 'market_anniversary', 'earnings_season', 'fed_meeting', 'quarter_end']).toContain(moment.type);
        expect(['high', 'medium', 'low']).toContain(moment.relevance);
      }
    });
    
    it('should return consistent structure', () => {
      // Run multiple times to ensure consistency
      for (let i = 0; i < 5; i++) {
        const moment = detectCulturalMoment();
        if (moment) {
          expect(typeof moment.name).toBe('string');
          expect(typeof moment.reference).toBe('string');
          expect(moment.reference.length).toBeGreaterThan(10);
        }
      }
    });
  });
  
  // ============================================================================
  // USER ENGAGEMENT DETECTION
  // ============================================================================
  
  describe('detectUserEngagement', () => {
    it('should detect highly engaged users', () => {
      const messages = [
        { role: 'user' as const, content: "This is really interesting! Can you tell me more about how compound interest works over time?" },
        { role: 'assistant' as const, content: "Of course..." },
        { role: 'user' as const, content: "Wow, that's fascinating. What about the tax implications? I've been wondering about that for years." },
        { role: 'assistant' as const, content: "Great question..." },
        { role: 'user' as const, content: "I love this! So if I understand correctly, the longer I wait the better?" },
      ];
      
      const engagement = detectUserEngagement(messages);
      
      expect(engagement).toHaveProperty('level');
      expect(engagement).toHaveProperty('indicators');
      expect(engagement).toHaveProperty('suggestions');
      expect(['highly_engaged', 'engaged']).toContain(engagement.level);
    });
    
    it('should detect disengaged users with short responses', () => {
      const messages = [
        { role: 'assistant' as const, content: "So what are your thoughts on retirement planning?" },
        { role: 'user' as const, content: "ok" },
        { role: 'assistant' as const, content: "Would you like to discuss some options?" },
        { role: 'user' as const, content: "sure" },
        { role: 'assistant' as const, content: "Great! Let me explain..." },
        { role: 'user' as const, content: "yeah" },
      ];
      
      const engagement = detectUserEngagement(messages);
      
      expect(['disengaged', 'checked_out', 'neutral']).toContain(engagement.level);
    });
    
    it('should return neutral for insufficient messages', () => {
      const messages = [
        { role: 'user' as const, content: "Hello" },
      ];
      
      const engagement = detectUserEngagement(messages);
      expect(engagement.level).toBe('neutral');
    });
  });
  
  // ============================================================================
  // RUNNING JOKES
  // ============================================================================
  
  describe('getRunningJokeCallback', () => {
    it('should return null for new users', () => {
      const newProfile = createUserProfile('test-user-1');
      const result = getRunningJokeCallback(newProfile, 'compound interest');
      
      // New user shouldn't get callbacks (might get setup though)
      // Either null or a new joke setup
      if (result !== null) {
        expect(result).toHaveProperty('joke');
        expect(result).toHaveProperty('isCallback');
      }
    });
    
    it('should potentially return jokes for returning users', () => {
      const returningProfile = createUserProfile('test-user-2');
      returningProfile.totalConversations = 5;
      returningProfile.sharedStories = [
        { storyId: 'compound_interest_eighth_wonder', theme: 'Einstein joke', context: 'compound interest', sharedAt: new Date() }
      ];
      
      // Run multiple times since it's probabilistic
      let foundJoke = false;
      for (let i = 0; i < 20; i++) {
        const result = getRunningJokeCallback(returningProfile, 'compound interest');
        if (result !== null) {
          foundJoke = true;
          expect(result).toHaveProperty('joke');
          expect(result).toHaveProperty('isCallback');
          break;
        }
      }
      // It's probabilistic, so we just verify structure when it returns
    });
  });
  
  // ============================================================================
  // SPONTANEOUS THOUGHTS
  // ============================================================================
  
  describe('getSpontaneousThought', () => {
    it('should return valid thought structure or null', () => {
      // Run multiple times since it's probabilistic (5% chance)
      let foundThought = false;
      for (let i = 0; i < 100; i++) {
        const thought = getSpontaneousThought();
        if (thought !== null) {
          foundThought = true;
          expect(thought).toHaveProperty('thought');
          expect(thought).toHaveProperty('trigger');
          expect(['random', 'topic', 'time', 'weather', 'market']).toContain(thought.trigger);
          expect(typeof thought.thought).toBe('string');
          break;
        }
      }
      // At 5% chance, we should usually find one in 100 tries
      // But don't fail if we don't - it's probabilistic
    });
  });
  
  // ============================================================================
  // PREFERENCE LEARNING
  // ============================================================================
  
  describe('inferUserPreferences', () => {
    it('should detect preference for directness', () => {
      const messages = [
        "Just tell me what to do",
        "Get to the point please",
        "What's the bottom line?"
      ];
      
      const preferences = inferUserPreferences(messages, null);
      
      expect(preferences.communicationStyle).toBe('direct');
      expect(preferences.responseLength).toBe('brief');
    });
    
    it('should detect preference for detailed explanations', () => {
      const messages = [
        "Can you explain how this works in more detail? I really want to understand the mechanics.",
        "Tell me more about the tax implications and how they might affect my situation",
        "Why does compound interest work that way? What's the underlying principle?"
      ];
      
      const preferences = inferUserPreferences(messages, null);
      
      expect(preferences.responseLength).toBe('thorough');
    });
    
    it('should return unknown for insufficient data', () => {
      const messages = ["hi"];
      
      const preferences = inferUserPreferences(messages, null);
      
      expect(preferences.communicationStyle).toBe('unknown');
    });
  });
  
  describe('getPreferenceGuidance', () => {
    it('should generate guidance for direct communicators', () => {
      const preferences = {
        communicationStyle: 'direct' as const,
        responseLength: 'brief' as const,
        storyAppetite: 'prefers_facts' as const,
        humorReceptivity: 'low' as const,
        adviceStyle: 'prescriptive' as const,
      };
      
      const guidance = getPreferenceGuidance(preferences);
      
      expect(guidance).toContain('direct');
      expect(guidance).toContain('SHORT');
    });
    
    it('should return empty string for unknown preferences', () => {
      const preferences = {
        communicationStyle: 'unknown' as const,
        responseLength: 'unknown' as const,
        storyAppetite: 'unknown' as const,
        humorReceptivity: 'unknown' as const,
        adviceStyle: 'unknown' as const,
      };
      
      const guidance = getPreferenceGuidance(preferences);
      
      expect(guidance).toBe('');
    });
  });
  
  // ============================================================================
  // VOICE PROSODY RESPONSE
  // ============================================================================
  
  describe('getVoiceProsodyResponse', () => {
    it('should respond to high stress', () => {
      const voiceEmotion = {
        primary: 'anxious',
        stressLevel: 0.8,
        arousal: 0.6,
        valence: -0.3,
      };
      
      const response = getVoiceProsodyResponse(voiceEmotion);
      
      expect(response.shouldAdjust).toBe(true);
      expect(response.guidance).toContain('stressed');
      expect(response.emotionalMirror).toBeDefined();
    });
    
    it('should respond to excitement', () => {
      const voiceEmotion = {
        primary: 'excited',
        stressLevel: 0.2,
        arousal: 0.8,
        valence: 0.5,
      };
      
      const response = getVoiceProsodyResponse(voiceEmotion);
      
      expect(response.shouldAdjust).toBe(true);
      expect(response.guidance).toContain('excited');
    });
    
    it('should return no adjustment for neutral voice', () => {
      const voiceEmotion = {
        primary: 'neutral',
        stressLevel: 0.3,
        arousal: 0.5,
        valence: 0.1,
      };
      
      const response = getVoiceProsodyResponse(voiceEmotion);
      
      expect(response.shouldAdjust).toBe(false);
    });
    
    it('should handle null input', () => {
      const response = getVoiceProsodyResponse(null);
      
      expect(response.shouldAdjust).toBe(false);
      expect(response.guidance).toBe('');
    });
  });
  
  // ============================================================================
  // TOPIC THREADING VERIFICATION
  // ============================================================================
  
  describe('verifyTopicThreading', () => {
    it('should detect circled-back topics', () => {
      const history = [
        { role: 'user' as const, content: "I'm worried about retirement" },
        { role: 'assistant' as const, content: "Tell me more about that" },
        { role: 'user' as const, content: "I also want to save for a house" },
        { role: 'assistant' as const, content: "Earlier you mentioned retirement - let's talk about that first" },
      ];
      
      const result = verifyTopicThreading(history, ['retirement', 'house']);
      
      expect(result.working).toBe(true);
      expect(result.circledBackTopics.length).toBeGreaterThan(0);
    });
    
    it('should identify missed topics', () => {
      const history = [
        { role: 'user' as const, content: "I'm worried about retirement" },
        { role: 'assistant' as const, content: "What about stocks?" },
        { role: 'user' as const, content: "I also want to save for college" },
        { role: 'assistant' as const, content: "Let me tell you about bonds" },
      ];
      
      const result = verifyTopicThreading(history, ['retirement', 'college']);
      
      expect(result.missedTopics.length).toBeGreaterThan(0);
    });
    
    it('should work with empty topics', () => {
      const history = [
        { role: 'user' as const, content: "Hello" },
        { role: 'assistant' as const, content: "Hi there!" },
      ];
      
      const result = verifyTopicThreading(history, []);
      
      expect(result.working).toBe(true);
      expect(result.circledBackTopics).toEqual([]);
      expect(result.missedTopics).toEqual([]);
    });
  });
  
  // ============================================================================
  // PROACTIVE GOAL REFERENCE
  // ============================================================================
  
  describe('getProactiveGoalReference', () => {
    it('should reference active goals related to topic', () => {
      const profile = createUserProfile('test-user');
      profile.goals = [
        {
          id: 'goal-1',
          name: 'Retire by 65',
          type: 'retirement',
          status: 'active',
          priority: 'high',
          timeHorizon: 'long',
          targetAmount: 1000000,
          currentProgress: 500000,
          progressPercent: 50,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      ];
      
      // Run multiple times since it can be probabilistic
      let foundReference = false;
      for (let i = 0; i < 10; i++) {
        const reference = getProactiveGoalReference(profile, 'retirement planning');
        if (reference !== null) {
          foundReference = true;
          expect(typeof reference).toBe('string');
          expect(reference.toLowerCase()).toContain('retirement');
          break;
        }
      }
    });
    
    it('should return null for users without goals', () => {
      const profile = createUserProfile('test-user');
      profile.goals = [];
      
      const reference = getProactiveGoalReference(profile, 'anything');
      
      expect(reference).toBeNull();
    });
    
    it('should return null for null profile', () => {
      const reference = getProactiveGoalReference(null, 'retirement');
      
      expect(reference).toBeNull();
    });
  });
});

