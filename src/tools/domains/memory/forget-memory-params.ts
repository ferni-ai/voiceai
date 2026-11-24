/**
 * The forgetMemory tool's parameters and description (tools.ts), as the model
 * sees them.
 *
 * `alsoAbout` names what belongs to the topic without repeating its words:
 * every forget check matches words, so "the Denver job" alone left the
 * recruiter call it was about (memory/recall/forget-related.ts). Only with
 * FORGET_RELATED_WORDS on is it offered and its hint added; off, both are
 * main's exactly, so the model is never told words it names are kept out when
 * nothing applies them.
 *
 * @module tools/domains/memory/forget-memory-params
 */
import { z } from 'zod';
import { flagOn, type Env } from '../../../config/env-flag.js';

const base = {
  whatToForget: z.string().describe('What the user wants you to forget'),
  confirmDeletion: z.boolean().describe('Whether the user has confirmed they want this forgotten'),
};

const alsoAbout = z
  .array(z.string())
  .optional()
  .describe(
    'Up to 5 specific people, places, plans or things from this conversation that belong to what they want forgotten but do not repeat its words. For "the Denver job": "the recruiter", "job offer", "the move". Never general words ("work", "family", "plans"), and never anything the user did not tie to it. Leave empty when nothing else belongs to it.'
  );

const ALSO_ABOUT_HINT =
  ' In alsoAbout, name the specific people, places or plans from this conversation that belong to it but don\'t share its words (for "the Denver job": "the recruiter", "job offer"), so they are kept out too; never general words or anything they didn\'t tie to it.';

/** The parameters: main's two, plus alsoAbout with FORGET_RELATED_WORDS on. */
export function parameters(env: Env = process.env) {
  return flagOn('FORGET_RELATED_WORDS', env) ? z.object({ ...base, alsoAbout }) : z.object(base);
}

/** The description: main's, plus the alsoAbout hint with FORGET_RELATED_WORDS on. */
export function description(description: string, env: Env = process.env): string {
  return flagOn('FORGET_RELATED_WORDS', env) ? `${description}${ALSO_ABOUT_HINT}` : description;
}

/** The related words in the tool's arguments; none when the parameter wasn't offered (flag off). */
export function alsoAboutOf(args: object): unknown[] | undefined {
  const related: unknown = 'alsoAbout' in args ? args.alsoAbout : undefined;
  return Array.isArray(related) ? related : undefined;
}
