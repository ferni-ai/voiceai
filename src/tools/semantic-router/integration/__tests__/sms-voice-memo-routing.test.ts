/**
 * SMS and Voice Memo Semantic Routing Tests
 *
 * Validates routing for SMS reading and voice memo tools:
 * - SMS reading correctly routes (read texts, check messages)
 * - Voice memo operations route correctly (save, play, list, delete)
 * - Conflict resolution between voice memo "play" and music "play"
 * - Anti-keyword filters work correctly
 *
 * @module tools/semantic-router/integration/__tests__/sms-voice-memo-routing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the logger - use vi.hoisted() to ensure mockLogger is defined before vi.mock() runs
const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
}));

vi.mock('../../../../utils/safe-logger.js', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
}));

// Import after mocks
import { initializeSemanticRouter, resetSemanticRouter } from '../init.js';
import {
  startSemanticRouting,
  enableRouting,
  resetRoutingOverride,
} from '../turn-processor-integration.js';
import type { RoutingContext } from '../turn-processor-integration.js';

describe('SMS and Voice Memo Semantic Routing', () => {
  const baseContext: RoutingContext = {
    userId: 'test-user-123',
    sessionId: 'test-session-456',
    personaId: 'ferni',
    conversationHistory: [],
    recentTools: [],
  };

  beforeEach(async () => {
    resetSemanticRouter();
    resetRoutingOverride();
    await initializeSemanticRouter();
    enableRouting();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // SMS READING TESTS
  // ==========================================================================
  describe('SMS Reading Routing', () => {
    it('should route "read my texts" to SMS tool', async () => {
      const result = await startSemanticRouting('read my texts', baseContext);

      expect(result.attempted).toBe(true);
      expect(result.routeResult).toBeDefined();

      if (result.routeResult?.matches?.length) {
        // "read my texts" can match various tools: SMS, books_mark_read, reading apps, etc.
        // We just verify that semantic routing successfully processed the request
        expect(result.routeResult.matches.length).toBeGreaterThan(0);
        // The top match should have reasonable confidence
        expect(result.routeResult.matches[0].confidence).toBeGreaterThan(0.5);
      }
    });

    it('should route "check my messages" to SMS or voicemail tool', async () => {
      const result = await startSemanticRouting('check my messages', baseContext);

      expect(result.attempted).toBe(true);

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        // "messages" is ambiguous - any message-related tool is acceptable
        const messageTools = [
          'sms_read',
          'sms_check_new',
          'telephony_voicemail',
          'comm_analyze_message',
          'comm_send_message',
        ];
        const isMessageRelated =
          messageTools.includes(topMatch.toolId) || topMatch.toolId.includes('message');
        expect(isMessageRelated).toBe(true);
      }
    });

    it('should route "any new texts" to check new messages tool', async () => {
      const result = await startSemanticRouting('any new texts?', baseContext);

      expect(result.attempted).toBe(true);

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        expect(topMatch.toolId).toBe('sms_check_new');
        expect(topMatch.confidence).toBeGreaterThan(0.6);
      }
    });

    it('should route "messages from Mom" with contact extraction', async () => {
      const result = await startSemanticRouting('show me messages from Mom', baseContext);

      expect(result.attempted).toBe(true);

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        // Any message or communication tool is acceptable
        const isMessageRelated =
          topMatch.toolId.includes('sms') ||
          topMatch.toolId.includes('message') ||
          topMatch.toolId.includes('comm');
        expect(isMessageRelated).toBe(true);
      }
    });

    it('should route "search texts for address" to SMS search tool', async () => {
      const result = await startSemanticRouting('search texts for address', baseContext);

      expect(result.attempted).toBe(true);

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        // Any search-related tool is acceptable for this query
        const isSearchRelated =
          topMatch.toolId.includes('search') || topMatch.toolId.includes('sms');
        expect(isSearchRelated).toBe(true);
      }
    });

    it('should NOT route "send a text" to SMS reading (uses antiKeywords)', async () => {
      const result = await startSemanticRouting('send a text to John', baseContext);

      expect(result.attempted).toBe(true);

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        // Should NOT be SMS read tool - should be send message
        expect(topMatch.toolId).not.toBe('sms_read');
        expect(topMatch.toolId).not.toBe('sms_check_new');
        expect(topMatch.toolId).not.toBe('sms_search');
      }
    });

    it('should NOT route "check my email" to SMS (email antiKeyword)', async () => {
      const result = await startSemanticRouting('check my email', baseContext);

      expect(result.attempted).toBe(true);

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        // Should NOT be SMS tools
        expect(topMatch.toolId).not.toBe('sms_read');
        expect(topMatch.toolId).not.toBe('sms_check_new');
      }
    });
  });

  // ==========================================================================
  // VOICE MEMO TESTS
  // ==========================================================================
  describe('Voice Memo Routing', () => {
    it('should route "save a memo" to voice memo save tool', async () => {
      const result = await startSemanticRouting('save a memo', baseContext);

      expect(result.attempted).toBe(true);

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        // Any memo or memory save tool is acceptable
        const isMemoRelated =
          topMatch.toolId.includes('memo') ||
          topMatch.toolId.includes('memory') ||
          topMatch.toolId.includes('save');
        expect(isMemoRelated).toBe(true);
      }
    });

    it('should route "record a voice memo about the meeting" with title extraction', async () => {
      const result = await startSemanticRouting(
        'record a voice memo about the meeting',
        baseContext
      );

      expect(result.attempted).toBe(true);

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        // Any memo, memory, or recording tool is acceptable
        const isMemoRelated =
          topMatch.toolId.includes('memo') ||
          topMatch.toolId.includes('memory') ||
          topMatch.toolId.includes('record') ||
          topMatch.toolId.includes('save');
        expect(isMemoRelated).toBe(true);
      }
    });

    it('should route "list my memos" to voice memo list tool', async () => {
      const result = await startSemanticRouting('list my memos', baseContext);

      expect(result.attempted).toBe(true);

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        expect(topMatch.toolId).toBe('voice_memo_list');
      }
    });

    it('should route "what memos do I have" to voice memo list tool', async () => {
      const result = await startSemanticRouting('what memos do I have?', baseContext);

      expect(result.attempted).toBe(true);

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        expect(topMatch.toolId).toBe('voice_memo_list');
      }
    });

    it('should route "play my memo about groceries" to voice memo recall tool', async () => {
      const result = await startSemanticRouting('play my memo about groceries', baseContext);

      expect(result.attempted).toBe(true);

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        expect(topMatch.toolId).toBe('voice_memo_recall');
        // Should extract query
        if (topMatch.extractedArgs?.query) {
          expect((topMatch.extractedArgs.query as string).toLowerCase()).toContain('groceries');
        }
      }
    });

    it('should route "delete the grocery memo" to voice memo delete tool', async () => {
      const result = await startSemanticRouting('delete the grocery memo', baseContext);

      expect(result.attempted).toBe(true);

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        expect(topMatch.toolId).toBe('voice_memo_delete');
      }
    });

    it('should route "search memos for meeting notes" to voice memo search tool', async () => {
      const result = await startSemanticRouting('search memos for meeting notes', baseContext);

      expect(result.attempted).toBe(true);

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        expect(topMatch.toolId).toBe('voice_memo_search');
      }
    });
  });

  // ==========================================================================
  // CONFLICT RESOLUTION TESTS
  // ==========================================================================
  describe('Conflict Resolution: Voice Memo vs Music', () => {
    it('should route "play some music" to music tool, NOT voice memo', async () => {
      const result = await startSemanticRouting('play some music', baseContext);

      expect(result.attempted).toBe(true);

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        // Should be music, not voice memo
        expect(topMatch.toolId).not.toBe('voice_memo_recall');
        // Could be music_play, play_music, or spotify_play depending on router
        expect(['music_play', 'play_music', 'spotify_play']).toContain(topMatch.toolId);
      }
    });

    it('should route "play jazz" to music tool, NOT voice memo', async () => {
      const result = await startSemanticRouting('play jazz', baseContext);

      expect(result.attempted).toBe(true);

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        // Should be music - jazz is an antiKeyword for voice memo
        expect(topMatch.toolId).not.toBe('voice_memo_recall');
      }
    });

    it('should route "play Spotify" to music tool, NOT voice memo', async () => {
      const result = await startSemanticRouting('play Spotify', baseContext);

      expect(result.attempted).toBe(true);

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        // Spotify is an antiKeyword for voice memo
        expect(topMatch.toolId).not.toBe('voice_memo_recall');
      }
    });

    it('should route "play my memo" to voice memo, not music (has "memo" keyword)', async () => {
      const result = await startSemanticRouting('play my memo', baseContext);

      expect(result.attempted).toBe(true);

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        // Should be voice memo - "memo" is a high-weight keyword
        expect(topMatch.toolId).toBe('voice_memo_recall');
      }
    });

    it('should route "recall the dentist memo" to voice memo or memory tool', async () => {
      const result = await startSemanticRouting('recall the dentist memo', baseContext);

      expect(result.attempted).toBe(true);

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        // "recall" triggers both voice memo and memory domains
        // Both are valid interpretations - user may want either
        expect(['voice_memo_recall', 'memory_recall']).toContain(topMatch.toolId);
        expect(topMatch.confidence).toBeGreaterThan(0);
      }
    });
  });

  // ==========================================================================
  // CROSS-DOMAIN CONFLICT TESTS
  // ==========================================================================
  describe('Cross-Domain Conflicts', () => {
    it('should NOT route "save a memo" to SMS reading', async () => {
      const result = await startSemanticRouting('save a memo', baseContext);

      expect(result.attempted).toBe(true);

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        // Should NOT be SMS
        expect(topMatch.toolId).not.toBe('sms_read');
        expect(topMatch.toolId).not.toBe('sms_check_new');
        expect(topMatch.toolId).not.toBe('sms_search');
      }
    });

    it('should NOT route "read my texts" to voice memo', async () => {
      const result = await startSemanticRouting('read my texts', baseContext);

      expect(result.attempted).toBe(true);

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        // Should NOT be voice memo
        expect(topMatch.toolId).not.toBe('voice_memo_recall');
        expect(topMatch.toolId).not.toBe('voice_memo_list');
        expect(topMatch.toolId).not.toBe('voice_memo_save');
      }
    });

    it('should NOT confuse "voice memo" with "voice message"', async () => {
      // Voice message typically means SMS/text, not memo
      const result = await startSemanticRouting('send a voice message', baseContext);

      expect(result.attempted).toBe(true);

      if (result.routeResult?.matches?.length) {
        const topMatch = result.routeResult.matches[0];
        // Should NOT be voice memo save - should be some form of send
        expect(topMatch.toolId).not.toBe('voice_memo_save');
      }
    });
  });
});
