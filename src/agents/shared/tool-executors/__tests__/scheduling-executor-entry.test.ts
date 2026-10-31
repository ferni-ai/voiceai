/**
 * The scheduling executor texts, emails and calls the account owner, but it is
 * not gated by ownerMessagePolicy (owner-message-policy.ts): that policy is for
 * a phone caller matched by caller ID alone, and the executor only runs for a
 * signed-in user of the chat API, whose account token already proves who they
 * are. This pins that: if another path ever reaches the executors, this fails,
 * and that path needs the owner-message gate.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '../../../..');
const sourceFiles = (): string[] =>
  (readdirSync(SRC, { recursive: true }) as string[])
    .filter((f) => f.endsWith('.ts') && !/(__tests__|\.test\.ts$|^tests\/)/.test(f))
    .map((f) => f.split('\\').join('/'));
const read = (f: string): string => readFileSync(join(SRC, f), 'utf8');
const importing = (pattern: RegExp): string[] => sourceFiles().filter((f) => pattern.test(read(f)));

describe('the tool executors run only behind the signed-in chat route', () => {
  it('only the tool dispatcher loads the executors that route a tool call', () => {
    const loaders = importing(/tool-executors\/(?:index|scheduling-executor|legacy-fallback-executor)\.js['"]/); // prettier-ignore
    const outside = loaders.filter((f) => !f.startsWith('agents/shared/tool-executors/'));
    expect(outside).toEqual(['agents/shared/tool-dispatcher.ts']);
  });

  it('the dispatcher runs tools for the chat API, and for the voice stream only playMusic', () => {
    const callers = importing(/tool-dispatcher\.js['"]/).filter((f) => /executeTool\(/.test(read(f))); // prettier-ignore
    expect(callers.sort()).toEqual([
      'agents/shared/sanitizer/streams/transform-stream.ts',
      'api/chat-routes.ts',
    ]);
    const stream = read('agents/shared/sanitizer/streams/transform-stream.ts');
    const named = [...stream.matchAll(/executeTool\(\s*\{\s*name:\s*([^,]+),/g)].map((m) => m[1]);
    expect(named).toEqual(["'playMusic'"]);
  });

  it('the chat API signs the caller in before any tool runs', () => {
    const routes = read('api/chat-routes.ts');
    const auth = routes.indexOf('await requireAuth(');
    expect(auth).toBeGreaterThan(-1);
    expect(routes.indexOf('executeTool(')).toBeGreaterThan(auth);
  });
});
