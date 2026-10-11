/**
 * findCoachingResources: the web's best answer on a coaching topic, with the
 * pages it came from, so Ferni can point to one good video, book or article
 * instead of generic advice (recommendResource only lists where to look).
 * For a video, short or book it returns ONE pick, checked by Gemini against
 * what fits this person (services/coach-media/checked-pick.ts).
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
import { bookCandidates, videoCandidates } from '../../../services/coach-media/candidates.js';
import { checkedPick } from '../../../services/coach-media/checked-pick.js';
import { fitContext } from '../../../services/coach-media/fit.js';
import { groundedAnswer } from '../../../services/coach-media/grounded-search.js';
import { groundedResultText, pickResultText } from '../../../services/coach-media/result-text.js';
import { coachMediaEnabled, topicOnlyQuery } from '../../../services/coach-media/topic-query.js';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolContext, ToolDefinition } from '../../registry/types.js';

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
    .enum(['any', 'video', 'short', 'book', 'article'])
    .optional()
    .describe('What kind of resource they want, if they said'),
  healthOrMoney: z
    .boolean()
    .optional()
    .describe('True for health, fitness, injury, mental health, money or investing topics'),
  fit: z
    .string()
    .optional()
    .describe('What suits them, no names: level, time they have, constraints, what they liked'),
});

const NONE_FIT =
  'Checked the top results and none was a good fit or well grounded. Say so honestly rather than recommend a weak one.';

const NOTHING =
  "Couldn't find a solid resource on that just now. Say so plainly rather than guessing a title or link.";

export async function runFindCoachingResources(
  args: z.infer<typeof parameters>,
  userData: Record<string, unknown>,
  userId?: string
): Promise<string> {
  const names = [userData.name, userData.userName, userData.preferredName].map((n) =>
    typeof n === 'string' ? n : undefined
  );
  const topic = topicOnlyQuery(args.topic, names);
  if (!topic) return 'Ask what topic they want help with, in a few general words.';
  const sensitive = args.healthOrMoney === true;
  const format = args.format ?? 'any';
  getLogger().info({ format }, 'coach-media: finding resources');
  if (format === 'video' || format === 'short' || format === 'book') {
    const candidates =
      format === 'book'
        ? await bookCandidates(topic)
        : await videoCandidates(topic, format === 'short');
    const fit = await fitContext(userId, args.fit, names);
    const pick = await checkedPick(candidates, topic, fit);
    if (pick) return pickResultText(topic, pick, sensitive);
    if (candidates.length > 0) return NONE_FIT;
  }
  const query = format === 'article' ? `${topic} article` : topic;
  const result = await groundedAnswer(query);
  return result ? groundedResultText(topic, result, sensitive) : NOTHING;
}

const findCoachingResourcesDefinition: ToolDefinition = {
  id: FIND_COACHING_RESOURCES,
  name: 'Find Coaching Resources',
  description: DESCRIPTION,
  domain: 'learning',
  tags: ['learning', 'resources', 'coaching', 'video', 'book', 'search'],
  create: (ctx: ToolContext) =>
    llm.tool({
      description: DESCRIPTION,
      parameters,
      // The session's userData: the caller's name, so it can be kept out of the query.
      execute: async (args, run) =>
        runFindCoachingResources(
          args,
          ((run as Partial<typeof run> | undefined)?.ctx?.userData ?? {}) as Record<
            string,
            unknown
          >,
          ctx.userId
        ),
    }),
};

/** The learning domain's share: findCoachingResources with COACH_MEDIA=on, nothing otherwise. */
export function coachingResourceTools(
  env: Record<string, string | undefined> = process.env
): ToolDefinition[] {
  return coachMediaEnabled(env) ? [findCoachingResourcesDefinition] : [];
}
