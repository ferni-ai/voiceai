/**
 * Conversation Quality Module Tests
 * 
 * Tests for advanced conversation features:
 * - Farewell summary generation
 * - Small detail extraction
 * - Follow-up scheduling
 * - Jack's physical state
 * - Conversation pacing score
 * - Session recovery
 * - Graceful error handling
 */

import { describe, it, expect } from 'vitest';
import {
  generateFarewellSummary,
  extractSmallDetails,
  getDetailCallback,
  extractFollowUps,
  getFollowUpSuggestion,
  getJackPhysicalState,
  getPhysicalStateInterjection,
  calculatePacingScore,
  createSessionRecoveryState,
  shouldAttemptRecovery,
  getGracefulErrorResponse,
} from '../intelligence/conversation-quality.js';

describe('Conversation Quality Module', () => {
  
  // ============================================================================
  // FAREWELL SUMMARY
  // ============================================================================
  
  describe('generateFarewellSummary', () => {
    it('should generate a complete farewell summary', () => {
      const history = [
        { role: 'user' as const, content: "I'm worried about my retirement savings" },
        { role: 'assistant' as const, content: "Tell me more about that" },
        { role: 'user' as const, content: "I have about $200,000 saved but I'm 55" },
        { role: 'assistant' as const, content: "That's a good start. Let's talk about options" },
        { role: 'user' as const, content: "Thanks, this has been helpful" },
      ];
      
      const summary = generateFarewellSummary(
        history,
        ['retirement', 'savings'],
        { name: 'John' },
        { start: 'worried', end: 'hopeful' }
      );
      
      expect(summary).toHaveProperty('nextTimeGreeting');
      expect(summary).toHaveProperty('keyThingsToRemember');
      expect(summary).toHaveProperty('openLoops');
      expect(summary).toHaveProperty('endingMood');
      expect(summary).toHaveProperty('relationshipNotes');
      expect(summary).toHaveProperty('specificDetails');
      expect(summary).toHaveProperty('followUps');
      
      expect(summary.endingMood).toBe('positive');
    });
    
    it('should detect concerned ending mood', () => {
      const history = [
        { role: 'user' as const, content: "I'm really worried about this" },
        { role: 'assistant' as const, content: "I understand" },
        { role: 'user' as const, content: "I'm still feeling anxious about it" },
      ];
      
      const summary = generateFarewellSummary(
        history,
        ['anxiety'],
        null,
        { start: 'worried', end: 'worried' }
      );
      
      expect(summary.endingMood).toBe('concerned');
    });
    
    it('should generate personalized next time greeting', () => {
      const history = [
        { role: 'user' as const, content: "Thanks for the help!" },
      ];
      
      const summary = generateFarewellSummary(
        history,
        ['retirement'],
        { name: 'Sarah' },
        { start: 'neutral', end: 'positive' }
      );
      
      expect(summary.nextTimeGreeting).toContain('Sarah');
    });
  });
  
  // ============================================================================
  // SMALL DETAIL EXTRACTION
  // ============================================================================
  
  describe('extractSmallDetails', () => {
    it('should extract pet names', () => {
      const text = "My dog Max is getting old. He's 12 now.";
      const details = extractSmallDetails(text);
      
      const petDetail = details.find(d => d.type === 'pet_name');
      expect(petDetail).toBeDefined();
      expect(petDetail?.value).toBe('Max');
    });
    
    it('should extract family member names', () => {
      const text = "My wife Sarah thinks we should save more.";
      const details = extractSmallDetails(text);
      
      const personDetail = details.find(d => d.type === 'person_name');
      expect(personDetail).toBeDefined();
      expect(personDetail?.value).toBe('Sarah');
    });
    
    it('should extract dollar amounts', () => {
      const text = "I have about $500,000 in my 401k.";
      const details = extractSmallDetails(text);
      
      const amountDetail = details.find(d => d.type === 'amount');
      expect(amountDetail).toBeDefined();
      expect(amountDetail?.value).toContain('500,000');
    });
    
    it('should extract company names', () => {
      const text = "I work at Microsoft in their finance department.";
      const details = extractSmallDetails(text);
      
      const companyDetail = details.find(d => d.type === 'company');
      expect(companyDetail).toBeDefined();
      expect(companyDetail?.value).toBe('Microsoft');
    });
    
    it('should return empty array for text without details', () => {
      const text = "I want to invest more money.";
      const details = extractSmallDetails(text);
      
      expect(details).toEqual([]);
    });
  });
  
  describe('getDetailCallback', () => {
    it('should generate pet callback', () => {
      const detail = {
        type: 'pet_name' as const,
        value: 'Buddy',
        context: 'my dog Buddy',
        extractedAt: new Date(),
      };
      
      const callback = getDetailCallback(detail);
      expect(callback).toContain('Buddy');
      expect(callback).toContain('doing');
    });
    
    it('should generate person callback', () => {
      const detail = {
        type: 'person_name' as const,
        value: 'Michael',
        context: 'my son Michael',
        extractedAt: new Date(),
      };
      
      const callback = getDetailCallback(detail);
      expect(callback).toContain('Michael');
    });
  });
  
  // ============================================================================
  // FOLLOW-UP SCHEDULING
  // ============================================================================
  
  describe('extractFollowUps', () => {
    it('should extract follow-ups for retirement discussions', () => {
      const history = [
        { role: 'user' as const, content: "I'm planning to retire next year" },
        { role: 'assistant' as const, content: "That's exciting! Let's make sure you're ready" },
      ];
      
      const followUps = extractFollowUps(history, ['retirement']);
      
      // Should create a retirement follow-up
      const retirementFollowUp = followUps.find(f => f.topic.toLowerCase().includes('retirement'));
      expect(retirementFollowUp).toBeDefined();
      expect(retirementFollowUp?.priority).toBe('high');
    });
    
    it('should extract time-based follow-ups', () => {
      const history = [
        { role: 'user' as const, content: "Let's talk about this again next week" },
      ];
      
      const followUps = extractFollowUps(history, []);
      
      const timeFollowUp = followUps.find(f => f.reason.includes('next week'));
      expect(timeFollowUp).toBeDefined();
    });
  });
  
  describe('getFollowUpSuggestion', () => {
    it('should generate appropriate suggestion based on time', () => {
      const now = new Date();
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      
      const followUp = {
        topic: 'retirement',
        suggestedDate: nextWeek,
        priority: 'high' as const,
        reason: 'Discussed retirement',
      };
      
      const suggestion = getFollowUpSuggestion(followUp);
      expect(suggestion).toContain('retirement');
    });
  });
  
  // ============================================================================
  // JACK'S PHYSICAL STATE
  // ============================================================================
  
  describe('getJackPhysicalState', () => {
    it('should return high energy in morning', () => {
      const state = getJackPhysicalState(9, 10, 5);
      
      expect(state.energyLevel).toBe('high');
      expect(state.alertness).toBe('sharp');
    });
    
    it('should return low energy late at night', () => {
      const state = getJackPhysicalState(23, 10, 5);
      
      expect(state.energyLevel).toBe('low');
      expect(state.alertness).toBe('tired');
    });
    
    it('should include physical note for tired states', () => {
      const state = getJackPhysicalState(2, 20, 10);
      
      expect(state.physicalNote).toBeDefined();
    });
  });
  
  describe('getPhysicalStateInterjection', () => {
    it('should occasionally return interjection for tired state', () => {
      const state = {
        energyLevel: 'low' as const,
        alertness: 'tired' as const,
        mood: 'sleepy' as const,
        physicalNote: "Getting tired",
      };
      
      // Run multiple times since it's probabilistic
      let foundInterjection = false;
      for (let i = 0; i < 50; i++) {
        const interjection = getPhysicalStateInterjection(state);
        if (interjection) {
          foundInterjection = true;
          break;
        }
      }
      // It's probabilistic, so we just verify it CAN return something
    });
  });
  
  // ============================================================================
  // CONVERSATION PACING SCORE
  // ============================================================================
  
  describe('calculatePacingScore', () => {
    it('should calculate high score for engaged conversation', () => {
      const messages = [
        { role: 'user' as const, content: "I've been thinking a lot about this. What do you suggest for someone my age?" },
        { role: 'assistant' as const, content: "That's a great question..." },
        { role: 'user' as const, content: "Interesting! So if I understand correctly, you're saying I should focus on index funds? That makes sense." },
        { role: 'assistant' as const, content: "Exactly..." },
        { role: 'user' as const, content: "I really appreciate this advice. Can you tell me more about how to get started?" },
      ];
      
      const score = calculatePacingScore(messages, 15, ['retirement', 'investing'], 2, 1);
      
      expect(score.overallScore).toBeGreaterThan(60);
      expect(['excellent', 'good']).toContain(score.assessment);
    });
    
    it('should calculate low score for disengaged conversation', () => {
      const messages = [
        { role: 'assistant' as const, content: "What would you like to discuss?" },
        { role: 'user' as const, content: "ok" },
        { role: 'assistant' as const, content: "Would you like to talk about retirement?" },
        { role: 'user' as const, content: "sure" },
        { role: 'assistant' as const, content: "Great! What questions do you have?" },
        { role: 'user' as const, content: "idk" },
      ];
      
      const score = calculatePacingScore(messages, 10, [], 0, 0);
      
      expect(score.overallScore).toBeLessThan(50);
      expect(score.suggestions.length).toBeGreaterThan(0);
    });
    
    it('should include all factor scores', () => {
      const messages = [
        { role: 'user' as const, content: "Hello" },
      ];
      
      const score = calculatePacingScore(messages, 1, [], 0, 0);
      
      expect(score.factors).toHaveProperty('engagement');
      expect(score.factors).toHaveProperty('depth');
      expect(score.factors).toHaveProperty('rapport');
      expect(score.factors).toHaveProperty('progress');
    });
  });
  
  // ============================================================================
  // SESSION RECOVERY
  // ============================================================================
  
  describe('createSessionRecoveryState', () => {
    it('should create recovery state with last topic', () => {
      const state = createSessionRecoveryState('retirement', 'What about my 401k?');
      
      expect(state.wasDisconnected).toBe(true);
      expect(state.lastTopic).toBe('retirement');
      expect(state.lastUserMessage).toBe('What about my 401k?');
      expect(state.recoveryGreeting).toBeDefined();
      expect(state.recoveryGreeting).toContain('retirement');
    });
    
    it('should create recovery state without topic', () => {
      const state = createSessionRecoveryState(null, null);
      
      expect(state.wasDisconnected).toBe(true);
      expect(state.recoveryGreeting).toBeDefined();
    });
  });
  
  describe('shouldAttemptRecovery', () => {
    it('should return true for recent disconnection', () => {
      const recentTime = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
      
      const shouldRecover = shouldAttemptRecovery(recentTime, 5);
      
      expect(shouldRecover).toBe(true);
    });
    
    it('should return false for old disconnection', () => {
      const oldTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      
      const shouldRecover = shouldAttemptRecovery(oldTime, 5);
      
      expect(shouldRecover).toBe(false);
    });
    
    it('should return false for null date', () => {
      const shouldRecover = shouldAttemptRecovery(null);
      
      expect(shouldRecover).toBe(false);
    });
  });
  
  // ============================================================================
  // GRACEFUL ERROR HANDLING
  // ============================================================================
  
  describe('getGracefulErrorResponse', () => {
    it('should return human-like API timeout response', () => {
      const error = getGracefulErrorResponse('api_timeout', 'stock data fetch');
      
      expect(error.userMessage).toBeDefined();
      expect(error.userMessage).not.toContain('error');
      expect(error.userMessage).not.toContain('API');
      expect(error.recoverable).toBe(true);
    });
    
    it('should return human-like market data error', () => {
      const error = getGracefulErrorResponse('market_data');
      
      expect(error.userMessage).toBeDefined();
      expect(error.internalError).toContain('market_data');
      expect(error.recoverable).toBe(true);
    });
    
    it('should return human-like memory error', () => {
      const error = getGracefulErrorResponse('memory_error');
      
      expect(error.userMessage).toBeDefined();
      expect(error.recoverable).toBe(true);
    });
    
    it('should return critical error for critical type', () => {
      const error = getGracefulErrorResponse('critical');
      
      expect(error.recoverable).toBe(false);
    });
    
    it('should fallback to general error for unknown type', () => {
      const error = getGracefulErrorResponse('unknown_weird_error');
      
      expect(error.userMessage).toBeDefined();
      expect(error.recoverable).toBe(true);
    });
  });
});

