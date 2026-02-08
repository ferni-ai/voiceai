/**
 * Briefing API Routes
 * REST API for daily/weekly briefings
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../../utils/safe-logger.js';
import { briefingService } from '../../services/ceo/briefing.js';
import { authenticateUser } from '../middleware/auth.js';

const log = createLogger({ module: 'briefing-routes' });
const router = Router();

router.use(authenticateUser);

/**
 * GET /api/ceo/briefing
 * Generate briefing for today
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const briefing = await briefingService.generateBriefing(userId);

    return res.json(briefing);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to generate briefing');
    return res.status(500).json({ error: 'Failed to generate briefing' });
  }
});

/**
 * GET /api/ceo/briefing/:date
 * Generate briefing for specific date
 */
router.get('/:date', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { date } = req.params;

    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const briefing = await briefingService.generateBriefing(userId);

    return res.json(briefing);
  } catch (error) {
    log.error({ error: String(error), date: req.params.date }, 'Failed to generate briefing for date');
    return res.status(500).json({ error: 'Failed to generate briefing' });
  }
});

export { router as briefingRoutes };
