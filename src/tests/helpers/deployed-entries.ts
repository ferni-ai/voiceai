/**
 * The script every deployed image starts: the CMD line of each docker/Dockerfile* and each
 * Dockerfile* at the repository root. A census of "every process does X at startup" reads the
 * entries from here, so a new image cannot be left out of it.
 *
 * It reads one form only: `CMD ["...", "<script>.js|.ts", ...]`. A Dockerfile it cannot read
 * (no such line, a shell-form CMD, an ENTRYPOINT) throws, so the census goes red rather than
 * passing without that image.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');

export function deployedEntries(root: string = ROOT): string[] {
  const dockerfiles = [
    ...readdirSync(join(root, 'docker')).map((f) => `docker/${f}`),
    ...readdirSync(root).filter((f) => f.startsWith('Dockerfile')),
  ].filter((f) => /Dockerfile/.test(f));
  return dockerfiles.flatMap((f) => {
    // One instruction per line: a HEALTHCHECK's `\` + CMD continuation is not a start line.
    const text = readFileSync(join(root, f), 'utf8').replace(/\\\r?\n/g, ' ');
    const entries = [...text.matchAll(/^CMD \[(.*)\]$/gm)].map((m) => {
      const args = JSON.parse(`[${m[1]}]`) as string[];
      return args.find((a) => /\.(js|ts)$/.test(a)) ?? '';
    });
    const startLines = text.match(/^\s*(?:CMD|ENTRYPOINT)\b/gm)?.length ?? 0;
    if (entries.length === 0 || entries.includes('') || startLines !== entries.length) {
      throw new Error(
        `${f}: every start line must be CMD ["...", "<script>.js|.ts"]; found ${startLines} CMD or ENTRYPOINT line(s), ${entries.filter(Boolean).length} readable`
      );
    }
    return entries;
  });
}
