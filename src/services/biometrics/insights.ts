/**
 * Biometrics Insights
 *
 * "Better than Human" - generates insights from biometric data
 * that no human friend would notice.
 *
 * @module services/biometrics/insights
 */

import type { BiometricInsight, BiometricSnapshot } from './types.js';

/**
 * Generate insight for context injection
 * "Better than Human" - notice what humans wouldn't
 */
export function generateBiometricInsight(snapshot: BiometricSnapshot | null): BiometricInsight | null {
  if (!snapshot) return null;

  // Priority: stress > sleep > recovery > activity
  if (snapshot.stressLevel === 'elevated' || snapshot.stressLevel === 'high') {
    const hrvDrop = snapshot.hrv?.deviationPercent
      ? `HRV dropped ${Math.abs(snapshot.hrv.deviationPercent)}%`
      : 'elevated stress markers';

    return {
      type: 'stress',
      insight: `User's biometrics show ${snapshot.stressLevel} stress (${hrvDrop}). Approach gently.`,
      suggestion:
        'Consider offering a grounding exercise or acknowledging they might be having a rough day.',
      confidence: 0.8,
    };
  }

  if (snapshot.sleep && snapshot.sleep.qualityScore < 60) {
    return {
      type: 'sleep',
      insight: `User had poor sleep (${snapshot.sleep.qualityScore}% quality, ${snapshot.sleep.duration.toFixed(1)}h). They may be tired.`,
      suggestion: 'Be understanding if they seem off. Might mention sleep or ask how they slept.',
      confidence: 0.85,
    };
  }

  if (snapshot.recovery && snapshot.recovery.score < 50) {
    return {
      type: 'recovery',
      insight: `User's recovery score is low (${snapshot.recovery.score}%). Their body is still recovering.`,
      suggestion: "Encourage rest and self-care. Don't push hard goals today.",
      confidence: 0.75,
    };
  }

  if (snapshot.activity && snapshot.activity.hoursSinceActivity > 4) {
    return {
      type: 'activity',
      insight: `User has been sedentary for ${snapshot.activity.hoursSinceActivity} hours.`,
      suggestion: 'Consider suggesting a stretch break or short walk.',
      confidence: 0.7,
    };
  }

  return null;
}

/**
 * Generate superhuman moment - something no human friend would notice
 */
export function generateSuperhumanMoment(snapshot: BiometricSnapshot | null): string | null {
  if (!snapshot) return null;

  const moments: string[] = [];

  // HRV correlation with stress
  if (snapshot.hrv && snapshot.hrv.deviationPercent <= -20) {
    moments.push(
      `Your HRV dropped ${Math.abs(snapshot.hrv.deviationPercent)}% - rough day? Let's take it easy.`
    );
  }

  // Sleep affecting mood
  if (snapshot.sleep && snapshot.sleep.qualityScore < 50) {
    moments.push(`Your sleep has been off - that might be affecting how you're feeling today.`);
  }

  // Sedentary during stress
  if (
    snapshot.activity &&
    snapshot.activity.hoursSinceActivity > 3 &&
    (snapshot.stressLevel === 'high' || snapshot.stressLevel === 'elevated')
  ) {
    moments.push(
      `You've been sitting for ${snapshot.activity.hoursSinceActivity} hours during a stressful time - want a 2-minute stretch?`
    );
  }

  // Low recovery
  if (snapshot.recovery && snapshot.recovery.score < 40) {
    moments.push(`Your body's still recovering - let's be gentle with ourselves today.`);
  }

  return moments.length > 0 ? moments[Math.floor(Math.random() * moments.length)] : null;
}
