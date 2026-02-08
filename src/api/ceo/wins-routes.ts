/**
 * Wins API Routes
 * REST API for tracking achievements
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../../utils/safe-logger.js';
import * as winsService from '../../services/ceo/wins.js';
import type { WinPeriod } from '../../services/ceo/wins.js';
import { authenticateUser } from '../middleware/auth.js';

const log = createLogger({ module: 'wins-routes' });
const router = Router();

const WIN_PERIODS: WinPeriod[] = ['today', 'week', 'month', 'all'];

function isWinPeriod(value: unknown): value is WinPeriod {
  return typeof value === 'string' && WIN_PERIODS.includes(value as WinPeriod);
}

router.use(authenticateUser);

/**
 * GET /api/ceo/wins
 * List wins with optional period filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { period } = req.query;
    const periodVal = isWinPeriod(period) ? period : 'all';

    const wins = await winsService.getWins(userId, periodVal);

    return res.json(wins);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to list wins');
    return res.status(500).json({ error: 'Failed to list wins' });
  }
});

/**
 * GET /api/ceo/wins/random
 * Get a random win for motivation
 */
router.get('/random', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const win = await winsService.getRandomWin(userId);

    if (!win) {
      return res.status(404).json({ error: 'No wins found' });
    }

    return res.json(win);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get random win');
    return res.status(500).json({ error: 'Failed to get random win' });
  }
});

/**
 * GET /api/ceo/wins/count
 * Get win count
 */
router.get('/count', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const count = await winsService.getWinCount(userId);

    return res.json({ count });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get win count');
    return res.status(500).json({ error: 'Failed to get win count' });
  }
});

/**
 * GET /api/ceo/wins/category/:category
 * Get wins by category
 */
router.get('/category/:category', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { category } = req.params;

    const wins = await winsService.getWinsByCategory(userId, category);

    return res.json(wins);
  } catch (error) {
    log.error({ error: String(error), category: req.params.category }, 'Failed to get wins by category');
    return res.status(500).json({ error: 'Failed to get wins by category' });
  }
});

/**
 * POST /api/ceo/wins
 * Add a new win
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { description, category } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'Description is required' });
    }

    const win = await winsService.addWin(userId, description, category);

    return res.status(201).json(win);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to add win');
    const message = error instanceof Error ? error.message : 'Failed to add win';
    return res.status(400).json({ error: message });
  }
});

export { router as winsRoutes };
