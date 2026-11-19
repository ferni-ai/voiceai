/**
 * updateTask (TASK_EDITS) under TASK_TOOLS_ALWAYS_ON: "move the dry cleaning to
 * Friday" says no topic word, so without the always-on set it reaches no task
 * tool (eval row 4). Its own file because TASK_EDITS is read when the
 * productivity domain loads, and a loaded domain is kept for the whole file.
 *
 * The call is built as agent setup builds it (personas/__tests__/first-agent-call.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startCall, turn } from '../../personas/__tests__/first-agent-call.js';

const MOVE_IT = 'Move the dry cleaning to Friday.';
const LIMIT = 88; // 64 + MID_SESSION_TOPIC_TOOLS (initial-tools.ts)

beforeEach(() => {
  vi.stubEnv('TOOLS_SAME_TURN', 'on');
  vi.stubEnv('TASK_EDITS', 'on');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('updateTask with TASK_EDITS on', () => {
  it('is on the first agent and on a turn without a topic word, with TASK_TOOLS_ALWAYS_ON', async () => {
    vi.stubEnv('TASK_TOOLS_ALWAYS_ON', 'on');
    const call = await startCall('task-edits-on');
    expect(call.initialNames).toContain('updateTask');
    const asked = await turn(call, MOVE_IT);
    expect(asked.request).toContain('updateTask');
    expect(asked.request.length).toBeLessThan(LIMIT);
  }, 120_000);

  it('waits for a topic word without TASK_TOOLS_ALWAYS_ON', async () => {
    const call = await startCall('task-edits-topic-only');
    expect(call.initialNames).not.toContain('updateTask');
    const asked = await turn(call, MOVE_IT);
    expect(asked.request).not.toContain('updateTask');
  }, 120_000);
});
