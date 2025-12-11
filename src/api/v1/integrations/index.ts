/**
 * Better-than-Human Integrations API
 *
 * Routes for managing external service connections that give Ferni
 * superhuman awareness capabilities.
 *
 * @module api/v1/integrations
 */

import { Router } from 'express';
import biometricsRouter from './biometrics.js';
import calendarRouter from './calendar.js';
import socialGraphRouter from './social-graph.js';
import bankingRouter from './banking.js';

const router = Router();

// Mount integration routes
router.use('/biometrics', biometricsRouter);
router.use('/calendar', calendarRouter);
router.use('/social-graph', socialGraphRouter);
router.use('/banking', bankingRouter);

// ============================================================================
// GET /api/v1/integrations/status
// Get status of all integrations for a user
// ============================================================================
router.get('/status', async (req, res) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Import services dynamically to avoid circular dependencies
    const { hasBiometricsConnected, getConnectedPlatform } =
      await import('../../../services/biometrics/index.js');
    const { hasCalendarConnected } =
      await import('../../../services/context-awareness/location-calendar.js');
    const { hasLinkedAccounts } = await import('../../../tools/plaid.js');
    const { getImportantPeople } = await import('../../../services/social-graph/index.js');

    const biometricsConnected = hasBiometricsConnected(userId);
    const calendarConnected = hasCalendarConnected(userId);
    const bankConnected = hasLinkedAccounts(userId);
    const socialPeople = getImportantPeople(userId);

    return res.json({
      userId,
      integrations: {
        biometrics: {
          connected: biometricsConnected,
          platform: biometricsConnected ? getConnectedPlatform(userId) : null,
        },
        calendar: {
          connected: calendarConnected,
        },
        banking: {
          connected: bankConnected,
        },
        socialGraph: {
          enabled: true, // Always enabled (from conversation)
          peopleTracked: socialPeople.length,
        },
      },
      capabilities: {
        stressAwareness: biometricsConnected,
        sleepAwareness: biometricsConnected,
        eventAnticipation: calendarConnected,
        locationAwareness: calendarConnected,
        financialPrediction: bankConnected,
        relationshipInsights: socialPeople.length > 0,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get integration status' });
  }
});

export default router;
