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
import {
  deliverPick,
  hasPick,
  recordPickFeedback,
  rememberPick,
} from '../../../services/coach-media/pick-delivery.js';
import { logOffered, recentPicks } from '../../../services/coach-media/pick-log.js';
import {
  boostFor,
  tasteFrom,
  tasteReason,
  tasteWords,
} from '../../../services/coach-media/taste.js';
import {
  GROUNDING_PER_USER_PER_DAY,
  takeDailyBudget,
} from '../../../services/coach-media/quota.js';
import { groundedAnswer } from '../../../services/coach-media/grounded-search.js';
import { groundedResultText, pickResultText } from '../../../services/coach-media/result-text.js';
import {
  coachMediaEnabled,
  sessionIdentifiers,
  topicOnlyQuery,
} from '../../../services/coach-media/topic-query.js';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolContext, ToolDefinition } from '../../registry/types.js';

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
      'A generic topic in a few words, e.g. "beginner shin splint stretches"; no names, places or personal details'
    ),
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

const OVER_DAILY_CAP =
  "That's a lot of lookups today; share what you know instead and offer to look it up tomorrow.";

const NOTHING =
  "Couldn't find a solid resource on that just now. Say so plainly rather than guessing a title or link.";

/** The call a tool runs on: its session object (keys this call's pick) and userData. */
interface Call {
  session?: object;
  userData: Record<string, unknown>;
}

function callOf(run: unknown): Call {
  const ctx = (run as { ctx?: { session?: object; userData?: unknown } } | undefined)?.ctx;
  return { session: ctx?.session, userData: (ctx?.userData ?? {}) as Record<string, unknown> };
}

export async function runFindCoachingResources(
  args: z.infer<typeof parameters>,
  call: Call,
  userId?: string
): Promise<string> {
  const started = Date.now();
  const names = sessionIdentifiers(call.userData);
  const topic = topicOnlyQuery(args.topic, names);
  if (!topic) return 'Ask what topic they want help with, in a few general words.';
  if (!(await takeDailyBudget(`grounding:${userId ?? 'anonymous'}`, GROUNDING_PER_USER_PER_DAY))) {
    return OVER_DAILY_CAP;
  }
  const sensitive = args.healthOrMoney === true;
  const format = args.format ?? 'any';
  getLogger().info({ format }, 'coach-media: finding resources');
  if (format === 'video' || format === 'short' || format === 'book') {
    const candidates =
      format === 'book'
        ? await bookCandidates(topic)
        : await videoCandidates(topic, format === 'short');
    const known = userId && userId !== 'anonymous' ? userId : undefined;
    const taste = tasteFrom(known ? await recentPicks(known) : []);
    const fit = [await fitContext(userId, args.fit, names), tasteWords(taste)]
      .filter(Boolean)
      .join('; ');
    const pick = await checkedPick(candidates, topic, fit, (c) => boostFor(taste, c, format));
    if (pick) {
      const c = pick.candidate;
      const pickId = known
        ? await logOffered(known, {
            topic,
            format,
            title: c.title,
            by: c.by,
            lengthSeconds: c.seconds,
            checked: pick.checked,
            latencyMs: Date.now() - started,
            firstInCall: !hasPick(call.session),
          })
        : undefined;
      rememberPick(call.session, { topic, candidate: c, why: pick.verdict?.why, pickId });
      return pickResultText(topic, pick, sensitive, tasteReason(taste, c, format));
    }
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
      execute: async (args, run) => runFindCoachingResources(args, callOf(run), ctx.userId),
    }),
};

export const COACHING_PICK = 'coachingPick';

const PICK_DESCRIPTION =
  'After findCoachingResources gave one pick on this call: send it, only when they asked ' +
  'or said yes (send_text to their verified number, send_app to their app messages); a ' +
  'follow-up to ask whether it helped is set for a few days later. Also: feedback, when ' +
  'they tell you whether something you sent helped.';

const pickParameters = z.object({
  action: z.enum(['send_text', 'send_app', 'feedback']),
  helped: z.enum(['yes', 'somewhat', 'no']).optional().describe('feedback: did it help'),
  whatMattered: z
    .string()
    .optional()
    .describe('feedback: what made it work or not, no names (e.g. "short follow-along videos")'),
});

export async function runCoachingPick(
  args: z.infer<typeof pickParameters>,
  call: Call,
  userId: string | undefined,
  personaId: string
): Promise<string> {
  if (args.action === 'feedback') {
    if (!args.helped) return 'Ask whether it helped first.';
    return recordPickFeedback(
      userId,
      { helped: args.helped, whatMattered: args.whatMattered },
      sessionIdentifiers(call.userData)
    );
  }
  return deliverPick(call.session, userId, args.action === 'send_text' ? 'text' : 'app', personaId);
}

const coachingPickDefinition: ToolDefinition = {
  id: COACHING_PICK,
  name: 'Coaching Pick',
  description: PICK_DESCRIPTION,
  domain: 'learning',
  tags: ['learning', 'resources', 'coaching', 'text', 'follow-up'],
  create: (ctx: ToolContext) =>
    llm.tool({
      description: PICK_DESCRIPTION,
      parameters: pickParameters,
      execute: async (args, run) => runCoachingPick(args, callOf(run), ctx.userId, ctx.agentId),
    }),
};

/** The learning domain's share with COACH_MEDIA=on (nothing otherwise). */
export function coachingResourceTools(
  env: Record<string, string | undefined> = process.env
): ToolDefinition[] {
  return coachMediaEnabled(env) ? [findCoachingResourcesDefinition, coachingPickDefinition] : [];
}
