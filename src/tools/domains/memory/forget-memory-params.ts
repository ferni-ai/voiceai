/**
 * The forgetMemory tool's parameters (tools.ts), as the model sees them.
 *
 * `alsoAbout` names what belongs to the topic without repeating its words:
 * every forget check matches words, so "the Denver job" alone left the
 * recruiter call it was about (memory/recall/forget-related.ts). It is applied
 * only with FORGET_RELATED_WORDS on.
 *
 * @module tools/domains/memory/forget-memory-params
 */
import { z } from 'zod';

export const forgetMemoryParams = z.object({
  whatToForget: z.string().describe('What the user wants you to forget'),
  confirmDeletion: z.boolean().describe('Whether the user has confirmed they want this forgotten'),
  alsoAbout: z
    .array(z.string())
    .optional()
    .describe(
      'Up to 5 specific people, places, plans or things from this conversation that belong to what they want forgotten but do not repeat its words. For "the Denver job": "the recruiter", "job offer", "the move". Never general words ("work", "family", "plans"), and never anything the user did not tie to it. Leave empty when nothing else belongs to it.'
    ),
});
