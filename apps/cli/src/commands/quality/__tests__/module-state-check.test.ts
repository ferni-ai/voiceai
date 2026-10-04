import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { findProjectRoot } from '../../../utils/project-root.js';
import { findModuleStateHazards } from '../module-state-check.js';

describe('module-level per-caller state check', () => {
  it('flags a singleton created from, or re-pointed at, a room', () => {
    const src = `
      let instance: Publisher | null = null;
      export function init(room: RoomRef): Publisher {
        if (!instance) instance = new Publisher(room);
        else instance.setRoom(room);
        return instance;
      }`;
    expect(findModuleStateHazards(src, 'a.ts')).toEqual([
      { file: 'a.ts', line: 4, variable: 'instance', fn: 'init', param: 'room' },
    ]);
  });

  it('flags a setter call alone, and per-caller params recognised by type', () => {
    const src = `
      let current = new Publisher();
      export const attach = (r: JobContext) => { current.attachRoom(r.room); };`;
    expect(findModuleStateHazards(src, 'b.ts')).toMatchObject([
      { variable: 'current', fn: 'attach', param: 'r' },
    ]);
  });

  it('ignores keyed state, const bindings, and functions without per-caller params', () => {
    const src = `
      let sessions = new Map<string, State>();
      const shared = { room: null as unknown };
      let counter = 0;
      export function track(sessionId: string, state: State): void {
        sessions.set(sessionId, state);
        shared.room = sessionId;
      }
      export function bump(amount: number): void { counter = counter + amount; }`;
    expect(findModuleStateHazards(src, 'c.ts')).toEqual([]);
  });

  it('flags frontend-publisher.ts', () => {
    const file = 'src/agents/realtime/frontend-publisher.ts';
    const src = readFileSync(join(findProjectRoot(), file), 'utf8');
    expect(findModuleStateHazards(src, file)).toMatchObject([
      { variable: 'publisherInstance', fn: 'initializeFrontendPublisher', param: 'room' },
    ]);
  });
});
