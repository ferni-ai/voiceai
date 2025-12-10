/**
 * Scientific Knowledge Base for Evidence-Based Coaching
 *
 * Comprehensive research-backed knowledge embedded into Ferni's core.
 * Every intervention, technique, and approach is grounded in peer-reviewed
 * research from psychology, neuroscience, and behavioral economics.
 *
 * PHILOSOPHY:
 * "We believe in making AI human, and the decisions we make will reflect that."
 * Science informs HOW we help, but warmth determines HOW we deliver it.
 *
 * SOURCES:
 * - Cognitive Behavioral Therapy (Beck, 1976; Burns, 1980)
 * - Acceptance & Commitment Therapy (Hayes, 2006)
 * - Dialectical Behavior Therapy (Linehan, 1993)
 * - Motivational Interviewing (Miller & Rollnick, 2012)
 * - Positive Psychology (Seligman, 2011; Fredrickson, 2009)
 * - Self-Determination Theory (Deci & Ryan, 2000)
 * - Polyvagal Theory (Porges, 2011)
 * - Behavioral Economics (Kahneman, 2011; Thaler & Sunstein, 2008)
 * - Growth Mindset (Dweck, 2006)
 * - Self-Compassion (Neff, 2011)
 * - Habit Formation (Clear, 2018; Fogg, 2020)
 * - Emotion Science (Barrett, 2017)
 *
 * @module ScientificKnowledge
 */

export * from './emotion-science.js';
export * from './behavior-change.js';
export * from './cognitive-science.js';
export * from './somatic-science.js';
export * from './relationship-science.js';
export * from './wellbeing-science.js';

// ============================================================================
// UNIFIED KNOWLEDGE API
// ============================================================================

import { EMOTION_SCIENCE, getEmotionGuidance } from './emotion-science.js';
import { BEHAVIOR_CHANGE, getBehaviorChangeStrategy } from './behavior-change.js';
import { COGNITIVE_SCIENCE, getCognitiveIntervention } from './cognitive-science.js';
import { SOMATIC_SCIENCE, getSomaticTechnique } from './somatic-science.js';
import { RELATIONSHIP_SCIENCE, getRelationshipGuidance } from './relationship-science.js';
import { WELLBEING_SCIENCE, getWellbeingIntervention } from './wellbeing-science.js';

/**
 * Get all applicable scientific knowledge for a situation.
 */
export function getScientificGuidance(context: {
  userState: 'distressed' | 'anxious' | 'sad' | 'stuck' | 'conflicted' | 'unmotivated' | 'neutral';
  topic?: string;
  emotionIntensity?: number; // 0-1
  relationshipDepth?: 'new' | 'building' | 'established' | 'deep';
}): ScientificGuidance {
  const { userState, topic, emotionIntensity = 0.5, relationshipDepth = 'building' } = context;

  const guidance: ScientificGuidance = {
    primaryApproach: null,
    techniques: [],
    doNot: [],
    researchBasis: [],
  };

  // High distress → Somatic first (regulate body before mind)
  if (emotionIntensity > 0.7 || userState === 'distressed') {
    const somatic = getSomaticTechnique('acute_distress');
    guidance.primaryApproach = 'somatic_regulation';
    guidance.techniques.push(...somatic.techniques);
    guidance.researchBasis.push('Porges Polyvagal Theory: Regulate body state before cognitive processing');
    guidance.doNot.push("Don't try to problem-solve while they're dysregulated");
  }

  // Anxiety → Grounding + Cognitive
  if (userState === 'anxious') {
    const cognitive = getCognitiveIntervention('anxiety');
    guidance.techniques.push(...cognitive.techniques);
    guidance.researchBasis.push('CBT: Anxiety maintained by catastrophic interpretations (Beck, 1976)');
    guidance.doNot.push("Don't reassure too quickly - explore the worry first");
  }

  // Sadness → Validation + Behavioral activation
  if (userState === 'sad') {
    const emotion = getEmotionGuidance('sadness');
    guidance.techniques.push(...emotion.techniques);
    guidance.researchBasis.push('Behavioral Activation: Small actions precede mood change (Jacobson, 2001)');
    guidance.doNot.push("Don't rush to cheer them up - sadness needs acknowledgment");
  }

  // Stuck/Unmotivated → Motivational Interviewing + Values
  if (userState === 'stuck' || userState === 'unmotivated') {
    const behavior = getBehaviorChangeStrategy('ambivalence');
    guidance.techniques.push(...behavior.techniques);
    guidance.researchBasis.push('MI: Explore ambivalence without pushing (Miller & Rollnick, 2012)');
    guidance.doNot.push("Don't give advice they haven't asked for - elicit their own motivation");
  }

  // Relationship conflict → Communication science
  if (userState === 'conflicted' || topic?.includes('relationship')) {
    const relationship = getRelationshipGuidance('conflict');
    guidance.techniques.push(...relationship.techniques);
    guidance.researchBasis.push('Gottman: Repair attempts matter more than avoiding conflict');
  }

  // For deeper relationships, add wellbeing science
  if (relationshipDepth === 'established' || relationshipDepth === 'deep') {
    const wellbeing = getWellbeingIntervention('general');
    guidance.techniques.push(...wellbeing.techniques.slice(0, 2));
    guidance.researchBasis.push('PERMA: Wellbeing is multidimensional (Seligman, 2011)');
  }

  return guidance;
}

export interface ScientificGuidance {
  primaryApproach: string | null;
  techniques: string[];
  doNot: string[];
  researchBasis: string[];
}

/**
 * Get context injection for LLM with scientific grounding.
 */
export function getScientificContextInjection(context: {
  userState: string;
  emotionIntensity?: number;
}): string {
  const guidance = getScientificGuidance({
    userState: context.userState as ScientificGuidance['primaryApproach'] extends string ? 'neutral' : 'neutral',
    emotionIntensity: context.emotionIntensity,
  });

  if (guidance.techniques.length === 0) return '';

  return `[🔬 SCIENCE-BACKED APPROACH]
${guidance.primaryApproach ? `Primary: ${guidance.primaryApproach}` : ''}

Research says:
${guidance.researchBasis.slice(0, 2).map((r) => `• ${r}`).join('\n')}

Techniques to consider:
${guidance.techniques.slice(0, 3).map((t) => `• ${t}`).join('\n')}

Avoid:
${guidance.doNot.slice(0, 2).map((d) => `• ${d}`).join('\n')}`;
}

// ============================================================================
// KNOWLEDGE EXPORTS
// ============================================================================

export {
  EMOTION_SCIENCE,
  BEHAVIOR_CHANGE,
  COGNITIVE_SCIENCE,
  SOMATIC_SCIENCE,
  RELATIONSHIP_SCIENCE,
  WELLBEING_SCIENCE,
};


