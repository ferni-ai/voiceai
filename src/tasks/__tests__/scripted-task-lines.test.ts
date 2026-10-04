/**
 * Small talk must not start a celebration, and task lines must not be scripted.
 *
 * Evidence: on the 2026-10-03 dev call the caller said "It's pretty good."
 * (analysis: emotion=joy, intent=unknown). That activated Quick Celebration and
 * Milestone Celebration, and the reply opened with the canned
 * "Wait, hold on, let's not skip over this!" from TASK_TRANSITIONS.toCelebration.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConversationAnalysis } from '../../services/types.js';
import { TaskManager } from '../task-manager.js';
import { TASK_TRANSITIONS } from '../transitions.js';

vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

function analysisFor(emotion: string, valence: string, intensity: number): ConversationAnalysis {
  return {
    emotion: { primary: emotion, valence, intensity, distressLevel: 0, confidence: 0.8 },
    intent: { primary: 'unknown', requiresEmpathy: false },
    state: { phase: 'warming_up' },
  } as unknown as ConversationAnalysis;
}

const CELEBRATION_TASKS = ['quick_celebrate', 'milestone_celebration'];
const joyful = analysisFor('joy', 'positive', 0.8);

afterEach(() => {
  delete process.env.FERNI_TASK_MOOD_ALONE_TRIGGERS;
  delete process.env.FERNI_TASK_SCRIPTED_TRANSITIONS;
});

describe('celebration tasks need news, not just a good mood', () => {
  it('"It\'s pretty good." activates no celebration task', () => {
    const manager = new TaskManager();
    const context = manager.processUserTurn(joyful, "It's pretty good.");

    expect(manager.getActiveTasks().filter((id) => CELEBRATION_TASKS.includes(id))).toEqual([]);
    expect(context.join('\n')).not.toMatch(/CELEBRATE/);
  });

  it('a real milestone still activates milestone_celebration', () => {
    const manager = new TaskManager();
    manager.processUserTurn(joyful, 'I finally paid off my student loans!');

    expect(manager.getActiveTasks()).toContain('milestone_celebration');
  });

  it('FERNI_TASK_MOOD_ALONE_TRIGGERS=on restores mood-only triggering', () => {
    process.env.FERNI_TASK_MOOD_ALONE_TRIGGERS = 'on';
    const manager = new TaskManager();
    manager.processUserTurn(joyful, "It's pretty good.");

    expect(manager.getActiveTasks()).toContain('milestone_celebration');
  });
});

describe('task transition lines are not handed to the model', () => {
  const celebrationLines = TASK_TRANSITIONS.toCelebration;

  it('an activated task adds no [TRANSITION] line', () => {
    const manager = new TaskManager();
    const context = manager.processUserTurn(joyful, 'I finally paid off my student loans!');

    expect(manager.getActiveTasks()).toContain('milestone_celebration');
    expect(context.join('\n')).not.toContain('[TRANSITION]');
    for (const line of celebrationLines) expect(context.join('\n')).not.toContain(line);
  });

  it('a finished task adds no exit line', () => {
    const manager = new TaskManager();
    const fear = analysisFor('fear', 'negative', 0.8);
    (fear.emotion as { distressLevel: number }).distressLevel = 0.7;
    manager.processUserTurn(fear, 'The market crash, I want to sell everything');
    expect(manager.getActiveTasks()).toContain('market_panic');

    const context = manager.processUserTurn(analysisFor('neutral', 'neutral', 0.2), 'Okay.');
    expect(manager.getActiveTasks()).not.toContain('market_panic');
    expect(context.join('\n')).not.toContain('You have more time than you think');
  });

  it('FERNI_TASK_SCRIPTED_TRANSITIONS=on restores the opening line', () => {
    process.env.FERNI_TASK_SCRIPTED_TRANSITIONS = 'on';
    const manager = new TaskManager();
    const context = manager.processUserTurn(joyful, 'I finally paid off my student loans!');

    const opener = context.find((part) => part.startsWith('[TRANSITION] Start with:'));
    expect(opener).toBeDefined();
    expect(celebrationLines.some((line) => opener?.includes(line))).toBe(true);
  });
});
