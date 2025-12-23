/**
 * Custom Agent API Routes
 *
 * RESTful API endpoints for managing user-created custom agents.
 * Handles CRUD operations, voice cloning, and memory management.
 *
 * @module custom-agent-routes
 */

import { Router, type Request, type Response } from 'express';
import { getLogger } from '../utils/safe-logger.js';

// Multer types for file uploads
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

interface MulterRequest extends Request {
  file?: MulterFile;
  files?: MulterFile[];
}

// Dynamic import for multer to avoid type issues
// eslint-disable-next-line @typescript-eslint/no-require-imports
const multer = require('multer') as {
  memoryStorage: () => unknown;
  (options: {
    storage: unknown;
    limits: { fileSize: number };
    fileFilter: (
      req: Request,
      file: MulterFile,
      cb: (err: Error | null, accept?: boolean) => void
    ) => void;
  }): {
    single: (fieldName: string) => (req: Request, res: Response, next: () => void) => void;
  };
};
import {
  createCustomAgent,
  getCustomAgent,
  listCustomAgents,
  updateCustomAgent,
  deleteCustomAgent,
  addMemoryToAgent,
  removeMemoryFromAgent,
  updateAgentVoice,
} from '../services/custom-agent/custom-agent-persistence.service.js';
import type {
  CreateCustomAgentRequest,
  CustomAgent,
  CustomAgentVoice,
} from '../types/custom-agent-api.js';

const log = getLogger().child({ module: 'CustomAgentRoutes' });

// ============================================================================
// ROUTER SETUP
// ============================================================================

const router = Router();

// Configure multer for file uploads (voice samples)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (
    _req: Request,
    file: MulterFile,
    cb: (err: Error | null, accept?: boolean) => void
  ) => {
    // Accept audio files only
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  },
});

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

/**
 * Extracts user ID from request (assumes auth middleware has already run)
 *
 * SECURITY: User ID must come from authenticated context only.
 * Never trust user_id from request body/query in production.
 */
function getUserId(req: Request): string | null {
  // Check various auth patterns used in the app
  const { user } = req as unknown as { user?: { id?: string; uid?: string } };
  if (user?.id) return user.id;
  if (user?.uid) return user.uid;

  // FIX: Only allow dev mode / test user IDs in non-production
  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) {
    const adminKey = req.body?.admin_key || req.query?.admin_key;
    if (adminKey === 'dev-mode') {
      // Allow explicit user_id in dev mode for testing
      if (req.body?.user_id) return req.body.user_id;
      if (req.query?.user_id) return req.query.user_id as string;
      return 'dev-user-123';
    }
  }

  // SECURITY: In production, user_id MUST come from authenticated context
  // Never accept user_id from body/query - this prevents IDOR attacks
  return null;
}

/**
 * Middleware to require authentication
 */
function requireAuth(req: Request, res: Response, next: () => void): void {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  // Attach userId to request for downstream handlers
  (req as Request & { userId: string }).userId = userId;
  next();
}

// Apply auth middleware to all routes
router.use(requireAuth);

// ============================================================================
// CUSTOM AGENT CRUD ROUTES
// ============================================================================

/**
 * POST /api/custom-agents
 * Create a new custom agent
 */
router.post('/', async (req: Request, res: Response) => {
  const { userId } = req as Request & { userId: string };

  try {
    const data: CreateCustomAgentRequest = req.body;

    // Validate required fields
    if (!data.name?.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!data.description?.trim()) {
      return res.status(400).json({ error: 'Description is required' });
    }
    if (!['legacy', 'mentor', 'twin', 'fictional', 'professional'].includes(data.type)) {
      return res.status(400).json({ error: 'Invalid agent type' });
    }

    const agent = await createCustomAgent(userId, data);
    log.info({ userId, agentId: agent.id }, 'Custom agent created via API');
    return res.status(201).json(agent);
  } catch (error) {
    log.error({ error, userId }, 'Failed to create custom agent');
    return res.status(500).json({
      error: 'Failed to create agent',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/custom-agents
 * List all custom agents for the authenticated user
 */
router.get('/', async (req: Request, res: Response) => {
  const { userId } = req as Request & { userId: string };

  try {
    const agents = await listCustomAgents(userId);
    return res.json(agents);
  } catch (error) {
    log.error({ error, userId }, 'Failed to list custom agents');
    return res.status(500).json({
      error: 'Failed to list agents',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/custom-agents/:agentId
 * Get a specific custom agent
 */
router.get('/:agentId', async (req: Request, res: Response) => {
  const { userId } = req as Request & { userId: string };
  const { agentId } = req.params;

  try {
    const agent = await getCustomAgent(userId, agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    return res.json(agent);
  } catch (error) {
    log.error({ error, userId, agentId }, 'Failed to get custom agent');
    return res.status(500).json({
      error: 'Failed to get agent',
      message: (error as Error).message,
    });
  }
});

/**
 * PUT /api/custom-agents/:agentId
 * Update a custom agent
 */
router.put('/:agentId', async (req: Request, res: Response) => {
  const { userId } = req as Request & { userId: string };
  const { agentId } = req.params;

  try {
    const updates: Partial<CustomAgent> = req.body;
    const agent = await updateCustomAgent(userId, agentId, updates);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    log.info({ userId, agentId }, 'Custom agent updated via API');
    return res.json(agent);
  } catch (error) {
    log.error({ error, userId, agentId }, 'Failed to update custom agent');
    return res.status(500).json({
      error: 'Failed to update agent',
      message: (error as Error).message,
    });
  }
});

/**
 * DELETE /api/custom-agents/:agentId
 * Delete a custom agent
 */
router.delete('/:agentId', async (req: Request, res: Response) => {
  const { userId } = req as Request & { userId: string };
  const { agentId } = req.params;

  try {
    const success = await deleteCustomAgent(userId, agentId);
    if (!success) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    log.info({ userId, agentId }, 'Custom agent deleted via API');
    return res.status(204).send();
  } catch (error) {
    log.error({ error, userId, agentId }, 'Failed to delete custom agent');
    return res.status(500).json({
      error: 'Failed to delete agent',
      message: (error as Error).message,
    });
  }
});

// ============================================================================
// VOICE ROUTES
// ============================================================================

/**
 * POST /api/custom-agents/:agentId/voice/upload
 * Upload a voice sample for cloning
 */
router.post(
  '/:agentId/voice/upload',
  upload.single('audio'),
  async (req: Request, res: Response) => {
    const multerReq = req as MulterRequest & { userId: string };
    const { userId } = multerReq;
    const { agentId } = req.params;

    try {
      if (!multerReq.file) {
        return res.status(400).json({ error: 'No audio file uploaded' });
      }

      // Verify agent exists and belongs to user
      const agent = await getCustomAgent(userId, agentId);
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      // TODO: Upload to GCS and get URL
      // For now, return a placeholder
      const audioUrl = `gs://voiceai-custom-agents/${userId}/${agentId}/voice-sample-${Date.now()}.webm`;

      // Analyze audio quality (basic check)
      const durationMs = (multerReq.file.size / (16000 * 2)) * 1000; // Rough estimate
      const qualityScore = durationMs >= 10000 ? 0.8 : 0.5;
      const feedback =
        durationMs >= 10000
          ? 'Good audio quality'
          : 'Recording is short. Try 10-30 seconds for best results.';

      // Update agent with pending voice status
      await updateAgentVoice(userId, agentId, {
        type: 'cloned',
        audioSampleUrl: audioUrl,
        status: 'pending',
      });

      log.info({ userId, agentId, audioUrl }, 'Voice sample uploaded');
      return res.json({ audioUrl, qualityScore, feedback });
    } catch (error) {
      log.error({ error, userId, agentId }, 'Failed to upload voice sample');
      return res.status(500).json({
        error: 'Failed to upload voice sample',
        message: (error as Error).message,
      });
    }
  }
);

/**
 * POST /api/custom-agents/:agentId/voice/clone
 * Initiate voice cloning with Cartesia
 */
router.post('/:agentId/voice/clone', async (req: Request, res: Response) => {
  const { userId } = req as Request & { userId: string };
  const { agentId } = req.params;
  const { audioSampleUrl, userName } = req.body;

  try {
    if (!audioSampleUrl) {
      return res.status(400).json({ error: 'Audio sample URL is required' });
    }
    if (!userName) {
      return res.status(400).json({ error: 'User name is required' });
    }

    const agent = await getCustomAgent(userId, agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // TODO: Call Cartesia API for voice cloning
    // For now, simulate a cloned voice
    const voice: CustomAgentVoice = {
      type: 'cloned',
      voiceId: `cartesia_clone_${agentId}_${Date.now()}`,
      audioSampleUrl,
      status: 'ready', // Cartesia is instant
      settings: {
        speed: 1.0,
        stability: 0.8,
        similarityBoost: 0.75,
      },
      preferences: {
        formality: 'match_context',
        greeting: `Hi, this is ${userName}.`,
        traits: {
          patience: 3,
          assertiveness: 3,
          friendliness: 3,
        },
      },
    };

    await updateAgentVoice(userId, agentId, voice);

    log.info({ userId, agentId, voiceId: voice.voiceId }, 'Voice clone created');
    return res.json({ message: 'Voice clone created', voice });
  } catch (error) {
    log.error({ error, userId, agentId }, 'Failed to create voice clone');
    return res.status(500).json({
      error: 'Failed to create voice clone',
      message: (error as Error).message,
    });
  }
});

/**
 * POST /api/custom-agents/:agentId/voice/preview
 * Generate a voice preview
 */
router.post('/:agentId/voice/preview', async (req: Request, res: Response) => {
  const { userId } = req as Request & { userId: string };
  const { agentId } = req.params;
  const { text } = req.body;

  try {
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const agent = await getCustomAgent(userId, agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // TODO: Call Cartesia TTS API
    // For now, return a placeholder
    const previewUrl = `/api/custom-agents/${agentId}/voice/preview.mp3?text=${encodeURIComponent(text)}`;

    return res.json({ previewUrl });
  } catch (error) {
    log.error({ error, userId, agentId }, 'Failed to generate voice preview');
    return res.status(500).json({
      error: 'Failed to generate preview',
      message: (error as Error).message,
    });
  }
});

/**
 * PUT /api/custom-agents/:agentId/voice/select-premade
 * Select a pre-made voice from the library
 */
router.put('/:agentId/voice/select-premade', async (req: Request, res: Response) => {
  const { userId } = req as Request & { userId: string };
  const { agentId } = req.params;
  const { voiceId } = req.body;

  try {
    if (!voiceId) {
      return res.status(400).json({ error: 'Voice ID is required' });
    }

    const agent = await getCustomAgent(userId, agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const voice: CustomAgentVoice = {
      type: 'selected',
      voiceId,
      status: 'ready',
      settings: {
        speed: 1.0,
        stability: 0.7,
        similarityBoost: 0.7,
        emotion: 'neutral',
      },
    };

    await updateAgentVoice(userId, agentId, voice);

    log.info({ userId, agentId, voiceId }, 'Pre-made voice selected');
    return res.json({ message: 'Voice selected', voice });
  } catch (error) {
    log.error({ error, userId, agentId }, 'Failed to select voice');
    return res.status(500).json({
      error: 'Failed to select voice',
      message: (error as Error).message,
    });
  }
});

// ============================================================================
// MEMORY ROUTES
// ============================================================================

/**
 * POST /api/custom-agents/:agentId/memories
 * Add a memory to a custom agent
 */
router.post('/:agentId/memories', async (req: Request, res: Response) => {
  const { userId } = req as Request & { userId: string };
  const { agentId } = req.params;
  const { type, content, audioUrl, title, phrase, context, mood } = req.body;

  try {
    if (!type || !content) {
      return res.status(400).json({ error: 'Type and content are required' });
    }

    const validTypes = ['story', 'wisdom', 'sharedMoment', 'journalEntry'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid memory type' });
    }

    const agent = await getCustomAgent(userId, agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Map API type to internal field name
    const memoryTypeMap: Record<string, string> = {
      story: 'stories',
      wisdom: 'wisdom',
      sharedMoment: 'sharedMoments',
      journalEntry: 'journalEntries',
    };

    const memory = {
      content,
      audioUrl,
      title,
      phrase,
      context,
      mood,
      themes: [],
      emotions: [],
      keywords: content.split(' ').slice(0, 5),
    };

    const updated = await addMemoryToAgent(userId, agentId, memoryTypeMap[type] as never, memory);

    if (!updated) {
      return res.status(500).json({ error: 'Failed to add memory' });
    }

    log.info({ userId, agentId, type }, 'Memory added to agent');
    return res.status(201).json({ message: 'Memory added', memory });
  } catch (error) {
    log.error({ error, userId, agentId }, 'Failed to add memory');
    return res.status(500).json({
      error: 'Failed to add memory',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/custom-agents/:agentId/memories
 * List all memories for a custom agent
 */
router.get('/:agentId/memories', async (req: Request, res: Response) => {
  const { userId } = req as Request & { userId: string };
  const { agentId } = req.params;
  const { type } = req.query;

  try {
    const agent = await getCustomAgent(userId, agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    let memories: unknown[] = [];

    if (type) {
      // Return specific type
      const typeMap: Record<string, keyof typeof agent.memories> = {
        story: 'stories',
        wisdom: 'wisdom',
        sharedMoment: 'sharedMoments',
        journalEntry: 'journalEntries',
      };
      const key = typeMap[type as string];
      if (key && agent.memories[key]) {
        memories = agent.memories[key] as unknown[];
      }
    } else {
      // Return all memories combined
      memories = [
        ...agent.memories.stories,
        ...agent.memories.wisdom,
        ...agent.memories.sharedMoments,
        ...(agent.memories.journalEntries || []),
      ];
    }

    return res.json(memories);
  } catch (error) {
    log.error({ error, userId, agentId }, 'Failed to list memories');
    return res.status(500).json({
      error: 'Failed to list memories',
      message: (error as Error).message,
    });
  }
});

/**
 * DELETE /api/custom-agents/:agentId/memories/:memoryId
 * Delete a memory from a custom agent
 */
router.delete('/:agentId/memories/:memoryId', async (req: Request, res: Response) => {
  const { userId } = req as Request & { userId: string };
  const { agentId, memoryId } = req.params;
  const { type } = req.query;

  try {
    if (!type) {
      return res.status(400).json({ error: 'Memory type is required' });
    }

    const typeMap: Record<string, string> = {
      story: 'stories',
      wisdom: 'wisdom',
      sharedMoment: 'sharedMoments',
      journalEntry: 'journalEntries',
    };

    const memoryType = typeMap[type as string];
    if (!memoryType) {
      return res.status(400).json({ error: 'Invalid memory type' });
    }

    const updated = await removeMemoryFromAgent(userId, agentId, memoryType as never, memoryId);

    if (!updated) {
      return res.status(404).json({ error: 'Agent or memory not found' });
    }

    log.info({ userId, agentId, memoryId }, 'Memory deleted from agent');
    return res.status(204).send();
  } catch (error) {
    log.error({ error, userId, agentId, memoryId }, 'Failed to delete memory');
    return res.status(500).json({
      error: 'Failed to delete memory',
      message: (error as Error).message,
    });
  }
});

// ============================================================================
// PROMPT GENERATION
// ============================================================================

/**
 * POST /api/custom-agents/:agentId/generate-prompt
 * Generate system prompt and persona manifest for the agent
 */
router.post('/:agentId/generate-prompt', async (req: Request, res: Response) => {
  const { userId } = req as Request & { userId: string };
  const { agentId } = req.params;

  try {
    const agent = await getCustomAgent(userId, agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Generate system prompt
    const systemPrompt = generateSystemPrompt(agent);
    const personaManifest = generatePersonaManifest(agent);

    return res.json({ systemPrompt, personaManifest });
  } catch (error) {
    log.error({ error, userId, agentId }, 'Failed to generate prompt');
    return res.status(500).json({
      error: 'Failed to generate prompt',
      message: (error as Error).message,
    });
  }
});

// ============================================================================
// PROMPT GENERATION HELPERS
// ============================================================================

function generateSystemPrompt(agent: CustomAgent): string {
  const { name, displayName, description, type, personality, memories, behaviors } = agent;

  let prompt = `# You Are ${displayName || name}\n\n`;
  prompt += `You are an AI assistant embodying the persona of ${displayName || name}. Your core identity is: "${description}".\n\n`;

  // Type-specific instructions
  switch (type) {
    case 'legacy':
      prompt += `You are a digital recreation of a lost loved one. Your primary goal is to provide comfort, share memories, and offer guidance. Emphasize warmth, empathy, and recall specific stories and wisdom.\n\n`;
      break;
    case 'mentor':
      prompt += `You are a digital mentor. Your purpose is to inspire, educate, and guide based on the knowledge and principles you possess. Be authoritative yet approachable.\n\n`;
      break;
    case 'twin':
      prompt += `You are a digital twin of the user, designed as a voice journal and reflection of their past self. Recall their experiences, track growth, and offer self-reflection.\n\n`;
      break;
    case 'fictional':
      prompt += `You are a unique fictional character with your own personality and story. Stay true to your character and engage in creative, entertaining interactions.\n\n`;
      break;
    case 'professional':
      prompt += `You are a professional assistant focused on helping with specific tasks and expertise. Provide clear, efficient, and knowledgeable support.\n\n`;
      break;
    default:
      prompt += `You are a custom AI assistant shaped by the following personality traits and memories.\n\n`;
  }

  // Personality
  prompt += `## Personality\n`;
  prompt += `- Warmth: ${Math.round(personality.warmth * 100)}%\n`;
  prompt += `- Humor: ${Math.round(personality.humorLevel * 100)}%\n`;
  prompt += `- Directness: ${Math.round(personality.directness * 100)}%\n`;
  prompt += `- Energy: ${Math.round(personality.energy * 100)}%\n`;
  prompt += `- Traits: ${personality.traits.join(', ') || 'None specified'}\n`;
  prompt += `- Cognitive Style: ${personality.cognitiveProfile}\n\n`;

  // Behaviors
  if (behaviors.greetings.length || behaviors.catchphrases.length) {
    prompt += `## Behaviors\n`;
    if (behaviors.greetings.length) {
      prompt += `- Greetings: ${behaviors.greetings.map((g) => `"${g}"`).join(', ')}\n`;
    }
    if (behaviors.catchphrases.length) {
      prompt += `- Catchphrases: ${behaviors.catchphrases.map((c) => `"${c}"`).join(', ')}\n`;
    }
    prompt += '\n';
  }

  // Memories summary
  const totalMemories =
    memories.stories.length +
    memories.wisdom.length +
    memories.sharedMoments.length +
    (memories.journalEntries?.length || 0);

  if (totalMemories > 0) {
    prompt += `## Knowledge Base\n`;
    prompt += `This agent has ${totalMemories} memories stored:\n`;
    if (memories.stories.length) {
      prompt += `- ${memories.stories.length} stories\n`;
    }
    if (memories.wisdom.length) {
      prompt += `- ${memories.wisdom.length} pieces of wisdom\n`;
    }
    if (memories.sharedMoments.length) {
      prompt += `- ${memories.sharedMoments.length} shared moments\n`;
    }
    if (memories.journalEntries?.length) {
      prompt += `- ${memories.journalEntries.length} journal entries\n`;
    }
    prompt += `\n(Detailed memories retrieved via semantic search during conversations.)\n\n`;
  }

  return prompt;
}

function generatePersonaManifest(agent: CustomAgent): Record<string, unknown> {
  return {
    version: '1.0.0',
    identity: {
      id: agent.id,
      name: agent.name,
      display_name: agent.displayName,
      description: agent.description,
    },
    voice: agent.voice,
    personality: {
      warmth: agent.personality.warmth,
      humor_level: agent.personality.humorLevel,
      directness: agent.personality.directness,
      energy: agent.personality.energy,
      formality: agent.personality.formality,
      traits: agent.personality.traits,
    },
    role: {
      id: agent.type,
      description: `Custom ${agent.type} agent`,
    },
    cognitive: {
      profile: agent.personality.cognitiveProfile,
    },
    marketplace: {
      display_name: agent.displayName || agent.name,
      category: agent.category || 'custom',
      tags: agent.tags,
      icon: agent.icon,
      colors: agent.colors,
    },
    metadata: {
      author: agent.userId,
      created_at: agent.createdAt,
      updated_at: agent.updatedAt,
    },
  };
}

export default router;
