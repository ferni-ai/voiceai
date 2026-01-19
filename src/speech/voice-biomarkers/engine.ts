/**
 * Voice Biomarker Pipeline Engine
 *
 * Detect emotional and physical states from voice characteristics.
 *
 * @module @ferni/speech/voice-biomarkers/engine
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  IVoiceBiomarkerPipeline,
  VoiceFeatures,
  VoiceState,
  VoiceIntervention,
  DetectedBiomarker,
  BiomarkerType,
} from './types.js';

const log = createLogger({ module: 'VoiceBiomarkerPipeline' });

// ============================================================================
// DETECTION THRESHOLDS
// ============================================================================

const THRESHOLDS = {
  stress: {
    speakingRateHigh: 180, // WPM
    pitchVarianceHigh: 50, // Hz
    energyHigh: 0.8,
  },
  fatigue: {
    speakingRateLow: 100, // WPM
    energyLow: 0.3,
    pauseFrequencyHigh: 0.4,
  },
  anxiety: {
    pitchMeanHigh: 250, // Hz
    jitterHigh: 0.03,
    shimmerHigh: 0.1,
  },
  sadness: {
    pitchMeanLow: 150, // Hz
    energyLow: 0.35,
    speakingRateLow: 110,
  },
};

// ============================================================================
// INTERVENTION SCRIPTS
// ============================================================================

const INTERVENTION_SCRIPTS = {
  'slow-pace': [
    "I notice your voice sounds a bit rushed. Let's take a breath together.",
    "Take your time. I'm here with you.",
  ],
  'breathing-exercise': [
    'Let\'s pause for a moment. Breathe in slowly... and out...',
    'I\'d like to try something. Can you take a slow, deep breath with me?',
  ],
  grounding: [
    "Let's ground ourselves. What's one thing you can see right now?",
    'I want to help you feel more present. What do you notice around you?',
  ],
  'energy-boost': [
    'I hear you might be feeling tired. Want to take a short break?',
    "Your voice tells me you might need some rest. That's okay.",
  ],
  'gentle-check-in': [
    'How are you feeling right now, really?',
    'I want to make sure you\'re okay. How are you doing?',
  ],
  celebration: [
    'I can hear the excitement in your voice!',
    "Your energy is wonderful right now!",
  ],
};

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

const stateHistory = new Map<string, VoiceState[]>();
const interventionHistory = new Map<string, Array<{
  intervention: VoiceIntervention;
  wasEffective: boolean;
  timestamp: Date;
}>>();

// ============================================================================
// ENGINE IMPLEMENTATION
// ============================================================================

export class VoiceBiomarkerPipeline implements IVoiceBiomarkerPipeline {
  async analyze(features: VoiceFeatures): Promise<VoiceState> {
    const biomarkers: DetectedBiomarker[] = [];
    const now = new Date();

    // Detect stress
    const stressConfidence = this.detectStress(features);
    if (stressConfidence > 0.5) {
      biomarkers.push({
        type: 'stress',
        confidence: stressConfidence,
        intensity: stressConfidence,
        features,
        detectedAt: now,
      });
    }

    // Detect fatigue
    const fatigueConfidence = this.detectFatigue(features);
    if (fatigueConfidence > 0.5) {
      biomarkers.push({
        type: 'fatigue',
        confidence: fatigueConfidence,
        intensity: fatigueConfidence,
        features,
        detectedAt: now,
      });
    }

    // Detect anxiety
    const anxietyConfidence = this.detectAnxiety(features);
    if (anxietyConfidence > 0.5) {
      biomarkers.push({
        type: 'anxiety',
        confidence: anxietyConfidence,
        intensity: anxietyConfidence,
        features,
        detectedAt: now,
      });
    }

    // Detect sadness
    const sadnessConfidence = this.detectSadness(features);
    if (sadnessConfidence > 0.5) {
      biomarkers.push({
        type: 'sadness',
        confidence: sadnessConfidence,
        intensity: sadnessConfidence,
        features,
        detectedAt: now,
      });
    }

    // Detect excitement (positive)
    const excitementConfidence = this.detectExcitement(features);
    if (excitementConfidence > 0.5) {
      biomarkers.push({
        type: 'excitement',
        confidence: excitementConfidence,
        intensity: excitementConfidence,
        features,
        detectedAt: now,
      });
    }

    // Detect calm
    const calmConfidence = this.detectCalm(features);
    if (calmConfidence > 0.5) {
      biomarkers.push({
        type: 'calm',
        confidence: calmConfidence,
        intensity: calmConfidence,
        features,
        detectedAt: now,
      });
    }

    // Sort by confidence
    biomarkers.sort((a, b) => b.confidence - a.confidence);

    // Calculate stress and energy levels
    const stressLevel = this.calculateStressLevel(biomarkers, features);
    const energyLevel = this.calculateEnergyLevel(features);

    // Determine recommended pacing
    let recommendedPacing: 'slower' | 'normal' | 'matched' = 'normal';
    if (stressLevel > 0.7 || biomarkers.some((b) => b.type === 'anxiety')) {
      recommendedPacing = 'slower';
    } else if (biomarkers.some((b) => b.type === 'excitement')) {
      recommendedPacing = 'matched';
    }

    const state: VoiceState = {
      primary: biomarkers[0]?.type || 'neutral',
      biomarkers,
      stressLevel,
      energyLevel,
      recommendedPacing,
      assessedAt: now,
    };

    log.debug(
      {
        primary: state.primary,
        biomarkerCount: biomarkers.length,
        stressLevel,
        energyLevel,
      },
      'Voice state analyzed'
    );

    return state;
  }

  getIntervention(state: VoiceState): VoiceIntervention {
    // High stress or anxiety → breathing/grounding
    if (state.stressLevel > 0.7 || state.biomarkers.some((b) => b.type === 'anxiety' && b.confidence > 0.7)) {
      return {
        type: 'breathing-exercise',
        reason: 'High stress/anxiety detected',
        script: this.getRandomScript('breathing-exercise'),
        urgency: 'soon',
        confidence: 0.8,
      };
    }

    // Fatigue → energy support
    if (state.biomarkers.some((b) => b.type === 'fatigue' && b.confidence > 0.6)) {
      return {
        type: 'energy-boost',
        reason: 'Fatigue detected in voice',
        script: this.getRandomScript('energy-boost'),
        urgency: 'when-natural',
        confidence: 0.7,
      };
    }

    // Sadness → gentle check-in
    if (state.biomarkers.some((b) => b.type === 'sadness' && b.confidence > 0.6)) {
      return {
        type: 'gentle-check-in',
        reason: 'Sadness detected',
        script: this.getRandomScript('gentle-check-in'),
        urgency: 'when-natural',
        confidence: 0.7,
      };
    }

    // Excitement → celebration
    if (state.biomarkers.some((b) => b.type === 'excitement' && b.confidence > 0.6)) {
      return {
        type: 'celebration',
        reason: 'Excitement/positive energy detected',
        script: this.getRandomScript('celebration'),
        urgency: 'when-natural',
        confidence: 0.8,
      };
    }

    // Moderate stress → slow pace
    if (state.stressLevel > 0.5) {
      return {
        type: 'slow-pace',
        reason: 'Moderate stress detected',
        script: this.getRandomScript('slow-pace'),
        urgency: 'when-natural',
        confidence: 0.6,
      };
    }

    return {
      type: 'none',
      reason: 'Voice state is calm/neutral',
      urgency: 'when-natural',
      confidence: 0.9,
    };
  }

  async recordIntervention(
    userId: string,
    intervention: VoiceIntervention,
    wasEffective: boolean
  ): Promise<void> {
    const history = interventionHistory.get(userId) || [];
    history.push({
      intervention,
      wasEffective,
      timestamp: new Date(),
    });

    // Keep last 50 interventions
    if (history.length > 50) {
      interventionHistory.set(userId, history.slice(-50));
    } else {
      interventionHistory.set(userId, history);
    }

    log.debug(
      { userId, type: intervention.type, wasEffective },
      'Intervention recorded'
    );
  }

  async getStateHistory(userId: string, limit = 10): Promise<VoiceState[]> {
    const history = stateHistory.get(userId) || [];
    return history.slice(-limit);
  }

  buildContextInjection(state: VoiceState): string {
    const sections: string[] = ['[VOICE STATE]'];

    sections.push(`Primary state: ${state.primary}`);
    sections.push(`Stress level: ${(state.stressLevel * 100).toFixed(0)}%`);
    sections.push(`Energy level: ${(state.energyLevel * 100).toFixed(0)}%`);

    if (state.recommendedPacing !== 'normal') {
      sections.push(`Recommended pacing: ${state.recommendedPacing}`);
    }

    if (state.biomarkers.length > 0) {
      sections.push('Detected biomarkers:');
      for (const marker of state.biomarkers.slice(0, 3)) {
        sections.push(
          `- ${marker.type}: ${(marker.confidence * 100).toFixed(0)}% confidence`
        );
      }
    }

    return sections.join('\n');
  }

  reset(): void {
    stateHistory.clear();
    interventionHistory.clear();
    log.debug('Voice biomarker pipeline reset');
  }

  // ==========================================================================
  // PRIVATE DETECTION METHODS
  // ==========================================================================

  private detectStress(features: VoiceFeatures): number {
    let confidence = 0;
    let factors = 0;

    if (features.speakingRate !== undefined) {
      if (features.speakingRate > THRESHOLDS.stress.speakingRateHigh) {
        confidence += 0.3;
      }
      factors++;
    }

    if (features.pitchVariance !== undefined) {
      if (features.pitchVariance > THRESHOLDS.stress.pitchVarianceHigh) {
        confidence += 0.3;
      }
      factors++;
    }

    if (features.energy !== undefined) {
      if (features.energy > THRESHOLDS.stress.energyHigh) {
        confidence += 0.2;
      }
      factors++;
    }

    if (features.jitter !== undefined && features.jitter > 0.02) {
      confidence += 0.2;
      factors++;
    }

    return factors > 0 ? Math.min(1, confidence) : 0;
  }

  private detectFatigue(features: VoiceFeatures): number {
    let confidence = 0;
    let factors = 0;

    if (features.speakingRate !== undefined) {
      if (features.speakingRate < THRESHOLDS.fatigue.speakingRateLow) {
        confidence += 0.3;
      }
      factors++;
    }

    if (features.energy !== undefined) {
      if (features.energy < THRESHOLDS.fatigue.energyLow) {
        confidence += 0.3;
      }
      factors++;
    }

    if (features.pauseFrequency !== undefined) {
      if (features.pauseFrequency > THRESHOLDS.fatigue.pauseFrequencyHigh) {
        confidence += 0.2;
      }
      factors++;
    }

    if (features.breathQuality === 'shallow') {
      confidence += 0.2;
      factors++;
    }

    return factors > 0 ? Math.min(1, confidence) : 0;
  }

  private detectAnxiety(features: VoiceFeatures): number {
    let confidence = 0;
    let factors = 0;

    if (features.pitchMean !== undefined) {
      if (features.pitchMean > THRESHOLDS.anxiety.pitchMeanHigh) {
        confidence += 0.3;
      }
      factors++;
    }

    if (features.jitter !== undefined) {
      if (features.jitter > THRESHOLDS.anxiety.jitterHigh) {
        confidence += 0.3;
      }
      factors++;
    }

    if (features.shimmer !== undefined) {
      if (features.shimmer > THRESHOLDS.anxiety.shimmerHigh) {
        confidence += 0.2;
      }
      factors++;
    }

    if (features.breathQuality === 'shallow') {
      confidence += 0.2;
      factors++;
    }

    return factors > 0 ? Math.min(1, confidence) : 0;
  }

  private detectSadness(features: VoiceFeatures): number {
    let confidence = 0;
    let factors = 0;

    if (features.pitchMean !== undefined) {
      if (features.pitchMean < THRESHOLDS.sadness.pitchMeanLow) {
        confidence += 0.3;
      }
      factors++;
    }

    if (features.energy !== undefined) {
      if (features.energy < THRESHOLDS.sadness.energyLow) {
        confidence += 0.3;
      }
      factors++;
    }

    if (features.speakingRate !== undefined) {
      if (features.speakingRate < THRESHOLDS.sadness.speakingRateLow) {
        confidence += 0.2;
      }
      factors++;
    }

    return factors > 0 ? Math.min(1, confidence) : 0;
  }

  private detectExcitement(features: VoiceFeatures): number {
    let confidence = 0;
    let factors = 0;

    if (features.speakingRate !== undefined) {
      if (features.speakingRate > 160) {
        confidence += 0.3;
      }
      factors++;
    }

    if (features.pitchVariance !== undefined) {
      if (features.pitchVariance > 40) {
        confidence += 0.3;
      }
      factors++;
    }

    if (features.energy !== undefined) {
      if (features.energy > 0.7) {
        confidence += 0.2;
      }
      factors++;
    }

    return factors > 0 ? Math.min(1, confidence) : 0;
  }

  private detectCalm(features: VoiceFeatures): number {
    let confidence = 0;
    let factors = 0;

    if (features.speakingRate !== undefined) {
      if (features.speakingRate >= 120 && features.speakingRate <= 150) {
        confidence += 0.3;
      }
      factors++;
    }

    if (features.energy !== undefined) {
      if (features.energy >= 0.4 && features.energy <= 0.6) {
        confidence += 0.3;
      }
      factors++;
    }

    if (features.jitter !== undefined && features.jitter < 0.02) {
      confidence += 0.2;
      factors++;
    }

    if (features.breathQuality === 'normal' || features.breathQuality === 'deep') {
      confidence += 0.2;
      factors++;
    }

    return factors > 0 ? Math.min(1, confidence) : 0;
  }

  private calculateStressLevel(
    biomarkers: DetectedBiomarker[],
    features: VoiceFeatures
  ): number {
    const stressMarkers = biomarkers.filter((b) =>
      ['stress', 'anxiety'].includes(b.type)
    );

    if (stressMarkers.length === 0) {
      // Base stress on features
      let baseStress = 0;
      if (features.energy && features.energy > 0.7) baseStress += 0.2;
      if (features.speakingRate && features.speakingRate > 170) baseStress += 0.2;
      return baseStress;
    }

    return Math.min(
      1,
      stressMarkers.reduce((max, m) => Math.max(max, m.confidence), 0)
    );
  }

  private calculateEnergyLevel(features: VoiceFeatures): number {
    if (features.energy !== undefined) {
      return features.energy;
    }

    // Estimate from other features
    let energy = 0.5;
    if (features.speakingRate) {
      if (features.speakingRate > 160) energy += 0.2;
      else if (features.speakingRate < 110) energy -= 0.2;
    }

    return Math.max(0, Math.min(1, energy));
  }

  private getRandomScript(type: keyof typeof INTERVENTION_SCRIPTS): string {
    const scripts = INTERVENTION_SCRIPTS[type];
    return scripts[Math.floor(Math.random() * scripts.length)];
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let instance: VoiceBiomarkerPipeline | null = null;

export function getVoiceBiomarkerPipeline(): IVoiceBiomarkerPipeline {
  if (!instance) {
    instance = new VoiceBiomarkerPipeline();
  }
  return instance;
}

export function createVoiceBiomarkerPipeline(): IVoiceBiomarkerPipeline {
  return new VoiceBiomarkerPipeline();
}

export function resetVoiceBiomarkerPipeline(): void {
  instance = null;
}
