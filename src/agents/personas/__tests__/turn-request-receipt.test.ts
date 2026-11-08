/**
 * withTurnReminder reports what it added to the request to the call's turn
 * receipt (turn-receipt.ts): the director's notes it kept and the size of the
 * rest of the reminder, never the words.
 */
import { EventEmitter } from 'node:events';
import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';
import type { TurnReceipt } from '../../shared/turn-receipt.js';
import { attachTurnReceipts, noteRequest } from '../../shared/turn-receipt-session.js';
import { Director, setDirector } from '../director-notes.js';
import { withTurnReminder } from '../turn-request.js';

describe('withTurnReminder → TURN_RECEIPT', () => {
  it("counts the director's notes and sizes the reminder it sends", () => {
    const session = Object.assign(new EventEmitter(), {
      userData: { services: { sessionId: 'RM_wire' } },
    });
    const receipts: TurnReceipt[] = [];
    attachTurnReceipts(session as never, {
      sessionId: 'RM_wire',
      userId: undefined,
      persona: () => 'ferni',
      emit: (r) => receipts.push(r),
      env: {},
    });
    const director = new Director({ sessionId: 'RM_wire', writeNotes: false });
    Object.assign(director, { notes: ['bring up the dog Biscuit'] }); // as observe() would leave them
    setDirector(session, director);
    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: 'hello there' });

    session.emit('metrics_collected', {
      metrics: { type: 'eou_metrics', endOfUtteranceDelayMs: 300, transcriptionDelayMs: 90 },
    });
    noteRequest(session, withTurnReminder(chat, session), { functionTools: {} });
    session.emit('agent_state_changed', { newState: 'speaking' });
    session.emit('agent_state_changed', { newState: 'listening' });

    expect(receipts).toHaveLength(1);
    const [r] = receipts;
    expect(r.director).toEqual({ offered: 1, kept: 1, droppedIdx: [] });
    const by = Object.fromEntries(r.prompt.sections.map((s) => [s.name, s]));
    expect(by.director_notes.chars).toBe('[Director: bring up the dog Biscuit]'.length);
    expect(by.turn_reminder.chars).toBeGreaterThan(0);
    expect(by.caller_turn.chars).toBe('hello there'.length);
    expect(JSON.stringify(r)).not.toContain('Biscuit');
  });
});
