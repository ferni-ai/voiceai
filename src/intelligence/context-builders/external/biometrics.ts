/**
 * Biometrics Context Builder
 *
 * Injects awareness of user's physical state from wearable data.
 * "Better than Human" - notice what no friend could consistently know.
 *
 * Superhuman Capabilities:
 * - Real-time stress detection from HRV
 * - Sleep quality affecting conversation approach
 * - Activity/sedentary awareness
 * - Recovery score integration
 *
 * @module intelligence/context-builders/biometrics
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  hasBiometricsConnected,
  getCurrentBiometrics,
  generateBiometricInsight,
  generateSuperhumanMoment,
} from '../../../services/biometrics/index.js';
import {
  registerContextBuilder,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';

const log = createLogger({ module: 'context:biometrics' });

// Track superhuman moments to avoid repetition
const recentMoments = new Map<string, number>(); // sessionId -> last moment timestamp
const MOMENT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between moments

/**
 * Biometrics Context Builder
 *
 * Priority: 35 (before emotional context, so we can inform tone)
 */
export const biometricsBuilder: ContextBuilder = {
  name: 'biometrics',
  description: 'Injects physical state awareness from wearable biometrics',
  priority: 35,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services, userData } = input;
    const userId = services.userId;

    if (!userId) return [];

    // Check if user has biometrics connected
    if (!hasBiometricsConnected(userId)) {
      return [];
    }

    const injections: ContextInjection[] = [];
    const snapshot = getCurrentBiometrics(userId);

    if (!snapshot) {
      return [];
    }

    // Generate insight for context
    const insight = generateBiometricInsight(userId);

    if (insight) {
      injections.push({
        id: `biometrics-${insight.type}`,
        source: 'biometrics',
        content: insight.insight,
        priority: insight.confidence >= 0.8 ? 'high' : 'standard',
        category: 'physical-state',
        confidence: insight.confidence,
      });

      if (insight.suggestion) {
        injections.push({
          id: 'biometrics-suggestion',
          source: 'biometrics',
          content: insight.suggestion,
          priority: 'hint',
          category: 'physical-state',
        });
      }

      log.debug(
        { userId, type: insight.type, confidence: insight.confidence },
        'Biometrics context injected'
      );
    }

    // Check for superhuman moment opportunity (not too frequently)
    const sessionId = services.sessionId;
    const lastMoment = recentMoments.get(sessionId) || 0;
    const turnCount = userData.turnCount || 0;

    // Only offer superhuman moments after turn 3 and with cooldown
    if (turnCount >= 3 && Date.now() - lastMoment > MOMENT_COOLDOWN_MS) {
      const moment = generateSuperhumanMoment(userId);

      if (moment) {
        injections.push({
          id: 'biometrics-superhuman-moment',
          source: 'biometrics',
          content: `SUPERHUMAN MOMENT OPPORTUNITY: You could naturally mention: "${moment}"`,
          priority: 'hint',
          category: 'superhuman-awareness',
        });

        recentMoments.set(sessionId, Date.now());
        log.debug({ userId, moment }, 'Superhuman biometrics moment available');
      }
    }

    // Specific state injections
    if (snapshot.stressLevel === 'elevated') {
      injections.push({
        id: 'biometrics-stress-alert',
        source: 'biometrics',
        content: 'User is showing elevated stress markers. Be especially gentle and grounding.',
        priority: 'high',
        category: 'physical-state',
      });
    }

    if (snapshot.sleep && snapshot.sleep.qualityScore < 50) {
      injections.push({
        id: 'biometrics-sleep-aware',
        source: 'biometrics',
        content: `User had poor sleep (${snapshot.sleep.qualityScore}% quality). They may be more irritable or less focused than usual.`,
        priority: 'standard',
        category: 'physical-state',
      });
    }

    if (snapshot.recovery && snapshot.recovery.readiness === 'low') {
      injections.push({
        id: 'biometrics-recovery-aware',
        source: 'biometrics',
        content: "User's body is still recovering. Don't push hard goals or high energy today.",
        priority: 'standard',
        category: 'physical-state',
      });
    }

    return injections;
  },
};

// Register on module load
registerContextBuilder(biometricsBuilder);

export default biometricsBuilder;
