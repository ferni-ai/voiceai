/**
 * Tests for FerniClient
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FerniClient } from '../client.js';
import { FerniApiError } from '../types.js';
import type {
  CreateApiKeyRequest,
  PersonaManifest,
  CreateWebhookRequest,
  UpdateWebhookRequest,
} from '../types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as typeof fetch;

describe('FerniClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('requires API key', () => {
      expect(() => new FerniClient({ apiKey: '' })).toThrow('API key is required');
    });

    it('accepts valid API key', () => {
      const client = new FerniClient({ apiKey: 'ferni_test_abc123' });
      expect(client).toBeInstanceOf(FerniClient);
    });

    it('uses default base URL', () => {
      const client = new FerniClient({ apiKey: 'ferni_test_abc123' });
      expect(client).toBeDefined();
    });

    it('accepts custom base URL and strips trailing slash', () => {
      const client = new FerniClient({
        apiKey: 'ferni_test_abc123',
        baseUrl: 'https://custom.api.com/',
      });
      expect(client).toBeDefined();
    });

    it('accepts custom timeout', () => {
      const client = new FerniClient({
        apiKey: 'ferni_test_abc123',
        timeout: 5000,
      });
      expect(client).toBeDefined();
    });

    it('accepts custom fetch implementation', () => {
      const customFetch = vi.fn();
      const client = new FerniClient({
        apiKey: 'ferni_test_abc123',
        fetch: customFetch as typeof fetch,
      });
      expect(client).toBeDefined();
    });
  });

  describe('Request method', () => {
    let client: FerniClient;

    beforeEach(() => {
      client = new FerniClient({ apiKey: 'ferni_test_abc123' });
    });

    it('builds correct headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await client.listApiKeys();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ferni.ai/api/v1/developers/keys',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer ferni_test_abc123',
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        })
      );
    });

    it('handles 401 Unauthorized', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Invalid API key', code: 'INVALID_API_KEY' }),
      });

      await expect(client.listApiKeys()).rejects.toThrow(FerniApiError);
      await expect(client.listApiKeys()).rejects.toMatchObject({
        message: 'Invalid API key',
        status: 401,
        code: 'INVALID_API_KEY',
      });
    });

    it('handles 404 Not Found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Resource not found' }),
      });

      await expect(client.getPersona('invalid-id')).rejects.toThrow(FerniApiError);
      await expect(client.getPersona('invalid-id')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('handles 429 Rate Limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' }),
      });

      await expect(client.listApiKeys()).rejects.toThrow(FerniApiError);
      await expect(client.listApiKeys()).rejects.toMatchObject({
        status: 429,
        code: 'RATE_LIMIT_EXCEEDED',
      });
    });

    it('handles 500 Internal Server Error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' }),
      });

      await expect(client.listApiKeys()).rejects.toThrow(FerniApiError);
      await expect(client.listApiKeys()).rejects.toMatchObject({
        status: 500,
      });
    });

    it('handles timeout', async () => {
      const client = new FerniClient({ apiKey: 'ferni_test_abc123', timeout: 100 });

      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ ok: true, json: async () => ({}) }), 200);
          })
      );

      await expect(client.listApiKeys()).rejects.toThrow(FerniApiError);
      await expect(client.listApiKeys()).rejects.toMatchObject({
        message: 'Request timeout',
        status: 408,
      });
    });

    it('handles network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      await expect(client.listApiKeys()).rejects.toThrow(FerniApiError);
      await expect(client.listApiKeys()).rejects.toMatchObject({
        message: 'Network failure',
        status: 0,
      });
    });
  });

  describe('API Keys', () => {
    let client: FerniClient;

    beforeEach(() => {
      client = new FerniClient({ apiKey: 'ferni_test_abc123' });
    });

    it('lists API keys', async () => {
      const mockResponse = {
        success: true,
        keys: [
          {
            id: 'key_1',
            keyPrefix: 'ferni_test_abc',
            type: 'test' as const,
            name: 'Test Key',
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.listApiKeys();

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ferni.ai/api/v1/developers/keys',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('creates API key', async () => {
      const request: CreateApiKeyRequest = {
        type: 'test',
        name: 'My Test Key',
      };

      const mockResponse = {
        success: true,
        key: {
          id: 'key_1',
          apiKey: 'ferni_test_xyz789',
          type: 'test' as const,
          createdAt: '2024-01-01T00:00:00Z',
        },
        warning: 'Save this key immediately',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.createApiKey(request);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ferni.ai/api/v1/developers/keys',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
        })
      );
    });

    it('rotates API key', async () => {
      const mockResponse = {
        success: true,
        key: {
          id: 'key_1',
          apiKey: 'ferni_test_newkey123',
          createdAt: '2024-01-02T00:00:00Z',
        },
        warning: 'Old key has been revoked',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.rotateApiKey('key_1');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ferni.ai/api/v1/developers/keys/key_1/rotate',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('revokes API key', async () => {
      const mockResponse = {
        success: true,
        message: 'API key revoked',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.revokeApiKey('key_1');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ferni.ai/api/v1/developers/keys/key_1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('Personas', () => {
    let client: FerniClient;

    beforeEach(() => {
      client = new FerniClient({ apiKey: 'ferni_test_abc123' });
    });

    const mockManifest: PersonaManifest = {
      identity: {
        id: 'chef-bot',
        name: 'Chef Bot',
        tagline: 'Your culinary companion',
        description: 'A helpful cooking assistant',
      },
      voice: {
        provider: 'cartesia',
        voice_id: 'voice_123',
        name: 'Chef Voice',
      },
      personality: {
        warmth: 0.8,
        humor_level: 0.6,
        directness: 0.7,
        formality: 0.5,
        traits: ['friendly', 'knowledgeable'],
      },
      knowledge: {
        category: 'cooking',
        domains: ['recipes', 'techniques'],
        expertise_tags: ['italian', 'french'],
      },
    };

    it('lists personas', async () => {
      const mockResponse = {
        success: true,
        personas: [
          {
            id: 'persona_1',
            name: 'Chef Bot',
            tagline: 'Your culinary companion',
            category: 'cooking',
            status: 'approved' as const,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.listPersonas();

      expect(result).toEqual(mockResponse);
    });

    it('creates persona', async () => {
      const mockResponse = {
        success: true,
        persona: {
          id: 'persona_1',
          name: 'Chef Bot',
          tagline: 'Your culinary companion',
          category: 'cooking',
          status: 'draft' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        validation: {
          valid: true,
          errors: [],
          warnings: [],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.createPersona(mockManifest);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ferni.ai/api/v1/developers/personas',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ manifest: mockManifest }),
        })
      );
    });

    it('gets persona', async () => {
      const mockResponse = {
        success: true,
        persona: {
          id: 'persona_1',
          name: 'Chef Bot',
          tagline: 'Your culinary companion',
          category: 'cooking',
          status: 'approved' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          manifest: mockManifest,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getPersona('persona_1');

      expect(result).toEqual(mockResponse);
    });

    it('updates persona', async () => {
      const mockResponse = {
        success: true,
        persona: {
          id: 'persona_1',
          name: 'Chef Bot',
          tagline: 'Your culinary companion',
          category: 'cooking',
          status: 'draft' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
        validation: {
          valid: true,
          errors: [],
          warnings: [],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.updatePersona('persona_1', mockManifest);

      expect(result).toEqual(mockResponse);
    });

    it('deletes persona', async () => {
      const mockResponse = {
        success: true,
        message: 'Persona deleted',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.deletePersona('persona_1');

      expect(result).toEqual(mockResponse);
    });

    it('validates persona', async () => {
      const mockResponse = {
        success: true,
        validation: {
          valid: true,
          errors: [],
          warnings: [],
        },
        readyToSubmit: true,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.validatePersona('persona_1');

      expect(result).toEqual(mockResponse);
    });

    it('submits persona', async () => {
      const mockResponse = {
        success: true,
        message: 'Persona submitted for review',
        persona: {
          id: 'persona_1',
          name: 'Chef Bot',
          tagline: 'Your culinary companion',
          category: 'cooking',
          status: 'submitted' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.submitPersona('persona_1');

      expect(result).toEqual(mockResponse);
    });
  });

  describe('Webhooks', () => {
    let client: FerniClient;

    beforeEach(() => {
      client = new FerniClient({ apiKey: 'ferni_test_abc123' });
    });

    const mockWebhook = {
      id: 'webhook_1',
      publisherId: 'pub_1',
      name: 'My Webhook',
      url: 'https://example.com/webhook',
      events: ['session.started', 'session.ended'] as const,
      secret: 'whsec_xyz789',
      enabled: true,
      failureCount: 0,
      createdAt: '2024-01-01T00:00:00Z',
    };

    it('lists webhooks', async () => {
      const mockResponse = {
        success: true,
        items: [mockWebhook],
        pagination: {
          limit: 50,
          hasMore: false,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.listWebhooks();

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ferni.ai/api/v2/developers/webhooks',
        expect.any(Object)
      );
    });

    it('lists webhooks with pagination', async () => {
      const mockResponse = {
        success: true,
        items: [mockWebhook],
        pagination: {
          limit: 10,
          nextCursor: 'cursor_abc',
          hasMore: true,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.listWebhooks({ limit: 10, cursor: 'cursor_abc' });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ferni.ai/api/v2/developers/webhooks?limit=10&cursor=cursor_abc',
        expect.any(Object)
      );
    });

    it('creates webhook', async () => {
      const request: CreateWebhookRequest = {
        name: 'My Webhook',
        url: 'https://example.com/webhook',
        events: ['session.started'],
        enabled: true,
      };

      const mockResponse = {
        success: true,
        data: mockWebhook,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.createWebhook(request);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ferni.ai/api/v2/developers/webhooks',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
        })
      );
    });

    it('gets webhook', async () => {
      const mockResponse = {
        success: true,
        data: mockWebhook,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getWebhook('webhook_1');

      expect(result).toEqual(mockResponse);
    });

    it('updates webhook', async () => {
      const updates: UpdateWebhookRequest = {
        enabled: false,
      };

      const mockResponse = {
        success: true,
        data: { ...mockWebhook, enabled: false },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.updateWebhook('webhook_1', updates);

      expect(result).toEqual(mockResponse);
    });

    it('deletes webhook', async () => {
      const mockResponse = {
        success: true,
        data: { deleted: true },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.deleteWebhook('webhook_1');

      expect(result).toEqual(mockResponse);
    });

    it('tests webhook', async () => {
      const mockResponse = {
        success: true,
        data: {
          success: true,
          statusCode: 200,
          executionTimeMs: 150,
          payload: {
            id: 'evt_1',
            type: 'session.started' as const,
            timestamp: '2024-01-01T00:00:00Z',
            publisherId: 'pub_1',
            data: {},
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.testWebhook('webhook_1');

      expect(result).toEqual(mockResponse);
    });

    it('gets webhook logs', async () => {
      const mockResponse = {
        success: true,
        data: {
          items: [
            {
              id: 'log_1',
              webhookId: 'webhook_1',
              eventId: 'evt_1',
              eventType: 'session.started' as const,
              statusCode: 200,
              success: true,
              executionTimeMs: 100,
              attempt: 1,
              createdAt: '2024-01-01T00:00:00Z',
            },
          ],
          pagination: {
            limit: 50,
            hasMore: false,
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getWebhookLogs('webhook_1');

      expect(result).toEqual(mockResponse);
    });
  });

  describe('Analytics', () => {
    let client: FerniClient;

    beforeEach(() => {
      client = new FerniClient({ apiKey: 'ferni_test_abc123' });
    });

    it('gets analytics overview', async () => {
      const mockResponse = {
        success: true,
        period: 'week',
        overview: {
          totalApiCalls: 1000,
          totalApiCallsChange: 10,
          activePersonas: 5,
          activePersonasChange: 1,
          uniqueUsers: 50,
          uniqueUsersChange: 5,
          errorRate: 0.02,
          errorRateChange: -0.01,
          avgResponseTime: 250,
          avgResponseTimeChange: -10,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getAnalyticsOverview('week');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ferni.ai/api/v1/developers/analytics/overview?period=week',
        expect.any(Object)
      );
    });

    it('gets usage over time', async () => {
      const mockResponse = {
        success: true,
        period: 'week',
        usage: [
          {
            date: '2024-01-01',
            apiCalls: 100,
            uniqueUsers: 10,
            errors: 2,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getUsageOverTime('week');

      expect(result).toEqual(mockResponse);
    });

    it('gets persona usage', async () => {
      const mockResponse = {
        success: true,
        period: 'week',
        personas: [
          {
            personaId: 'persona_1',
            personaName: 'Chef Bot',
            totalCalls: 500,
            avgSessionDuration: 120,
            uniqueUsers: 25,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getPersonaUsage('week');

      expect(result).toEqual(mockResponse);
    });

    it('gets error breakdown', async () => {
      const mockResponse = {
        success: true,
        period: 'week',
        errors: [
          {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests',
            count: 10,
            lastOccurred: '2024-01-01T00:00:00Z',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getErrorBreakdown('week');

      expect(result).toEqual(mockResponse);
    });

    it('uses default period when not specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, period: 'week', overview: {} }),
      });

      await client.getAnalyticsOverview();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ferni.ai/api/v1/developers/analytics/overview?period=week',
        expect.any(Object)
      );
    });
  });

  describe('MCP Servers (v2)', () => {
    let client: FerniClient;

    beforeEach(() => {
      client = new FerniClient({ apiKey: 'ferni_test_abc123' });
    });

    const mockMCPServer = {
      id: 'mcp_1',
      publisherId: 'pub_1',
      name: 'My MCP Server',
      description: 'A test server',
      transport: 'http' as const,
      endpoint: 'https://mcp.example.com',
      autoConnect: true,
      enabled: true,
      status: 'active' as const,
      hasSecrets: false,
      toolCount: 3,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    it('lists MCP servers', async () => {
      const mockResponse = {
        success: true,
        data: [mockMCPServer],
        pagination: { limit: 20, hasMore: false },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.listMCPServers();

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ferni.ai/api/v2/developers/mcp-servers',
        expect.any(Object)
      );
    });

    it('creates MCP server', async () => {
      const request = {
        name: 'My MCP Server',
        description: 'A test server',
        transport: 'http' as const,
        endpoint: 'https://mcp.example.com',
      };

      const mockResponse = {
        success: true,
        data: mockMCPServer,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.createMCPServer(request);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ferni.ai/api/v2/developers/mcp-servers',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
        })
      );
    });

    it('gets MCP server', async () => {
      const mockResponse = {
        success: true,
        data: mockMCPServer,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getMCPServer('mcp_1');

      expect(result).toEqual(mockResponse);
    });

    it('updates MCP server', async () => {
      const mockResponse = {
        success: true,
        data: { ...mockMCPServer, enabled: false },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.updateMCPServer('mcp_1', { enabled: false });

      expect(result).toEqual(mockResponse);
    });

    it('deletes MCP server', async () => {
      const mockResponse = {
        success: true,
        data: { deleted: true },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.deleteMCPServer('mcp_1');

      expect(result).toEqual(mockResponse);
    });

    it('tests MCP server', async () => {
      const mockResponse = {
        success: true,
        data: {
          success: true,
          connected: true,
          tools: ['search', 'weather'],
          latencyMs: 150,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.testMCPServer('mcp_1');

      expect(result).toEqual(mockResponse);
    });

    it('gets MCP server tools', async () => {
      const mockResponse = {
        success: true,
        data: {
          tools: ['search', 'weather', 'calendar'],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getMCPServerTools('mcp_1');

      expect(result).toEqual(mockResponse);
    });
  });

  describe('Custom Tools (v2)', () => {
    let client: FerniClient;

    beforeEach(() => {
      client = new FerniClient({ apiKey: 'ferni_test_abc123' });
    });

    const mockTool = {
      id: 'tool_1',
      publisherId: 'pub_1',
      name: 'my-tool',
      displayName: 'My Tool',
      description: 'A custom tool',
      llmDescription: 'Use this tool to do something',
      type: 'webhook' as const,
      config: { url: 'https://api.example.com/tool', method: 'POST' as const },
      parameters: { type: 'object', properties: {} },
      enabled: true,
      requiresAuth: false,
      version: '1.0.0',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    it('lists custom tools', async () => {
      const mockResponse = {
        success: true,
        data: [mockTool],
        pagination: { limit: 20, hasMore: false },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.listTools();

      expect(result).toEqual(mockResponse);
    });

    it('creates custom tool', async () => {
      const request = {
        name: 'my-tool',
        displayName: 'My Tool',
        description: 'A custom tool',
        llmDescription: 'Use this tool to do something',
        type: 'webhook' as const,
        config: { url: 'https://api.example.com/tool', method: 'POST' as const },
        parameters: { type: 'object', properties: {} },
      };

      const mockResponse = {
        success: true,
        data: mockTool,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.createTool(request);

      expect(result).toEqual(mockResponse);
    });

    it('gets custom tool', async () => {
      const mockResponse = {
        success: true,
        data: mockTool,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getTool('tool_1');

      expect(result).toEqual(mockResponse);
    });

    it('tests custom tool', async () => {
      const mockResponse = {
        success: true,
        data: {
          success: true,
          result: { message: 'Hello' },
          executionTimeMs: 50,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.testTool('tool_1', { input: 'test' });

      expect(result).toEqual(mockResponse);
    });
  });

  describe('Activities (v2)', () => {
    let client: FerniClient;

    beforeEach(() => {
      client = new FerniClient({ apiKey: 'ferni_test_abc123' });
    });

    const mockActivity = {
      id: 'act_1',
      publisherId: 'pub_1',
      type: 'checkout',
      name: 'User checkout',
      data: { cartTotal: 99.99 },
      status: 'completed' as const,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    it('lists activities', async () => {
      const mockResponse = {
        success: true,
        data: [mockActivity],
        pagination: { limit: 20, hasMore: false },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.listActivities();

      expect(result).toEqual(mockResponse);
    });

    it('creates activity', async () => {
      const request = {
        type: 'checkout',
        name: 'User checkout',
        data: { cartTotal: 99.99 },
      };

      const mockResponse = {
        success: true,
        data: mockActivity,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.createActivity(request);

      expect(result).toEqual(mockResponse);
    });

    it('gets activity stats', async () => {
      const mockResponse = {
        success: true,
        data: {
          totalCount: 100,
          byType: { checkout: 50, signup: 50 },
          byStatus: { started: 10, completed: 85, failed: 5 },
          averageDurationMs: 5000,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getActivityStats({ type: 'checkout' });

      expect(result).toEqual(mockResponse);
    });
  });

  describe('Workflows (v2)', () => {
    let client: FerniClient;

    beforeEach(() => {
      client = new FerniClient({ apiKey: 'ferni_test_abc123' });
    });

    const mockWorkflow = {
      id: 'wf_1',
      publisherId: 'pub_1',
      name: 'My Workflow',
      description: 'A test workflow',
      version: '1.0.0',
      trigger: { type: 'api' as const, config: {} },
      nodes: [{ id: 'start', name: 'Start', type: 'start' as const, config: {} }],
      edges: [],
      entryNodeId: 'start',
      exitNodeIds: ['start'],
      enabled: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    it('lists workflows', async () => {
      const mockResponse = {
        success: true,
        data: [mockWorkflow],
        pagination: { limit: 20, hasMore: false },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.listWorkflows();

      expect(result).toEqual(mockResponse);
    });

    it('creates workflow', async () => {
      const request = {
        name: 'My Workflow',
        description: 'A test workflow',
        trigger: { type: 'api' as const, config: {} },
        nodes: [{ id: 'start', name: 'Start', type: 'start' as const, config: {} }],
        edges: [],
        entryNodeId: 'start',
      };

      const mockResponse = {
        success: true,
        data: mockWorkflow,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.createWorkflow(request);

      expect(result).toEqual(mockResponse);
    });

    it('executes workflow', async () => {
      const mockResponse = {
        success: true,
        data: {
          id: 'exec_1',
          workflowId: 'wf_1',
          publisherId: 'pub_1',
          triggeredBy: 'api' as const,
          status: 'running' as const,
          currentNodeIds: ['start'],
          completedNodeIds: [],
          variables: {},
          startedAt: '2024-01-01T00:00:00Z',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.executeWorkflow('wf_1', { input: 'test' });

      expect(result).toEqual(mockResponse);
    });

    it('lists workflow executions', async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            id: 'exec_1',
            workflowId: 'wf_1',
            publisherId: 'pub_1',
            triggeredBy: 'api' as const,
            status: 'completed' as const,
            currentNodeIds: [],
            completedNodeIds: ['start'],
            variables: {},
            startedAt: '2024-01-01T00:00:00Z',
            completedAt: '2024-01-01T00:00:01Z',
          },
        ],
        pagination: { limit: 20, hasMore: false },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.listWorkflowExecutions('wf_1');

      expect(result).toEqual(mockResponse);
    });
  });

  describe('OAuth (v2)', () => {
    let client: FerniClient;

    beforeEach(() => {
      client = new FerniClient({ apiKey: 'ferni_test_abc123' });
    });

    const mockProvider = {
      id: 'oauth_1',
      publisherId: 'pub_1',
      name: 'GitHub',
      authorizationUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      clientId: 'client_123',
      scopes: ['read:user', 'repo'],
      enabled: true,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    it('lists OAuth providers', async () => {
      const mockResponse = {
        success: true,
        data: [mockProvider],
        pagination: { limit: 20, hasMore: false },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.listOAuthProviders();

      expect(result).toEqual(mockResponse);
    });

    it('creates OAuth provider', async () => {
      const request = {
        name: 'GitHub',
        authorizationUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        clientId: 'client_123',
        clientSecret: 'secret_456',
        scopes: ['read:user', 'repo'],
      };

      const mockResponse = {
        success: true,
        data: mockProvider,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.createOAuthProvider(request);

      expect(result).toEqual(mockResponse);
    });

    it('starts OAuth authorization', async () => {
      const mockResponse = {
        success: true,
        data: {
          authorizationUrl: 'https://github.com/login/oauth/authorize?client_id=...',
          state: 'state_xyz',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.authorizeOAuth('oauth_1', 'https://myapp.com/callback');

      expect(result).toEqual(mockResponse);
    });

    it('lists OAuth tokens', async () => {
      const mockResponse = {
        success: true,
        data: [
          {
            id: 'token_1',
            publisherId: 'pub_1',
            providerId: 'oauth_1',
            scopes: ['read:user'],
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        ],
        pagination: { limit: 20, hasMore: false },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.listOAuthTokens();

      expect(result).toEqual(mockResponse);
    });

    it('gets OAuth access token', async () => {
      const mockResponse = {
        success: true,
        data: {
          accessToken: 'gho_xyz123',
          expiresAt: '2024-01-02T00:00:00Z',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.getOAuthAccessToken('token_1');

      expect(result).toEqual(mockResponse);
    });

    it('revokes OAuth token', async () => {
      const mockResponse = {
        success: true,
        data: { revoked: true },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.revokeOAuthToken('token_1');

      expect(result).toEqual(mockResponse);
    });
  });
});
