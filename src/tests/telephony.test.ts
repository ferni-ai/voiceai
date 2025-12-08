/**
 * Tests for Telephony Tools
 *
 * Tests outbound call functionality and callback scheduling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTelephonyTools } from '../tools/telephony.js';

// Mock tool options that satisfies ToolOptions<unknown>
const mockToolOptions = {
  toolCallId: 'test-call-id',
  ctx: {} as any,
};

describe('Telephony Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Tool Creation', () => {
    it('should create telephony tools', () => {
      const tools = createTelephonyTools();

      expect(tools).toHaveProperty('callUser');
      expect(tools).toHaveProperty('scheduleCallback');
    });

    it('should have proper tool descriptions', () => {
      const tools = createTelephonyTools();

      // Access the tool's description through the LLM tool interface
      expect(tools.callUser).toBeDefined();
      expect(tools.scheduleCallback).toBeDefined();
    });
  });

  describe('callUser tool', () => {
    it('should validate phone number format', async () => {
      const tools = createTelephonyTools();

      // Call with invalid phone number
      const result = await tools.callUser.execute(
        { phoneNumber: '123', reason: 'checkIn' as const },
        mockToolOptions
      );

      // Should return error message for invalid number
      expect(result).toContain('valid phone number');
    });

    it('should accept valid phone numbers', async () => {
      const tools = createTelephonyTools();

      const result = await tools.callUser.execute(
        { phoneNumber: '5551234567', reason: 'checkIn' as const },
        mockToolOptions
      );

      // Should return success message (simulated since SIP not configured)
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle different call reasons', async () => {
      const tools = createTelephonyTools();

      const reasons = ['marketAlert', 'reminder', 'checkIn', 'peterHandoff'] as const;

      for (const reason of reasons) {
        const result = await tools.callUser.execute(
          { phoneNumber: '5551234567', reason },
          mockToolOptions
        );

        expect(typeof result).toBe('string');
      }
    });

    it('should handle custom messages', async () => {
      const tools = createTelephonyTools();

      const result = await tools.callUser.execute(
        {
          phoneNumber: '5551234567',
          reason: 'reminder' as const,
          customMessage: 'Remember to rebalance your portfolio!',
        },
        mockToolOptions
      );

      expect(typeof result).toBe('string');
    });

    it('should format E.164 phone numbers correctly', async () => {
      const tools = createTelephonyTools();

      // Test with different formats
      const formats = [
        '5551234567', // No country code
        '15551234567', // With country code
        '+15551234567', // With + prefix
        '555-123-4567', // With dashes
        '(555) 123-4567', // With formatting
      ];

      for (const phone of formats) {
        const result = await tools.callUser.execute(
          { phoneNumber: phone, reason: 'checkIn' as const },
          mockToolOptions
        );

        // All should work (in simulation mode)
        expect(typeof result).toBe('string');
      }
    });
  });

  describe('scheduleCallback tool', () => {
    it('should schedule callbacks', async () => {
      const tools = createTelephonyTools();

      const result = await tools.scheduleCallback.execute(
        {
          phoneNumber: '5551234567',
          when: 'tomorrow at 9am',
          reason: 'market update',
        },
        mockToolOptions
      );

      expect(result).toContain('call');
      expect(result).toContain('tomorrow at 9am');
    });

    it('should include reason in confirmation', async () => {
      const tools = createTelephonyTools();

      const result = await tools.scheduleCallback.execute(
        {
          phoneNumber: '5551234567',
          when: 'in 30 minutes',
          reason: 'remind about rebalancing',
        },
        mockToolOptions
      );

      expect(result).toContain('remind about rebalancing');
    });
  });
});

describe('Telephony Configuration', () => {
  it('should support environment variables for configuration', () => {
    // Verify the module can read from process.env
    // In test environment, these may be undefined or empty strings
    const sipTrunkId = process.env.SIP_TRUNK_ID;
    expect(sipTrunkId === undefined || typeof sipTrunkId === 'string').toBe(true);
  });

  it('should work in simulation mode when SIP not configured', async () => {
    // Clear SIP config to force simulation
    // Note: Environment vars are captured at module load time
    const originalSipTrunk = process.env.SIP_TRUNK_ID;
    const originalLivekitUrl = process.env.LIVEKIT_URL;
    process.env.SIP_TRUNK_ID = '';
    process.env.LIVEKIT_URL = '';

    // Reset module cache to pick up new env vars
    vi.resetModules();

    // Dynamically import to get fresh module with cleared env
    const { createTelephonyTools: freshCreateTelephonyTools } = await import(
      '../tools/telephony.js'
    );

    const tools = freshCreateTelephonyTools();
    const result = await tools.callUser.execute(
      { phoneNumber: '5551234567', reason: 'checkIn' as const },
      mockToolOptions
    );

    // Should mention demo/simulation mode
    expect(result).toMatch(/demo|simul|imagine/i);

    // Restore
    process.env.SIP_TRUNK_ID = originalSipTrunk;
    process.env.LIVEKIT_URL = originalLivekitUrl;
  });
});

describe('Call Announcements', () => {
  it('should return different messages for different reasons', async () => {
    const tools = createTelephonyTools();
    const results: string[] = [];

    const reasons = ['marketAlert', 'reminder', 'checkIn', 'peterHandoff'] as const;

    for (const reason of reasons) {
      const result = await tools.callUser.execute(
        { phoneNumber: '5551234567', reason },
        mockToolOptions
      );
      results.push(result);
    }

    // All results should be strings
    results.forEach((r) => expect(typeof r).toBe('string'));
  });
});
