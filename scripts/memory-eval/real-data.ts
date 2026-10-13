/**
 * Guards for runs on real calls (build-private-cases.ts, longmem.ts --cases,
 * grade-human.ts). Real speech must reach only Vertex AI: callLLM and the
 * embedding provider both fall back to OpenAI, and callLLM sends the tasks in
 * CLAUDE_LLM_TASKS to Claude, so these refuse to run unless neither can happen. Call them from main(), after the imports, so
 * a key loaded from a .env file is seen.
 */
import { chmodSync, existsSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { claudeTasks } from '../../src/services/llm/claude-text.js';

export function assertVertexOnly(env: NodeJS.ProcessEnv = process.env): void {
  const problems: string[] = [];
  if (env.OPENAI_API_KEY) {
    problems.push('OPENAI_API_KEY is set: callLLM would fall back to OpenAI');
  }
  if (env.ANTHROPIC_API_KEY && claudeTasks(env).size > 0) {
    problems.push(
      `CLAUDE_LLM_TASKS (${[...claudeTasks(env)].join(', ')}) with ANTHROPIC_API_KEY: those calls would go to Claude`
    );
  }
  if (env.USE_VERTEX_AI === 'false') {
    problems.push('USE_VERTEX_AI=false: calls would go to the consumer Gemini API');
  }
  if (!env.GOOGLE_CLOUD_PROJECT) {
    problems.push('GOOGLE_CLOUD_PROJECT is unset: embeddings would fall back to OpenAI');
  }
  if (problems.length > 0) {
    throw new Error(
      `refusing to run on real calls:\n- ${problems.join('\n- ')}\n` +
        'unset OPENAI_API_KEY, CLAUDE_LLM_TASKS and USE_VERTEX_AI=false, and set GOOGLE_CLOUD_PROJECT'
    );
  }
}

/**
 * Where `path` really is: symlinks resolved on its nearest existing ancestor
 * (the rest may not exist yet), folded to lower case when the file system
 * ignores case.
 */
function realLocation(path: string, foldCase: boolean): string {
  let existing = resolve(path);
  const rest: string[] = [];
  while (!existsSync(existing) && dirname(existing) !== existing) {
    rest.unshift(basename(existing));
    existing = dirname(existing);
  }
  const real = join(realpathSync(existing), ...rest);
  return foldCase ? real.toLowerCase() : real;
}

/**
 * Whether `path` is `root` or inside it, however either is spelled: through
 * a symlink (/tmp is /private/tmp on macOS) or, where the file system ignores
 * case (macOS by default), in other capitals.
 */
export function isInside(
  path: string,
  root: string,
  foldCase: boolean = process.platform === 'darwin'
): boolean {
  const rel = relative(realLocation(root, foldCase), realLocation(path, foldCase));
  return rel === '' || (!isAbsolute(rel) && rel.split(sep)[0] !== '..');
}

/** Writes a file only its owner can read. The mode applies only when the file is new, so chmod too. */
export function writePrivate(file: string, data: string): void {
  writeFileSync(file, data, { mode: 0o600 });
  chmodSync(file, 0o600);
}
