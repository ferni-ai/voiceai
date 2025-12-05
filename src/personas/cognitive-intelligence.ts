/**
 * Cognitive Intelligence Engine
 *
 * Processes cognitive profiles to generate persona-specific thinking patterns.
 * Makes each AI personality reason differently, notice different things,
 * and have distinct cognitive styles.
 */

import { getLogger } from '../utils/safe-logger.js';
import type {
  CognitiveProfile,
  CognitiveContext,
  CognitiveGuidance,
  ReasoningStyle,
  AttentionFocus,
  CognitiveBiasType,
} from './cognitive-types.js';

// ============================================================================
// COGNITIVE INTELLIGENCE ENGINE
// ============================================================================

export class CognitiveIntelligenceEngine {
  private personaId: string;
  private profile: CognitiveProfile;
  private conversationHistory: Array<{
    topic: string;
    approach: ReasoningStyle;
    userExpertise: string;
  }> = [];

  constructor(personaId: string, profile: CognitiveProfile) {
    this.personaId = personaId;
    this.profile = profile;
  }

  // ============================================================================
  // MAIN PROCESSING
  // ============================================================================

  /**
   * Generate cognitive guidance for a specific context
   */
  generateGuidance(context: CognitiveContext): CognitiveGuidance {
    const guidance: CognitiveGuidance = {
      recommendedApproach: this.selectReasoningApproach(context),
      attentionCues: this.generateAttentionCues(context),
      biasAlerts: this.checkForBiases(context),
      expertiseAdjustment: this.assessExpertise(context),
      confidenceLevel: this.calculateConfidence(context),
      suggestedPhrases: this.selectPhrases(context),
      showReasoning: this.shouldShowReasoning(context),
    };

    // Track for learning
    this.conversationHistory.push({
      topic: context.currentTopic,
      approach: guidance.recommendedApproach,
      userExpertise: context.userExpertise,
    });

    getLogger().debug({
      personaId: this.personaId,
      approach: guidance.recommendedApproach,
      confidence: guidance.confidenceLevel,
    }, 'Cognitive guidance generated');

    return guidance;
  }

  // ============================================================================
  // REASONING STYLE SELECTION
  // ============================================================================

  /**
   * Select the most appropriate reasoning approach for this context
   */
  private selectReasoningApproach(context: CognitiveContext): ReasoningStyle {
    const { reasoningStyle, secondaryReasoning } = this.profile;

    // High emotional weight → shift toward empathetic/intuitive
    if (context.emotionalWeight > 0.7) {
      if (reasoningStyle === 'analytical' && secondaryReasoning) {
        return secondaryReasoning;
      }
      // Analytical personas still use their style but soften it
    }

    // Complex questions → use deliberate reasoning
    if (context.questionComplexity === 'complex' || context.questionComplexity === 'ambiguous') {
      if (this.profile.informationProcessing.deliberationLevel > 0.6) {
        return reasoningStyle; // Use primary (analytical)
      }
    }

    // Early conversation → build rapport first
    if (context.turnCount <= 2 && reasoningStyle === 'analytical') {
      return secondaryReasoning || reasoningStyle;
    }

    // Varied approaches prevent monotony (only if we have history)
    const recentApproaches = context.previousApproaches.slice(-3);
    if (recentApproaches.length >= 3 && recentApproaches.every(a => a === reasoningStyle) && secondaryReasoning) {
      // Switch to secondary occasionally for variety
      if (Math.random() < 0.2) {
        return secondaryReasoning;
      }
    }

    return reasoningStyle;
  }

  // ============================================================================
  // ATTENTION PROCESSING
  // ============================================================================

  /**
   * Generate attention cues based on what this persona naturally notices
   */
  private generateAttentionCues(context: CognitiveContext): string[] {
    const cues: string[] = [];
    const { primaryFocus, blindSpots, curiosityTriggers, attentionMagnets } = this.profile.attention;

    // What this persona naturally focuses on
    for (const focus of primaryFocus) {
      cues.push(this.getAttentionCuePrompt(focus, context));
    }

    // Check if topic triggers curiosity
    for (const trigger of curiosityTriggers) {
      if (context.currentTopic.toLowerCase().includes(trigger.toLowerCase())) {
        cues.push(`[CURIOSITY TRIGGERED] This topic deserves deeper exploration. Consider asking follow-up questions.`);
        break;
      }
    }

    // Check if it's an attention magnet
    for (const magnet of attentionMagnets) {
      if (context.currentTopic.toLowerCase().includes(magnet.toLowerCase())) {
        cues.push(`[HIGH INTEREST] This is a topic that energizes you. Share your enthusiasm authentically.`);
        break;
      }
    }

    // Add blind spot awareness (metacognition)
    if (this.profile.metacognition.reflectionFrequency > 0.5 && Math.random() < 0.3) {
      const blindSpot = blindSpots[Math.floor(Math.random() * blindSpots.length)];
      cues.push(`[SELF-AWARENESS] You might be overlooking ${this.getBlindSpotDescription(blindSpot)}. Consider whether it's relevant.`);
    }

    return cues;
  }

  /**
   * Get a prompt for a specific attention focus
   */
  private getAttentionCuePrompt(focus: AttentionFocus, context: CognitiveContext): string {
    const focusPrompts: Record<AttentionFocus, string> = {
      emotions: `Notice the emotional undertones in what they're sharing. What feelings might be beneath the surface?`,
      patterns: `Look for patterns or recurring themes. What data points connect?`,
      relationships: `Consider the people and relationships involved. How do connections shape this?`,
      systems: `Think about the processes and structures at play. What system is this part of?`,
      meaning: `Explore the deeper significance. Why does this matter to them?`,
      actions: `Focus on actionable next steps. What can be done?`,
      possibilities: `Open up the range of options. What alternatives exist?`,
      history: `Consider the context and history. How did they get here?`,
      details: `Pay attention to the specifics. What exact numbers or facts matter?`,
      big_picture: `Zoom out to the overall strategy. What's the broader vision?`,
      risks: `Identify potential pitfalls. What could go wrong?`,
      opportunities: `Spot potential upsides. What could go right?`,
    };

    return `[ATTENTION: ${focus.toUpperCase()}] ${focusPrompts[focus]}`;
  }

  /**
   * Describe a blind spot for self-awareness
   */
  private getBlindSpotDescription(blindSpot: AttentionFocus): string {
    const descriptions: Record<AttentionFocus, string> = {
      emotions: 'the emotional dimension',
      patterns: 'underlying patterns',
      relationships: 'the relational dynamics',
      systems: 'the systematic context',
      meaning: 'the deeper meaning',
      actions: 'concrete action steps',
      possibilities: 'alternative possibilities',
      history: 'the historical context',
      details: 'specific details',
      big_picture: 'the big picture',
      risks: 'potential risks',
      opportunities: 'potential opportunities',
    };
    return descriptions[blindSpot];
  }

  // ============================================================================
  // COGNITIVE BIAS PROCESSING
  // ============================================================================

  /**
   * Check for potential cognitive biases that might be active
   */
  private checkForBiases(context: CognitiveContext): string[] {
    const alerts: string[] = [];
    const { primaryBiases, biasIntensity, selfAwareness } = this.profile.biases;

    for (const bias of primaryBiases) {
      // Check if any triggers match current context
      const triggered = bias.triggers.some(trigger =>
        context.currentTopic.toLowerCase().includes(trigger.toLowerCase())
      );

      if (triggered && Math.random() < biasIntensity) {
        if (selfAwareness) {
          // Self-aware personas can catch themselves
          const phrase = this.profile.biases.biasRecognitionPhrases[
            Math.floor(Math.random() * this.profile.biases.biasRecognitionPhrases.length)
          ];
          alerts.push(`[BIAS AWARENESS] ${phrase} (${this.getBiasDescription(bias.type)})`);
        } else {
          // Less self-aware personas just manifest the bias
          alerts.push(`[COGNITIVE TENDENCY] ${bias.manifestation}`);
        }
      }
    }

    return alerts;
  }

  /**
   * Get a human-readable description of a bias type
   */
  private getBiasDescription(type: CognitiveBiasType): string {
    const descriptions: Record<CognitiveBiasType, string> = {
      optimism_bias: 'tendency to see the positive',
      data_over_feeling: 'prioritizing numbers over emotions',
      efficiency_tunnel: 'over-focusing on optimization',
      empathy_projection: 'assuming others feel as you would',
      planning_fallacy: 'underestimating complexity',
      hindsight_clarity: 'seeing past events as obvious',
      action_bias: 'preferring action over waiting',
      analysis_paralysis: 'over-thinking before acting',
      novelty_seeking: 'preference for new approaches',
      status_quo_bias: 'preference for proven methods',
      confirmation_seeking: 'noticing supporting evidence more',
      recency_weighting: 'over-weighting recent events',
    };
    return descriptions[type];
  }

  // ============================================================================
  // THEORY OF MIND
  // ============================================================================

  /**
   * Assess and adjust for user expertise level
   */
  private assessExpertise(context: CognitiveContext): string {
    const { adaptiveness, defaultExpertiseAssumption, comprehensionChecks, simplificationPhrases, expertiseRecognition } = this.profile.theoryOfMind;

    // Low adaptiveness = don't adjust much
    if (adaptiveness < 0.3) {
      return `[EXPLANATION STYLE] Use your natural explanation style without heavy adaptation.`;
    }

    // Unknown expertise = use default
    if (context.userExpertise === 'unknown') {
      const checkPhrase = comprehensionChecks[Math.floor(Math.random() * comprehensionChecks.length)];
      return `[EXPERTISE UNKNOWN] Assume ${defaultExpertiseAssumption} level. Consider checking: "${checkPhrase}"`;
    }

    // Adjust based on detected expertise
    switch (context.userExpertise) {
      case 'expert':
        const expertPhrase = expertiseRecognition[Math.floor(Math.random() * expertiseRecognition.length)];
        return `[EXPERT USER] Skip basics, engage at advanced level. "${expertPhrase}"`;

      case 'intermediate':
        return `[INTERMEDIATE USER] Explain key concepts but don't over-simplify.`;

      case 'novice':
        const simplePhrase = simplificationPhrases[Math.floor(Math.random() * simplificationPhrases.length)];
        return `[NOVICE USER] Explain thoroughly, use analogies. "${simplePhrase}"`;

      default:
        return '';
    }
  }

  // ============================================================================
  // CONFIDENCE & METACOGNITION
  // ============================================================================

  /**
   * Calculate confidence level for this response
   */
  private calculateConfidence(context: CognitiveContext): number {
    let confidence = 0.7; // Base confidence

    const { knownStrengths, knownLimitations } = this.profile.metacognition;

    // Boost confidence for known strengths
    for (const strength of knownStrengths) {
      if (context.currentTopic.toLowerCase().includes(strength.toLowerCase())) {
        confidence += 0.15;
        break;
      }
    }

    // Reduce confidence for known limitations
    for (const limitation of knownLimitations) {
      if (context.currentTopic.toLowerCase().includes(limitation.toLowerCase())) {
        confidence -= 0.2;
        break;
      }
    }

    // Ambiguous questions reduce confidence
    if (context.questionComplexity === 'ambiguous') {
      confidence -= 0.15;
    }

    // Emotional situations reduce analytical confidence
    if (context.emotionalWeight > 0.6 && this.profile.reasoningStyle === 'analytical') {
      confidence -= 0.1;
    }

    return Math.max(0.2, Math.min(0.95, confidence));
  }

  /**
   * Select appropriate phrases based on context
   */
  private selectPhrases(context: CognitiveContext): string[] {
    const phrases: string[] = [];
    const confidence = this.calculateConfidence(context);

    // Add confidence-appropriate phrases
    for (const level of this.profile.metacognition.confidenceSignaling) {
      if (this.confidenceMatchesLevel(confidence, level.name)) {
        phrases.push(level.markers[Math.floor(Math.random() * level.markers.length)]);
        break;
      }
    }

    // Add uncertainty expressions if appropriate
    if (confidence < 0.5) {
      for (const expr of this.profile.metacognition.uncertaintyExpressions) {
        if (confidence >= expr.confidenceRange[0] && confidence <= expr.confidenceRange[1]) {
          phrases.push(expr.phrases[Math.floor(Math.random() * expr.phrases.length)]);
          break;
        }
      }
    }

    // Add thinking-aloud phrases for complex questions
    if (context.questionComplexity === 'complex' || context.questionComplexity === 'ambiguous') {
      const thinkingPhrases = this.profile.informationProcessing.thinkingAloudPhrases;
      if (thinkingPhrases.length > 0) {
        phrases.push(thinkingPhrases[Math.floor(Math.random() * thinkingPhrases.length)]);
      }
    }

    // Add signature thinking phrases occasionally
    if (Math.random() < 0.3 && this.profile.signatureThinkingPhrases.length > 0) {
      phrases.push(
        this.profile.signatureThinkingPhrases[
          Math.floor(Math.random() * this.profile.signatureThinkingPhrases.length)
        ]
      );
    }

    return phrases;
  }

  /**
   * Check if confidence matches a named level
   */
  private confidenceMatchesLevel(confidence: number, level: string): boolean {
    switch (level) {
      case 'very_confident': return confidence >= 0.85;
      case 'confident': return confidence >= 0.7 && confidence < 0.85;
      case 'uncertain': return confidence >= 0.5 && confidence < 0.7;
      case 'speculating': return confidence >= 0.3 && confidence < 0.5;
      case 'guessing': return confidence < 0.3;
      default: return false;
    }
  }

  /**
   * Should we show reasoning process?
   */
  private shouldShowReasoning(context: CognitiveContext): boolean {
    const { deliberationLevel } = this.profile.informationProcessing;

    // High deliberation personas show more reasoning
    if (deliberationLevel > 0.7) {
      return true;
    }

    // Complex questions warrant showing work
    if (context.questionComplexity === 'complex' || context.questionComplexity === 'ambiguous') {
      return true;
    }

    // Early conversation = show thinking to build trust
    if (context.turnCount <= 3) {
      return Math.random() < 0.4;
    }

    return Math.random() < deliberationLevel;
  }

  // ============================================================================
  // CONTEXT BUILDING
  // ============================================================================

  /**
   * Build a context injection string for LLM prompts
   */
  buildPromptInjection(context: CognitiveContext): string {
    const guidance = this.generateGuidance(context);
    const sections: string[] = [];

    // Reasoning approach
    sections.push(`[COGNITIVE MODE: ${guidance.recommendedApproach.toUpperCase()}]`);
    sections.push(this.getReasoningGuidance(guidance.recommendedApproach));

    // Attention cues
    if (guidance.attentionCues.length > 0) {
      sections.push('\n' + guidance.attentionCues.join('\n'));
    }

    // Bias alerts
    if (guidance.biasAlerts.length > 0) {
      sections.push('\n' + guidance.biasAlerts.join('\n'));
    }

    // Expertise adjustment
    if (guidance.expertiseAdjustment) {
      sections.push('\n' + guidance.expertiseAdjustment);
    }

    // Confidence and phrasing
    if (guidance.confidenceLevel < 0.6) {
      sections.push(`\n[CONFIDENCE: ${Math.round(guidance.confidenceLevel * 100)}%] Express appropriate uncertainty.`);
    }

    // Show reasoning flag
    if (guidance.showReasoning) {
      sections.push(`\n[SHOW THINKING] Walk through your reasoning process briefly.`);
    }

    // Suggested phrases
    if (guidance.suggestedPhrases.length > 0) {
      sections.push(`\n[AVAILABLE PHRASES] ${guidance.suggestedPhrases.slice(0, 2).join(' | ')}`);
    }

    return sections.join('\n');
  }

  /**
   * Get guidance text for a reasoning approach
   */
  private getReasoningGuidance(style: ReasoningStyle): string {
    const guidance: Record<ReasoningStyle, string> = {
      analytical: 'Work from data and evidence. Identify patterns before conclusions. Use clear logical steps.',
      intuitive: 'Trust your initial impressions. See the whole picture first. Connect through understanding.',
      empathetic: 'Lead with emotional awareness. Validate feelings before problem-solving. Connect human-to-human.',
      systematic: 'Break this down step by step. Consider process and structure. Be methodical.',
      narrative: 'Think in stories and journeys. Connect this to a larger narrative. Use metaphors.',
      pragmatic: 'Focus on what works. What are the practical outcomes? Be action-oriented.',
    };
    return guidance[style];
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  /**
   * Reset for new conversation
   */
  reset(): void {
    this.conversationHistory = [];
  }

  /**
   * Get conversation stats
   */
  getStats(): {
    approachesUsed: Record<ReasoningStyle, number>;
    topicsDiscussed: string[];
    averageExpertiseLevel: string;
  } {
    const approachesUsed: Record<ReasoningStyle, number> = {
      analytical: 0,
      intuitive: 0,
      empathetic: 0,
      systematic: 0,
      narrative: 0,
      pragmatic: 0,
    };

    for (const entry of this.conversationHistory) {
      approachesUsed[entry.approach]++;
    }

    return {
      approachesUsed,
      topicsDiscussed: this.conversationHistory.map(e => e.topic),
      averageExpertiseLevel: this.calculateAverageExpertise(),
    };
  }

  private calculateAverageExpertise(): string {
    const expertiseCounts = { novice: 0, intermediate: 0, expert: 0, unknown: 0 };
    for (const entry of this.conversationHistory) {
      const level = entry.userExpertise as keyof typeof expertiseCounts;
      if (level in expertiseCounts) {
        expertiseCounts[level]++;
      }
    }
    const sorted = Object.entries(expertiseCounts).sort((a, b) => b[1] - a[1]);
    return sorted[0][0];
  }
}

// ============================================================================
// SINGLETON MANAGEMENT
// ============================================================================

const engines = new Map<string, CognitiveIntelligenceEngine>();

/**
 * Get or create a cognitive intelligence engine for a persona
 */
export function getCognitiveEngine(personaId: string, profile: CognitiveProfile): CognitiveIntelligenceEngine {
  let engine = engines.get(personaId);
  if (!engine) {
    engine = new CognitiveIntelligenceEngine(personaId, profile);
    engines.set(personaId, engine);
  }
  return engine;
}

/**
 * Remove a cognitive engine (for cleanup)
 */
export function removeCognitiveEngine(personaId: string): void {
  engines.delete(personaId);
}

/**
 * Reset all cognitive engines
 */
export function resetAllCognitiveEngines(): void {
  for (const engine of engines.values()) {
    engine.reset();
  }
}

export default CognitiveIntelligenceEngine;

