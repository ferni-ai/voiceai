#!/usr/bin/env node
/**
 * Generate Motion Sequences for Web
 *
 * Auto-generates apps/web/src/config/sequences.generated.ts (typed data)
 * from design-system/tokens/sequences.json, so the app plays the
 * choreography designers write in the tokens instead of hand-copied timings.
 * The first reader is the call arrival (the arrival_* sequences).
 *
 * Usage:
 *   node design-system/generate-sequences.js
 *   pnpm build:sequences
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeIfChanged } from './lib/write-if-changed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.dirname(__dirname);

const CONFIG = {
  source: path.join(__dirname, 'tokens/sequences.json'),
  output: path.join(PROJECT_ROOT, 'apps/web/src/config/sequences.generated.ts'),
};

/** Sequences only: keys starting with "_" are documentation. */
function sequencesOf(tokens) {
  return Object.fromEntries(
    Object.entries(tokens.sequences ?? {}).filter(
      ([id, s]) => !id.startsWith('_') && s && Array.isArray(s.steps)
    )
  );
}

function simplificationsOf(tokens, ids) {
  const all = tokens.reducedMotion?.simplifications ?? {};
  return Object.fromEntries(Object.entries(all).filter(([id]) => ids.includes(id)));
}

export function generate(tokens) {
  const sequences = sequencesOf(tokens);
  const ids = Object.keys(sequences);
  const reduced = simplificationsOf(tokens, ids);
  return `/**
 * Motion Sequences - Auto-Generated
 * 🎬 AUTO-GENERATED FROM design-system/tokens/sequences.json
 * Do not edit directly - run: pnpm build:sequences
 *
 * ${ids.length} sequences. Each step animates one element after \`delay\` ms; a sequence has
 * at most one sound and one haptic, so a moment never stacks chimes or buzzes.
 */

export type SequenceId =
${ids.map((id) => `  | '${id}'`).join('\n')};

export interface SequenceStep {
  readonly element: string;
  readonly animation: string;
  readonly delay: number;
  readonly duration: number;
  readonly easing?: string;
  readonly stagger?: number;
  readonly repeat?: number;
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly description?: string;
  /** Older sequences carry extra, free-form keys. */
  readonly [extra: string]: unknown;
}

export interface Sequence {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly trigger: string;
  readonly totalDuration: number;
  readonly interruptible: boolean;
  readonly emotion?: string;
  readonly steps: readonly SequenceStep[];
  readonly sound?: { readonly track: string; readonly delay: number; readonly volume?: number; readonly [extra: string]: unknown };
  readonly haptic?: { readonly pattern: string; readonly delay: number; readonly [extra: string]: unknown };
  readonly [extra: string]: unknown;
}

export interface ReducedMotionSimplification {
  readonly description?: string;
  readonly replaceWith?: readonly Partial<SequenceStep>[];
  readonly removeSteps?: readonly string[];
  readonly modifySteps?: Readonly<Record<string, Partial<SequenceStep>>>;
  readonly [extra: string]: unknown;
}

export const SEQUENCES: Readonly<Record<SequenceId, Sequence>> = ${JSON.stringify(sequences, null, 2)};

export const REDUCED_MOTION: Readonly<Partial<Record<SequenceId, ReducedMotionSimplification>>> = ${JSON.stringify(reduced, null, 2)};
`;
}

function main() {
  const tokens = JSON.parse(fs.readFileSync(CONFIG.source, 'utf8'));
  const changed = writeIfChanged(CONFIG.output, generate(tokens));
  console.log(
    `${changed ? '✅ Wrote' : '✓ Unchanged'} ${path.relative(PROJECT_ROOT, CONFIG.output)}`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
