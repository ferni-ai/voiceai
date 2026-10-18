/**
 * findCoachingResources: the web's best answer on a coaching topic with its
 * sources, so Ferni can point to one good resource instead of generic advice
 * (recommendResource only lists where to look). Only a scrubbed topic leaves
 * the call (topic-query.ts); results come back as data, and this tool loads
 * no tools and sends nothing. For a video, short or book it returns ONE pick,
 * checked against what fits this person (checked-pick.ts). Behind COACH_MEDIA=on.
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
import {
  groundedResultText,
  pickResultText,
  useRegisteredToolNames,
} from '../../../services/coach-media/result-text.js';
import {
  coachMediaEnabled,
  sessionIdentifiers,
  topicOnlyQuery,
} from '../../../services/coach-media/topic-query.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { isSyntheticUserId } from '../../../utils/synthetic-user.js';
import { ownerKnown, testAccountReply } from '../communication/outreach/outreach-confirm.js';
import { toolRegistry } from '../../registry/index.js';
import type { ToolContext, ToolDefinition } from '../../registry/types.js';
import { isMemberIdentity } from '../../../services/identity/member-identity.js';

// Brands like iPhone may stay in web text; registered tool names never do.
useRegisteredToolNames(() => toolRegistry.getAllIds());

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
  "Couldn't vet a good, well-grounded one this time. Say so honestly rather than recommend one unchecked.";

const NO_ACCOUNT =
  "Can't look that up on this call; share what you know and suggest they ask again once signed in.";

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
  // No account, no per-user cap to hold it to: no paid lookups.
  if (!isMemberIdentity(userId)) return NO_ACCOUNT;
  if (!(await takeDailyBudget(`grounding:${userId}`, GROUNDING_PER_USER_PER_DAY))) {
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
    const known = isMemberIdentity(userId) ? userId : undefined;
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
            creatorId: c.creatorId,
            latencyMs: Date.now() - started,
            firstInCall: !hasPick(call.session),
          })
        : undefined;
      rememberPick(call.session, { topic, candidate: c, why: pick.verdict?.why, pickId });
      return pickResultText(topic, pick, sensitive, tasteReason(taste, c, format));
    }
    if (candidates.length > 0) return NONE_FIT;
  }
  // Only the scrubbed topic and a fixed word go to search; no model text, no fit.
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
  const how = args.action === 'send_text' ? 'text' : 'app';
  // A text reaches the owner's phone: only when the speaker is known to be the
  // owner. Unknown counts as no, whatever session path built this call.
  if (how === 'text' && isSyntheticUserId(userId)) return testAccountReply(COACHING_PICK);
  if (how === 'text' && !ownerKnown(call.session))
    return "Nothing was sent: a text goes only to the account owner, and I can't tell they're the one on the line. Offer the app instead.";
  return deliverPick(call.session, userId, how, personaId);
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
