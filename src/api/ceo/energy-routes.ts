/**
 * Energy API Routes
 * REST API for energy logging and tracking
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../../utils/safe-logger.js';
import * as energyService from '../../services/ceo/energy.js';
import { authenticateUser } from '../middleware/auth.js';

const log = createLogger({ module: 'energy-routes' });
const router = Router();

router.use(authenticateUser);

/**
 * POST /api/ceo/energy
 * Log energy level
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { level, notes, context } = req.body;

    if (level === undefined || level === null) {
      return res.status(400).json({ error: 'Energy level is required' });
    }

    if (typeof level !== 'number' || level < 1 || level > 10) {
      return res.status(400).json({ error: 'Energy level must be between 1 and 10' });
    }

    const entry = await energyService.logEnergy(userId, level, notes);

    return res.status(201).json(entry);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to log energy');
    const message = error instanceof Error ? error.message : 'Failed to log energy';
    return res.status(400).json({ error: message });
  }
});

/**
 * GET /api/ceo/energy/today
 * Get today's energy logs
 */
router.get('/today', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const logs = await energyService.getToday(userId);

    return res.json(logs);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get today energy');
    return res.status(500).json({ error: 'Failed to get today energy' });
  }
});

/**
 * GET /api/ceo/energy/weekly-average
 * Get weekly average energy
 */
router.get('/weekly-average', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const average = await energyService.getWeeklyAverage(userId);

    return res.json({ average });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get weekly average');
    return res.status(500).json({ error: 'Failed to get weekly average' });
  }
});

/**
 * GET /api/ceo/energy/trend
 * Get energy trend
 */
router.get('/trend', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const trend = await energyService.getTrend(userId, 7);

    return res.json(trend);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get energy trend');
    return res.status(500).json({ error: 'Failed to get energy trend' });
  }
});

/**
 * GET /api/ceo/energy/weekly-analysis
 * Get weekly energy analysis
 */
router.get('/weekly-analysis', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const analysis = await energyService.getWeeklyAnalysis(userId);

    return res.json(analysis);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get weekly analysis');
    return res.status(500).json({ error: 'Failed to get weekly analysis' });
  }
});

/**
 * GET /api/ceo/energy/latest
 * Get latest energy log
 */
router.get('/latest', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const log_entry = await energyService.getLatestLog(userId);

    if (!log_entry) {
      return res.status(404).json({ error: 'No energy logs found' });
    }

    return res.json(log_entry);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get latest log');
    return res.status(500).json({ error: 'Failed to get latest log' });
  }
});

export { router as energyRoutes };
