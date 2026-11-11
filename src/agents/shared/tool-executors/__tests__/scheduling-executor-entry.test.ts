/**
 * The scheduling executor texts, emails and calls the account owner, but it is
 * not gated by ownerMessagePolicy (owner-message-policy.ts): that policy is for
 * a phone caller matched by caller ID alone, and the executor only runs for a
 * signed-in user of the chat API, whose account token already proves who they
 * are. This pins that: if another path ever reaches the executors (a new
 * dispatcher caller, a new routeToToolModular call, or a semantic tool's
 * `delegateTo: 'scheduling-executor'` being wired up), this fails, and that
 * path needs the owner-message gate.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '../../../..');
const sourceFiles = (): string[] =>
  (readdirSync(SRC, { recursive: true }) as string[])
    .map((f) => f.split('\\').join('/'))
    .filter((f) => f.endsWith('.ts') && !/(__tests__\/|\.test\.ts$|^tests\/)/.test(f));
const read = (f: string): string => readFileSync(join(SRC, f), 'utf8');
const matching = (pattern: RegExp): string[] =>
  sourceFiles()
    .filter((f) => pattern.test(read(f)))
    .sort();
const EXECUTORS = 'agents/shared/tool-executors/';

describe('the tool executors run only behind the signed-in chat route', () => {
  it('only the tool dispatcher loads the executors that route a tool call', () => {
    const loaders = matching(/tool-executors\/(?:index|scheduling-executor|legacy-fallback-executor)\.js['"]/); // prettier-ignore
    expect(loaders.filter((f) => !f.startsWith(EXECUTORS))).toEqual(['agents/shared/tool-dispatcher.ts']); // prettier-ignore
  });

  it('routeToToolModular is called by the dispatcher, and inside the executors only for playMusic', () => {
    const calls = matching(/\brouteToToolModular\(/).filter((f) => !f.endsWith('tool-executors/index.ts')); // prettier-ignore
    expect(calls).toEqual([
      'agents/shared/tool-dispatcher.ts',
      'agents/shared/tool-executors/legacy-fallback-executor.ts',
    ]);
    const fallback = read(`${EXECUTORS}legacy-fallback-executor.ts`);
    const named = [...fallback.matchAll(/routeToToolModular\(\s*([^,]+),/g)].map((m) => m[1]);
    expect(named).toEqual(["'playmusic'"]);
  });

  it('the dispatcher is used by the chat API, and by the voice stream only for playMusic', () => {
    const users = matching(/tool-dispatcher\.js['"]/).filter((f) => f !== 'agents/shared/tool-dispatcher.ts'); // prettier-ignore
    expect(users).toEqual(['agents/shared/sanitizer/streams/transform-stream.ts', 'api/chat-routes.ts']); // prettier-ignore
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

  it("a semantic tool's delegateTo: 'scheduling-executor' is still not routed anywhere", () => {
    const named = matching(/['"]scheduling-executor['"]/);
    expect(named).toEqual(['tools/semantic-router/tool-definitions/telephony.semantic.ts']);
    // The one reader of delegateTo turns it into an error, never a dispatch
    expect(matching(/\.delegateTo\b/)).toEqual(['tools/semantic-router/integration/transcript-integration.ts']); // prettier-ignore
    const reader = read('tools/semantic-router/integration/transcript-integration.ts');
    expect(reader).toMatch(/if \(result\.delegateTo && !result\.naturalResponse\) \{[\s\S]{0,400}?success: false/); // prettier-ignore
  });
});
