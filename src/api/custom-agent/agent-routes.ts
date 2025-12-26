/**
 * Custom Agent CRUD Routes
 *
 * Handles create, read, update, delete operations for custom agents.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { parseBody } from '../helpers.js';
import {
  createCustomAgent,
  getCustomAgent,
  listCustomAgents,
  updateCustomAgent,
  deleteCustomAgent,
} from '../../services/custom-agent/custom-agent-persistence.service.js';
import type { CreateCustomAgentRequest, CustomAgent } from '../../types/custom-agent-api.js';
import { sendJson } from './helpers.js';

const log = createLogger({ module: 'CustomAgentRoutes' });

/**
 * POST /api/custom-agents - Create agent
 */
export async function handleCreateAgent(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<boolean> {
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

/**
 * GET /api/custom-agents - List agents
 */
export async function handleListAgents(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<boolean> {
  const agents = await listCustomAgents(userId);
  sendJson(res, 200, agents);
  return true;
}

/**
 * GET /api/custom-agents/:agentId - Get specific agent
 */
export async function handleGetAgent(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  agentId: string
): Promise<boolean> {
  const agent = await getCustomAgent(userId, agentId);

  if (!agent) {
    sendJson(res, 404, { error: 'Agent not found' });
    return true;
  }

  sendJson(res, 200, agent);
  return true;
}

/**
 * PUT /api/custom-agents/:agentId - Update agent
 */
export async function handleUpdateAgent(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  agentId: string
): Promise<boolean> {
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

/**
 * DELETE /api/custom-agents/:agentId - Delete agent
 */
export async function handleDeleteAgent(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  agentId: string
): Promise<boolean> {
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

/**
 * PUT /api/custom-agents/:agentId/status - Toggle agent status
 */
export async function handleUpdateStatus(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  agentId: string
): Promise<boolean> {
  const body = await parseBody<{ status: 'active' | 'paused' | 'draft' }>(req);

  if (!body.status || !['active', 'paused', 'draft'].includes(body.status)) {
    sendJson(res, 400, { error: 'Valid status is required (active, paused, draft)' });
    return true;
  }

  const agent = await getCustomAgent(userId, agentId);
  if (!agent) {
    sendJson(res, 404, { error: 'Agent not found' });
    return true;
  }

  // Validate agent is ready to be activated
  if (body.status === 'active') {
    const validationErrors: string[] = [];

    if (!agent.voice?.voiceId) {
      validationErrors.push('Voice is not configured');
    }
    if (agent.voice?.status !== 'ready') {
      validationErrors.push('Voice is not ready');
    }
    if (!agent.description || agent.description.length < 10) {
      validationErrors.push('Description is too short');
    }

    if (validationErrors.length > 0) {
      sendJson(res, 400, {
        error: 'Agent cannot be activated',
        validationErrors,
      });
      return true;
    }
  }

  const updated = await updateCustomAgent(userId, agentId, { status: body.status });
  if (!updated) {
    sendJson(res, 500, { error: 'Failed to update status' });
    return true;
  }

  log.info({ userId, agentId, status: body.status }, 'Agent status updated');
  sendJson(res, 200, {
    message: `Agent ${body.status === 'active' ? 'activated' : body.status === 'paused' ? 'paused' : 'set to draft'}`,
    status: body.status,
  });
  return true;
}

/**
 * POST /api/custom-agents/:agentId/activate - Quick activate agent
 */
export async function handleActivateAgent(
  _req: IncomingMessage,
  res: ServerResponse,
  userId: string,
  agentId: string
): Promise<boolean> {
  const agent = await getCustomAgent(userId, agentId);
  if (!agent) {
    sendJson(res, 404, { error: 'Agent not found' });
    return true;
  }

  // Validate agent is ready to be activated
  const validationErrors: string[] = [];

  if (!agent.voice?.voiceId) {
    validationErrors.push('Voice is not configured');
  }
  if (agent.voice?.status !== 'ready') {
    validationErrors.push('Voice is not ready');
  }
  if (!agent.description || agent.description.length < 10) {
    validationErrors.push('Description is too short');
  }

  if (validationErrors.length > 0) {
    sendJson(res, 400, {
      error: 'Agent cannot be activated',
      validationErrors,
      readyStatus: {
        hasVoice: !!agent.voice?.voiceId,
        voiceReady: agent.voice?.status === 'ready',
        hasDescription: (agent.description?.length || 0) >= 10,
      },
    });
    return true;
  }

  const updated = await updateCustomAgent(userId, agentId, { status: 'active' });
  if (!updated) {
    sendJson(res, 500, { error: 'Failed to activate agent' });
    return true;
  }

  log.info({ userId, agentId }, 'Agent activated');
  sendJson(res, 200, {
    message: 'Agent activated and ready for conversations',
    status: 'active',
  });
  return true;
}
