/**
 * Tests for the Behavioral Context Builder System
 *
 * These tests verify:
 * 1. Behavioral signals don't leak raw facts
 * 2. Crisis mode correctly overrides everything
 * 3. Signal aggregation works correctly
 * 4. Legacy translation works
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { ContextBuilderInput } from '../../core/types.js';
import type { BehavioralSignals } from '../signals.js';
import {
  createCallback,
  createPresenceSignals,
  createCrisisSignals,
  createCelebrationSignals,
} from '../signals.js';
import { aggregateBehavior, formatBehavioralDirective } from '../aggregator.js';
import { translateContextToSignals, sanitizeContextForSafety } from '../translator.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockInput(overrides: Partial<ContextBuilderInput> = {}): ContextBuilderInput {
  return {
    userText: 'test message',
    analysis: {
      emotion: {
        primary: 'neutral',
        intensity: 0.5,
        valence: 'neutral',
      },
      intent: {
        primary: 'unknown',
        confidence: 0.5,
      },
      topics: {
        detected: [],
      },
      state: {
        phase: 'exploring',
      },
    },
    services: {
      sessionId: 'test-session',
      sessionStartTime: Date.now(),
      userProfile: null,
    },
    userData: {
      turnCount: 1,
    },
    userProfile: null,
    persona: {
      identity: {
        id: 'ferni',
        name: 'Ferni',
        version: '1.0',
        voiceId: 'test',
        description: 'Test persona',
      },
    } as any,
    ...overrides,
  };
}

// ============================================================================
// SIGNAL FACTORY TESTS
// ============================================================================

describe('Signal Factories', () => {
  describe('createCallback', () => {
    it('should create a callback signal with hint (not raw fact)', () => {
      const callback = createCallback(
        'memory',
        'They shared something meaningful. Acknowledge naturally.',
        'natural'
      );

      expect(callback.type).toBe('memory');
      expect(callback.hint).toContain('Acknowledge naturally');
      expect(callback.strength).toBe('natural');

      // CRITICAL: Hints should NOT contain specific facts
      expect(callback.hint).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/); // No dates
      expect(callback.hint).not.toMatch(/\$[\d,]+/); // No dollar amounts
    });
  });

  describe('createPresenceSignals', () => {
    it('should create signals for holding space', () => {
      const signals = createPresenceSignals();

      expect(signals.tone).toBe('gentle');
      expect(signals.pace).toBe('slow');
      expect(signals.style).toBe('listening');
      expect(signals.questionStyle).toBe('none');
      expect(signals.modes?.holdingSpace).toBe(true);
    });
  });

  describe('createCrisisSignals', () => {
    it('should create high-priority crisis signals', () => {
      const signals = createCrisisSignals();

      expect(signals.tone).toBe('grounding');
      expect(signals.pace).toBe('slow');
      expect(signals.modes?.crisisMode).toBe(true);
      expect(signals.priority).toBe(100);
    });
  });
});

// ============================================================================
// AGGREGATOR TESTS
// ============================================================================

describe('Signal Aggregator', () => {
  it('should aggregate multiple signals correctly', () => {
    const signals: BehavioralSignals[] = [
      { tone: 'warm', source: 'builder1', priority: 50 },
      { style: 'supportive', source: 'builder2', priority: 60 },
      { energy: 'calm', source: 'builder3', priority: 40 },
    ];

    const result = aggregateBehavior(signals);

    expect(result.tone).toBe('warm');
    expect(result.style).toBe('supportive'); // Higher priority wins
    expect(result.energy).toBe('calm');
    expect(result.contributors).toContain('builder1');
    expect(result.contributors).toContain('builder2');
  });

  it('should let higher priority override lower', () => {
    const signals: BehavioralSignals[] = [
      { tone: 'warm', source: 'low', priority: 30 },
      { tone: 'gentle', source: 'high', priority: 70 },
    ];

    const result = aggregateBehavior(signals);

    expect(result.tone).toBe('gentle'); // Higher priority wins
  });

  it('should activate crisis mode and override everything', () => {
    const signals: BehavioralSignals[] = [
      { tone: 'celebratory', style: 'celebratory', modes: { celebrationMode: true } },
      { modes: { crisisMode: true } },
    ];

    const result = aggregateBehavior(signals);

    expect(result.modes.crisisMode).toBe(true);
    expect(result.tone).toBe('grounding'); // Crisis overrides celebration
    expect(result.style).toBe('grounding');
    expect(result.questionStyle).toBe('none');
  });

  it('should aggregate callbacks from multiple sources', () => {
    const signals: BehavioralSignals[] = [
      {
        callbacks: [createCallback('memory', 'hint 1', 'natural')],
        source: 'memory',
      },
      {
        callbacks: [createCallback('pattern', 'hint 2', 'important')],
        source: 'emotional',
      },
    ];

    const result = aggregateBehavior(signals);

    expect(result.callbacks.length).toBe(2);
    // Important should come first
    expect(result.callbacks[0].strength).toBe('important');
  });

  it('should limit callbacks to max count', () => {
    const signals: BehavioralSignals[] = [
      {
        callbacks: [
          createCallback('memory', 'hint 1', 'subtle'),
          createCallback('memory', 'hint 2', 'subtle'),
          createCallback('memory', 'hint 3', 'subtle'),
          createCallback('memory', 'hint 4', 'subtle'),
          createCallback('memory', 'hint 5', 'subtle'),
        ],
        source: 'memory',
      },
    ];

    const result = aggregateBehavior(signals);

    expect(result.callbacks.length).toBeLessThanOrEqual(3); // Default max is 3
  });

  it('should merge avoidances from all sources', () => {
    const signals: BehavioralSignals[] = [
      { avoidances: ['giving advice'], source: 'a' },
      { avoidances: ['minimizing feelings', 'changing subject'], source: 'b' },
    ];

    const result = aggregateBehavior(signals);

    expect(result.avoidances).toContain('giving advice');
    expect(result.avoidances).toContain('minimizing feelings');
    expect(result.avoidances).toContain('changing subject');
  });

  it('should detect and warn about conflicts', () => {
    const signals: BehavioralSignals[] = [
      { tone: 'celebratory', source: 'a', priority: 50 },
      { tone: 'gentle', source: 'b', priority: 50 },
    ];

    const result = aggregateBehavior(signals);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('Tone conflict');
  });
});

// ============================================================================
// DIRECTIVE FORMATTING TESTS
// ============================================================================

describe('Behavioral Directive Formatting', () => {
  it('should format directive without raw facts', () => {
    const behavior = aggregateBehavior([
      {
        tone: 'gentle',
        style: 'supportive',
        energy: 'subdued',
        callbacks: [createCallback('memory', 'Something meaningful to reference', 'natural')],
      },
    ]);

    const directive = formatBehavioralDirective(behavior);

    // Should contain behavioral instructions
    expect(directive).toContain('gentle');
    expect(directive).toContain('Validate and support');

    // Should NOT contain specific user facts
    expect(directive).not.toMatch(/\b(user|they) (said|mentioned|told)/i);
    expect(directive).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/); // No dates
  });

  it('should format crisis mode prominently', () => {
    const behavior = aggregateBehavior([createCrisisSignals()]);

    const directive = formatBehavioralDirective(behavior);

    expect(directive).toContain('Safety first');
    expect(directive).toContain('PRIORITY');
  });

  it('should format presence mode correctly', () => {
    const behavior = aggregateBehavior([createPresenceSignals()]);

    const directive = formatBehavioralDirective(behavior);

    expect(directive).toContain("Don't fix");
    expect(directive).toContain("Don't advise");
    expect(directive).toContain('presence');
  });
});

// ============================================================================
// TRANSLATOR TESTS
// ============================================================================

describe('Legacy Context Translator', () => {
  it('should translate crisis context to crisis signals', () => {
    const legacyContext = '[EMOTIONAL CRISIS DETECTED - 95% distress]';
    const signals = translateContextToSignals(legacyContext, 'test');

    expect(signals.modes?.crisisMode).toBe(true);
    expect(signals.tone).toBe('grounding');
  });

  it('should translate presence context correctly', () => {
    const legacyContext = 'Just be present. Do not try to fix or solve anything.';
    const signals = translateContextToSignals(legacyContext, 'test');

    expect(signals.modes?.holdingSpace).toBe(true);
    expect(signals.style).toBe('listening');
  });

  it('should translate venting context correctly', () => {
    const legacyContext = '[VENTING MODE] User is venting, listen more than speak.';
    const signals = translateContextToSignals(legacyContext, 'test');

    expect(signals.modes?.ventingMode).toBe(true);
    expect(signals.questionStyle).toBe('none');
  });

  it('should translate celebration context correctly', () => {
    const legacyContext = '[EMOTIONAL CONTEXT: User is excited! Share in their joy.]';
    const signals = translateContextToSignals(legacyContext, 'test');

    expect(signals.modes?.celebrationMode).toBe(true);
    expect(signals.tone).toBe('celebratory');
  });

  it('should translate memory callback into behavioral hint', () => {
    const legacyContext =
      '[MEMORY CALLBACK: Earlier in this conversation, they mentioned something.]';
    const signals = translateContextToSignals(legacyContext, 'test');

    expect(signals.callbacks).toBeDefined();
    expect(signals.callbacks!.length).toBeGreaterThan(0);

    // The translated callback should have a behavioral hint
    const callback = signals.callbacks![0];
    expect(callback.type).toBe('thread');
    expect(callback.hint.length).toBeGreaterThan(0);
  });

  it('should extract emotion and map to tone', () => {
    const contexts = [
      { text: '[EMOTIONAL CONTEXT: User seems sad]', expectedTone: 'gentle' },
      { text: '[EMOTIONAL CONTEXT: User seems anxious]', expectedTone: 'grounding' },
      { text: '[EMOTIONAL CONTEXT: User seems grief]', expectedTone: 'gentle' },
    ];

    for (const { text, expectedTone } of contexts) {
      const signals = translateContextToSignals(text, 'test');
      expect(signals.tone).toBe(expectedTone);
    }
  });
});

// ============================================================================
// SAFETY SANITIZER TESTS
// ============================================================================

describe('Context Safety Sanitizer', () => {
  it('should redact dates', () => {
    const input = 'User mentioned their birthday on 12/25/1990';
    const sanitized = sanitizeContextForSafety(input);

    expect(sanitized).toContain('[date]');
    expect(sanitized).not.toContain('12/25/1990');
  });

  it('should redact times', () => {
    const input = 'They have a meeting at 3:30 PM';
    const sanitized = sanitizeContextForSafety(input);

    expect(sanitized).toContain('[time]');
    expect(sanitized).not.toContain('3:30 PM');
  });

  it('should redact dollar amounts', () => {
    const input = "They're worried about the $50,000 debt";
    const sanitized = sanitizeContextForSafety(input);

    expect(sanitized).toContain('[amount]');
    expect(sanitized).not.toContain('$50,000');
  });

  it('should redact email addresses', () => {
    const input = 'Contact them at user@example.com';
    const sanitized = sanitizeContextForSafety(input);

    expect(sanitized).toContain('[email]');
    expect(sanitized).not.toContain('user@example.com');
  });

  it('should redact phone numbers', () => {
    const input = 'Call 555-123-4567 for help';
    const sanitized = sanitizeContextForSafety(input);

    expect(sanitized).toContain('[phone]');
    expect(sanitized).not.toContain('555-123-4567');
  });
});

// ============================================================================
// NO-LEAKAGE VERIFICATION TESTS
// ============================================================================

describe('No-Leakage Verification', () => {
  // Patterns that indicate actual user data leaking (not just prose)
  const DANGEROUS_PATTERNS = [
    /\buser\s+(said|mentioned|told|shared|revealed)\s+"[^"]+"/i, // Direct quotes
    /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/, // Dates
    /\$[\d,]+(?:\.\d{2})?/, // Dollar amounts
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Emails
    /\d{3}[.\-]?\d{3}[.\-]?\d{4}/, // Phone numbers
  ];

  it('should not include raw facts in behavioral directive', () => {
    const signals: BehavioralSignals[] = [
      {
        tone: 'gentle',
        style: 'supportive',
        callbacks: [createCallback('memory', 'weave in something meaningful', 'natural')],
      },
    ];

    const behavior = aggregateBehavior(signals);
    const directive = formatBehavioralDirective(behavior);

    for (const pattern of DANGEROUS_PATTERNS) {
      expect(directive).not.toMatch(pattern);
    }
  });

  it('should not include raw facts after translating legacy context', () => {
    // Simulate a legacy context that contains specific facts
    const dangerousLegacy =
      '[MEMORY: User mentioned their divorce from Sarah on 3/15/2024 ' +
      'and the $500,000 settlement. They seemed upset.]';

    const signals = translateContextToSignals(dangerousLegacy, 'legacy');
    const behavior = aggregateBehavior([signals]);
    const directive = formatBehavioralDirective(behavior);

    // Should NOT contain the raw facts
    expect(directive).not.toContain('divorce');
    expect(directive).not.toContain('Sarah');
    expect(directive).not.toContain('3/15/2024');
    expect(directive).not.toContain('$500,000');
    expect(directive).not.toContain('settlement');
  });

  it('callback hints should be behavioral, not factual', () => {
    const callback = createCallback(
      'memory',
      "They've been going through something difficult. Be supportive.",
      'natural'
    );

    // Behavioral language is OK
    expect(callback.hint).toContain('supportive');

    // But it should not contain specific facts
    expect(callback.hint).not.toMatch(/\buser\s+(said|mentioned)/i);
  });
});
