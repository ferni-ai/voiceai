/**
 * The people in the personas' own lives (Ferni's friends Jack and Jim, Nayan's
 * late wife Jyoti): every bundle's identity/people.json, read where the bundle
 * loader looks. They exist only in the story, so a tool that calls, texts or
 * emails someone must never take one of them for a real person
 * (tools/registry/outbound-gate.ts).
 *
 * @module personas/canon-people
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

let cached: Promise<ReadonlySet<string>> | undefined;

/** The lower-case first names from every bundle's identity/people.json; empty when none load. */
export function canonPeople(): Promise<ReadonlySet<string>> {
  cached ??= (async () => {
    const { getBundleSearchPaths } = await import('./bundles/loader.js');
    const names = new Set<string>();
    for (const root of getBundleSearchPaths()) {
      const bundles = await readdir(root).catch(() => [] as string[]);
      for (const bundle of bundles) {
        const text = await readFile(join(root, bundle, 'identity', 'people.json'), 'utf8').catch(
          () => ''
        );
        for (const n of namesIn(text)) names.add(n.trim().toLowerCase());
      }
    }
    return names;
  })().catch(() => new Set<string>());
  return cached;
}

/** The string names in one people.json; none when it is missing or malformed. */
function namesIn(text: string): string[] {
  try {
    const { names } = JSON.parse(text || '{}') as { names?: unknown };
    return Array.isArray(names) ? names.filter((n): n is string => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

/** The canon name `target` refers to ("Jim", "my friend Jim", "jim's cell"), or null. */
export function canonPersonIn(target: string, people: ReadonlySet<string>): string | null {
  const words = target.toLowerCase().match(/[a-z]+/g) ?? [];
  return words.find((w) => people.has(w)) ?? null;
}

/** Test seam: forget the loaded names. */
export function resetCanonPeopleForTest(): void {
  cached = undefined;
}
