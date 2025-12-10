/**
 * Social Graph API Routes
 *
 * Manage relationships tracked from conversation mentions.
 * Privacy-first: Only tracks names mentioned IN conversation.
 *
 * @module api/v1/integrations/social-graph
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../../../utils/safe-logger.js';
import {
  getImportantPeople,
  getPerson,
  confirmImportantPerson,
  addImportantDate,
  detectWithdrawal,
  detectSentimentPatterns,
  getUpcomingDates,
  getMentionFrequency,
  clearSocialGraph,
} from '../../../services/social-graph/index.js';

const log = createLogger({ module: 'api:social-graph' });
const router = Router();

// ============================================================================
// GET /api/v1/integrations/social-graph/people
// Get important people from social graph
// ============================================================================
router.get('/people', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const people = getImportantPeople(userId);

    return res.json({
      people: people.map((p) => ({
        id: p.id,
        name: p.name,
        relationship: p.relationship,
        importance: p.importance,
        isConfirmedImportant: p.isConfirmedImportant,
        lastMentioned: p.lastMentioned,
        mentionCount: p.mentionCount,
        averageSentiment: p.averageSentiment,
        importantDates: p.importantDates,
      })),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get people');
    return res.status(500).json({ error: 'Failed to get people' });
  }
});

// ============================================================================
// GET /api/v1/integrations/social-graph/person/:personId
// Get details for a specific person
// ============================================================================
router.get('/person/:personId', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const { personId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const person = getPerson(userId, personId);

    if (!person) {
      return res.status(404).json({ error: 'Person not found' });
    }

    return res.json({ person });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get person');
    return res.status(500).json({ error: 'Failed to get person' });
  }
});

// ============================================================================
// POST /api/v1/integrations/social-graph/person/:personId/confirm
// Mark a person as confirmed important
// ============================================================================
router.post('/person/:personId/confirm', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body as { userId: string };
    const { personId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const success = confirmImportantPerson(userId, personId);

    if (success) {
      log.info({ userId, personId }, 'Person confirmed as important');
      return res.json({ success: true });
    } else {
      return res.status(404).json({ error: 'Person not found' });
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to confirm person');
    return res.status(500).json({ error: 'Failed to confirm person' });
  }
});

// ============================================================================
// POST /api/v1/integrations/social-graph/person/:personId/date
// Add an important date for a person
// ============================================================================
router.post('/person/:personId/date', async (req: Request, res: Response) => {
  try {
    const { userId, personName, date, type, label } = req.body as {
      userId: string;
      personName: string;
      date: string; // MM-DD format
      type: 'birthday' | 'anniversary' | 'memorial' | 'other';
      label?: string;
    };

    if (!userId || !personName || !date || !type) {
      return res.status(400).json({
        error: 'userId, personName, date (MM-DD), and type are required',
      });
    }

    // Validate date format
    if (!/^\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Date must be in MM-DD format' });
    }

    const success = addImportantDate(userId, personName, date, type, label);

    if (success) {
      log.info({ userId, personName, date, type }, 'Important date added');
      return res.json({ success: true });
    } else {
      return res.status(400).json({ error: 'Failed to add date (person not found or duplicate)' });
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to add date');
    return res.status(500).json({ error: 'Failed to add date' });
  }
});

// ============================================================================
// GET /api/v1/integrations/social-graph/dates
// Get upcoming important dates
// ============================================================================
router.get('/dates', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const daysAhead = parseInt(req.query.daysAhead as string) || 7;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const dates = getUpcomingDates(userId, daysAhead);

    return res.json({ dates });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get dates');
    return res.status(500).json({ error: 'Failed to get dates' });
  }
});

// ============================================================================
// GET /api/v1/integrations/social-graph/insights
// Get relationship insights (withdrawal alerts, patterns)
// ============================================================================
router.get('/insights', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const withdrawals = detectWithdrawal(userId);
    const patterns = detectSentimentPatterns(userId);

    return res.json({
      withdrawalAlerts: withdrawals,
      relationshipPatterns: patterns,
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get insights');
    return res.status(500).json({ error: 'Failed to get insights' });
  }
});

// ============================================================================
// GET /api/v1/integrations/social-graph/frequency
// Get mention frequency for a person
// ============================================================================
router.get('/frequency', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const personName = req.query.personName as string;
    const days = parseInt(req.query.days as string) || 30;

    if (!userId || !personName) {
      return res.status(400).json({ error: 'userId and personName are required' });
    }

    const frequency = getMentionFrequency(userId, personName, days);

    return res.json({
      personName,
      days,
      mentionCount: frequency,
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get frequency');
    return res.status(500).json({ error: 'Failed to get frequency' });
  }
});

// ============================================================================
// DELETE /api/v1/integrations/social-graph/clear
// Clear all social graph data for a user
// ============================================================================
router.delete('/clear', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const confirm = req.query.confirm === 'true';

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!confirm) {
      return res.status(400).json({
        error: 'Add confirm=true to confirm deletion of all relationship data',
      });
    }

    clearSocialGraph(userId);

    log.info({ userId }, 'Social graph cleared');
    return res.json({ success: true });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to clear social graph');
    return res.status(500).json({ error: 'Failed to clear data' });
  }
});

export default router;
