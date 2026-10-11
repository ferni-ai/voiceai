/**
 * findCoachingResources: the web's best answer on a coaching topic, with the
 * pages it came from, so Ferni can point to one good video, book or article
 * instead of generic advice (recommendResource only lists where to look).
 *
 * Only the topic leaves the call: the caller's name, numbers, emails and links
 * are scrubbed from the query (services/coach-media/topic-query.ts). What comes
 * back is web text, returned as quoted data; this tool loads no tools and
 * sends nothing.
 *
 * Behind COACH_MEDIA=on; off, the learning domain does not include it.
 *
 * @module tools/domains/learning/coaching-resources-tool
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { groundedAnswer } from '../../../services/coach-media/grounded-search.js';
import { groundedResultText } from '../../../services/coach-media/result-text.js';
import { coachMediaEnabled, topicOnlyQuery } from '../../../services/coach-media/topic-query.js';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolDefinition } from '../../registry/types.js';

export const FIND_COACHING_RESOURCES = 'findCoachingResources';

const DESCRIPTION =
  'Look up what actually helps with something they are working on (a stretch routine, a ' +
  'money habit, a hard conversation, a skill) and the best video, book or article on it, ' +
  'checked against the web. Use when they want a resource or real-world advice beyond what ' +
  'you know. Pass the TOPIC ONLY, in general words: never their name, a phone number, ' +
  'an email, an account or a personal health detail.';

const parameters = z.object({
  topic: z.string().describe('General topic words only, e.g. "beginner shin splint stretches"'),
  format: z
    .enum(['any', 'video', 'book', 'article'])
    .optional()
    .describe('What kind of resource they want, if they said'),
  healthOrMoney: z
    .boolean()
    .optional()
    .describe('True for health, fitness, injury, mental health, money or investing topics'),
});

const NOTHING =
  "Couldn't find a solid resource on that just now. Say so plainly rather than guessing a title or link.";

export async function runFindCoachingResources(
  args: z.infer<typeof parameters>,
  userData: Record<string, unknown>
): Promise<string> {
  const names = [userData.name, userData.userName, userData.preferredName].map((n) =>
    typeof n === 'string' ? n : undefined
  );
  const topic = topicOnlyQuery(args.topic, names);
  if (!topic) return 'Ask what topic they want help with, in a few general words.';
  const query = args.format && args.format !== 'any' ? `${topic} ${args.format}` : topic;
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
