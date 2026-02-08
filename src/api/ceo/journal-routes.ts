/**
 * Journal API Routes
 * REST API for journal entries
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../../utils/safe-logger.js';
import * as journalService from '../../services/ceo/journal.js';
import type { JournalPeriod, Sentiment } from '../../services/ceo/journal.js';
import { authenticateUser } from '../middleware/auth.js';

const log = createLogger({ module: 'journal-routes' });
const router = Router();

const JOURNAL_PERIODS: JournalPeriod[] = ['today', 'week', 'month'];
const SENTIMENTS: Sentiment[] = ['positive', 'neutral', 'negative'];

function isJournalPeriod(value: unknown): value is JournalPeriod {
  return typeof value === 'string' && JOURNAL_PERIODS.includes(value as JournalPeriod);
}

function isSentiment(value: unknown): value is Sentiment {
  return typeof value === 'string' && SENTIMENTS.includes(value as Sentiment);
}

router.use(authenticateUser);

/**
 * GET /api/ceo/journal
 * List journal entries with optional period filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { period } = req.query;
    const periodVal = isJournalPeriod(period) ? period : 'week';

    const entries = await journalService.getEntries(userId, periodVal);

    return res.json(entries);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to list journal entries');
    return res.status(500).json({ error: 'Failed to list journal entries' });
  }
});

/**
 * GET /api/ceo/journal/latest
 * Get latest journal entry
 */
router.get('/latest', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const entry = await journalService.getLatestEntry(userId);

    if (!entry) {
      return res.status(404).json({ error: 'No journal entries found' });
    }

    return res.json(entry);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get latest entry');
    return res.status(500).json({ error: 'Failed to get latest entry' });
  }
});

/**
 * GET /api/ceo/journal/search
 * Search journal entries
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const entries = await journalService.search(userId, query as string);

    return res.json(entries);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to search journal');
    return res.status(500).json({ error: 'Failed to search journal' });
  }
});

/**
 * GET /api/ceo/journal/sentiment/:sentiment
 * Get entries by sentiment
 */
router.get('/sentiment/:sentiment', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { sentiment } = req.params;
    if (!isSentiment(sentiment)) {
      return res.status(400).json({ error: 'Invalid sentiment. Use: positive, neutral, negative' });
    }
    const entries = await journalService.getEntriesBySentiment(userId, sentiment);

    return res.json(entries);
  } catch (error) {
    log.error({ error: String(error), sentiment: req.params.sentiment }, 'Failed to get entries by sentiment');
    return res.status(500).json({ error: 'Failed to get entries by sentiment' });
  }
});

/**
 * POST /api/ceo/journal
 * Add a new journal entry
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { content, sentiment } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const entry = await journalService.addEntry(userId, content, sentiment);

    return res.status(201).json(entry);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to add journal entry');
    const message = error instanceof Error ? error.message : 'Failed to add journal entry';
    return res.status(400).json({ error: message });
  }
});

export { router as journalRoutes };
