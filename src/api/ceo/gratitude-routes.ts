/**
 * Gratitude API Routes
 * REST API for gratitude logging
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../../utils/safe-logger.js';
import { addGratitude, getEntries, getRandom, getToday, getThisWeek, getByCategory, getCount, getStreak } from '../../services/ceo/gratitude.js';
import { authenticateUser } from '../middleware/auth.js';

const log = createLogger({ module: 'gratitude-routes' });
const router = Router();

router.use(authenticateUser);

/**
 * GET /api/ceo/gratitude
 * List gratitude entries
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const entries = await getEntries(userId);

    return res.json(entries);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to list gratitude entries');
    return res.status(500).json({ error: 'Failed to list gratitude entries' });
  }
});

/**
 * GET /api/ceo/gratitude/today
 * Get today's gratitude entries
 */
router.get('/today', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const entries = await getToday(userId);

    return res.json(entries);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get today gratitude');
    return res.status(500).json({ error: 'Failed to get today gratitude' });
  }
});

/**
 * GET /api/ceo/gratitude/week
 * Get this week's gratitude entries
 */
router.get('/week', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const entries = await getThisWeek(userId);

    return res.json(entries);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get week gratitude');
    return res.status(500).json({ error: 'Failed to get week gratitude' });
  }
});

/**
 * GET /api/ceo/gratitude/random
 * Get a random gratitude entry
 */
router.get('/random', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const entry = await getRandom(userId);

    if (!entry) {
      return res.status(404).json({ error: 'No gratitude entries found' });
    }

    return res.json(entry);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get random gratitude');
    return res.status(500).json({ error: 'Failed to get random gratitude' });
  }
});

/**
 * GET /api/ceo/gratitude/category/:category
 * Get gratitude by category
 */
router.get('/category/:category', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { category } = req.params;

    const entries = await getByCategory(userId, category ?? '');

    return res.json(entries);
  } catch (error) {
    log.error({ error: String(error), category: req.params.category }, 'Failed to get gratitude by category');
    return res.status(500).json({ error: 'Failed to get gratitude by category' });
  }
});

/**
 * GET /api/ceo/gratitude/count
 * Get gratitude count
 */
router.get('/count', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const count = await getCount(userId);

    return res.json({ count });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get gratitude count');
    return res.status(500).json({ error: 'Failed to get gratitude count' });
  }
});

/**
 * GET /api/ceo/gratitude/streak
 * Get gratitude streak
 */
router.get('/streak', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const streak = await getStreak(userId);

    return res.json({ streak });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get gratitude streak');
    return res.status(500).json({ error: 'Failed to get gratitude streak' });
  }
});

/**
 * POST /api/ceo/gratitude
 * Add a new gratitude entry
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { content, category } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const entry = await addGratitude(userId, content, category);

    return res.status(201).json(entry);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to add gratitude');
    const message = error instanceof Error ? error.message : 'Failed to add gratitude';
    return res.status(400).json({ error: message });
  }
});

export { router as gratitudeRoutes };
