/**
 * Custom Agent API Module
 *
 * Modular API routes for custom agent management.
 * Split from the original 1150-line file for maintainability.
 *
 * SECURITY: Uses Firebase auth (requireAuth) instead of deprecated x-user-id header
 *
 * @module api/custom-agent
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { requireAuth } from '../auth-middleware.js';
import { getPathSegments, sendJson } from './helpers.js';

// Route handlers
import {
  handleCreateAgent,
  handleListAgents,
  handleGetAgent,
  handleUpdateAgent,
  handleDeleteAgent,
  handleUpdateStatus,
  handleActivateAgent,
} from './agent-routes.js';

import {
  handleVoiceUpload,
  handleVoiceClone,
  handleSelectPremadeVoice,
  handleGetVoiceStatus,
  handleVoicePreview,
} from './voice-routes.js';

import { handleAddMemory, handleListMemories, handleDeleteMemory } from './memory-routes.js';

import { handleCreateJournalEntry, handleListJournalEntries } from './journal-routes.js';

import { handleGeneratePrompt } from './prompt-routes.js';

const log = createLogger({ module: 'CustomAgentAPI' });

/**
 * Main handler for all custom agent routes
 *
 * Routes:
 * - POST   /api/custom-agents                      - Create agent
 * - GET    /api/custom-agents                      - List agents
 * - GET    /api/custom-agents/:id                  - Get agent
 * - PUT    /api/custom-agents/:id                  - Update agent
 * - DELETE /api/custom-agents/:id                  - Delete agent
 * - PUT    /api/custom-agents/:id/status           - Update status
 * - POST   /api/custom-agents/:id/activate         - Activate agent
 * - POST   /api/custom-agents/:id/voice/upload     - Upload voice sample
 * - POST   /api/custom-agents/:id/voice/clone      - Create voice clone
 * - PUT    /api/custom-agents/:id/voice/select-premade - Select premade voice
 * - GET    /api/custom-agents/:id/voice/status     - Get voice status
 * - POST   /api/custom-agents/:id/voice/preview    - Generate preview
 * - POST   /api/custom-agents/:id/memories         - Add memory
 * - GET    /api/custom-agents/:id/memories         - List memories
 * - DELETE /api/custom-agents/:id/memories/:memId  - Delete memory
 * - POST   /api/custom-agents/:id/journal/entry    - Create journal entry
 * - GET    /api/custom-agents/:id/journal/entries  - List journal entries
 * - POST   /api/custom-agents/:id/generate-prompt  - Generate system prompt
 */
export async function handleCustomAgentRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  const method = req.method || 'GET';
  const segments = getPathSegments(pathname);

  // SECURITY: Use Firebase auth instead of deprecated x-user-id header
  const auth = await requireAuth(req, res);
  if (!auth) return true; // 401 already sent
  const { userId } = auth;

  try {
    // ========================================================================
    // AGENT CRUD ROUTES
    // ========================================================================

    // POST /api/custom-agents - Create agent
    if (method === 'POST' && segments.length === 0) {
      return handleCreateAgent(req, res, userId);
    }

    // GET /api/custom-agents - List agents
    if (method === 'GET' && segments.length === 0) {
      return handleListAgents(req, res, userId);
    }

    // GET /api/custom-agents/:agentId - Get specific agent
    if (method === 'GET' && segments.length === 1) {
      return handleGetAgent(req, res, userId, segments[0]);
    }

    // PUT /api/custom-agents/:agentId - Update agent
    if (method === 'PUT' && segments.length === 1) {
      return handleUpdateAgent(req, res, userId, segments[0]);
    }

    // DELETE /api/custom-agents/:agentId - Delete agent
    if (method === 'DELETE' && segments.length === 1) {
      return handleDeleteAgent(req, res, userId, segments[0]);
    }

    // ========================================================================
    // STATUS ROUTES
    // ========================================================================

    // PUT /api/custom-agents/:agentId/status - Toggle agent status
    if (method === 'PUT' && segments.length === 2 && segments[1] === 'status') {
      return handleUpdateStatus(req, res, userId, segments[0]);
    }

    // POST /api/custom-agents/:agentId/activate - Quick activate agent
    if (method === 'POST' && segments.length === 2 && segments[1] === 'activate') {
      return handleActivateAgent(req, res, userId, segments[0]);
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
      return handleVoiceUpload(req, res, userId, segments[0]);
    }

    // POST /api/custom-agents/:agentId/voice/clone - Create voice clone
    if (
      method === 'POST' &&
      segments.length === 3 &&
      segments[1] === 'voice' &&
      segments[2] === 'clone'
    ) {
      return handleVoiceClone(req, res, userId, segments[0]);
    }

    // PUT /api/custom-agents/:agentId/voice/select-premade - Select pre-made voice
    if (
      method === 'PUT' &&
      segments.length === 3 &&
      segments[1] === 'voice' &&
      segments[2] === 'select-premade'
    ) {
      return handleSelectPremadeVoice(req, res, userId, segments[0]);
    }

    // GET /api/custom-agents/:agentId/voice/status - Poll voice clone status
    if (
      method === 'GET' &&
      segments.length === 3 &&
      segments[1] === 'voice' &&
      segments[2] === 'status'
    ) {
      return handleGetVoiceStatus(req, res, userId, segments[0]);
    }

    // POST /api/custom-agents/:agentId/voice/preview - Generate voice preview
    if (
      method === 'POST' &&
      segments.length === 3 &&
      segments[1] === 'voice' &&
      segments[2] === 'preview'
    ) {
      return handleVoicePreview(req, res, userId, segments[0]);
    }

    // ========================================================================
    // JOURNAL ROUTES (Digital Twin)
    // ========================================================================

    // POST /api/custom-agents/:agentId/journal/entry - Record journal entry
    if (
      method === 'POST' &&
      segments.length === 3 &&
      segments[1] === 'journal' &&
      segments[2] === 'entry'
    ) {
      return handleCreateJournalEntry(req, res, userId, segments[0]);
    }

    // GET /api/custom-agents/:agentId/journal/entries - List journal entries
    if (
      method === 'GET' &&
      segments.length === 3 &&
      segments[1] === 'journal' &&
      segments[2] === 'entries'
    ) {
      return handleListJournalEntries(req, res, userId, segments[0], parsedUrl);
    }

    // ========================================================================
    // MEMORY ROUTES
    // ========================================================================

    // POST /api/custom-agents/:agentId/memories - Add memory
    if (method === 'POST' && segments.length === 2 && segments[1] === 'memories') {
      return handleAddMemory(req, res, userId, segments[0]);
    }

    // GET /api/custom-agents/:agentId/memories - List memories
    if (method === 'GET' && segments.length === 2 && segments[1] === 'memories') {
      return handleListMemories(req, res, userId, segments[0], parsedUrl);
    }

    // DELETE /api/custom-agents/:agentId/memories/:memoryId - Delete memory
    if (method === 'DELETE' && segments.length === 3 && segments[1] === 'memories') {
      return handleDeleteMemory(req, res, userId, segments[0], segments[2], parsedUrl);
    }

    // ========================================================================
    // PROMPT GENERATION
    // ========================================================================

    // POST /api/custom-agents/:agentId/generate-prompt
    if (method === 'POST' && segments.length === 2 && segments[1] === 'generate-prompt') {
      return handleGeneratePrompt(req, res, userId, segments[0]);
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

// Re-export for backward compatibility
export { handleCustomAgentRoutes as default };
