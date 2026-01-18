/**
 * Action Visibility Tests
 *
 * Tests for the UI and voice integration of autonomous actions:
 * - Action event dispatcher
 * - Action approval handler
 * - Frontend publisher PendingActionMessage
 *
 * Run: pnpm vitest run src/tests/agi-features/action-visibility.test.ts
 *
 * @module tests/agi-features/action-visibility
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { generateTestUserId, createMockFirestoreDb, createMockActionPreview } from './index.js';

// ============================================================================
// MOCKS
// ============================================================================

const mockFirestoreDb = createMockFirestoreDb();
vi.mock('../../utils/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => mockFirestoreDb),
}));

// Mock the frontend publisher
const mockSendPendingAction = vi.fn().mockResolvedValue(true);
const mockSendActionResolved = vi.fn().mockResolvedValue(true);
const mockIsConnected = vi.fn().mockReturnValue(true);
const mockSendData = vi.fn().mockResolvedValue(true);

vi.mock('../../agents/realtime/frontend-publisher.js', () => ({
  getFrontendPublisher: vi.fn(() => ({
    isConnected: mockIsConnected,
    sendPendingAction: mockSendPendingAction,
    sendActionResolved: mockSendActionResolved,
    sendData: mockSendData,
  })),
}));

// Mock the generate reply gateway
const mockGenerateReply = vi.fn().mockResolvedValue(undefined);
vi.mock('../../agents/shared/generate-reply-gateway.js', () => ({
  generateReply: mockGenerateReply,
}));

// Import after mocking
import {
  detectConfirmationIntent,
  handleActionApprovalIntent,
  hasPendingActions,
} from '../../agents/shared/action-approval-handler.js';

import {
  dispatchPendingAction,
  dispatchActionApproved,
  dispatchActionRejected,
  generateConfirmationPrompt,
  generateConfirmationResponse,
  generateRejectionResponse,
  initActionDispatcher,
  clearActionDispatcher,
  clearAllActionDispatchers,
} from '../../agents/realtime/action-event-dispatcher.js';

import {
  createPendingAction,
  getPendingActions,
  resolvePendingAction,
  actionEvents,
  type PendingAction,
} from '../../services/automation/trust-level-system.js';

// ============================================================================
// TEST SETUP
// ============================================================================

describe('Action Visibility System', () => {
  let testUserId: string;

  beforeEach(() => {
    testUserId = generateTestUserId('action_vis');
    mockFirestoreDb._clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearAllActionDispatchers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Action Approval Handler Tests
  // ==========================================================================

  describe('Action Approval Handler', () => {
    describe('detectConfirmationIntent', () => {
      it('should detect confirmation intent for "yes"', () => {
        expect(detectConfirmationIntent('yes')).toBe('confirm');
      });

      it('should detect confirmation intent for "yeah"', () => {
        expect(detectConfirmationIntent('yeah')).toBe('confirm');
      });

      it('should detect confirmation intent for "do it"', () => {
        expect(detectConfirmationIntent('do it')).toBe('confirm');
      });

      it('should detect confirmation intent for "go ahead"', () => {
        expect(detectConfirmationIntent('go ahead')).toBe('confirm');
      });

      it('should detect confirmation intent for "send it"', () => {
        expect(detectConfirmationIntent('send it')).toBe('confirm');
      });

      it('should detect confirmation intent for "sounds good"', () => {
        expect(detectConfirmationIntent('sounds good')).toBe('confirm');
      });

      it('should detect denial intent for "no"', () => {
        expect(detectConfirmationIntent('no')).toBe('deny');
      });

      it('should detect denial intent for "not now"', () => {
        expect(detectConfirmationIntent('not now')).toBe('deny');
      });

      it('should detect denial intent for "never mind"', () => {
        expect(detectConfirmationIntent('never mind')).toBe('deny');
      });

      it('should detect denial intent for "cancel"', () => {
        expect(detectConfirmationIntent('cancel')).toBe('deny');
      });

      it('should return unclear for long sentences', () => {
        expect(detectConfirmationIntent('I need to think about this for a while')).toBe('unclear');
      });

      it('should return unclear for unrelated content', () => {
        expect(detectConfirmationIntent('tell me about the weather')).toBe('unclear');
      });
    });

    describe('handleActionApprovalIntent', () => {
      it('should return handled=false for long input', async () => {
        const result = await handleActionApprovalIntent(
          testUserId,
          'I need to think about this request for a while before deciding'
        );
        expect(result.handled).toBe(false);
      });

      it('should return handled=false when no pending actions', async () => {
        const result = await handleActionApprovalIntent(testUserId, 'yes');
        expect(result.handled).toBe(false);
      });

      it('should return handled=false for unclear intent', async () => {
        const result = await handleActionApprovalIntent(testUserId, 'maybe');
        expect(result.handled).toBe(false);
      });
    });

    describe('hasPendingActions', () => {
      it('should return false for user with no pending actions', async () => {
        const result = await hasPendingActions(testUserId);
        expect(result).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Action Event Dispatcher Tests
  // ==========================================================================

  describe('Action Event Dispatcher', () => {
    describe('generateConfirmationPrompt', () => {
      it('should generate SMS prompt', () => {
        const action: PendingAction = {
          id: 'test_1',
          userId: testUserId,
          actionType: 'send_sms',
          category: 'messaging',
          description: 'Send SMS',
          preview: {
            title: 'Send SMS to Mom',
            summary: 'Happy Birthday!',
            details: [],
            canUndo: false,
            affectedParties: ['Mom'],
          },
          status: 'pending',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          metadata: {},
        };

        const prompt = generateConfirmationPrompt(action);
        expect(prompt).toContain('text');
        expect(prompt).toContain('Mom');
        expect(prompt).toContain('Happy Birthday!');
      });

      it('should generate calendar prompt', () => {
        const action: PendingAction = {
          id: 'test_2',
          userId: testUserId,
          actionType: 'create_event',
          category: 'calendar',
          description: 'Create event',
          preview: {
            title: 'Team Standup',
            summary: 'Daily meeting at 9am',
            details: [],
            canUndo: true,
          },
          status: 'pending',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          metadata: {},
        };

        const prompt = generateConfirmationPrompt(action);
        expect(prompt).toContain('Team Standup');
        expect(prompt).toContain('calendar');
      });

      it('should generate booking prompt', () => {
        const action: PendingAction = {
          id: 'test_3',
          userId: testUserId,
          actionType: 'book_restaurant',
          category: 'booking',
          description: 'Book restaurant',
          preview: {
            title: 'Table at Italian Place',
            summary: '7pm for 4 people',
            details: [],
            canUndo: true,
          },
          status: 'pending',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          metadata: {},
        };

        const prompt = generateConfirmationPrompt(action);
        expect(prompt).toContain('book');
        expect(prompt).toContain('Italian Place');
      });
    });

    describe('generateConfirmationResponse', () => {
      it('should return "Sent!" for send_sms', () => {
        expect(generateConfirmationResponse('send_sms', 'messaging')).toBe('Sent!');
      });

      it('should return "Email\'s on its way." for send_email', () => {
        expect(generateConfirmationResponse('send_email', 'messaging')).toBe("Email's on its way.");
      });

      it('should return "It\'s on your calendar." for create_event', () => {
        expect(generateConfirmationResponse('create_event', 'calendar')).toBe("It's on your calendar.");
      });

      it('should return "You\'re all set!" for book_restaurant', () => {
        expect(generateConfirmationResponse('book_restaurant', 'booking')).toBe("You're all set!");
      });

      it('should return "Done!" for unknown action', () => {
        expect(generateConfirmationResponse('unknown', 'task')).toBe('Done!');
      });
    });

    describe('generateRejectionResponse', () => {
      it('should return one of the rejection phrases', () => {
        const response = generateRejectionResponse();
        const validResponses = [
          "Got it, I won't do that.",
          'No problem.',
          'Okay, never mind.',
          'Understood.',
        ];
        expect(validResponses).toContain(response);
      });
    });

    describe('dispatchPendingAction', () => {
      it('should send to UI when publisher is connected', async () => {
        const action: PendingAction = {
          id: 'test_dispatch_1',
          userId: testUserId,
          actionType: 'send_sms',
          category: 'messaging',
          description: 'Send SMS',
          preview: createMockActionPreview({ title: 'Test SMS' }),
          status: 'pending',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          metadata: {},
        };

        const result = await dispatchPendingAction(action, { skipVoice: true });
        
        expect(result.sentToUI).toBe(true);
        expect(mockSendPendingAction).toHaveBeenCalledWith(action);
      });

      it('should skip UI when publisher is not connected', async () => {
        mockIsConnected.mockReturnValue(false);

        const action: PendingAction = {
          id: 'test_dispatch_2',
          userId: testUserId,
          actionType: 'send_sms',
          category: 'messaging',
          description: 'Send SMS',
          preview: createMockActionPreview(),
          status: 'pending',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          metadata: {},
        };

        const result = await dispatchPendingAction(action, { skipVoice: true });
        
        expect(result.sentToUI).toBe(false);
      });

      it('should skip UI when skipUI option is true', async () => {
        const action: PendingAction = {
          id: 'test_dispatch_3',
          userId: testUserId,
          actionType: 'send_sms',
          category: 'messaging',
          description: 'Send SMS',
          preview: createMockActionPreview(),
          status: 'pending',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          metadata: {},
        };

        const result = await dispatchPendingAction(action, { skipUI: true, skipVoice: true });
        
        expect(result.sentToUI).toBe(false);
        expect(mockSendPendingAction).not.toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // Trust Level System Event Tests
  // ==========================================================================

  describe('Trust Level System Events', () => {
    it('should emit action_created event when pending action is created', async () => {
      const eventHandler = vi.fn();
      actionEvents.on('action_created', eventHandler);

      const preview = createMockActionPreview({ title: 'Test Action' });
      await createPendingAction(testUserId, 'send_sms', preview);

      expect(eventHandler).toHaveBeenCalled();
      expect(eventHandler.mock.calls[0][0].action).toBeDefined();
      expect(eventHandler.mock.calls[0][0].action.actionType).toBe('send_sms');

      actionEvents.off('action_created', eventHandler);
    });
  });
});
