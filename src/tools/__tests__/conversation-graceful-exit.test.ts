/**
 * Conversation Tools - gracefulExit integration test
 *
 * Ensures the gracefulExit tool properly signals the frontend when
 * an agent needs to end a conversation due to discomfort or boundary violations.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock sendFrontendSignal before importing the module under test
const mockSendFrontendSignal = vi.fn(async () => true);

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config: { execute: unknown }) => config),
  },
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../services/frontend-signal.js', () => ({
  sendFrontendSignal: mockSendFrontendSignal,
}));

vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { createConversationTools } from '../domains/conversation/conversation-tools.js';

describe('conversation-tools gracefulExit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should signal frontend with agent_exit reason and exit type', async () => {
    const tools = createConversationTools();

    const result = await tools.gracefulExit.execute(
      { reason: 'harassment', briefNote: 'User was using slurs' },
      // @ts-expect-error - Partial context for testing
      { ctx: { userData: {} } }
    );

    // Verify the frontend signal was sent with correct parameters
    expect(mockSendFrontendSignal).toHaveBeenCalledWith('conversation_end', {
      reason: 'agent_exit',
      exitType: 'harassment',
      disconnectDelay: 1500,
      timestamp: expect.any(Number),
    });

    // Verify the return value is an internal message
    expect(result).toContain('[INTERNAL:');
    expect(result).toContain('Graceful exit initiated');
  });

  it('should handle uncomfortable reason', async () => {
    const tools = createConversationTools();

    await tools.gracefulExit.execute(
      { reason: 'uncomfortable' },
      // @ts-expect-error - Partial context for testing
      { ctx: { userData: {} } }
    );

    expect(mockSendFrontendSignal).toHaveBeenCalledWith(
      'conversation_end',
      expect.objectContaining({
        reason: 'agent_exit',
        exitType: 'uncomfortable',
      })
    );
  });

  it('should handle boundary_crossed reason', async () => {
    const tools = createConversationTools();

    await tools.gracefulExit.execute(
      { reason: 'boundary_crossed', briefNote: 'Kept pushing despite redirects' },
      // @ts-expect-error - Partial context for testing
      { ctx: { userData: {} } }
    );

    expect(mockSendFrontendSignal).toHaveBeenCalledWith(
      'conversation_end',
      expect.objectContaining({
        reason: 'agent_exit',
        exitType: 'boundary_crossed',
      })
    );
  });

  it('should handle inappropriate_content reason', async () => {
    const tools = createConversationTools();

    await tools.gracefulExit.execute(
      { reason: 'inappropriate_content' },
      // @ts-expect-error - Partial context for testing
      { ctx: { userData: {} } }
    );

    expect(mockSendFrontendSignal).toHaveBeenCalledWith(
      'conversation_end',
      expect.objectContaining({
        reason: 'agent_exit',
        exitType: 'inappropriate_content',
      })
    );
  });

  it('should handle safety_concern reason', async () => {
    const tools = createConversationTools();

    await tools.gracefulExit.execute(
      { reason: 'safety_concern', briefNote: 'Something felt off' },
      // @ts-expect-error - Partial context for testing
      { ctx: { userData: {} } }
    );

    expect(mockSendFrontendSignal).toHaveBeenCalledWith(
      'conversation_end',
      expect.objectContaining({
        reason: 'agent_exit',
        exitType: 'safety_concern',
      })
    );
  });

  it('should handle unproductive reason', async () => {
    const tools = createConversationTools();

    await tools.gracefulExit.execute(
      { reason: 'unproductive' },
      // @ts-expect-error - Partial context for testing
      { ctx: { userData: {} } }
    );

    expect(mockSendFrontendSignal).toHaveBeenCalledWith(
      'conversation_end',
      expect.objectContaining({
        reason: 'agent_exit',
        exitType: 'unproductive',
      })
    );
  });

  it('should continue gracefully if frontend signal fails', async () => {
    mockSendFrontendSignal.mockRejectedValueOnce(new Error('Network error'));

    const tools = createConversationTools();

    // Should not throw - graceful degradation
    const result = await tools.gracefulExit.execute(
      { reason: 'uncomfortable' },
      // @ts-expect-error - Partial context for testing
      { ctx: { userData: {} } }
    );

    // Still returns internal message even if signal failed
    expect(result).toContain('[INTERNAL:');
    expect(result).toContain('Graceful exit initiated');
  });

  it('should work without optional briefNote', async () => {
    const tools = createConversationTools();

    const result = await tools.gracefulExit.execute(
      { reason: 'harassment' },
      // @ts-expect-error - Partial context for testing
      { ctx: { userData: {} } }
    );

    expect(mockSendFrontendSignal).toHaveBeenCalled();
    expect(result).toContain('[INTERNAL:');
  });
});
