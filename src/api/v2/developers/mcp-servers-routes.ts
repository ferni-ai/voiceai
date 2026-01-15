/**
 * MCP Server Registration API
 *
 * Allows developers to register external MCP servers that agents can use.
 * Servers are stored in Firestore and loaded at session start.
 *
 * Endpoints:
 * - POST   /api/v2/developers/mcp-servers          - Register server
 * - GET    /api/v2/developers/mcp-servers          - List servers
 * - GET    /api/v2/developers/mcp-servers/:id      - Get server
 * - PUT    /api/v2/developers/mcp-servers/:id      - Update server
 * - DELETE /api/v2/developers/mcp-servers/:id      - Delete server
 * - POST   /api/v2/developers/mcp-servers/:id/test - Test connection
 * - GET    /api/v2/developers/mcp-servers/:id/tools - List server tools
 *
 * @module api/v2/developers/mcp-servers-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { parseBody, sendError } from '../../helpers.js';
import {
  requireApiKeyAuth,
  extractRouteParams,
  sendPaginatedResponse,
  sendItemResponse,
  sendSuccess,
  generateId,
  verifyOwnership,
  checkDeveloperRateLimit,
  type AuthenticatedRequest,
  type AuthContext,
} from './shared/middleware.js';
import {
  CreateMCPServerSchema,
  UpdateMCPServerSchema,
  PaginationSchema,
} from './shared/validation.js';
import {
  type DeveloperMCPServer,
  type MCPServerTestResult,
  COLLECTIONS,
  ID_PREFIXES,
} from './shared/types.js';
import { getFirestore } from '../../v1/developers/shared/developer-auth.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { encryptSensitive, decryptSensitive } from '../../../services/privacy-crypto.js';

const log = getLogger().child({ module: 'mcp-servers-routes' });

// ============================================================================
// SECRET ENCRYPTION HELPERS
// ============================================================================

/**
 * Encrypt all secrets in a secrets object using AES-256-GCM
 */
async function encryptSecrets(
  secrets: Record<string, string> | undefined
): Promise<Record<string, string> | undefined> {
  if (!secrets || Object.keys(secrets).length === 0) {
    return undefined;
  }

  const encrypted: Record<string, string> = {};
  for (const [key, value] of Object.entries(secrets)) {
    encrypted[key] = await encryptSensitive(value);
  }
  return encrypted;
}

/**
 * Decrypt all secrets in a secrets object
 * Handles legacy unencrypted secrets for backward compatibility
 */
async function decryptSecrets(
  secrets: Record<string, string> | undefined
): Promise<Record<string, string> | undefined> {
  if (!secrets || Object.keys(secrets).length === 0) {
    return undefined;
  }

  const decrypted: Record<string, string> = {};
  for (const [key, value] of Object.entries(secrets)) {
    // Handle legacy unencrypted secrets
    if (!value.startsWith('enc_')) {
      log.warn({ key }, 'Decrypting legacy unencrypted MCP secret - consider migrating');
      decrypted[key] = value;
    } else {
      decrypted[key] = await decryptSensitive<string>(value);
    }
  }
  return decrypted;
}

/** Base path for MCP server routes */
const BASE_PATH = '/api/v2/developers/mcp-servers';

/**
 * Main handler for MCP server routes
 */
export async function handleMCPServersRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  const authReq = req as AuthenticatedRequest;
  const params = extractRouteParams(pathname, BASE_PATH);

  // Require authentication for all routes
  const auth = await requireApiKeyAuth(authReq, res);
  if (!auth) return true; // Auth failed, response already sent

  try {
    // Route based on method and path
    const method = req.method || 'GET';

    // POST /mcp-servers - Create server
    if (method === 'POST' && !params.id) {
      return handleCreateServer(authReq, res, auth);
    }

    // GET /mcp-servers - List servers
    if (method === 'GET' && !params.id) {
      return handleListServers(authReq, res, auth);
    }

    // GET /mcp-servers/:id - Get server
    if (method === 'GET' && params.id && !params.action) {
      return handleGetServer(res, auth, params.id);
    }

    // PUT /mcp-servers/:id - Update server
    if (method === 'PUT' && params.id && !params.action) {
      return handleUpdateServer(authReq, res, auth, params.id);
    }

    // DELETE /mcp-servers/:id - Delete server
    if (method === 'DELETE' && params.id && !params.action) {
      return handleDeleteServer(res, auth, params.id);
    }

    // POST /mcp-servers/:id/test - Test connection
    if (method === 'POST' && params.id && params.action === 'test') {
      return handleTestServer(res, auth, params.id);
    }

    // GET /mcp-servers/:id/tools - List server tools
    if (method === 'GET' && params.id && params.action === 'tools') {
      return handleListServerTools(res, auth, params.id);
    }

    // No route matched
    sendError(res, 'Method not allowed', 405);
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, pathname }, 'MCP server route error');
    sendError(res, 'Internal server error', 500);
    return true;
  }
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * Create a new MCP server
 * POST /api/v2/developers/mcp-servers
 */
async function handleCreateServer(
  req: AuthenticatedRequest,
  res: ServerResponse,
  auth: AuthContext
): Promise<boolean> {
  // Rate limit (write tier - 50/min)
  if (await checkDeveloperRateLimit(res, auth, 'write')) {
    return true;
  }

  const body = await parseBody(req);
  const parseResult = CreateMCPServerSchema.safeParse(body);

  if (!parseResult.success) {
    sendError(res, `Validation error: ${parseResult.error.issues[0]?.message}`, 400);
    return true;
  }

  const input = parseResult.data;
  const id = generateId(ID_PREFIXES.MCP_SERVER);
  const now = new Date();

  // Build server document
  // Encrypt secrets before storing
  const encryptedSecrets = await encryptSecrets(input.secrets);

  const server: DeveloperMCPServer = {
    id,
    publisherId: auth.publisherId,
    personaId: input.personaId,
    name: input.name,
    description: input.description,
    transport: input.transport,
    command: input.command,
    args: input.args,
    endpoint: input.endpoint,
    headers: input.headers,
    secrets: encryptedSecrets, // Encrypted with AES-256-GCM
    autoConnect: input.autoConnect ?? true,
    enabled: input.enabled ?? true,
    timeout: input.timeout,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  // Save to Firestore
  const db = await getFirestore();
  await db.collection(COLLECTIONS.MCP_SERVERS).doc(id).set(serverToFirestore(server));

  log.info({ serverId: id, publisherId: auth.publisherId }, 'Created MCP server');

  // Return without secrets
  sendItemResponse(res, sanitizeServer(server));
  return true;
}

/**
 * List MCP servers for publisher
 * GET /api/v2/developers/mcp-servers
 */
async function handleListServers(
  req: AuthenticatedRequest,
  res: ServerResponse,
  auth: AuthContext
): Promise<boolean> {
  // Rate limit (read tier - 200/min)
  if (await checkDeveloperRateLimit(res, auth, 'read')) {
    return true;
  }

  // Parse pagination from query string
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const queryParams = Object.fromEntries(url.searchParams);
  const pagination = PaginationSchema.safeParse(queryParams);

  const page = pagination.success ? pagination.data.page : 1;
  const limit = pagination.success ? pagination.data.limit : 20;

  // Query Firestore
  const db = await getFirestore();
  const query = db
    .collection(COLLECTIONS.MCP_SERVERS)
    .where('publisherId', '==', auth.publisherId)
    .orderBy('createdAt', 'desc')
    .limit(limit);

  const snapshot = await query.get();
  const servers = snapshot.docs.map((doc) => sanitizeServer(firestoreToServer(doc)));

  // Get total count (for pagination)
  const countQuery = db
    .collection(COLLECTIONS.MCP_SERVERS)
    .where('publisherId', '==', auth.publisherId);
  const countSnapshot = await countQuery.get();

  sendPaginatedResponse(res, servers, {
    total: countSnapshot.size,
    page,
    limit,
  });
  return true;
}

/**
 * Get a single MCP server
 * GET /api/v2/developers/mcp-servers/:id
 */
async function handleGetServer(
  res: ServerResponse,
  auth: AuthContext,
  serverId: string
): Promise<boolean> {
  // Rate limit (read tier - 200/min)
  if (await checkDeveloperRateLimit(res, auth, 'read')) {
    return true;
  }

  const db = await getFirestore();
  const doc = await db.collection(COLLECTIONS.MCP_SERVERS).doc(serverId).get();

  if (!doc.exists) {
    sendError(res, 'Server not found', 404);
    return true;
  }

  const server = firestoreToServer(doc);

  if (!verifyOwnership(res, server.publisherId, auth)) {
    return true; // Response already sent
  }

  sendItemResponse(res, sanitizeServer(server));
  return true;
}

/**
 * Update an MCP server
 * PUT /api/v2/developers/mcp-servers/:id
 */
async function handleUpdateServer(
  req: AuthenticatedRequest,
  res: ServerResponse,
  auth: AuthContext,
  serverId: string
): Promise<boolean> {
  // Rate limit (write tier - 50/min)
  if (await checkDeveloperRateLimit(res, auth, 'write')) {
    return true;
  }

  const body = await parseBody(req);
  const parseResult = UpdateMCPServerSchema.safeParse(body);

  if (!parseResult.success) {
    sendError(res, `Validation error: ${parseResult.error.issues[0]?.message}`, 400);
    return true;
  }

  const input = parseResult.data;
  const db = await getFirestore();
  const docRef = db.collection(COLLECTIONS.MCP_SERVERS).doc(serverId);
  const doc = await docRef.get();

  if (!doc.exists) {
    sendError(res, 'Server not found', 404);
    return true;
  }

  const existing = firestoreToServer(doc);

  if (!verifyOwnership(res, existing.publisherId, auth)) {
    return true; // Response already sent
  }

  // Build update object (only include provided fields)
  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.transport !== undefined) updates.transport = input.transport;
  if (input.command !== undefined) updates.command = input.command;
  if (input.args !== undefined) updates.args = input.args;
  if (input.endpoint !== undefined) updates.endpoint = input.endpoint;
  if (input.headers !== undefined) updates.headers = input.headers;
  if (input.secrets !== undefined) {
    // Encrypt secrets before storing
    updates.secrets = await encryptSecrets(input.secrets);
  }
  if (input.autoConnect !== undefined) updates.autoConnect = input.autoConnect;
  if (input.enabled !== undefined) updates.enabled = input.enabled;
  if (input.timeout !== undefined) updates.timeout = input.timeout;

  await docRef.update(updates);

  log.info({ serverId, publisherId: auth.publisherId }, 'Updated MCP server');

  // Fetch updated document
  const updatedDoc = await docRef.get();
  const updatedServer = firestoreToServer(updatedDoc);

  sendItemResponse(res, sanitizeServer(updatedServer));
  return true;
}

/**
 * Delete an MCP server
 * DELETE /api/v2/developers/mcp-servers/:id
 */
async function handleDeleteServer(
  res: ServerResponse,
  auth: AuthContext,
  serverId: string
): Promise<boolean> {
  // Rate limit (write tier - 50/min)
  if (await checkDeveloperRateLimit(res, auth, 'write')) {
    return true;
  }

  const db = await getFirestore();
  const docRef = db.collection(COLLECTIONS.MCP_SERVERS).doc(serverId);
  const doc = await docRef.get();

  if (!doc.exists) {
    sendError(res, 'Server not found', 404);
    return true;
  }

  const server = firestoreToServer(doc);

  if (!verifyOwnership(res, server.publisherId, auth)) {
    return true; // Response already sent
  }

  await docRef.delete();

  log.info({ serverId, publisherId: auth.publisherId }, 'Deleted MCP server');

  sendSuccess(res, 'Server deleted');
  return true;
}

/**
 * Test MCP server connection
 * POST /api/v2/developers/mcp-servers/:id/test
 */
async function handleTestServer(
  res: ServerResponse,
  auth: AuthContext,
  serverId: string
): Promise<boolean> {
  // Rate limit (expensive tier - 10/min)
  if (await checkDeveloperRateLimit(res, auth, 'expensive')) {
    return true;
  }

  const db = await getFirestore();
  const doc = await db.collection(COLLECTIONS.MCP_SERVERS).doc(serverId).get();

  if (!doc.exists) {
    sendError(res, 'Server not found', 404);
    return true;
  }

  const server = firestoreToServer(doc);

  if (!verifyOwnership(res, server.publisherId, auth)) {
    return true;
  }

  // Test connection based on transport type
  const result = await testMCPConnection(server);

  // Update server status based on test result
  const docRef = db.collection(COLLECTIONS.MCP_SERVERS).doc(serverId);
  await docRef.update({
    status: result.success ? 'active' : 'error',
    lastConnected: result.success ? new Date() : undefined,
    lastError: result.error,
    toolCount: result.tools?.length ?? 0,
    updatedAt: new Date(),
  });

  sendItemResponse(res, result);
  return true;
}

/**
 * List tools available on MCP server
 * GET /api/v2/developers/mcp-servers/:id/tools
 */
async function handleListServerTools(
  res: ServerResponse,
  auth: AuthContext,
  serverId: string
): Promise<boolean> {
  const db = await getFirestore();
  const doc = await db.collection(COLLECTIONS.MCP_SERVERS).doc(serverId).get();

  if (!doc.exists) {
    sendError(res, 'Server not found', 404);
    return true;
  }

  const server = firestoreToServer(doc);

  if (!verifyOwnership(res, server.publisherId, auth)) {
    return true;
  }

  // Test connection to get tools list
  const result = await testMCPConnection(server);

  if (!result.success) {
    sendError(res, result.error || 'Failed to connect to server', 503);
    return true;
  }

  sendItemResponse(res, { tools: result.tools || [] });
  return true;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Test MCP server connection
 *
 * TODO: Implement actual MCP protocol connection
 * For now, returns a mock response
 */
async function testMCPConnection(server: DeveloperMCPServer): Promise<MCPServerTestResult> {
  const startTime = Date.now();

  try {
    // TODO: Implement real MCP connection test based on transport type
    // For HTTP: Make a request to the endpoint
    // For WebSocket: Open connection and list tools
    // For stdio: Spawn process and communicate

    if (server.transport === 'http' && server.endpoint) {
      // Basic HTTP health check
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), server.timeout || 5000);

      try {
        const response = await fetch(server.endpoint, {
          method: 'GET',
          headers: server.headers || {},
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          return {
            success: false,
            connected: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
            latencyMs: Date.now() - startTime,
          };
        }

        // TODO: Parse MCP tools from response
        return {
          success: true,
          connected: true,
          tools: ['example-tool'], // Placeholder
          latencyMs: Date.now() - startTime,
        };
      } catch (fetchError) {
        clearTimeout(timeout);
        const err = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
        return {
          success: false,
          connected: false,
          error: err.name === 'AbortError' ? 'Connection timeout' : err.message,
          latencyMs: Date.now() - startTime,
        };
      }
    }

    // For other transports, return placeholder response
    // TODO: Implement stdio and websocket connections
    return {
      success: true,
      connected: true,
      tools: [], // Will be populated when MCP client is implemented
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.error({ error: err.message, serverId: server.id }, 'MCP connection test failed');
    return {
      success: false,
      connected: false,
      error: err.message,
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Convert Firestore document to server object
 */
function firestoreToServer(doc: {
  id: string;
  data: () => Record<string, unknown> | undefined;
}): DeveloperMCPServer {
  const data = doc.data() || {};
  return {
    id: doc.id,
    publisherId: data.publisherId as string,
    personaId: data.personaId as string | undefined,
    name: data.name as string,
    description: data.description as string,
    transport: data.transport as 'stdio' | 'http' | 'websocket',
    command: data.command as string | undefined,
    args: data.args as string[] | undefined,
    endpoint: data.endpoint as string | undefined,
    headers: data.headers as Record<string, string> | undefined,
    secrets: data.secrets as Record<string, string> | undefined,
    autoConnect: data.autoConnect as boolean,
    enabled: data.enabled as boolean,
    timeout: data.timeout as number | undefined,
    status: data.status as 'active' | 'error' | 'disabled',
    lastConnected: data.lastConnected ? toDate(data.lastConnected) : undefined,
    lastError: data.lastError as string | undefined,
    toolCount: data.toolCount as number | undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/**
 * Convert server object to Firestore format
 */
function serverToFirestore(server: DeveloperMCPServer): Record<string, unknown> {
  return {
    publisherId: server.publisherId,
    personaId: server.personaId || null,
    name: server.name,
    description: server.description,
    transport: server.transport,
    command: server.command || null,
    args: server.args || null,
    endpoint: server.endpoint || null,
    headers: server.headers || null,
    secrets: server.secrets || null, // Already encrypted in route handlers
    autoConnect: server.autoConnect,
    enabled: server.enabled,
    timeout: server.timeout || null,
    status: server.status,
    lastConnected: server.lastConnected || null,
    lastError: server.lastError || null,
    toolCount: server.toolCount || null,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
  };
}

/**
 * Remove secrets from server for API response
 */
function sanitizeServer(
  server: DeveloperMCPServer
): Omit<DeveloperMCPServer, 'secrets'> & { hasSecrets: boolean } {
  const { secrets, ...rest } = server;
  return {
    ...rest,
    hasSecrets: !!secrets && Object.keys(secrets).length > 0,
  };
}

/**
 * Convert various timestamp formats to Date
 */
function toDate(value: unknown): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') return new Date(value);
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  // Firestore Timestamp with _seconds
  if (typeof (value as { _seconds?: number })._seconds === 'number') {
    return new Date((value as { _seconds: number })._seconds * 1000);
  }
  return new Date();
}
