/**
 * findCoachingResources: the web's best answer on a coaching topic with its
 * sources, so Ferni can point to one good resource instead of generic advice
 * (recommendResource only lists where to look). Only a scrubbed topic leaves
 * the call (topic-query.ts); results come back as data, and this tool loads
 * no tools and sends nothing. Behind COACH_MEDIA=on.
 *
 * @module tools/domains/learning/coaching-resources-tool
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { groundedAnswer } from '../../../services/coach-media/grounded-search.js';
import { groundedResultText } from '../../../services/coach-media/result-text.js';
import {
  coachMediaEnabled,
  sessionIdentifiers,
  topicOnlyQuery,
} from '../../../services/coach-media/topic-query.js';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolDefinition } from '../../registry/types.js';

export const FIND_COACHING_RESOURCES = 'findCoachingResources';

const DESCRIPTION =
  'Look up what actually helps with something they are working on (a stretch routine, a ' +
  'money habit, a hard conversation, a skill) and the best video, book or article on it, ' +
  'checked against the web. Use when they want a resource or real-world advice beyond what ' +
  'you know. Pass a GENERIC topic only (e.g. "beginner shin splint stretches"): never a ' +
  "name (theirs or anyone's), a place, an employer, a number, an email, an account or a " +
  'personal health detail.';

const parameters = z.object({
  topic: z
    .string()
    .describe(
      'A generic topic in a few words, e.g. "beginner shin splint stretches"; keep proper nouns capitalized; no names, places or personal details'
    ),
  format: z
    .enum(['any', 'video', 'book', 'article'])
    .optional()
    .describe('What kind of resource they want, if they said'),
  healthOrMoney: z
    .boolean()
    .optional()
    .describe('True for health, fitness, injury, mental health, money or investing topics'),
});

const FORMAT_WORD = { any: '', video: ' video', book: ' book', article: ' article' } as const;

const NOTHING =
  "Couldn't find a solid resource on that just now. Say so plainly rather than guessing a title or link.";

export async function runFindCoachingResources(
  args: z.infer<typeof parameters>,
  userData: Record<string, unknown>
): Promise<string> {
  const topic = topicOnlyQuery(args.topic, sessionIdentifiers(userData));
  if (!topic) return 'Ask what topic they want help with, in a few general words.';
  // Only the scrubbed topic and a fixed word go to search; no model text, no fit.
  const query = `${topic}${FORMAT_WORD[args.format ?? 'any']}`;
  getLogger().info({ format: args.format ?? 'any' }, 'coach-media: finding resources');
  const result = await groundedAnswer(query);
  return result ? groundedResultText(topic, result, args.healthOrMoney === true) : NOTHING;
}

const findCoachingResourcesDefinition: ToolDefinition = {
  id: FIND_COACHING_RESOURCES,
  name: 'Find Coaching Resources',
  description: DESCRIPTION,
  domain: 'learning',
  tags: ['learning', 'resources', 'coaching', 'video', 'book', 'search'],
  create: () =>
    llm.tool({
      description: DESCRIPTION,
      parameters,
      // The session's userData: the caller's name, so it can be kept out of the query.
      execute: async (args, run) =>
        runFindCoachingResources(
          args,
          ((run as Partial<typeof run> | undefined)?.ctx?.userData ?? {}) as Record<string, unknown>
        ),
    }),
};

/** The learning domain's share: findCoachingResources with COACH_MEDIA=on, nothing otherwise. */
export function coachingResourceTools(
  env: Record<string, string | undefined> = process.env
): ToolDefinition[] {
  return coachMediaEnabled(env) ? [findCoachingResourcesDefinition] : [];
}
