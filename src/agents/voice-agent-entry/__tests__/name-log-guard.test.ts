/**
 * The caller's name never reaches a log line in the files that read or write
 * it (#4395): not as a field, not in the message text, and never the sentence
 * it came from. Whether there was one and how long it is are fine
 * (nameForLog, utils/name-for-log.ts). It reads the source with
 * call-log-surface-guard's reader (log-guard.ts), so a log call no behaviour
 * test reaches is still held to it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { nameForLog } from '../../../utils/name-for-log.js';
import { CALL, SHAPE, closing, logged } from './log-guard.js';

/** The files that read or write the caller's name, grouped by where they sit. */
const GROUPS = {
  tool: [
    'src/tools/domains/conversation/conversation-tools.ts',
    'src/tools/domains/conversation/remember-name.ts',
  ],
  routes: ['src/api/user-routes.ts'],
  session: [
    'src/services/session/load-session-profile.ts',
    'src/services/data/realtime-persistence.ts',
    'src/services/data-layer/fast-session-init.ts',
    'src/services/data-layer/name-sync.ts',
  ],
  learning: [
    'src/intelligence/user-learning-engine/engine.ts',
    'src/conversation/superhuman/nicknames.ts',
  ],
} as const;

/** A logged value or key that may be a person's name, or the words it came from. */
const NAME = /\b\w*(?:[nN]ame|NAME|[nN]ickname)s?\b|\b\w*NameDetail\b|\bnaming\b/;

/** Names that are not a person's: [file, key, value]. */
const NOT_A_PERSON: ReadonlyArray<readonly [string, string, string]> = [
  ['fast-session-init.ts', 'task', 'name'], // a background task's name ('name_sync')
];

/** Every logged value in `src` that may carry a name, as `line: key: value`. */
export function nameOffences(path: string, src = readFileSync(path, 'utf8')): string[] {
  const found: string[] = [];
  for (const m of src.matchAll(CALL)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const args = src.slice(open, closing(src, open) + 1);
    const line = src.slice(0, m.index).split('\n').length;
    for (const { key = '', value } of logged(args)) {
      if (SHAPE.test(value)) continue;
      if (!NAME.test(value) && !(key !== value && NAME.test(key))) continue;
      if (NOT_A_PERSON.some(([f, k, v]) => path.endsWith(f) && k === key && v === value)) continue;
      found.push(`${line}: ${key && key !== value ? `${key}: ` : ''}${value}`);
    }
  }
  return found;
}

describe.each(Object.entries(GROUPS))('the %s files log no name', (_group, files) => {
  it.each(files)('%s', (path) => {
    expect(nameOffences(path)).toEqual([]);
  });
});

/** One plant per group: a name put back into one of its log calls, [file, fixed, planted]. */
const PLANTS: Record<keyof typeof GROUPS, readonly [string, string, string]> = {
  tool: [
    'src/tools/domains/conversation/remember-name.ts',
    "getLogger().info(nameForLog(name), 'Remembering user name');",
    'getLogger().info(`Remembering user name: ${name}`);',
  ],
  routes: [
    'src/api/user-routes.ts',
    "{ userId, nameChars: body.name.length }, '✨ Name set from onboarding'",
    "{ userId, name: body.name }, '✨ Name set from onboarding'",
  ],
  session: [
    'src/services/session/load-session-profile.ts',
    '{ userId, ...nameForLog(userName) }',
    '{ userId, name: userName }',
  ],
  // The sentence the name came from (#4395's worst line).
  learning: [
    'src/intelligence/user-learning-engine/engine.ts',
    "getLogger().info(nameForLog(userNameDetail.value), '🎉 Learned user name!');",
    "getLogger().info({ context: userNameDetail.context }, '🎉 Learned user name!');",
  ],
};

describe.each(Object.entries(PLANTS))(
  'a name put back in a %s file',
  (_group, [path, fixed, planted]) => {
    it('is caught', () => {
      const src = readFileSync(path, 'utf8');
      expect(src).toContain(fixed);
      expect(nameOffences(path, src)).toEqual([]);
      expect(nameOffences(path, src.replace(fixed, planted))).not.toEqual([]);
    });
  }
);

describe('nameForLog', () => {
  it.each([
    ['Sam', { hasName: true, nameChars: 3 }],
    ['  Jess ', { hasName: true, nameChars: 4 }],
    ['  ', { hasName: false, nameChars: 0 }],
    [undefined, { hasName: false, nameChars: 0 }],
    [null, { hasName: false, nameChars: 0 }],
  ] as const)('%j: whether there is one and its length, never the name', (name, shape) => {
    expect(nameForLog(name)).toEqual(shape);
    expect(JSON.stringify(nameForLog(name))).not.toMatch(/sam|jess/i);
  });
});
