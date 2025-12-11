/**
 * Financial Prediction Context Builder
 *
 * Injects proactive financial awareness from Plaid prediction service.
 * "Better than Human" - anticipate money stress before it happens.
 *
 * Superhuman Capabilities:
 * - Cash flow forecasting awareness
 * - Spending anomaly detection
 * - Subscription creep alerts
 * - Upcoming bill reminders
 *
 * @module intelligence/context-builders/financial-prediction
 */

import {
  detectAnomalies,
  generateFinancialInsight,
  generateSuperhumanMoment,
  predictCashFlow,
} from '../../services/finance/prediction.js';
import { hasLinkedAccounts } from '../../tools/plaid.js';
import { createLogger } from '../../utils/safe-logger.js';
import { DISTRESS } from '../distress-levels.js';
import {
  registerContextBuilder,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

const log = createLogger({ module: 'context:financial-prediction' });

// Track when we last synced for each user to avoid excessive API calls
const lastSyncTime = new Map<string, number>();
const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// Track superhuman moments to avoid repetition
const recentMoments = new Map<string, number>();
const MOMENT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes between financial moments

/**
 * Financial Prediction Context Builder
 *
 * Priority: 45 (after core emotional context, before engagement)
 */
export const financialPredictionBuilder: ContextBuilder = {
  name: 'financial-prediction',
  description: 'Injects proactive financial awareness and predictions',
  priority: 45,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services, userData, analysis } = input;
    const userId = services.userId;

    if (!userId) return [];

    // Check if user has Plaid connected
    if (!hasLinkedAccounts(userId)) {
      return [];
    }

    const injections: ContextInjection[] = [];

    // Check if we need to refresh predictions
    const lastSync = lastSyncTime.get(userId) || 0;
    const needsSync = Date.now() - lastSync > SYNC_INTERVAL_MS;

    if (needsSync) {
      // Trigger background sync (non-blocking)
      void syncFinancialData(userId);
      lastSyncTime.set(userId, Date.now());
    }

    // Generate financial insight
    try {
      const insight = await generateFinancialInsight(userId);

      if (insight) {
        // Map severity to priority
        const priority =
          insight.severity === 'alert'
            ? 'high'
            : insight.severity === 'warning'
              ? 'standard'
              : 'hint';

        injections.push({
          id: `financial-${insight.type}`,
          source: 'financial-prediction',
          content: insight.insight,
          priority,
          category: 'financial-awareness',
        });

        if (insight.suggestion) {
          injections.push({
            id: 'financial-suggestion',
            source: 'financial-prediction',
            content: insight.suggestion,
            priority: 'hint',
            category: 'financial-awareness',
          });
        }

        log.debug(
          { userId, type: insight.type, severity: insight.severity },
          'Financial prediction context injected'
        );
      }
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Financial insight generation failed');
    }

    // Check for superhuman moment (only if topic seems financial or stress-related)
    const sessionId = services.sessionId;
    const lastMoment = recentMoments.get(sessionId) || 0;
    const turnCount = userData.turnCount || 0;

    const isFinancialTopic =
      analysis.topics.detected.some((t) =>
        /money|budget|spend|save|bill|debt|finance|afford/.test(t.toLowerCase())
      ) ||
      analysis.emotion.primary === 'anxiety' ||
      (analysis.state.distressLevel && analysis.state.distressLevel >= DISTRESS.MODERATE);

    // Superhuman moments after turn 2 if topic is relevant
    if (turnCount >= 2 && isFinancialTopic && Date.now() - lastMoment > MOMENT_COOLDOWN_MS) {
      const moment = generateSuperhumanMoment(userId);

      if (moment) {
        injections.push({
          id: 'financial-superhuman-moment',
          source: 'financial-prediction',
          content: `FINANCIAL INSIGHT OPPORTUNITY: You could naturally mention: "${moment}"`,
          priority: 'hint',
          category: 'superhuman-awareness',
        });

        recentMoments.set(sessionId, Date.now());
        log.debug({ userId, moment }, 'Superhuman financial moment available');
      }
    }

    // Check for urgent cash flow warnings
    try {
      const cashFlow = await predictCashFlow(userId, 7);
      if (cashFlow && cashFlow.warnings.length > 0) {
        const urgentWarnings = cashFlow.warnings.filter((w) => w.severity === 'alert');

        for (const warning of urgentWarnings) {
          injections.push({
            id: `cashflow-warning-${warning.type}`,
            source: 'financial-prediction',
            content: `URGENT: ${warning.message}. Be sensitive - user may be stressed about money.`,
            priority: 'high',
            category: 'financial-urgent',
          });
        }
      }
    } catch (error) {
      // Cash flow prediction failed - not critical
    }

    return injections;
  },
};

/**
 * Background sync of financial data
 */
async function syncFinancialData(userId: string): Promise<void> {
  try {
    await Promise.all([
      detectAnomalies(userId),
      // Bills and income detection is expensive, do less frequently
    ]);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Financial sync failed');
  }
}

// Register on module load
registerContextBuilder(financialPredictionBuilder);

export default financialPredictionBuilder;
