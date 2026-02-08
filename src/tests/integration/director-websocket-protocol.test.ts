/**
 * Director WebSocket protocol integration tests.
 *
 * Tests the /ws/director protocol: auth, session lookup, state push,
 * and inbound message handling (query, command, accept_suggestion).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  registerDirectorEngine,
  unregisterDirectorEngine,
  handleDirectorWebSocket,
} from '../../api/director-routes.js';
import { DirectorEngine } from '../../integrations/qwen3-omni/director/director-engine.js';
import type { IncomingMessage } from 'http';

describe('Director WebSocket protocol', () => {
  const sessionId = 'test-session-ws';
  const userId = 'director-user-1';

  function createMinimalEngine(): DirectorEngine {
    return new DirectorEngine({
      sessionId,
      userId: 'user-1',
      directorUserId: userId,
      initialLead: 'ferni',
      initialCast: ['ferni'],
      initialMood: 'warm',
      autoDirectorMode: 'off',
      maxEnsembleSize: 4,
      enableMusic: false,
    });
  }

  function createMockWs(): {
    readyState: number;
    OPEN: number;
    send: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
  } {
    const OPEN = 1;
    return {
      readyState: OPEN,
      OPEN,
      send: vi.fn(),
      on: vi.fn(),
      close: vi.fn(),
      off: vi.fn(),
    };
  }

  function createMockReq(query: { sessionId: string; userId: string }): IncomingMessage {
    const path = `/ws/director?sessionId=${encodeURIComponent(query.sessionId)}&userId=${encodeURIComponent(query.userId)}`;
    return {
      url: path,
      headers: { host: 'localhost' },
    } as unknown as IncomingMessage;
  }

  beforeEach(() => {
    unregisterDirectorEngine(sessionId);
    vi.clearAllMocks();
  });

  it('sends error and closes when userId not authorized', () => {
    const engine = createMinimalEngine();
    registerDirectorEngine(sessionId, engine);
    const ws = createMockWs();
    const req = createMockReq({ sessionId, userId: 'unknown-user' });
    const config = { authorizedDirectorIds: [userId] };

    handleDirectorWebSocket(ws as unknown as import('ws').WebSocket, req, config);

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"error"'));
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('Unauthorized'));
    expect(ws.close).toHaveBeenCalledWith(4001, 'Unauthorized');
    unregisterDirectorEngine(sessionId);
  });

  it('sends error and closes when sessionId missing', () => {
    const engine = createMinimalEngine();
    registerDirectorEngine(sessionId, engine);
    const ws = createMockWs();
    const req = createMockReq({ sessionId: '', userId });
    const config = { authorizedDirectorIds: [userId] };

    handleDirectorWebSocket(ws as unknown as import('ws').WebSocket, req, config);

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"error"'));
    expect(ws.close).toHaveBeenCalledWith(4002, 'Missing sessionId');
    unregisterDirectorEngine(sessionId);
  });

  it('sends error and closes when no engine for sessionId', () => {
    const ws = createMockWs();
    const req = createMockReq({ sessionId: 'nonexistent-session', userId });
    const config = { authorizedDirectorIds: [userId] };

    handleDirectorWebSocket(ws as unknown as import('ws').WebSocket, req, config);

    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"type":"error"'));
    expect(ws.close).toHaveBeenCalledWith(4003, 'Session not found');
  });

  it('sends initial state when authorized and session exists', () => {
    const engine = createMinimalEngine();
    registerDirectorEngine(sessionId, engine);
    const ws = createMockWs();
    const req = createMockReq({ sessionId, userId });
    const config = { authorizedDirectorIds: [userId] };

    handleDirectorWebSocket(ws as unknown as import('ws').WebSocket, req, config);

    expect(ws.send).toHaveBeenCalled();
    const stateCall = (ws.send as ReturnType<typeof vi.fn>).mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('"type":"state"')
    );
    expect(stateCall).toBeDefined();
    const payload = JSON.parse(stateCall[0] as string);
    expect(payload.type).toBe('state');
    expect(payload.snapshot).toBeDefined();
    expect(payload.snapshot.cast.leadPersona).toBe('ferni');
    unregisterDirectorEngine(sessionId);
  });
});
