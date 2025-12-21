/**
 * Custom Agent Handler
 *
 * Adapts the Express-style router to the raw HTTP server format
 * used by the UI server.
 *
 * @module custom-agent-handler
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../utils/safe-logger.js';
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

const log = getLogger().child({ module: 'CustomAgentHandler' });

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Parses JSON body from request
 */
async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : ({} as T));
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Sends JSON response
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Extracts meaningful keywords from content text
 */
function extractKeywords(content: string): string[] {
  // Common stop words to filter out
  const stopWords = new Set([
    'a',
    'an',
    'the',
    'and',
    'or',
    'but',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'must',
    'shall',
    'can',
    'need',
    'dare',
    'ought',
    'used',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'up',
    'down',
    'out',
    'off',
    'over',
    'under',
    'again',
    'further',
    'then',
    'once',
    'here',
    'there',
    'when',
    'where',
    'why',
    'how',
    'all',
    'each',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'no',
    'not',
    'only',
    'own',
    'same',
    'so',
    'than',
    'too',
    'very',
    'just',
    'i',
    'me',
    'my',
    'myself',
    'we',
    'our',
    'ours',
    'ourselves',
    'you',
    'your',
    'yours',
    'yourself',
    'yourselves',
    'he',
    'him',
    'his',
    'himself',
    'she',
    'her',
    'hers',
    'herself',
    'it',
    'its',
    'itself',
    'they',
    'them',
    'their',
    'theirs',
    'themselves',
    'what',
    'which',
    'who',
    'whom',
    'this',
    'that',
    'these',
    'those',
    'am',
  ]);

  // Extract words, filter stop words, and get unique meaningful keywords
  const words = content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));

  // Return unique keywords, up to 10
  return [...new Set(words)].slice(0, 10);
}

/**
 * Gets user ID from request headers or query params
 */
function getUserId(req: IncomingMessage, parsedUrl: URL): string | null {
  // Check x-user-id header
  const headerUserId = req.headers['x-user-id'];
  if (headerUserId && typeof headerUserId === 'string') {
    return headerUserId;
  }

  // Check query param (for dev/testing)
  const queryUserId = parsedUrl.searchParams.get('user_id');
  if (queryUserId) return queryUserId;

  // Dev mode
  const adminKey = parsedUrl.searchParams.get('admin_key');
  if (adminKey === 'dev-mode' && process.env.NODE_ENV !== 'production') {
    return 'dev-user-123';
  }

  return null;
}

/**
 * Extracts path segments from a URL path
 * e.g., '/api/custom-agents/agent123/voice' -> ['agent123', 'voice']
 */
function getPathSegments(pathname: string): string[] {
  return pathname.replace('/api/custom-agents', '').split('/').filter(Boolean);
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Handles custom agent routes
 */
export async function handleCustomAgentRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  const method = req.method || 'GET';
  const segments = getPathSegments(pathname);

  // Get user ID
  const userId = getUserId(req, parsedUrl);
  if (!userId) {
    sendJson(res, 401, { error: 'Authentication required' });
    return true;
  }

  try {
    // POST /api/custom-agents - Create agent
    if (method === 'POST' && segments.length === 0) {
      const body = await parseBody<CreateCustomAgentRequest>(req);

      if (!body.name?.trim()) {
        sendJson(res, 400, { error: 'Name is required' });
        return true;
      }
      if (!body.description?.trim()) {
        sendJson(res, 400, { error: 'Description is required' });
        return true;
      }
      if (!['legacy', 'mentor', 'twin', 'fictional', 'professional'].includes(body.type)) {
        sendJson(res, 400, { error: 'Invalid agent type' });
        return true;
      }

      const agent = await createCustomAgent(userId, body);
      log.info({ userId, agentId: agent.id }, 'Custom agent created');
      sendJson(res, 201, agent);
      return true;
    }

    // GET /api/custom-agents - List agents
    if (method === 'GET' && segments.length === 0) {
      const agents = await listCustomAgents(userId);
      sendJson(res, 200, agents);
      return true;
    }

    // GET /api/custom-agents/:agentId - Get specific agent
    if (method === 'GET' && segments.length === 1) {
      const agentId = segments[0];
      const agent = await getCustomAgent(userId, agentId);

      if (!agent) {
        sendJson(res, 404, { error: 'Agent not found' });
        return true;
      }

      sendJson(res, 200, agent);
      return true;
    }

    // PUT /api/custom-agents/:agentId - Update agent
    if (method === 'PUT' && segments.length === 1) {
      const agentId = segments[0];
      const body = await parseBody<Partial<CustomAgent>>(req);

      const agent = await updateCustomAgent(userId, agentId, body);
      if (!agent) {
        sendJson(res, 404, { error: 'Agent not found' });
        return true;
      }

      log.info({ userId, agentId }, 'Custom agent updated');
      sendJson(res, 200, agent);
      return true;
    }

    // DELETE /api/custom-agents/:agentId - Delete agent
    if (method === 'DELETE' && segments.length === 1) {
      const agentId = segments[0];
      const success = await deleteCustomAgent(userId, agentId);

      if (!success) {
        sendJson(res, 404, { error: 'Agent not found' });
        return true;
      }

      log.info({ userId, agentId }, 'Custom agent deleted');
      res.writeHead(204);
      res.end();
      return true;
    }

    // ========================================================================
    // VOICE ROUTES
    // ========================================================================

    // POST /api/custom-agents/:agentId/voice/upload - Upload voice sample
    if (
      method === 'POST' &&
      segments.length === 3 &&
      segments[1] === 'voice' &&
      segments[2] === 'upload'
    ) {
      const agentId = segments[0];

      // Note: File uploads would need multipart parsing
      // For now, accept base64 encoded audio in body
      const body = await parseBody<{ audio: string; mimeType: string }>(req);

      if (!body.audio) {
        sendJson(res, 400, { error: 'Audio data is required' });
        return true;
      }

      // Verify agent exists
      const agent = await getCustomAgent(userId, agentId);
      if (!agent) {
        sendJson(res, 404, { error: 'Agent not found' });
        return true;
      }

      // TODO: Upload to GCS
      const audioUrl = `gs://voiceai-custom-agents/${userId}/${agentId}/voice-sample-${Date.now()}.webm`;

      // Update agent with pending status
      await updateAgentVoice(userId, agentId, {
        type: 'cloned',
        audioSampleUrl: audioUrl,
        status: 'pending',
      });

      log.info({ userId, agentId, audioUrl }, 'Voice sample uploaded');
      sendJson(res, 200, {
        audioUrl,
        qualityScore: 0.8,
        feedback: 'Audio uploaded successfully',
      });
      return true;
    }

    // POST /api/custom-agents/:agentId/voice/clone - Create voice clone
    if (
      method === 'POST' &&
      segments.length === 3 &&
      segments[1] === 'voice' &&
      segments[2] === 'clone'
    ) {
      const agentId = segments[0];
      const body = await parseBody<{ audioSampleUrl: string; userName: string }>(req);

      if (!body.audioSampleUrl) {
        sendJson(res, 400, { error: 'Audio sample URL is required' });
        return true;
      }
      if (!body.userName) {
        sendJson(res, 400, { error: 'User name is required' });
        return true;
      }

      const agent = await getCustomAgent(userId, agentId);
      if (!agent) {
        sendJson(res, 404, { error: 'Agent not found' });
        return true;
      }

      // TODO: Call Cartesia API
      const voice: CustomAgentVoice = {
        type: 'cloned',
        voiceId: `cartesia_clone_${agentId}_${Date.now()}`,
        audioSampleUrl: body.audioSampleUrl,
        status: 'ready',
        settings: {
          speed: 1.0,
          stability: 0.8,
          similarityBoost: 0.75,
        },
        preferences: {
          formality: 'match_context',
          greeting: `Hi, this is ${body.userName}.`,
          traits: { patience: 3, assertiveness: 3, friendliness: 3 },
        },
      };

      await updateAgentVoice(userId, agentId, voice);

      log.info({ userId, agentId, voiceId: voice.voiceId }, 'Voice clone created');
      sendJson(res, 200, { message: 'Voice clone created', voice });
      return true;
    }

    // PUT /api/custom-agents/:agentId/voice/select-premade - Select pre-made voice
    if (
      method === 'PUT' &&
      segments.length === 3 &&
      segments[1] === 'voice' &&
      segments[2] === 'select-premade'
    ) {
      const agentId = segments[0];
      const body = await parseBody<{ voiceId: string }>(req);

      if (!body.voiceId) {
        sendJson(res, 400, { error: 'Voice ID is required' });
        return true;
      }

      const agent = await getCustomAgent(userId, agentId);
      if (!agent) {
        sendJson(res, 404, { error: 'Agent not found' });
        return true;
      }

      const voice: CustomAgentVoice = {
        type: 'selected',
        voiceId: body.voiceId,
        status: 'ready',
        settings: {
          speed: 1.0,
          stability: 0.7,
          similarityBoost: 0.7,
          emotion: 'neutral',
        },
      };

      await updateAgentVoice(userId, agentId, voice);

      log.info({ userId, agentId, voiceId: body.voiceId }, 'Pre-made voice selected');
      sendJson(res, 200, { message: 'Voice selected', voice });
      return true;
    }

    // ========================================================================
    // MEMORY ROUTES
    // ========================================================================

    // POST /api/custom-agents/:agentId/memories - Add memory
    if (method === 'POST' && segments.length === 2 && segments[1] === 'memories') {
      const agentId = segments[0];
      const body = await parseBody<{
        type: string;
        content: string;
        audioUrl?: string;
        title?: string;
        phrase?: string;
        context?: string;
        mood?: string;
        keywords?: string[];
        themes?: string[];
        emotions?: string[];
      }>(req);

      if (!body.type || !body.content) {
        sendJson(res, 400, { error: 'Type and content are required' });
        return true;
      }

      const validTypes = ['story', 'wisdom', 'sharedMoment', 'journalEntry'];
      if (!validTypes.includes(body.type)) {
        sendJson(res, 400, { error: 'Invalid memory type' });
        return true;
      }

      const agent = await getCustomAgent(userId, agentId);
      if (!agent) {
        sendJson(res, 404, { error: 'Agent not found' });
        return true;
      }

      const typeMap: Record<string, string> = {
        story: 'stories',
        wisdom: 'wisdom',
        sharedMoment: 'sharedMoments',
        journalEntry: 'journalEntries',
      };

      // Use provided keywords/themes/emotions or extract from content
      const memory = {
        content: body.content,
        audioUrl: body.audioUrl,
        title: body.title,
        phrase: body.phrase,
        context: body.context,
        mood: body.mood,
        themes: body.themes || [],
        emotions: body.emotions || [],
        keywords: body.keywords || extractKeywords(body.content),
      };

      const updated = await addMemoryToAgent(userId, agentId, typeMap[body.type] as never, memory);

      if (!updated) {
        sendJson(res, 500, { error: 'Failed to add memory' });
        return true;
      }

      log.info({ userId, agentId, type: body.type }, 'Memory added');
      sendJson(res, 201, { message: 'Memory added', memory });
      return true;
    }

    // GET /api/custom-agents/:agentId/memories - List memories
    if (method === 'GET' && segments.length === 2 && segments[1] === 'memories') {
      const agentId = segments[0];
      const memoryType = parsedUrl.searchParams.get('type');

      const agent = await getCustomAgent(userId, agentId);
      if (!agent) {
        sendJson(res, 404, { error: 'Agent not found' });
        return true;
      }

      let memories: unknown[] = [];

      if (memoryType) {
        const typeMap: Record<string, keyof typeof agent.memories> = {
          story: 'stories',
          wisdom: 'wisdom',
          sharedMoment: 'sharedMoments',
          journalEntry: 'journalEntries',
        };
        const key = typeMap[memoryType];
        if (key && agent.memories[key]) {
          memories = agent.memories[key] as unknown[];
        }
      } else {
        memories = [
          ...agent.memories.stories,
          ...agent.memories.wisdom,
          ...agent.memories.sharedMoments,
          ...(agent.memories.journalEntries || []),
        ];
      }

      sendJson(res, 200, memories);
      return true;
    }

    // DELETE /api/custom-agents/:agentId/memories/:memoryId - Delete memory
    if (method === 'DELETE' && segments.length === 3 && segments[1] === 'memories') {
      const agentId = segments[0];
      const memoryId = segments[2];
      const memoryType = parsedUrl.searchParams.get('type');

      if (!memoryType) {
        sendJson(res, 400, { error: 'Memory type is required' });
        return true;
      }

      const typeMap: Record<string, string> = {
        story: 'stories',
        wisdom: 'wisdom',
        sharedMoment: 'sharedMoments',
        journalEntry: 'journalEntries',
      };

      const internalType = typeMap[memoryType];
      if (!internalType) {
        sendJson(res, 400, { error: 'Invalid memory type' });
        return true;
      }

      const updated = await removeMemoryFromAgent(userId, agentId, internalType as never, memoryId);

      if (!updated) {
        sendJson(res, 404, { error: 'Agent or memory not found' });
        return true;
      }

      log.info({ userId, agentId, memoryId }, 'Memory deleted');
      res.writeHead(204);
      res.end();
      return true;
    }

    // ========================================================================
    // PROMPT GENERATION
    // ========================================================================

    // POST /api/custom-agents/:agentId/generate-prompt
    if (method === 'POST' && segments.length === 2 && segments[1] === 'generate-prompt') {
      const agentId = segments[0];

      const agent = await getCustomAgent(userId, agentId);
      if (!agent) {
        sendJson(res, 404, { error: 'Agent not found' });
        return true;
      }

      const systemPrompt = generateSystemPrompt(agent);
      const personaManifest = generatePersonaManifest(agent);

      sendJson(res, 200, { systemPrompt, personaManifest });
      return true;
    }

    // Route not matched
    return false;
  } catch (error) {
    log.error({ error, pathname, method }, 'Custom agent route error');
    sendJson(res, 500, {
      error: 'Internal server error',
      message: (error as Error).message,
    });
    return true;
  }
}

// ============================================================================
// PROMPT GENERATION HELPERS
// ============================================================================

function generateSystemPrompt(agent: CustomAgent): string {
  const { name, displayName, description, type, personality, memories, behaviors } = agent;

  let prompt = `# You Are ${displayName || name}\n\n`;
  prompt += `You are an AI assistant embodying the persona of ${displayName || name}. Your core identity is: "${description}".\n\n`;

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

  prompt += `## Personality\n`;
  prompt += `- Warmth: ${Math.round(personality.warmth * 100)}%\n`;
  prompt += `- Humor: ${Math.round(personality.humorLevel * 100)}%\n`;
  prompt += `- Directness: ${Math.round(personality.directness * 100)}%\n`;
  prompt += `- Energy: ${Math.round(personality.energy * 100)}%\n`;
  prompt += `- Traits: ${personality.traits.join(', ') || 'None specified'}\n`;
  prompt += `- Cognitive Style: ${personality.cognitiveProfile}\n\n`;

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

  const totalMemories =
    memories.stories.length +
    memories.wisdom.length +
    memories.sharedMoments.length +
    (memories.journalEntries?.length || 0);

  if (totalMemories > 0) {
    prompt += `## Knowledge Base\n`;
    prompt += `This agent has ${totalMemories} memories stored.\n\n`;
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
