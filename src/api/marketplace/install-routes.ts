/**
 * Marketplace Install Routes
 *
 * Handles installation management:
 * - POST   /api/marketplace/install/tool - Install a tool
 * - POST   /api/marketplace/install/agent - Install an agent
 * - DELETE /api/marketplace/install/tool/:id - Uninstall a tool
 * - DELETE /api/marketplace/install/agent/:id - Uninstall an agent
 * - GET    /api/marketplace/install/list - List user's installations
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getAgent,
  getInstallation,
  getTool,
  installItem,
  listInstallations,
  uninstallItem,
} from '../../marketplace/index.js';
import type { PermissionScope } from '../../marketplace/schema/types.js';
import { getLogger } from '../../utils/safe-logger.js';
import { parseBody, sendJson, getUserId } from './helpers.js';

const log = getLogger().child({ module: 'marketplace-install-routes' });

/**
 * Handle install routes
 */
export async function handleInstallRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string
): Promise<boolean> {
  // POST /api/marketplace/install/tool - Install a tool
  if (pathname === '/api/marketplace/install/tool' && method === 'POST') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    try {
      const body = await parseBody<{ toolId: string; grantedPermissions?: PermissionScope[] }>(req);

      const tool = getTool(body.toolId);
      if (!tool) {
        sendJson(res, 404, { error: 'Tool not found' });
        return true;
      }

      const installation = await installItem({
        itemType: 'tool',
        itemId: body.toolId,
        userId,
        permissions: body.grantedPermissions || [],
      });

      log.info({ userId, toolId: body.toolId, installationId: installation.id }, 'Tool installed');
      sendJson(res, 200, {
        success: true,
        installation: {
          id: installation.id,
          toolId: installation.itemId,
          installedAt: installation.installedAt,
        },
      });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { success: false, error: err.message });
      return true;
    }
  }

  // POST /api/marketplace/install/agent - Install an agent
  if (pathname === '/api/marketplace/install/agent' && method === 'POST') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    try {
      const body = await parseBody<{ agentId: string; grantedPermissions?: PermissionScope[] }>(
        req
      );

      const agent = getAgent(body.agentId);
      if (!agent) {
        sendJson(res, 404, { error: 'Agent not found' });
        return true;
      }

      const installation = await installItem({
        itemType: 'agent',
        itemId: body.agentId,
        userId,
        permissions: body.grantedPermissions || [],
      });

      log.info(
        { userId, agentId: body.agentId, installationId: installation.id },
        'Agent installed'
      );
      sendJson(res, 200, {
        success: true,
        installation: {
          id: installation.id,
          agentId: installation.itemId,
          installedAt: installation.installedAt,
        },
      });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { success: false, error: err.message });
      return true;
    }
  }

  // DELETE /api/marketplace/install/tool/:id - Uninstall a tool
  if (pathname.match(/^\/api\/marketplace\/install\/tool\/[^/]+$/) && method === 'DELETE') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    const toolId = pathname.split('/')[5];

    try {
      const installation = getInstallation(userId, toolId);
      if (!installation) {
        sendJson(res, 404, { error: 'Installation not found' });
        return true;
      }

      await uninstallItem(installation.id);
      log.info({ userId, toolId }, 'Tool uninstalled');
      sendJson(res, 200, { success: true });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { success: false, error: err.message });
      return true;
    }
  }

  // DELETE /api/marketplace/install/agent/:id - Uninstall an agent
  if (pathname.match(/^\/api\/marketplace\/install\/agent\/[^/]+$/) && method === 'DELETE') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    const agentId = pathname.split('/')[5];

    try {
      const installation = getInstallation(userId, agentId);
      if (!installation) {
        sendJson(res, 404, { error: 'Installation not found' });
        return true;
      }

      await uninstallItem(installation.id);
      log.info({ userId, agentId }, 'Agent uninstalled');
      sendJson(res, 200, { success: true });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { success: false, error: err.message });
      return true;
    }
  }

  // GET /api/marketplace/install/list - List user's installations
  if (pathname === '/api/marketplace/install/list' && method === 'GET') {
    const userId = getUserId(req);
    if (!userId) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    try {
      const installations = listInstallations(userId);

      const result = installations.map((inst) => ({
        id: inst.id,
        itemId: inst.itemId,
        itemType: inst.itemType,
        installedAt: inst.installedAt,
        status: inst.status,
      }));

      sendJson(res, 200, { installations: result, totalCount: result.length });
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      sendJson(res, 500, { error: err.message });
      return true;
    }
  }

  return false;
}
