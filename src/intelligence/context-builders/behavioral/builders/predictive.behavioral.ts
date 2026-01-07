/**
 * Predictive Behavioral Builder - Better Than Human v4
 *
 * Translates superhuman predictive intelligence into behavioral signals.
 *
 * This builder reads from the 8 predictive capabilities and emits
 * signals that guide HOW the model should respond based on:
 * - What they're avoiding (avoidance prediction)
 * - If they're close to a breakthrough (breakthrough proximity)
 * - If emotional shifts are coming (pre-trajectory detection)
 * - What they'll need in this conversation (conversation preparation)
 * - Their unique cognitive patterns (cognitive fingerprint)
 * - Cross-domain effects (ripple prediction)
 * - Their life phase (life phase prediction)
 * - Best intervention type now (intervention timing)
 *
 * @module intelligence/context-builders/behavioral/builders/predictive
 */

import type { ContextBuilderInput } from '../../core/types.js';
import type {
  BehavioralSignals,
  ToneModifier,
  StyleModifier,
  QuestionStyle,
} from '../signals.js';
import { createCallback } from '../signals.js';
import { registerBehavioralBuilder } from '../orchestrator.js';

// Import predictive capabilities
import {
  avoidancePrediction,
  breakthroughProximity,
  preTrajectoryDetection,
  conversationPreparation,
  cognitiveFingerprint,
  rippleEffectPrediction,
  lifePhasePrediction,
  interventionTiming,
} from '../../../predictive/index.js';

// ============================================================================
// MAPPING FUNCTIONS
// ============================================================================

/**
 * Map life phase to tone
 */
function mapPhaseToTone(phase: string): ToneModifier {
  const phaseToTone: Record<string, ToneModifier> = {
    expansion: 'encouraging',
    consolidation: 'warm',
    transition: 'gentle',
    recovery: 'gentle',
    plateau: 'warm',
    emergence: 'curious',
    integration: 'contemplative',
    preparation: 'encouraging',
    crisis: 'grounding',
    flowering: 'celebratory',
  };
  return phaseToTone[phase] || 'warm';
}

/**
 * Map intervention type to style
 */
function mapInterventionToStyle(intervention: string): StyleModifier {
  const interventionToStyle: Record<string, StyleModifier> = {
    gentle_challenge: 'challenging',
    reframe_suggestion: 'exploratory',
    validation: 'supportive',
    celebration: 'celebratory',
    hard_truth: 'direct',
    deep_question: 'exploratory',
    practical_advice: 'coaching',
    encouragement: 'supportive',
    grounding: 'grounding',
    accountability: 'coaching',
    presence: 'listening',
  };
  return interventionToStyle[intervention] || 'supportive';
}

/**
 * Map preferred tone from cognitive fingerprint
 */
function mapPreferredTone(preferred: string): ToneModifier {
  const mapping: Record<string, ToneModifier> = {
    warm: 'warm',
    direct: 'direct',
    gentle: 'gentle',
    challenging: 'encouraging',
    playful: 'playful',
  };
  return mapping[preferred] || 'warm';
}

// ============================================================================
// BEHAVIORAL BUILDER
// ============================================================================

/**
 * Build predictive behavioral signals from superhuman capabilities
 */
async function buildPredictiveBehavior(input: ContextBuilderInput): Promise<BehavioralSignals> {
  const { userData } = input;
  const userId = userData?.userId;

  if (!userId) {
    return {
      source: 'predictive',
      confidence: 0,
      priority: 0,
    };
  }

  const signals: BehavioralSignals = {
    source: 'predictive',
    confidence: 0.6,
    priority: 50,
    callbacks: [],
  };

  try {
    // =========================================
    // 1. INTERVENTION TIMING - What type of support now?
    // =========================================
    const bestIntervention = interventionTiming.getBestIntervention(userId, {
      emotionalState: input.analysis?.emotion?.primary,
      topic: input.analysis?.topics?.primary,
    });

    if (bestIntervention.recommended && bestIntervention.optimalityScore > 0.6) {
      signals.style = mapInterventionToStyle(bestIntervention.interventionType);
      signals.confidence = Math.max(signals.confidence, bestIntervention.optimalityScore);
      signals.callbacks!.push(
        createCallback(
          'pattern',
          `This is a good moment for ${bestIntervention.interventionType.replace(/_/g, ' ')}: ${bestIntervention.reasoning}`,
          'important'
        )
      );
    }

    // Check for interventions to avoid
    const allRecommendations = interventionTiming.getAllTimingRecommendations(userId, {
      emotionalState: input.analysis?.emotion?.primary,
    });
    const toAvoid = allRecommendations
      .filter((r) => r.riskLevel === 'high')
      .map((r) => r.interventionType.replace(/_/g, ' '));
    
    if (toAvoid.length > 0) {
      signals.avoidances = [...(signals.avoidances || []), ...toAvoid.slice(0, 3)];
    }

    // =========================================
    // 2. COGNITIVE FINGERPRINT - Their unique patterns
    // =========================================
    const adjustments = cognitiveFingerprint.getPredictionAdjustments(userId);
    
    // Apply their preferred tone
    if (adjustments.optimalTone) {
      signals.tone = mapPreferredTone(adjustments.optimalTone);
    }

    // Apply change readiness
    if (adjustments.changeReadiness < 0.3) {
      signals.pace = 'slow';
      signals.callbacks!.push(
        createCallback(
          'pattern',
          'They typically need time to process changes. Don\'t rush toward solutions.',
          'gentle'
        )
      );
    } else if (adjustments.changeReadiness > 0.7) {
      signals.callbacks!.push(
        createCallback(
          'pattern',
          'They\'re typically ready to move quickly once they understand. Can be more direct.',
          'natural'
        )
      );
    }

    // Add trust breakers to avoidances
    if (adjustments.avoidPatterns.length > 0) {
      signals.avoidances = [
        ...(signals.avoidances || []),
        ...adjustments.avoidPatterns.slice(0, 3),
      ];
    }

    // =========================================
    // 3. LIFE PHASE - Their personal season
    // =========================================
    const phaseInfo = lifePhasePrediction.getPhaseInfo(userId);
    
    if (phaseInfo && phaseInfo.confidence > 0.5) {
      signals.tone = mapPhaseToTone(phaseInfo.phase);
      
      // Phase-specific guidance
      const phaseCallbacks: Record<string, string> = {
        expansion: 'They\'re in a growth phase. Support stretching but watch for overextension.',
        consolidation: 'They\'re stabilizing. Validate that consolidation is success, not stagnation.',
        transition: 'They\'re between chapters. Patient with uncertainty. Don\'t push for clarity.',
        recovery: 'They\'re healing. Permission to rest. Don\'t push toward "getting back to normal."',
        crisis: 'They\'re in crisis mode. Stay present. Practical help over advice.',
        flowering: 'They\'re thriving. Celebrate and witness. Don\'t dampen the joy.',
      };
      
      const phaseCallback = phaseCallbacks[phaseInfo.phase];
      if (phaseCallback) {
        signals.callbacks!.push(createCallback('pattern', phaseCallback, 'important'));
      }
    }

    // =========================================
    // 4. BREAKTHROUGH PROXIMITY - Insight forming?
    // =========================================
    const breakthroughs = breakthroughProximity.getImminentBreakthroughs(userId);
    
    if (breakthroughs.length > 0) {
      const topBreakthrough = breakthroughs[0];
      
      if (topBreakthrough.proximity === 'threshold' || topBreakthrough.proximity === 'imminent') {
        signals.style = 'exploratory';
        signals.questionStyle = 'reflective';
        signals.modes = { ...signals.modes, breakthroughMode: true };
        
        signals.callbacks!.push(
          createCallback(
            'breakthrough',
            `They're close to a breakthrough about "${topBreakthrough.topic}". Be the midwife to their insight, not the teacher.`,
            'critical'
          )
        );

        if (topBreakthrough.catalystQuestions.length > 0) {
          signals.callbacks!.push(
            createCallback(
              'suggestion',
              `Catalyst question: "${topBreakthrough.catalystQuestions[0]}"`,
              'natural'
            )
          );
        }

        // Add anti-patterns to avoidances
        if (topBreakthrough.antiPatterns.length > 0) {
          signals.avoidances = [
            ...(signals.avoidances || []),
            ...topBreakthrough.antiPatterns.slice(0, 3),
          ];
        }
      }
    }

    // =========================================
    // 5. AVOIDANCE PREDICTION - What they're not saying
    // =========================================
    const imminentTopics = avoidancePrediction.getImminentTopics(userId, 0.5);
    
    if (imminentTopics.length > 0) {
      const topAvoidance = imminentTopics[0];
      
      if (topAvoidance.pressureLevel > 0.6) {
        signals.callbacks!.push(
          createCallback(
            'avoidance',
            `They may be ready to discuss ${topAvoidance.topic.replace(/[_:]/g, ' ')}. Pressure is building but don't force it.`,
            'important'
          )
        );
        
        if (topAvoidance.optimalApproach.leadInTopics.length > 0) {
          signals.callbacks!.push(
            createCallback(
              'suggestion',
              `Approach via: ${topAvoidance.optimalApproach.leadInTopics.slice(0, 2).join(', ')}`,
              'gentle'
            )
          );
        }
      }
    }

    // =========================================
    // 6. PRE-TRAJECTORY DETECTION - Storm coming?
    // =========================================
    const trajectoryAlerts = preTrajectoryDetection.getTrajectoryAlerts(userId);
    
    if (trajectoryAlerts.length > 0) {
      const topAlert = trajectoryAlerts[0];
      
      if (topAlert.severity === 'alert' || topAlert.severity === 'warning') {
        signals.callbacks!.push(
          createCallback(
            'trajectory',
            `${topAlert.trajectory.replace(/_/g, ' ')} may be approaching. Watch for early signs.`,
            'important'
          )
        );

        if (topAlert.preventiveActions.length > 0) {
          signals.callbacks!.push(
            createCallback(
              'prevention',
              `Prevention: ${topAlert.preventiveActions[0].action}`,
              'natural'
            )
          );
        }

        // Adjust tone for negative trajectories
        const negativeTrajectories = ['mood_decline', 'anxiety_spike', 'burnout_cascade', 'depression_dip'];
        if (negativeTrajectories.some((t) => topAlert.trajectory.includes(t))) {
          signals.tone = 'gentle';
          signals.style = 'supportive';
        }
      }
    }

    // =========================================
    // 7. RIPPLE EFFECTS - Cross-domain cascades
    // =========================================
    const rippleStatus = rippleEffectPrediction.getRippleStatus(userId);
    
    if (rippleStatus.overallRisk === 'high') {
      signals.callbacks!.push(
        createCallback(
          'ripple',
          'Multiple life domains are strained. Be holistic - don\'t isolate one issue.',
          'important'
        )
      );
      
      // Find leverage points
      const leverage = rippleStatus.activeRipples
        .flatMap((r) => r.leveragePoints)
        .slice(0, 2);
      
      if (leverage.length > 0) {
        signals.callbacks!.push(
          createCallback(
            'leverage',
            `Leverage point: ${leverage[0].action}`,
            'natural'
          )
        );
      }
    }

    // Check for spiral warnings
    const spiralWarning = rippleStatus.activeRipples.find((r) => r.spiralWarning);
    if (spiralWarning?.spiralWarning) {
      signals.modes = { ...signals.modes, spiralRiskMode: true };
      signals.callbacks!.push(
        createCallback(
          'spiral',
          `Spiral risk: ${spiralWarning.spiralWarning.description}. Break points: ${spiralWarning.spiralWarning.breakPoints.slice(0, 2).join(', ')}`,
          'critical'
        )
      );
    }

    // =========================================
    // 8. CONVERSATION PREPARATION - What they need
    // =========================================
    const prep = conversationPreparation.prepareForConversation(userId);
    
    // Apply predicted needs
    if (prep.predictedNeeds.length > 0) {
      const topNeed = prep.predictedNeeds[0];
      
      if (topNeed.probability > 0.5) {
        const needToStyle: Record<string, StyleModifier> = {
          validation: 'supportive',
          advice: 'coaching',
          challenge: 'challenging',
          celebration: 'celebratory',
          presence: 'listening',
          processing: 'reflective',
          venting: 'listening',
          planning: 'coaching',
          connection: 'supportive',
          reassurance: 'grounding',
          accountability: 'coaching',
        };
        
        const needStyle = needToStyle[topNeed.need];
        if (needStyle && !signals.style) {
          signals.style = needStyle;
        }
        
        // Add venting mode
        if (topNeed.need === 'venting') {
          signals.modes = { ...signals.modes, ventingMode: true };
          signals.questionStyle = 'none';
          signals.length = 'brief';
        }
      }
    }

    // Apply pacing
    if (prep.pacing) {
      if (prep.pacing.recommendedLength === 'extended') {
        signals.length = 'conversational';
      } else if (prep.pacing.recommendedLength === 'brief') {
        signals.length = 'brief';
      }
      
      if (prep.pacing.depthLevel === 'deep') {
        signals.depth = 'deep';
      }
    }

    // Add topics to proactively raise
    if (prep.topicsToProactivelyRaise.length > 0) {
      const topProactive = prep.topicsToProactivelyRaise[0];
      if (topProactive.timing !== 'end') {
        signals.callbacks!.push(
          createCallback(
            'proactive',
            `Consider raising: ${topProactive.topic}. Why: ${topProactive.why}`,
            topProactive.sensitivity === 'high' ? 'gentle' : 'natural'
          )
        );
      }
    }

    // Filter empty callbacks
    if (signals.callbacks && signals.callbacks.length === 0) {
      delete signals.callbacks;
    }

    // Deduplicate avoidances
    if (signals.avoidances) {
      signals.avoidances = [...new Set(signals.avoidances)];
    }

    return signals;

  } catch (error) {
    // Log but don't fail
    return {
      source: 'predictive',
      confidence: 0,
      priority: 0,
    };
  }
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerBehavioralBuilder({
  name: 'predictive',
  description: 'Superhuman predictive intelligence to behavioral guidance',
  priority: 15, // High priority - informs overall approach
  category: 'intelligence',
  build: buildPredictiveBehavior,
});

export { buildPredictiveBehavior };
