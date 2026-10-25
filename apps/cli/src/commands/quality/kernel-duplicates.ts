/**
 * Kernel-duplicate rule for the architecture gate: a shared-kernel noun (PersonaId,
 * RelationshipStage, ConversationTurn, ContextInjection) declared again outside L2.
 *
 * On 2026-10-23 PersonaId had 20 exported declarations with incompatible value sets
 * ('peter-john' vs 'peter'), RelationshipStage 18 in five vocabularies, ConversationTurn
 * 11 and ContextInjection 5 (code-health ddd.md §0.3, G3). Today's declarations are
 * grandfathered in kernel-duplicates-baseline.json; a new one fails. L2 (src/types,
 * src/utils, ...) may hold one declaration of each name: that is where the kernel goes.
 *
 * A declaration is a top-level `type`, `interface`, `enum` or `class` with that name,
 * exported or not. `export { X as PersonaId }` and imports are uses, not declarations.
 *
 * @module quality/kernel-duplicates
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import ts from 'typescript';
import { fileURLToPath } from 'url';

export const KERNEL_TYPES = ['PersonaId', 'RelationshipStage', 'ConversationTurn', 'ContextInjection'] as const;
export type KernelType = (typeof KERNEL_TYPES)[number];
/** name → files that declare it, sorted. */
export type KernelBaseline = Record<KernelType, string[]>;
export const KERNEL_BASELINE = join(dirname(fileURLToPath(import.meta.url)), 'kernel-duplicates-baseline.json');

export interface KernelDeclaration { name: KernelType; file: string; line: number }

const MENTION = new RegExp(`\\b(${KERNEL_TYPES.join('|')})\\b`);

/** Every top-level declaration of a kernel type name in `files` (paths relative to `root`). */
export function kernelDeclarations(root: string, files: string[]): KernelDeclaration[] {
  const out: KernelDeclaration[] = [];
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8');
    if (!MENTION.test(text)) continue; // cheap prefilter: most files never mention them
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    for (const s of sf.statements) {
      const declares =
        ts.isTypeAliasDeclaration(s) || ts.isInterfaceDeclaration(s) || ts.isEnumDeclaration(s) || ts.isClassDeclaration(s);
      const name = declares ? s.name?.text : undefined;
      if (name && (KERNEL_TYPES as readonly string[]).includes(name)) {
        out.push({ name: name as KernelType, file, line: sf.getLineAndCharacterOfPosition(s.getStart()).line + 1 });
      }
    }
  }
  return out;
}

export function toKernelBaseline(decls: KernelDeclaration[]): KernelBaseline {
  const files = (n: KernelType): string[] => [...new Set(decls.filter((d) => d.name === n).map((d) => d.file))].sort();
  return Object.fromEntries(KERNEL_TYPES.map((n) => [n, files(n)])) as KernelBaseline;
}

/**
 * Declarations not in the baseline. The first L2 declaration of a name is allowed (the
 * kernel itself); any other new one, in L2 or out, is a duplicate.
 */
export function newDuplicates(
  base: KernelBaseline,
  now: KernelDeclaration[],
  inKernel: (file: string) => boolean
): KernelDeclaration[] {
  const known = (d: KernelDeclaration): boolean => (base[d.name] ?? []).includes(d.file);
  return now.filter((d) => {
    if (known(d)) return false;
    if (!inKernel(d.file)) return true;
    const kernelOnes = now.filter((o) => o.name === d.name && inKernel(o.file));
    return kernelOnes.length > 1;
  });
}

/** Lowered baseline: entries whose declaration is gone are dropped; nothing is added. */
export function lowerKernelBaseline(base: KernelBaseline, now: KernelDeclaration[]): KernelBaseline {
  const current = toKernelBaseline(now);
  return Object.fromEntries(
    KERNEL_TYPES.map((n) => [n, (base[n] ?? []).filter((f) => current[n].includes(f))])
  ) as KernelBaseline;
}

/**
 * The gate step: checks (or with --init / --update records) the kernel declarations.
 * Returns true when it found new duplicates, so the caller can fail the run.
 */
export function kernelDuplicateGate(
  root: string,
  files: string[],
  inKernel: (file: string) => boolean,
  args: string[],
  say: (t: string) => unknown
): boolean {
  const now = kernelDeclarations(root, files);
  const counts = KERNEL_TYPES.map((n) => `${n} ${now.filter((d) => d.name === n).length}`).join(', ');
  say(`\nKernel types declared (kernel-duplicate rule): ${counts}.`);
  const write = (b: KernelBaseline): void => writeFileSync(KERNEL_BASELINE, JSON.stringify(b, null, 1) + '\n');
  if (args.includes('--init')) {
    write(toKernelBaseline(now));
    return false;
  }
  if (!existsSync(KERNEL_BASELINE)) throw new Error(`No baseline at ${KERNEL_BASELINE}: run with --init`);
  const base = JSON.parse(readFileSync(KERNEL_BASELINE, 'utf8')) as KernelBaseline;
  if (args.includes('--update')) write(lowerKernelBaseline(base, now));
  const added = newDuplicates(base, now, inKernel);
  if (added.length === 0) return false;
  say(`\n❌ ${added.length} new declaration(s) of a shared-kernel type name:`);
  for (const d of added) {
    say(`  kernel-duplicate  ${d.file}:${d.line} declares ${d.name}\n      fix: import the existing ${d.name} (one per name in L2: src/types/), or name your type for what it means here`);
  }
  return true;
}
