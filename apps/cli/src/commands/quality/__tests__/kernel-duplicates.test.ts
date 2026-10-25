import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  kernelDeclarations,
  lowerKernelBaseline,
  newDuplicates,
  toKernelBaseline,
} from '../kernel-duplicates.js';

let root: string;
function repo(files: Record<string, string>): { root: string; files: string[] } {
  root = mkdtempSync(join(tmpdir(), 'kernel-dupes-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return { root, files: Object.keys(files) };
}
const inKernel = (f: string): boolean => f.startsWith('src/types/');
const decls = (files: Record<string, string>) => {
  const r = repo(files);
  return kernelDeclarations(r.root, r.files);
};

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe('kernel-duplicate: what counts as a declaration', () => {
  it('finds top-level type, interface, enum and class declarations, exported or not, with lines', () => {
    const found = decls({
      'src/a.ts': "export type PersonaId = 'ferni';\n",
      'src/b.ts': '\ninterface RelationshipStage { s: string }\n',
      'src/c.ts': 'export enum ConversationTurn { A }\n',
      'src/d.ts': 'export class ContextInjection {}\n',
    });
    expect(found.map((d) => `${d.name} ${d.file}:${d.line}`).sort()).toEqual([
      'ContextInjection src/d.ts:1',
      'ConversationTurn src/c.ts:1',
      'PersonaId src/a.ts:1',
      'RelationshipStage src/b.ts:2',
    ]);
  });

  it('ignores imports, re-exports, aliases and look-alike names', () => {
    expect(
      decls({
        'src/a.ts': "import type { PersonaId } from './k.js';\nexport type { PersonaId } from './k.js';\n",
        'src/b.ts': "export { X as RelationshipStage } from './k.js';\nexport type PersonaIdLike = string;\n",
        'src/c.ts': 'export function f(p: PersonaId): void {}\nconst ConversationTurn = 1;\n',
      })
    ).toEqual([]);
  });
});

describe('kernel-duplicate: ratchet', () => {
  const files = {
    'src/types/persona.ts': 'export type PersonaId = string;\n',
    'src/memory/old.ts': "export type PersonaId = 'peter';\n",
  };

  it('passes on the grandfathered declarations', () => {
    const now = decls(files);
    expect(newDuplicates(toKernelBaseline(now), now, inKernel)).toEqual([]);
  });

  it('fails on a new declaration outside the kernel', () => {
    const base = toKernelBaseline(decls(files));
    const now = decls({ ...files, 'src/tools/new.ts': "export type PersonaId = 'maya';\n" });
    expect(newDuplicates(base, now, inKernel).map((d) => `${d.name} ${d.file}`)).toEqual(['PersonaId src/tools/new.ts']);
  });

  it('allows the first kernel declaration of a name, but not a second one in the kernel', () => {
    const base = toKernelBaseline(decls(files));
    const first = decls({ ...files, 'src/types/turn.ts': 'export interface ConversationTurn { text: string }\n' });
    expect(newDuplicates(base, first, inKernel)).toEqual([]);
    const second = decls({ ...files, 'src/types/persona2.ts': 'export type PersonaId = string;\n' });
    expect(newDuplicates(base, second, inKernel).map((d) => d.file)).toEqual(['src/types/persona2.ts']);
  });

  it('lowers the baseline when a duplicate is deleted, and never adds', () => {
    const base = toKernelBaseline(decls(files));
    const now = decls({ 'src/types/persona.ts': files['src/types/persona.ts'], 'src/x.ts': 'type PersonaId = 1;\n' });
    expect(lowerKernelBaseline(base, now).PersonaId).toEqual(['src/types/persona.ts']);
  });
});
