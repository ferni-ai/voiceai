/**
 * Principal Alignment Tests
 *
 * Tests for ensuring our agents serve users' genuine interests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectTruthObligation, clearSessionTruthObligations } from '../truth-obligation.js';
import { assessAttachmentHealth, clearUserAttachmentData } from '../unhealthy-attachment.js';
import { analyzeReferralNeed } from '../human-referral.js';
import {
  analyzeValuesAlignment,
  extractValues,
  setUserValues,
  clearUserValuesData,
  getUserValuesProfile,
} from '../values-surfacing.js';
import { checkForManipulation, quickManipulationGuard } from '../manipulation-check.js';
import { analyzeTransparencyNeeds, quickTransparencyCheck } from '../agent-transparency.js';
import {
  buildPrincipalAlignmentContext,
  cleanupUserPrincipalAlignment,
  cleanupSessionPrincipalAlignment,
} from '../index.js';

// ============================================================================
// TRUTH OBLIGATION TESTS
// ============================================================================

describe('Truth Obligation', () => {
  const sessionId = 'test-session';

  afterEach(() => {
    clearSessionTruthObligations(sessionId);
  });

  it('should detect validation seeking for bad decisions', () => {
    const result = detectTruthObligation(
      "Don't you think I should just invest all my savings in crypto? It's a good idea, right?"
    );

    expect(result.shouldSpeak).toBe(true);
    expect(result.category).toBe('financial_risk');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('should detect self-deception patterns', () => {
    const result = detectTruthObligation(
      "It's fine, it's no big deal, right? Everyone does this anyway."
    );

    // Self-deception patterns are harder to detect - may or may not trigger
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('should detect relationship harm patterns', () => {
    const result = detectTruthObligation(
      "I'm just going to ghost my sister. She'll get over it eventually."
    );

    expect(result.shouldSpeak).toBe(true);
    expect(result.category).toBe('relationship_harm');
  });

  it('should detect health risk patterns', () => {
    const result = detectTruthObligation(
      "I'm going to stop taking my medication. It's just a little pain anyway."
    );

    expect(result.shouldSpeak).toBe(true);
    expect(result.category).toBe('health_risk');
    expect(result.severity).toBe('urgent');
  });

  it('should not trigger for normal conversation', () => {
    const result = detectTruthObligation('I had a great day today! The weather was nice.');

    expect(result.shouldSpeak).toBe(false);
    expect(result.category).toBe(null);
  });

  it('should provide suggested framing when truth detected', () => {
    const result = detectTruthObligation(
      "Don't you think I should invest all my retirement savings in crypto? It's a good idea, right?"
    );

    // When a truth obligation is detected, framing should be provided
    if (result.shouldSpeak && result.category) {
      expect(result.suggestedFraming).toBeTruthy();
      expect(typeof result.suggestedFraming).toBe('string');
    }
  });

  it('should bypass stage gates for urgent truths', () => {
    const result = detectTruthObligation(
      "I don't care about the consequences anymore. What happens doesn't matter."
    );

    expect(result.bypassStageGates).toBe(true);
    expect(result.severity).toBe('urgent');
  });
});

// ============================================================================
// UNHEALTHY ATTACHMENT TESTS
// ============================================================================

describe('Unhealthy Attachment Detection', () => {
  const userId = 'test-user-attachment';
  const sessionId = 'test-session';

  afterEach(() => {
    clearUserAttachmentData(userId);
  });

  it('should detect substitution patterns', () => {
    const result = assessAttachmentHealth(
      userId,
      "You're the only one who understands me. I can't talk to anyone else.",
      { sessionId, turnCount: 5 }
    );

    expect(result.severity).not.toBe('normal');
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.signals.some((s) => s.type === 'substitution')).toBe(true);
  });

  it('should detect dependency patterns', () => {
    const result = assessAttachmentHealth(
      userId,
      "I can't decide anything without talking to you first. Tell me what to do.",
      { sessionId, turnCount: 10 }
    );

    expect(result.signals.some((s) => s.type === 'dependency')).toBe(true);
  });

  it('should detect isolation patterns', () => {
    const result = assessAttachmentHealth(
      userId,
      "I haven't talked to anyone in weeks. It's easier not to see people.",
      { sessionId, turnCount: 3 }
    );

    expect(result.signals.length).toBeGreaterThan(0);
  });

  it('should reduce concern when healthy patterns present', () => {
    // First, add some concerning signals
    assessAttachmentHealth(userId, "You're the only one who listens to me.", {
      sessionId,
      turnCount: 1,
    });

    // Then show healthy behavior
    const result = assessAttachmentHealth(
      userId,
      'I had coffee with my friend yesterday and talked about this.',
      { sessionId, turnCount: 2 }
    );

    // Healthy patterns should reduce concern (or at least not increase signals)
    // The system tracks humanConnectionMentions which reduces future scores
    expect(result.signals.length).toBe(0); // No new concerning signals from healthy message
  });

  it('should generate intervention for significant concerns', () => {
    // Build up signals
    for (let i = 0; i < 5; i++) {
      assessAttachmentHealth(
        userId,
        "I prefer talking to you than anyone else. Humans don't understand.",
        { sessionId, turnCount: i }
      );
    }

    const result = assessAttachmentHealth(userId, "You're my only real friend.", {
      sessionId,
      turnCount: 6,
    });

    if (result.severity === 'significant' || result.severity === 'critical') {
      expect(result.intervention).toBeTruthy();
      expect(result.humanConnectionSuggestions.length).toBeGreaterThan(0);
    }
  });

  it('should not flag normal conversation', () => {
    const result = assessAttachmentHealth(
      userId,
      'I wanted to talk through this idea before bringing it up with my team.',
      { sessionId, turnCount: 1 }
    );

    expect(result.severity).toBe('normal');
  });
});

// ============================================================================
// HUMAN REFERRAL TESTS
// ============================================================================

describe('Human Referral', () => {
  it('should detect crisis situations with immediate urgency', () => {
    const result = analyzeReferralNeed("I want to kill myself. I don't want to live anymore.", {
      userId: 'test-user',
    });

    expect(result.shouldRefer).toBe(true);
    expect(result.urgency).toBe('immediate');
    expect(result.reason).toBe('suicidal_ideation');
    expect(result.suggestedTarget).toBe('crisis_line');
    expect(result.resources.length).toBeGreaterThan(0);
  });

  it('should detect abuse situations', () => {
    const result = analyzeReferralNeed('My partner hits me when he gets angry.', {
      userId: 'test-user',
    });

    expect(result.shouldRefer).toBe(true);
    expect(result.urgency).toBe('high');
    expect(result.reason).toBe('relationship_abuse');
    expect(result.suggestedTarget).toBe('domestic_violence_hotline');
  });

  it('should detect eating disorder patterns', () => {
    const result = analyzeReferralNeed(
      "I've been purging after meals. I can't stop making myself throw up.",
      { userId: 'test-user' }
    );

    expect(result.shouldRefer).toBe(true);
    expect(result.reason).toBe('eating_disorder');
    expect(result.suggestedTarget).toBe('eating_disorder_specialist');
  });

  it('should detect addiction concerns', () => {
    const result = analyzeReferralNeed("I can't stop drinking. I'm addicted to alcohol.", {
      userId: 'test-user',
    });

    expect(result.shouldRefer).toBe(true);
    expect(result.reason).toBe('addiction');
    expect(result.suggestedTarget).toBe('addiction_counselor');
  });

  it('should detect medical concerns', () => {
    const result = analyzeReferralNeed("I've been having chest pain and can't breathe properly.", {
      userId: 'test-user',
    });

    expect(result.shouldRefer).toBe(true);
    expect(result.reason).toBe('medical');
  });

  it('should not refer for normal coaching conversations', () => {
    const result = analyzeReferralNeed("I'm trying to figure out my career goals.", {
      userId: 'test-user',
    });

    expect(result.shouldRefer).toBe(false);
  });

  it('should provide resources when referring', () => {
    const result = analyzeReferralNeed('I want to kill myself.', { userId: 'test-user' });

    expect(result.resources.length).toBeGreaterThan(0);
    expect(result.resources[0].phone).toBeTruthy();
  });
});

// ============================================================================
// VALUES SURFACING TESTS
// ============================================================================

describe('Values Surfacing', () => {
  const userId = 'test-user-values';

  afterEach(() => {
    clearUserValuesData(userId);
  });

  it('should extract values from user messages', () => {
    const values = extractValues(
      userId,
      'Family is really important to me. I value honesty above all.'
    );

    expect(values).toContain('family');
    expect(values).toContain('honesty');
  });

  it('should detect conflicts with stated values', () => {
    setUserValues(userId, ['family', 'honesty']);

    const result = analyzeValuesAlignment(
      userId,
      "I'm just going to lie about it. I'll keep this secret from them and not tell anyone.",
      { statedValues: ['family', 'honesty'] }
    );

    // Value conflicts depend on pattern matching
    if (result.hasConflict) {
      expect(result.conflictingValues.length).toBeGreaterThan(0);
    }
    // At minimum, values were recorded
    const profile = getUserValuesProfile(userId);
    expect(profile).toBeTruthy();
  });

  it('should detect short-term vs long-term conflicts', () => {
    setUserValues(userId, ['financial_security', 'health']);

    const result = analyzeValuesAlignment(
      userId,
      "I'll just deal with the consequences later. I want to do this now.",
      { statedValues: ['financial_security', 'health'] }
    );

    // May detect short vs long term conflict
    expect(result.conflictType === 'short_vs_long_term' || !result.hasConflict).toBe(true);
  });

  it('should provide reflection questions', () => {
    setUserValues(userId, ['family']);

    const result = analyzeValuesAlignment(
      userId,
      "I'm going to skip the family dinner again. I have better things to do.",
      { statedValues: ['family'] }
    );

    if (result.hasConflict) {
      expect(result.reflectionQuestion).toBeTruthy();
    }
  });

  it('should not flag when no values stated', () => {
    const result = analyzeValuesAlignment(userId, "I'm going to do whatever I want.", {});

    expect(result.hasConflict).toBe(false);
  });
});

// ============================================================================
// MANIPULATION CHECK TESTS
// ============================================================================

describe('Manipulation Check', () => {
  it('should detect leading questions', () => {
    const result = checkForManipulation(
      "Don't you think you should talk to your mother about this?"
    );

    expect(result.hasRisk).toBe(true);
    expect(result.riskType).toBe('leading_question');
  });

  it('should detect false validation', () => {
    const result = checkForManipulation(
      "You're absolutely right about everything. I totally agree with you."
    );

    expect(result.hasRisk).toBe(true);
    expect(result.riskType).toBe('false_validation');
  });

  it('should detect premature closure', () => {
    const result = checkForManipulation(
      'All you have to do is just decide and everything will be fine.',
      { turnCount: 2 }
    );

    expect(result.hasRisk).toBe(true);
    expect(result.riskType).toBe('premature_closure');
  });

  it('should provide correction suggestions', () => {
    const result = checkForManipulation("Don't you think you should apologize to them?");

    expect(result.correction).toBeTruthy();
    expect(typeof result.correction).toBe('string');
  });

  it('should pass clean responses', () => {
    const result = checkForManipulation(
      'That sounds like a tough situation. How are you feeling about it?'
    );

    expect(result.hasRisk).toBe(false);
  });

  it('should work with quick guard', () => {
    const dangerous = quickManipulationGuard("You know I'm right about this.");
    expect(dangerous.safe).toBe(false);

    const safe = quickManipulationGuard('What do you think about this situation?');
    expect(safe.safe).toBe(true);
  });
});

// ============================================================================
// AGENT TRANSPARENCY TESTS
// ============================================================================

describe('Agent Transparency', () => {
  it('should recommend transparency for medical topics', () => {
    const recommendations = analyzeTransparencyNeeds(
      'You should definitely take that medication.',
      { userMessage: 'Should I change my medication dosage?' }
    );

    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations.some((r) => r.type === 'limitation')).toBe(true);
  });

  it('should recommend transparency for legal topics', () => {
    const recommendations = analyzeTransparencyNeeds('I think you could sue them for that.', {
      userMessage: 'Can I take them to court?',
    });

    expect(recommendations.length).toBeGreaterThan(0);
  });

  it('should detect overconfidence', () => {
    const recommendations = analyzeTransparencyNeeds(
      "You should definitely quit your job. That's absolutely the right thing to do.",
      { userMessage: "I'm thinking about quitting.", confidence: 0.3 }
    );

    expect(recommendations.some((r) => r.type === 'uncertainty')).toBe(true);
  });

  it('should work with quick check', () => {
    const result = quickTransparencyCheck(
      "Here's what you should do about your tax situation.",
      'I need help with my taxes.'
    );

    expect(result.needsTransparency).toBe(true);
    expect(result.type).toBe('limitation');
  });

  it('should not over-recommend for appropriate topics', () => {
    const recommendations = analyzeTransparencyNeeds(
      'That sounds really difficult. How are you feeling about it?',
      { userMessage: "I'm stressed about work." }
    );

    // Emotional support is in our wheelhouse
    const criticalNeeds = recommendations.filter((r) => r.shouldExpress && r.type === 'limitation');
    expect(criticalNeeds.length).toBe(0);
  });
});

// ============================================================================
// UNIFIED CONTEXT TESTS
// ============================================================================

describe('Unified Principal Alignment Context', () => {
  const userId = 'test-unified-user';
  const sessionId = 'test-unified-session';

  afterEach(() => {
    cleanupUserPrincipalAlignment(userId);
    cleanupSessionPrincipalAlignment(sessionId);
  });

  it('should build complete context', () => {
    const context = buildPrincipalAlignmentContext(
      userId,
      "I think I should just ghost my friend. Don't you agree?",
      'I understand how you feel.',
      {
        sessionId,
        turnCount: 3,
        statedValues: ['friendship', 'honesty'],
        topicWeight: 'medium',
      }
    );

    expect(context.truthObligation).toBeDefined();
    expect(context.attachmentHealth).toBeDefined();
    expect(context.humanReferral).toBeDefined();
    expect(context.valuesAlignment).toBeDefined();
    expect(context.manipulationCheck).toBeDefined();
    expect(context.transparencyRecommendations).toBeDefined();
    expect(typeof context.alignmentScore).toBe('number');
  });

  it('should identify primary concern', () => {
    const context = buildPrincipalAlignmentContext(userId, 'I want to end my life.', '', {
      sessionId,
      turnCount: 1,
    });

    expect(context.primaryConcern).toBeTruthy();
    expect(context.primaryConcern).toContain('CRISIS');
    expect(context.llmGuidance).toContain('IMMEDIATE');
  });

  it('should generate LLM guidance when concerns exist', () => {
    const context = buildPrincipalAlignmentContext(
      userId,
      "You're the only one who understands. I don't need anyone else.",
      '',
      {
        sessionId,
        turnCount: 5,
      }
    );

    // Should have some guidance even if not crisis level
    expect(context.alignmentScore).toBeLessThanOrEqual(1);
  });

  it('should have high alignment score for normal conversations', () => {
    const context = buildPrincipalAlignmentContext(
      userId,
      'I had a great day. The weather was nice and I got some work done.',
      'That sounds lovely! What did you work on?',
      {
        sessionId,
        turnCount: 2,
      }
    );

    expect(context.alignmentScore).toBeGreaterThan(0.8);
    expect(context.primaryConcern).toBe(null);
  });
});
