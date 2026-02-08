/**
 * Ideas API Routes
 * REST API for idea capture and management
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '../../utils/safe-logger.js';
import * as ideasService from '../../services/ceo/ideas.js';
import { authenticateUser } from '../middleware/auth.js';

const log = createLogger({ module: 'ideas-routes' });
const router = Router();

router.use(authenticateUser);

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const ideas = await ideasService.getIdeas(userId);
    return res.json(ideas);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to list ideas');
    return res.status(500).json({ error: 'Failed to list ideas' });
  }
});

router.get('/random', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const idea = await ideasService.getRandomIdea(userId);

    if (!idea) {
      return res.status(404).json({ error: 'No ideas found' });
    }

    return res.json(idea);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get random idea');
    return res.status(500).json({ error: 'Failed to get random idea' });
  }
});

router.get('/tag/:tag', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { tag } = req.params;
    const ideas = await ideasService.getIdeasByTag(userId, tag);
    return res.json(ideas);
  } catch (error) {
    log.error({ error: String(error), tag: req.params.tag }, 'Failed to get ideas by tag');
    return res.status(500).json({ error: 'Failed to get ideas by tag' });
  }
});

router.get('/search', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const ideas = await ideasService.searchIdeas(userId, query as string);
    return res.json(ideas);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to search ideas');
    return res.status(500).json({ error: 'Failed to search ideas' });
  }
});

router.get('/count', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const count = await ideasService.getIdeaCount(userId);
    return res.json({ count });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get idea count');
    return res.status(500).json({ error: 'Failed to get idea count' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { content, tags } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const idea = await ideasService.addIdea(userId, content, tags);
    return res.status(201).json(idea);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to add idea');
    const message = error instanceof Error ? error.message : 'Failed to add idea';
    return res.status(400).json({ error: message });
  }
});

router.post('/:ideaId/tag', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { ideaId } = req.params;
    const { tag } = req.body;

    if (!tag) {
      return res.status(400).json({ error: 'Tag is required' });
    }

    const idea = await ideasService.tagIdea(userId, ideaId, tag);
    return res.json(idea);
  } catch (error) {
    log.error({ error: String(error), ideaId: req.params.ideaId }, 'Failed to tag idea');
    const message = error instanceof Error ? error.message : 'Failed to tag idea';
    return res.status(400).json({ error: message });
  }
});

router.post('/:ideaId/archive', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const { ideaId } = req.params;

    const idea = await ideasService.archiveIdea(userId, ideaId);
    return res.json(idea);
  } catch (error) {
    log.error({ error: String(error), ideaId: req.params.ideaId }, 'Failed to archive idea');
    const message = error instanceof Error ? error.message : 'Failed to archive idea';
    return res.status(400).json({ error: message });
  }
});

export { router as ideasRoutes };
