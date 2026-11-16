/**
 * updateTask (TASK_EDITS): rename, move, reprioritise or remove one task, and the
 * honest tool text that comes with it. Flag off, the task tools are exactly main's.
 */
process.env.TZ = 'UTC';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/safe-logger.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    getLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
    createLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
  };
});
vi.mock('@livekit/agents', () => ({
  llm: { tool: vi.fn((config) => config) },
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const calendar = vi.hoisted(() => ({
  sync: vi.fn(async () => ({ success: true })),
  remove: vi.fn(async () => true),
}));
vi.mock('../../../../services/calendar/calendar-bridge.js', () => ({
  syncTaskToCalendar: calendar.sync,
  removeCalendarSyncedItem: calendar.remove,
}));
vi.mock('../../../../services/stores/productivity-store.js', () => ({
  getProductivityStore: () => ({
    loadUserData: vi.fn(async () => {}),
    getUserTasks: () => [],
    setTask: vi.fn(),
    deleteTask: vi.fn(),
  }),
}));

import { createTask, createTaskTools, getUserTasks } from '../tasks.js';
import { pickTaskToEdit } from '../task-match.js';
import { getTaskToolDefinitions } from '../index.js';

interface Exec {
  execute: (args: Record<string, unknown>, opts?: unknown) => Promise<string>;
}
/** updateTask as the registry builds it, with TASK_EDITS on. */
function builtUpdateTask(): Exec {
  process.env.TASK_EDITS = 'on';
  try {
    return (createTaskTools() as unknown as { updateTask: Exec }).updateTask;
  } finally {
    delete process.env.TASK_EDITS;
  }
}
const updateTask = builtUpdateTask();

let n = 0;
const freshUser = (): string => `update-task-user-${++n}`;
const ctxFor = (userId: string) => ({
  ctx: { userData: { userId, callerTimezone: 'America/New_York' } },
});
const titles = (userId: string): string[] => getUserTasks(userId).map((t) => t.title);
const task = (title: string): { title: string } => ({ title });

describe('pickTaskToEdit: which open task the person named', () => {
  const list = [
    task('Call mom'),
    task('Call mom about the trip'),
    task('Pick up the dry cleaning'),
    task('Call the plumber'),
    task('Book the vacation'),
  ];

  it('the exact title wins over a longer one that contains it', () => {
    expect(pickTaskToEdit(list, 'call mom')).toEqual({ kind: 'one', task: list[0] });
  });

  it('a few of its words name one task, in any case', () => {
    expect(pickTaskToEdit(list, 'Dry Cleaning')).toEqual({ kind: 'one', task: list[2] });
  });

  it('the way people say it ("the dry cleaning one") still names it', () => {
    expect(pickTaskToEdit(list, 'the dry cleaning one')).toEqual({ kind: 'one', task: list[2] });
  });

  it('words that fit several tasks are several, never a guess', () => {
    const match = pickTaskToEdit(list, 'call');
    expect(match.kind).toBe('several');
    if (match.kind === 'several') {
      expect(match.tasks.map((t) => t.title).sort()).toEqual(
        ['Call mom', 'Call mom about the trip', 'Call the plumber'].sort()
      );
    }
  });

  it('whole words only: "cat" is not in "Book the vacation"', () => {
    expect(pickTaskToEdit(list, 'cat')).toEqual({ kind: 'none' });
  });

  it('nothing that fits is none', () => {
    expect(pickTaskToEdit(list, 'taxes')).toEqual({ kind: 'none' });
    expect(pickTaskToEdit([], 'dry cleaning')).toEqual({ kind: 'none' });
  });
});

describe('updateTask', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T13:19:00Z')); // Thu 08:19 in New York
    calendar.sync.mockClear();
    calendar.remove.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('moves a task to "tomorrow" on the caller\'s clock and moves its calendar entry', async () => {
    const userId = freshUser();
    const added = await createTask({
      userId,
      title: 'Pick up the dry cleaning',
      dueDate: new Date('2026-11-06T04:59:00Z'),
    });

    const said = await updateTask.execute(
      { taskTitle: 'dry cleaning', dueDate: 'tomorrow' },
      ctxFor(userId)
    );

    expect(getUserTasks(userId)[0].dueDate?.toISOString()).toBe('2026-11-07T04:59:00.000Z');
    expect(said).toBe('Updated: due by tomorrow, Nov 6, 11:59 PM your time.');
    expect(calendar.remove).toHaveBeenCalledWith(userId, added.id);
    expect(calendar.sync).toHaveBeenLastCalledWith(
      userId,
      added.id,
      'Pick up the dry cleaning',
      new Date('2026-11-06T14:00:00Z'), // 9am New York on the new day
      30
    );
  });

  it('renames a task and changes its priority', async () => {
    const userId = freshUser();
    await createTask({ userId, title: 'Call the plumber' });

    const said = await updateTask.execute(
      { taskTitle: 'plumber', newTitle: 'Call the electrician', priority: 'urgent' },
      ctxFor(userId)
    );

    expect(titles(userId)).toEqual(['Call the electrician']);
    expect(getUserTasks(userId)[0].priority).toBe('urgent');
    expect(said).toBe(
      'Updated: renamed "Call the plumber" to "Call the electrician", now urgent priority.'
    );
  });

  it('removes a task, and its calendar entry when it had a date', async () => {
    const userId = freshUser();
    const dated = await createTask({
      userId,
      title: 'Pick up the dry cleaning',
      dueDate: new Date('2026-11-06T04:59:00Z'),
    });
    await createTask({ userId, title: 'Book the vacation' });

    const said = await updateTask.execute(
      { taskTitle: 'dry cleaning', remove: true },
      ctxFor(userId)
    );

    expect(titles(userId)).toEqual(['Book the vacation']);
    expect(said).toBe('Removed "Pick up the dry cleaning" from their to-do list.');
    expect(calendar.remove).toHaveBeenCalledWith(userId, dated.id);
  });

  it('changes nothing when the name fits several tasks, and says which', async () => {
    const userId = freshUser();
    await createTask({ userId, title: 'Call mom' });
    await createTask({ userId, title: 'Call the plumber' });

    const said = await updateTask.execute({ taskTitle: 'call', remove: true }, ctxFor(userId));

    expect(titles(userId).sort()).toEqual(['Call mom', 'Call the plumber']);
    expect(said).toContain('matches 2 tasks');
    expect(said).toContain('nothing changed yet');
  });

  it('changes nothing for a date it cannot read, or when nothing was asked', async () => {
    const userId = freshUser();
    await createTask({ userId, title: 'Book the vacation' });

    const badDate = await updateTask.execute(
      { taskTitle: 'vacation', dueDate: 'whenever works' },
      ctxFor(userId)
    );
    const nothing = await updateTask.execute({ taskTitle: 'vacation' }, ctxFor(userId));

    expect(getUserTasks(userId)[0].dueDate).toBeUndefined();
    expect(badDate).toContain('is unchanged');
    expect(nothing).toContain('Nothing to change on "Book the vacation"');
  });

  it('says plainly when no open task fits, and names what is there', async () => {
    const userId = freshUser();
    await createTask({ userId, title: 'Book the vacation' });

    const said = await updateTask.execute({ taskTitle: 'taxes', remove: true }, ctxFor(userId));

    expect(said).toBe(
      'No open task matches "taxes", so nothing changed. Their open tasks: "Book the vacation".'
    );
  });
});

describe('TASK_EDITS: which task tools exist and what they say', () => {
  afterEach(() => delete process.env.TASK_EDITS);

  it('off: the three tools and their old text, no updateTask', () => {
    delete process.env.TASK_EDITS;
    const defs = getTaskToolDefinitions();
    expect(defs.map((d) => d.id)).toEqual(['addTask', 'completeTask', 'getTasks']);
    expect(defs[0].description).toContain('Can also update existing tasks');
    const tools = createTaskTools() as unknown as Record<string, { description: string }>;
    expect(tools.addTask.description).toContain('a reminder they want');
    expect(tools.updateTask).toBeUndefined();
  });

  it('on: updateTask exists, and no tool claims what it cannot do', () => {
    process.env.TASK_EDITS = 'on';
    const defs = getTaskToolDefinitions();
    expect(defs.map((d) => d.id)).toEqual(['addTask', 'completeTask', 'getTasks', 'updateTask']);
    const text = defs.map((d) => d.description).join('\n');
    expect(text).not.toContain('Can also update');
    expect(text).not.toContain('delete it entirely');
    const tools = createTaskTools() as unknown as Record<string, { description: string }>;
    expect(tools.addTask.description).toContain('never pings them');
    expect(tools.addTask.description).not.toContain('a reminder they want');
    expect(tools.getTasks.description).not.toBe('Show the user.');
  });
});
