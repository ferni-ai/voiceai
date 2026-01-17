/**
 * Tests for webhook signature verification
 */

import { describe, it, expect, vi } from 'vitest';
import {
  parseSignatureHeader,
  computeSignature,
  verifyWebhookSignature,
  parseWebhookEvent,
  isEventType,
  createWebhookRouter,
} from '../webhooks.js';
import type { WebhookPayload } from '../types.js';

describe('Webhook utilities', () => {
  describe('parseSignatureHeader', () => {
    it('parses valid signature header', () => {
      const header = 't=1234567890,v1=abc123def456';
      const result = parseSignatureHeader(header);

      expect(result).toEqual({
        timestamp: 1234567890,
        signature: 'abc123def456',
      });
    });

    it('handles out-of-order parts', () => {
      const header = 'v1=abc123def456,t=1234567890';
      const result = parseSignatureHeader(header);

      expect(result).toEqual({
        timestamp: 1234567890,
        signature: 'abc123def456',
      });
    });

    it('returns null for missing timestamp', () => {
      const header = 'v1=abc123def456';
      const result = parseSignatureHeader(header);

      expect(result).toBeNull();
    });

    it('returns null for missing signature', () => {
      const header = 't=1234567890';
      const result = parseSignatureHeader(header);

      expect(result).toBeNull();
    });

    it('returns null for invalid format', () => {
      const header = 'invalid';
      const result = parseSignatureHeader(header);

      expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
      const header = '';
      const result = parseSignatureHeader(header);

      expect(result).toBeNull();
    });
  });

  describe('computeSignature', () => {
    it('computes HMAC-SHA256 signature', async () => {
      const secret = 'test_secret';
      const timestamp = 1234567890;
      const payload = '{"type":"session.started"}';

      const signature = await computeSignature(secret, timestamp, payload);

      expect(signature).toBeTruthy();
      expect(typeof signature).toBe('string');
      expect(signature).toMatch(/^[a-f0-9]{64}$/); // SHA-256 produces 64 hex chars
    });

    it('produces different signatures for different secrets', async () => {
      const timestamp = 1234567890;
      const payload = '{"type":"session.started"}';

      const sig1 = await computeSignature('secret1', timestamp, payload);
      const sig2 = await computeSignature('secret2', timestamp, payload);

      expect(sig1).not.toBe(sig2);
    });

    it('produces different signatures for different timestamps', async () => {
      const secret = 'test_secret';
      const payload = '{"type":"session.started"}';

      const sig1 = await computeSignature(secret, 1234567890, payload);
      const sig2 = await computeSignature(secret, 1234567891, payload);

      expect(sig1).not.toBe(sig2);
    });

    it('produces different signatures for different payloads', async () => {
      const secret = 'test_secret';
      const timestamp = 1234567890;

      const sig1 = await computeSignature(secret, timestamp, '{"type":"session.started"}');
      const sig2 = await computeSignature(secret, timestamp, '{"type":"session.ended"}');

      expect(sig1).not.toBe(sig2);
    });

    it('produces consistent signatures for same inputs', async () => {
      const secret = 'test_secret';
      const timestamp = 1234567890;
      const payload = '{"type":"session.started"}';

      const sig1 = await computeSignature(secret, timestamp, payload);
      const sig2 = await computeSignature(secret, timestamp, payload);

      expect(sig1).toBe(sig2);
    });
  });

  describe('verifyWebhookSignature', () => {
    const secret = 'test_secret';
    const payload = '{"type":"session.started","data":{}}';

    it('accepts valid signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await computeSignature(secret, timestamp, payload);
      const header = `t=${timestamp},v1=${signature}`;

      const isValid = await verifyWebhookSignature(payload, header, secret);

      expect(isValid).toBe(true);
    });

    it('rejects invalid signature', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const header = `t=${timestamp},v1=invalid_signature`;

      const isValid = await verifyWebhookSignature(payload, header, secret);

      expect(isValid).toBe(false);
    });

    it('rejects signature with wrong secret', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await computeSignature('wrong_secret', timestamp, payload);
      const header = `t=${timestamp},v1=${signature}`;

      const isValid = await verifyWebhookSignature(payload, header, secret);

      expect(isValid).toBe(false);
    });

    it('rejects expired signature (default 5 min tolerance)', async () => {
      const timestamp = Math.floor(Date.now() / 1000) - 400; // 6+ minutes ago
      const signature = await computeSignature(secret, timestamp, payload);
      const header = `t=${timestamp},v1=${signature}`;

      const isValid = await verifyWebhookSignature(payload, header, secret);

      expect(isValid).toBe(false);
    });

    it('accepts signature within custom tolerance', async () => {
      const timestamp = Math.floor(Date.now() / 1000) - 500; // 8+ minutes ago
      const signature = await computeSignature(secret, timestamp, payload);
      const header = `t=${timestamp},v1=${signature}`;

      const isValid = await verifyWebhookSignature(payload, header, secret, 600); // 10 min tolerance

      expect(isValid).toBe(true);
    });

    it('rejects signature from future (beyond tolerance)', async () => {
      const timestamp = Math.floor(Date.now() / 1000) + 400; // 6+ minutes in future
      const signature = await computeSignature(secret, timestamp, payload);
      const header = `t=${timestamp},v1=${signature}`;

      const isValid = await verifyWebhookSignature(payload, header, secret);

      expect(isValid).toBe(false);
    });

    it('rejects malformed header', async () => {
      const isValid = await verifyWebhookSignature(payload, 'invalid', secret);

      expect(isValid).toBe(false);
    });

    it('rejects signature with tampered payload', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await computeSignature(secret, timestamp, payload);
      const header = `t=${timestamp},v1=${signature}`;
      const tamperedPayload = '{"type":"session.ended","data":{}}';

      const isValid = await verifyWebhookSignature(tamperedPayload, header, secret);

      expect(isValid).toBe(false);
    });

    it('uses constant-time comparison', async () => {
      // Test that verification doesn't leak timing information
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await computeSignature(secret, timestamp, payload);
      const header = `t=${timestamp},v1=${signature}`;

      // These should take roughly the same time
      const invalidSig = '0'.repeat(64);
      const invalidHeader = `t=${timestamp},v1=${invalidSig}`;

      const start1 = performance.now();
      await verifyWebhookSignature(payload, header, secret);
      const time1 = performance.now() - start1;

      const start2 = performance.now();
      await verifyWebhookSignature(payload, invalidHeader, secret);
      const time2 = performance.now() - start2;

      // Allow some variance, but they should be similar
      expect(Math.abs(time1 - time2)).toBeLessThan(10);
    });
  });

  describe('parseWebhookEvent', () => {
    const secret = 'test_secret';

    it('parses valid webhook event', async () => {
      const payload: WebhookPayload = {
        id: 'evt_123',
        type: 'session.started',
        timestamp: '2024-01-01T00:00:00Z',
        publisherId: 'pub_123',
        data: { sessionId: 'sess_123' },
      };

      const payloadStr = JSON.stringify(payload);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = await computeSignature(secret, timestamp, payloadStr);
      const header = `t=${timestamp},v1=${signature}`;

      const event = await parseWebhookEvent(payloadStr, header, secret);

      expect(event).toEqual(payload);
    });

    it('throws error for invalid signature', async () => {
      const payload = '{"type":"session.started"}';
      const header = 't=1234567890,v1=invalid';

      await expect(parseWebhookEvent(payload, header, secret)).rejects.toThrow(
        'Invalid webhook signature'
      );
    });

    it('throws error for expired signature', async () => {
      const payload = '{"type":"session.started"}';
      const timestamp = Math.floor(Date.now() / 1000) - 400;
      const signature = await computeSignature(secret, timestamp, payload);
      const header = `t=${timestamp},v1=${signature}`;

      await expect(parseWebhookEvent(payload, header, secret)).rejects.toThrow(
        'Invalid webhook signature'
      );
    });

    it('parses all event types', async () => {
      const eventTypes: Array<WebhookPayload['type']> = [
        'session.started',
        'session.ended',
        'session.error',
        'persona.switched',
        'tool.executed',
        'transcript.ready',
      ];

      for (const type of eventTypes) {
        const payload: WebhookPayload = {
          id: 'evt_123',
          type,
          timestamp: '2024-01-01T00:00:00Z',
          publisherId: 'pub_123',
          data: {},
        };

        const payloadStr = JSON.stringify(payload);
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = await computeSignature(secret, timestamp, payloadStr);
        const header = `t=${timestamp},v1=${signature}`;

        const event = await parseWebhookEvent(payloadStr, header, secret);

        expect(event.type).toBe(type);
      }
    });
  });

  describe('isEventType', () => {
    it('returns true for matching event type', () => {
      const event: WebhookPayload = {
        id: 'evt_123',
        type: 'session.started',
        timestamp: '2024-01-01T00:00:00Z',
        publisherId: 'pub_123',
        data: {},
      };

      expect(isEventType(event, 'session.started')).toBe(true);
    });

    it('returns false for non-matching event type', () => {
      const event: WebhookPayload = {
        id: 'evt_123',
        type: 'session.started',
        timestamp: '2024-01-01T00:00:00Z',
        publisherId: 'pub_123',
        data: {},
      };

      expect(isEventType(event, 'session.ended')).toBe(false);
    });

    it('narrows type correctly', () => {
      const event: WebhookPayload = {
        id: 'evt_123',
        type: 'session.started',
        timestamp: '2024-01-01T00:00:00Z',
        publisherId: 'pub_123',
        data: {},
      };

      if (isEventType(event, 'session.started')) {
        // TypeScript should know event.type is 'session.started'
        const type: 'session.started' = event.type;
        expect(type).toBe('session.started');
      }
    });
  });

  describe('createWebhookRouter', () => {
    it('routes events to correct handlers', async () => {
      const startedHandler = vi.fn();
      const endedHandler = vi.fn();

      const router = createWebhookRouter({
        'session.started': startedHandler,
        'session.ended': endedHandler,
      });

      const startedEvent: WebhookPayload = {
        id: 'evt_1',
        type: 'session.started',
        timestamp: '2024-01-01T00:00:00Z',
        publisherId: 'pub_123',
        data: { sessionId: 'sess_123' },
      };

      await router(startedEvent);

      expect(startedHandler).toHaveBeenCalledWith(startedEvent);
      expect(endedHandler).not.toHaveBeenCalled();
    });

    it('handles async handlers', async () => {
      const handler = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      const router = createWebhookRouter({
        'session.started': handler,
      });

      const event: WebhookPayload = {
        id: 'evt_1',
        type: 'session.started',
        timestamp: '2024-01-01T00:00:00Z',
        publisherId: 'pub_123',
        data: {},
      };

      await router(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('does nothing for unhandled events', async () => {
      const handler = vi.fn();

      const router = createWebhookRouter({
        'session.started': handler,
      });

      const event: WebhookPayload = {
        id: 'evt_1',
        type: 'session.ended',
        timestamp: '2024-01-01T00:00:00Z',
        publisherId: 'pub_123',
        data: {},
      };

      await router(event);

      expect(handler).not.toHaveBeenCalled();
    });

    it('handles all event types', async () => {
      const handlers = {
        'session.started': vi.fn(),
        'session.ended': vi.fn(),
        'session.error': vi.fn(),
        'persona.switched': vi.fn(),
        'tool.executed': vi.fn(),
        'transcript.ready': vi.fn(),
      };

      const router = createWebhookRouter(handlers);

      for (const [type, handler] of Object.entries(handlers)) {
        const event: WebhookPayload = {
          id: 'evt_1',
          type: type as WebhookPayload['type'],
          timestamp: '2024-01-01T00:00:00Z',
          publisherId: 'pub_123',
          data: {},
        };

        await router(event);

        expect(handler).toHaveBeenCalledWith(event);
        expect(handler).toHaveBeenCalledTimes(1);
      }
    });

    it('provides type-safe event data to handlers', async () => {
      const router = createWebhookRouter({
        'session.started': async (event) => {
          // TypeScript should know event.type is 'session.started'
          expect(event.type).toBe('session.started');
          expect(event.data).toBeDefined();
        },
        'transcript.ready': async (event) => {
          // TypeScript should know event.type is 'transcript.ready'
          expect(event.type).toBe('transcript.ready');
          expect(event.data).toBeDefined();
        },
      });

      const startedEvent: WebhookPayload = {
        id: 'evt_1',
        type: 'session.started',
        timestamp: '2024-01-01T00:00:00Z',
        publisherId: 'pub_123',
        data: { sessionId: 'sess_123' },
      };

      await router(startedEvent);
    });
  });
});
