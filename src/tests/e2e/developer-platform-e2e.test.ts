/**
 * Developer Platform E2E Tests
 *
 * Tests the full developer platform v2 API flow:
 * - MCP server registration
 * - Custom tools
 * - Webhooks
 * - Activities
 * - Workflows
 * - OAuth
 *
 * @module tests/e2e/developer-platform-e2e
 */

import { describe, it, expect, beforeAll } from 'vitest';

// Test the workflow engine internals
import { interpolate, evaluateCondition } from '../../services/workflow-engine.js';

describe('Developer Platform E2E', () => {
  describe('Workflow Engine - Variable Interpolation', () => {
    it('should interpolate simple variables', () => {
      const template = 'Hello, {{name}}!';
      const variables = { name: 'World' };
      expect(interpolate(template, variables)).toBe('Hello, World!');
    });

    it('should interpolate nested variables', () => {
      const template = 'User: {{user.name}}, Email: {{user.email}}';
      const variables = {
        user: {
          name: 'Alice',
          email: 'alice@example.com',
        },
      };
      expect(interpolate(template, variables)).toBe('User: Alice, Email: alice@example.com');
    });

    it('should handle missing variables gracefully', () => {
      const template = 'Hello, {{missing}}!';
      const variables = {};
      expect(interpolate(template, variables)).toBe('Hello, !');
    });

    it('should apply json filter', () => {
      const template = 'Data: {{data | json}}';
      const variables = { data: { foo: 'bar' } };
      expect(interpolate(template, variables)).toBe('Data: {"foo":"bar"}');
    });

    it('should apply uppercase filter', () => {
      const template = '{{name | uppercase}}';
      const variables = { name: 'hello' };
      expect(interpolate(template, variables)).toBe('HELLO');
    });

    it('should apply first filter to array', () => {
      const template = 'First: {{items | first}}';
      const variables = { items: ['a', 'b', 'c'] };
      expect(interpolate(template, variables)).toBe('First: a');
    });

    it('should apply length filter', () => {
      const template = 'Count: {{items | length}}';
      const variables = { items: ['a', 'b', 'c'] };
      expect(interpolate(template, variables)).toBe('Count: 3');
    });
  });

  describe('Workflow Engine - Condition Evaluation', () => {
    it('should evaluate literal true', () => {
      expect(evaluateCondition('true', {})).toBe(true);
    });

    it('should evaluate literal false', () => {
      expect(evaluateCondition('false', {})).toBe(false);
    });

    it('should evaluate equality', () => {
      const variables = { status: 'active' };
      expect(evaluateCondition("status === 'active'", variables)).toBe(true);
      expect(evaluateCondition("status === 'inactive'", variables)).toBe(false);
    });

    it('should evaluate inequality', () => {
      const variables = { count: 5 };
      expect(evaluateCondition('count !== 0', variables)).toBe(true);
      expect(evaluateCondition('count !== 5', variables)).toBe(false);
    });

    it('should evaluate greater than', () => {
      const variables = { score: 85 };
      expect(evaluateCondition('score > 80', variables)).toBe(true);
      expect(evaluateCondition('score > 90', variables)).toBe(false);
    });

    it('should evaluate less than', () => {
      const variables = { score: 85 };
      expect(evaluateCondition('score < 90', variables)).toBe(true);
      expect(evaluateCondition('score < 80', variables)).toBe(false);
    });

    it('should evaluate nested property access', () => {
      const variables = {
        result: {
          events: ['a', 'b', 'c'],
        },
      };
      expect(evaluateCondition('result.events.length > 0', variables)).toBe(true);
    });

    it('should handle truthy check', () => {
      const variables = { enabled: true, disabled: false, value: 42 };
      expect(evaluateCondition('enabled', variables)).toBe(true);
      expect(evaluateCondition('disabled', variables)).toBe(false);
      expect(evaluateCondition('value', variables)).toBe(true);
    });
  });

  describe('Webhook Signature Generation', () => {
    it('should generate valid HMAC signature', async () => {
      const { signPayload, verifySignature } =
        await import('../../services/integrations/developer-webhook-dispatcher.js');

      const secret = 'test-secret-123';
      const payload = {
        id: 'evt_test',
        type: 'session.started',
        timestamp: '2026-01-11T10:00:00Z',
        publisherId: 'pub_123',
        data: { sessionId: 'sess_456' },
      };

      const signature = signPayload(secret, payload as any);

      // Signature format: t={timestamp},v1={hash}
      expect(signature).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);

      // Should verify correctly
      const body = JSON.stringify(payload);
      expect(verifySignature(signature, secret, body, 300)).toBe(true);
    });

    it('should reject invalid signature', async () => {
      const { verifySignature } = await import('../../services/integrations/developer-webhook-dispatcher.js');

      const signature = 't=1704985200,v1=invalid';
      const body = '{}';
      const secret = 'test-secret';

      expect(verifySignature(signature, secret, body, 300)).toBe(false);
    });

    it('should reject expired timestamp', async () => {
      const { verifySignature } = await import('../../services/integrations/developer-webhook-dispatcher.js');

      // Timestamp from 2024 (way too old)
      const oldTimestamp = 1704985200;
      const signature = `t=${oldTimestamp},v1=abcdef`;
      const body = '{}';
      const secret = 'test-secret';

      expect(verifySignature(signature, secret, body, 300)).toBe(false);
    });
  });

  describe('Type Definitions', () => {
    it('should have correct collection names', async () => {
      const { COLLECTIONS } = await import('../../types/developer-platform.js');

      expect(COLLECTIONS.MCP_SERVERS).toBe('developer_mcp_servers');
      expect(COLLECTIONS.TOOLS).toBe('developer_tools');
      expect(COLLECTIONS.WEBHOOKS).toBe('developer_webhooks');
      expect(COLLECTIONS.WEBHOOK_LOGS).toBe('developer_webhook_logs');
      expect(COLLECTIONS.ACTIVITIES).toBe('developer_activities');
      expect(COLLECTIONS.WORKFLOWS).toBe('developer_workflows');
      expect(COLLECTIONS.WORKFLOW_EXECUTIONS).toBe('workflow_executions');
      expect(COLLECTIONS.OAUTH_PROVIDERS).toBe('developer_oauth_providers');
      expect(COLLECTIONS.OAUTH_TOKENS).toBe('developer_oauth_tokens');
    });

    it('should have correct ID prefixes', async () => {
      const { ID_PREFIXES } = await import('../../types/developer-platform.js');

      expect(ID_PREFIXES.MCP_SERVER).toBe('mcp_');
      expect(ID_PREFIXES.TOOL).toBe('tool_');
      expect(ID_PREFIXES.WEBHOOK).toBe('wh_');
      expect(ID_PREFIXES.ACTIVITY).toBe('act_');
      expect(ID_PREFIXES.WORKFLOW).toBe('wf_');
      expect(ID_PREFIXES.EXECUTION).toBe('exec_');
      expect(ID_PREFIXES.OAUTH_PROVIDER).toBe('oauth_');
      expect(ID_PREFIXES.OAUTH_TOKEN).toBe('token_');
    });
  });
});

// ============================================================================
// API Route Tests (requires running server)
// ============================================================================

describe.skip('Developer Platform API Routes (requires server)', () => {
  const BASE_URL = 'http://localhost:3002/api/v2/developers';
  const API_KEY = process.env.TEST_PUBLISHER_API_KEY || 'pk_test_xxx';

  const headers = {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  };

  describe('MCP Servers API', () => {
    it('should list MCP servers', async () => {
      const response = await fetch(`${BASE_URL}/mcp-servers`, { headers });
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  describe('Tools API', () => {
    it('should list tools', async () => {
      const response = await fetch(`${BASE_URL}/tools`, { headers });
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  describe('Webhooks API', () => {
    it('should list webhooks', async () => {
      const response = await fetch(`${BASE_URL}/webhooks`, { headers });
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  describe('Activities API', () => {
    it('should list activities', async () => {
      const response = await fetch(`${BASE_URL}/activities`, { headers });
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  describe('Workflows API', () => {
    it('should list workflows', async () => {
      const response = await fetch(`${BASE_URL}/workflows`, { headers });
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });
  });
});
