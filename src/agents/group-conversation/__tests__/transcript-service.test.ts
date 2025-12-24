/**
 * Transcript Service Tests
 *
 * Tests for attributed transcript management and analysis.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AttributedTranscriptService, createTranscriptService } from '../transcript-service.js';
import type { GroupParticipant } from '../types.js';

// ============================================================================
// HELPERS
// ============================================================================

function createMockParticipants(): GroupParticipant[] {
  return [
    {
      id: 'user_1',
      name: 'User',
      type: 'human',
      connection: { type: 'webrtc', identity: 'user_1' },
      role: 'initiator',
      speakingState: 'silent',
      joinedAt: new Date(),
    },
    {
      id: 'agent_ferni',
      name: 'Ferni',
      type: 'agent',
      connection: { type: 'agent', personaId: 'ferni' },
      role: 'moderator',
      speakingState: 'silent',
      joinedAt: new Date(),
    },
  ];
}

// ============================================================================
// TESTS
// ============================================================================

describe('AttributedTranscriptService', () => {
  let service: AttributedTranscriptService;

  beforeEach(() => {
    service = createTranscriptService({
      sessionId: 'test-session',
      userId: 'user_123',
    });
  });

  describe('Adding Utterances', () => {
    it('should add an utterance', () => {
      const utterance = service.addUtterance('user_1', 'User', 'human', 'Hello!', 500);

      expect(utterance.id).toBe('utt_1');
      expect(utterance.speakerId).toBe('user_1');
      expect(utterance.text).toBe('Hello!');
    });

    it('should increment utterance IDs', () => {
      const utt1 = service.addUtterance('user_1', 'User', 'human', 'First', 100);
      const utt2 = service.addUtterance('user_1', 'User', 'human', 'Second', 100);

      expect(utt1.id).toBe('utt_1');
      expect(utt2.id).toBe('utt_2');
    });

    it('should analyze sentiment', () => {
      const positive = service.addUtterance('user_1', 'User', 'human', 'This is great!', 100);
      const negative = service.addUtterance('user_1', 'User', 'human', 'This is terrible', 100);
      const neutral = service.addUtterance('user_1', 'User', 'human', 'Hello there', 100);

      expect(positive.sentiment).toBe('positive');
      expect(negative.sentiment).toBe('negative');
      expect(neutral.sentiment).toBe('neutral');
    });
  });

  describe('Getting Utterances', () => {
    beforeEach(() => {
      service.addUtterance('user_1', 'User', 'human', 'Hello', 100);
      service.addUtterance('agent_ferni', 'Ferni', 'agent', 'Hi there!', 200);
      service.addUtterance('user_1', 'User', 'human', 'How are you?', 150);
    });

    it('should get all utterances', () => {
      expect(service.getUtterances().length).toBe(3);
    });

    it('should get recent utterances', () => {
      const recent = service.getRecentUtterances(2);
      expect(recent.length).toBe(2);
      expect(recent[0].text).toBe('Hi there!');
    });

    it('should get utterances by speaker', () => {
      const userUtterances = service.getUtterancesBySpeaker('user_1');
      expect(userUtterances.length).toBe(2);
    });
  });

  describe('Formatted Transcript', () => {
    beforeEach(() => {
      service.addUtterance('user_1', 'User', 'human', 'Hello', 100);
      service.addUtterance('agent_ferni', 'Ferni', 'agent', 'Hi there!', 200);
    });

    it('should format transcript', () => {
      const formatted = service.getFormattedTranscript();

      expect(formatted).toContain('[User]: Hello');
      expect(formatted).toContain('[Ferni]: Hi there!');
    });

    it('should format with limit', () => {
      const formatted = service.getFormattedTranscript(1);

      expect(formatted).not.toContain('Hello');
      expect(formatted).toContain('[Ferni]: Hi there!');
    });

    it('should include timestamps', () => {
      const timestamped = service.getTimestampedTranscript();

      // Matches "[HH:MM:SS AM/PM]" format
      expect(timestamped).toMatch(/\[\d{2}:\d{2}:\d{2}\s(?:AM|PM)\]/);
    });
  });

  describe('Action Item Detection', () => {
    it('should detect "we should" action items', () => {
      service.addUtterance(
        'user_1',
        'User',
        'human',
        'We should schedule a meeting tomorrow.',
        100
      );

      const items = service.getActionItems();
      expect(items.length).toBeGreaterThan(0);
    });

    it('should detect "let\'s" action items', () => {
      service.addUtterance('user_1', 'User', 'human', "Let's go for a walk in the park.", 100);

      const items = service.getActionItems();
      expect(items.length).toBeGreaterThan(0);
    });

    it('should detect "need to" action items', () => {
      service.addUtterance('user_1', 'User', 'human', 'I need to finish this project today.', 100);

      const items = service.getActionItems();
      expect(items.length).toBeGreaterThan(0);
    });

    it('should include speaker in action items', () => {
      service.addUtterance('agent_ferni', 'Ferni', 'agent', "Let's set a goal for this week.", 100);

      const items = service.getActionItems();
      expect(items.some((i) => i.mentionedBy === 'Ferni')).toBe(true);
    });
  });

  describe('Key Moment Detection', () => {
    it('should detect decisions', () => {
      const onKeyMoment = vi.fn();
      const serviceWithCallback = createTranscriptService({
        sessionId: 'test',
        userId: 'user_123',
        onKeyMoment,
      });

      serviceWithCallback.addUtterance(
        'user_1',
        'User',
        'human',
        "Let's do it! That's the plan.",
        100
      );

      expect(onKeyMoment).toHaveBeenCalled();
      const moment = onKeyMoment.mock.calls[0][0];
      expect(moment.type).toBe('decision');
    });

    it('should detect agreements', () => {
      service.addUtterance('agent_ferni', 'Ferni', 'agent', 'I totally agree with you', 100);

      const moments = service.getKeyMoments();
      expect(moments.some((m) => m.type === 'agreement')).toBe(true);
    });

    it('should detect breakthroughs', () => {
      service.addUtterance('user_1', 'User', 'human', 'I just realized something important!', 100);

      const moments = service.getKeyMoments();
      expect(moments.some((m) => m.type === 'breakthrough')).toBe(true);
    });
  });

  describe('Summary Generation', () => {
    beforeEach(() => {
      // Add conversation
      service.addUtterance('user_1', 'User', 'human', 'I want to improve my habits', 200);
      service.addUtterance(
        'agent_ferni',
        'Ferni',
        'agent',
        'I totally agree that habits are important',
        300
      );
      service.addUtterance('user_1', 'User', 'human', "Let's set a morning routine goal", 250);
      service.addUtterance(
        'agent_ferni',
        'Ferni',
        'agent',
        "I'll help you track your progress",
        280
      );
    });

    it('should generate summary with participant data', async () => {
      const participants = createMockParticipants();
      const summary = await service.generateSummary(participants);

      expect(summary.participantSummaries.has('user_1')).toBe(true);
      expect(summary.participantSummaries.has('agent_ferni')).toBe(true);
    });

    it('should include utterance counts in summary', async () => {
      const participants = createMockParticipants();
      const summary = await service.generateSummary(participants);

      const userSummary = summary.participantSummaries.get('user_1');
      expect(userSummary?.utteranceCount).toBe(2);
    });

    it('should include action items in summary', async () => {
      const participants = createMockParticipants();
      const summary = await service.generateSummary(participants);

      expect(summary.actionItems.length).toBeGreaterThan(0);
    });
  });

  describe('Export', () => {
    it('should export transcript', async () => {
      service.addUtterance('user_1', 'User', 'human', 'Hello', 100);
      service.addUtterance('agent_ferni', 'Ferni', 'agent', 'Hi!', 100);

      const participants = createMockParticipants();
      const exported = await service.exportTranscript(participants, {
        topic: 'Test conversation',
        mode: 'team_roundtable',
        startedAt: new Date(),
      });

      expect(exported.session.id).toBe('test-session');
      expect(exported.session.topic).toBe('Test conversation');
      expect(exported.transcript.length).toBe(2);
      expect(exported.participants.length).toBe(2);
    });
  });

  describe('Clear', () => {
    it('should clear all data', () => {
      service.addUtterance('user_1', 'User', 'human', "Let's do something", 100);

      service.clear();

      expect(service.getUtterances().length).toBe(0);
      expect(service.getActionItems().length).toBe(0);
      expect(service.getKeyMoments().length).toBe(0);
    });
  });
});
