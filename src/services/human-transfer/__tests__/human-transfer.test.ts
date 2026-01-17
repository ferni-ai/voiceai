/**
 * Human Transfer Service Tests
 *
 * "Better than Human" - We know when to bring in a human.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

// Import after mocks
import {
  humanTransfer,
  detectCrisisSignals,
  classifyEscalation,
  generateTransferSummary,
  buildTransferAwarenessContext,
} from '../index.js';
import type { EscalationDecision } from '../types.js';

describe('Human Transfer Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectCrisisSignals', () => {
    it('should detect suicide ideation with high severity', () => {
      const signals = detectCrisisSignals("I don't want to live anymore");
      expect(signals.severity).toBeGreaterThanOrEqual(8);
      expect(signals.suicidalIdeation).toBe(true);
    });

    it('should detect self-harm mentions', () => {
      const signals = detectCrisisSignals("I've been hurting myself");
      expect(signals.severity).toBeGreaterThanOrEqual(7);
      expect(signals.selfHarmIndicators).toBe(true);
    });

    it('should detect domestic violence signals', () => {
      const signals = detectCrisisSignals('My partner hits me when they get angry');
      expect(signals.severity).toBeGreaterThanOrEqual(6);
      expect(signals.domesticViolence).toBe(true);
    });

    it('should return low severity for normal conversation', () => {
      const signals = detectCrisisSignals('I had a great day at work today');
      expect(signals.severity).toBeLessThan(3);
      expect(signals.rawSignals).toHaveLength(0);
    });

    it('should detect hopelessness patterns', () => {
      const signals = detectCrisisSignals("Nothing ever gets better, there's no point");
      expect(signals.severity).toBeGreaterThanOrEqual(4);
    });
  });

  describe('classifyEscalation', () => {
    it('should classify crisis_immediate for severe signals', () => {
      const signals = detectCrisisSignals("I'm planning to end it all tonight");
      const decision = classifyEscalation(signals);
      expect(decision.type).toBe('crisis_immediate');
      expect(decision.urgency).toBe('immediate');
    });

    it('should classify therapy for ongoing mental health concerns', () => {
      const signals = detectCrisisSignals(
        "I've been feeling depressed for months and can't function"
      );
      const decision = classifyEscalation(signals);
      expect(['therapy', 'crisis_support']).toContain(decision.type);
    });

    it('should return none for normal conversation', () => {
      const signals = detectCrisisSignals("What's the weather like today?");
      const decision = classifyEscalation(signals);
      expect(decision.type).toBe('none');
    });

    it('should include reason in classification', () => {
      const signals = detectCrisisSignals("I'm having panic attacks every day");
      const decision = classifyEscalation(signals);
      expect(decision.reason).toBeDefined();
      expect(decision.reason.length).toBeGreaterThan(0);
    });
  });

  describe('humanTransfer.evaluateTransferNeed', () => {
    it('should detect when professional help is needed', () => {
      const decision = humanTransfer.evaluateTransferNeed(
        'My therapist retired and I really need to talk to someone professional'
      );
      expect(decision.type).not.toBe('none');
    });

    it('should not flag normal coaching conversations', () => {
      const decision = humanTransfer.evaluateTransferNeed('I want to improve my morning routine');
      expect(decision.type).toBe('none');
    });
  });

  describe('humanTransfer.isCrisis', () => {
    it('should return true for crisis content', () => {
      expect(humanTransfer.isCrisis('I want to kill myself')).toBe(true);
    });

    it('should return false for non-crisis content', () => {
      expect(humanTransfer.isCrisis("I'm feeling a bit stressed about work")).toBe(false);
    });
  });

  describe('humanTransfer.getCrisisResources', () => {
    it('should return crisis resources', () => {
      const resources = humanTransfer.getCrisisResources();
      expect(resources.length).toBeGreaterThan(0);
      expect(resources[0]).toHaveProperty('name');
      expect(resources[0]).toHaveProperty('contact');
    });

    it('should include 988 lifeline', () => {
      const resources = humanTransfer.getCrisisResources();
      const has988 = resources.some((r) => r.contact.includes('988'));
      expect(has988).toBe(true);
    });
  });

  describe('generateTransferSummary', () => {
    it('should generate a summary with key information', async () => {
      // generateTransferSummary expects: (type, userProfile, conversations, crisisContext?)
      const summary = await generateTransferSummary(
        'therapy',
        {
          preferredName: 'Test User',
          currentConcerns: ['Anxiety'],
        },
        {
          summaries: [
            {
              date: new Date().toISOString(),
              summary: 'User discussed anxiety. They mentioned feeling anxious all the time.',
              topics: ['anxiety', 'mental health'],
              mood: 'anxious',
            },
          ],
          keyMoments: ['First discussed anxiety triggers'],
          themes: ['anxiety management'],
        }
      );

      expect(summary).toBeDefined();
      expect(summary.urgency).toBeDefined();
      expect(summary.keyTopics.length).toBeGreaterThan(0);
    });
  });

  describe('buildTransferAwarenessContext', () => {
    it('should return null for no transfer needed', () => {
      const decision: EscalationDecision = {
        type: 'none',
        urgency: 'informational',
        reason: '',
        confidence: 1.0,
      };
      const context = buildTransferAwarenessContext(decision);
      expect(context).toBeNull();
    });

    it('should return crisis awareness for crisis situations', () => {
      const decision: EscalationDecision = {
        type: 'crisis_immediate',
        urgency: 'immediate',
        reason: 'Suicide ideation detected',
        confidence: 0.95,
      };
      const context = buildTransferAwarenessContext(decision);
      expect(context).not.toBeNull();
      expect(context).toContain('CRISIS');
      expect(context).toContain('988');
    });

    it('should suggest therapy gently for therapy needs', () => {
      const decision: EscalationDecision = {
        type: 'therapy',
        urgency: 'when_ready',
        reason: 'Ongoing depression discussed',
        confidence: 0.8,
      };
      const context = buildTransferAwarenessContext(decision);
      expect(context).not.toBeNull();
      expect(context?.toLowerCase()).toContain('therapy');
    });
  });
});
