/**
 * Guards for runs on real calls (build-private-cases.ts, longmem.ts --cases,
 * grade-human.ts). Real speech must reach only Vertex AI: callLLM and the
 * embedding provider both fall back to OpenAI, so these refuse to run unless
 * that fallback cannot happen. Call them from main(), after the imports, so
 * a key loaded from a .env file is seen.
 */
import { chmodSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, sep } from 'node:path';

export function assertVertexOnly(env: NodeJS.ProcessEnv = process.env): void {
  const problems: string[] = [];
  if (env.OPENAI_API_KEY) {
    problems.push('OPENAI_API_KEY is set: callLLM would fall back to OpenAI');
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
        'unset OPENAI_API_KEY and USE_VERTEX_AI=false, and set GOOGLE_CLOUD_PROJECT'
    );
  }
}

/** Whether `path` is `root` or inside it. */
export function isInside(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel.split(sep)[0] !== '..');
}

/** Writes a file only its owner can read. The mode applies only when the file is new, so chmod too. */
export function writePrivate(file: string, data: string): void {
  writeFileSync(file, data, { mode: 0o600 });
  chmodSync(file, 0o600);
}
