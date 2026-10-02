/**
 * Work & career statements in the user's own words (and in summaries).
 *
 *   "I work at Acme" / "I just started at Beta"     → job (current; replaces the old one)
 *   "I used to work at Acme" / "I left Acme"        → job (past)
 *   "I work as a nurse" / "I got promoted to lead"  → role on the current job (+ a win)
 *   "I'm on the platform team"                      → team on the current job
 *   "working on the Q3 launch"                      → project
 *   "I closed the deal" / "we shipped the redesign" → win
 *   "work has been crazy" / "my boss keeps ..."     → stress
 *   "I have an interview at Stripe next Tuesday"    → event (reminded via important dates)
 *   "I want to get promoted"                        → goal
 *
 * Pure: no I/O. Capture decides how to apply the result.
 *
 * @module services/work-and-places/work-capture
 */

import {
  ADDITIONAL_RE,
  BE,
  cleanName,
  dateFromPhrase,
  firstPerson,
  NAME,
  NEGATION_RE,
  sentenceCase,
  sentences,
  SUBJ,
  thisMonth,
} from './text-patterns.js';
import type { LifeInput, LifeSource, WorkEventType } from './types.js';

export interface WorkCapture {
  readonly inputs: LifeInput[];
  /** Role / team said without an employer: belongs to the current job. */
  readonly currentJobPatch?: { role?: string; team?: string };
  /** "I quit my job" / "I got laid off" without naming the employer. */
  readonly leftCurrentJob?: boolean;
}

interface Ctx {
  readonly source: LifeSource;
  readonly confidence: number;
  readonly conversationId?: string;
  readonly now: Date;
}

const ROLE = String.raw`([a-z][a-z /&-]{2,40}?)`;
const ROLE_END = String.raw`(?=\s+(?:at|for|and|but|in|on|with|since|now)\b|[.,!?;]|$)`;
const PROJECT_NOUN =
  'project|launch|migration|release|pitch|proposal|presentation|report|rollout|redesign|campaign|audit|deal|merger|integration|product';

const re = (source: string, flags = 'u') => new RegExp(source, flags);

const CURRENT_JOB = [
  re(
    `${SUBJ}(?:${BE})?\\s+(?:currently\\s+|now\\s+|still\\s+|also\\s+)?(?:works?|working|employed)\\s+(?:at|for)\\s+${NAME}`
  ),
  re(`\\b[Mm]y\\s+(?:new\\s+)?(?:job|work|company|employer)\\s+(?:at|is)\\s+${NAME}`),
];
const NEW_JOB = [
  re(
    `${SUBJ}\\s+(?:just\\s+|recently\\s+|finally\\s+)?(?:started|joined)\\s+(?:a\\s+new\\s+job\\s+|working\\s+|my\\s+new\\s+job\\s+)?(?:at|with|for)?\\s*${NAME}`
  ),
  re(
    `${SUBJ}\\s+(?:just\\s+|finally\\s+)?(?:got|landed|accepted)\\s+(?:a|the|an)\\s+(?:new\\s+)?(?:job|offer|position|role)\\s+(?:at|with|from)\\s+${NAME}`
  ),
  re(`${SUBJ}\\s+(?:just\\s+)?got\\s+hired\\s+(?:at|by)\\s+${NAME}`),
  re(`\\b[Mm]y\\s+first\\s+(?:day|week)\\s+at\\s+${NAME}`),
];
const PAST_JOB = [
  re(`${SUBJ}\\s+(?:used\\s+to\\s+work|worked)\\s+(?:at|for)\\s+${NAME}`),
  re(
    `\\b[Mm]y\\s+(?:old|previous|last|former)\\s+(?:job|company|employer)\\s+(?:at|was)\\s+${NAME}`
  ),
];
const LEFT_JOB = [
  re(
    `${SUBJ}\\s+(?:just\\s+|finally\\s+)?(?:left|quit|resigned\\s+from|retired\\s+from)\\s+(?:my\\s+job\\s+at\\s+)?${NAME}`
  ),
  re(
    `${SUBJ}\\s+(?:just\\s+)?(?:got|was|were)\\s+(?:laid\\s+off|let\\s+go|fired)\\s+(?:from|by)\\s+${NAME}`
  ),
];
const LEFT_UNNAMED =
  /\b(?:I|we)\s+(?:just\s+|finally\s+)?(?:quit|left|lost)\s+my\s+job\b|\b(?:I|we)\s+(?:just\s+)?(?:got|was)\s+(?:laid off|let go|fired)\b/;

const ROLE_RES = [
  re(`${SUBJ}\\s+works?\\s+as\\s+(?:a|an)\\s+${ROLE}${ROLE_END}`),
  re(
    `\\b[Mm]y\\s+(?:job\\s+title|title|role|position)\\s+is\\s+(?:a\\s+|an\\s+)?${ROLE}${ROLE_END}`
  ),
  re(`${SUBJ}${BE}\\s+(?:a|an)\\s+${ROLE}\\s+(?:at|for)\\s+${NAME}`),
];
const PROMOTED = re(
  `${SUBJ}\\s+(?:just\\s+)?(?:got|was)\\s+promoted(?:\\s+to\\s+${ROLE}${ROLE_END})?`
);
const TEAM = re(
  `${SUBJ}(?:${BE}\\s+(?:on|in)|\\s+(?:lead|leads|run|runs|manage|manages|joined))\\s+the\\s+([A-Za-z][\\w -]{1,30}?)\\s+team\\b`
);

const PROJECT_ACTIVE = re(
  `\\b(?:working\\s+on|launching|shipping|leading|running|finishing|wrapping\\s+up|preparing|prepping)\\s+(?:the|a|our|my)\\s+([\\w'’ -]{1,30}?\\s*(?:${PROJECT_NOUN}))\\b`
);
const PROJECT_DONE = re(
  `${SUBJ}\\s+(?:finally\\s+|just\\s+)?(?:shipped|launched|finished|wrapped\\s+up|delivered|completed|closed)\\s+(?:the|a|our|my)\\s+([\\w'’ -]{1,30}?\\s*(?:${PROJECT_NOUN}))\\b`
);
const WINS: ReadonlyArray<[RegExp, string]> = [
  [/\b(?:I|we)\s+(?:just\s+)?got\s+a\s+raise\b/, 'Got a raise'],
  [
    /\b(?:I|we)\s+(?:just\s+)?(?:nailed|crushed|aced)\s+(?:the|my|our)\s+(presentation|interview|pitch|demo|review|talk)\b/,
    'Nailed the $1',
  ],
  [
    /\b(?:I|we)\s+(?:just\s+)?(?:won|got)\s+(?:an?|the)\s+(award|bonus|grant|contract|client)\b/,
    'Won the $1',
  ],
  [
    /\bmy\s+(?:boss|manager)\s+(?:praised|thanked|recognized)\s+me\b/,
    'Recognised by their manager',
  ],
];
const STRESS_LOAD =
  /\b(?:work|my job)(?:['’]s|\s+is|\s+has\s+been)\s+(?:so\s+|really\s+|super\s+|pretty\s+|kind of\s+)?(stressful|crazy|overwhelming|intense|brutal|exhausting|hectic|a lot|rough|toxic)\b/i;
const STRESS_BOSS =
  /\bmy\s+(boss|manager|team lead|coworker|co-worker|colleague)\s+(?:is|has been|keeps|won['’]t|never|always)\s+([^.!?]{3,60})/i;
const STRESS_BURNOUT =
  /\b(?:I['’]m|I am|I feel|I've been)\s+(?:so\s+|really\s+|totally\s+)?(?:burn(?:ed|t)\s+out|overworked|drowning at work)\b/i;

const EVENT_RES: ReadonlyArray<[RegExp, WorkEventType]> = [
  [
    re(
      `\\b(?:I|we)\\s+(?:have|['’]ve\\s+got|got|had|have\\s+got)\\s+(?:a|an|my|the)\\s+(?:second\\s+|final\\s+|phone\\s+|job\\s+|big\\s+)*interview\\s+(?:at|with)\\s+${NAME}([^.!?]*)`
    ),
    'interview',
  ],
  [/\b(?:my|the|a)\s+(?:annual\s+|performance\s+|quarterly\s+)+review\b([^.!?]*)/i, 'review'],
  [
    /\b(?:I|we)\s+(?:have|['’]ve got|had)\s+(?:a|my|the|our)\s+(?:big\s+)?(presentation|pitch|demo|talk)\b([^.!?]*)/,
    'presentation',
  ],
  [/\b(?:a|my|the|our)\s+(?:big\s+)?deadline\b([^.!?]*)/i, 'deadline'],
];
const GOAL = re(
  `${SUBJ}\\s+(?:really\\s+)?(?:want|hope|['’]d\\s+like|would\\s+like|plan|am\\s+hoping|['’]m\\s+hoping)\\s+to\\s+(get\\s+promoted|become\\s+(?:a|an)\\s+[a-z ]{3,30}?|move\\s+into\\s+[a-z ]{3,30}?|switch\\s+careers?|change\\s+careers?|start\\s+my\\s+own\\s+(?:business|company)|lead\\s+a\\s+team|find\\s+a\\s+new\\s+job|ask\\s+for\\s+a\\s+raise|go\\s+back\\s+to\\s+school)(?=[.,!?;]|\\s+(?:by|this|next|before|and|but)\\b|$)`
);

function job(ctx: Ctx, employer: string, extra: Partial<LifeInput> = {}): LifeInput {
  return {
    area: 'work',
    kind: 'job',
    subject: employer,
    employer,
    source: ctx.source,
    confidence: ctx.confidence,
    conversationId: ctx.conversationId,
    ...extra,
  };
}

function item(
  ctx: Ctx,
  kind: LifeInput['kind'],
  subject: string,
  extra: Partial<LifeInput> = {}
): LifeInput {
  return {
    area: 'work',
    kind,
    subject,
    source: ctx.source,
    confidence: ctx.confidence,
    conversationId: ctx.conversationId,
    ...extra,
  };
}

function cleanRole(raw: string | undefined): string {
  const role = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (role.length < 3 || /^(mess|wreck|bit|lot|fan|little|big|good|bad)\b/.test(role)) return '';
  return role;
}

function parseSentence(
  s: string,
  ctx: Ctx,
  out: LifeInput[],
  patch: { role?: string; team?: string }
): boolean {
  if (NEGATION_RE.test(s) && !/\bno longer\b/.test(s)) return false;
  let left = false;
  const additional = ADDITIONAL_RE.test(s);
  const thisMonthStr = thisMonth(ctx.now);

  for (const r of LEFT_JOB) {
    const employer = cleanName(r.exec(s)?.[1]);
    if (employer) out.push(job(ctx, employer, { status: 'past', endDate: thisMonthStr }));
  }
  if (/\bno longer\s+work(?:s|ing)?\s+(?:at|for)\b/.test(s)) {
    const employer = cleanName(re(`(?:at|for)\\s+${NAME}`).exec(s)?.[1]);
    if (employer) out.push(job(ctx, employer, { status: 'past' }));
  } else {
    for (const r of PAST_JOB) {
      const employer = cleanName(r.exec(s)?.[1]);
      if (employer) out.push(job(ctx, employer, { status: 'past' }));
    }
  }
  if (LEFT_UNNAMED.test(s) && !out.some((i) => i.kind === 'job' && i.status === 'past'))
    left = true;

  for (const r of NEW_JOB) {
    const employer = cleanName(r.exec(s)?.[1]);
    if (employer)
      out.push(job(ctx, employer, { status: 'current', startDate: thisMonthStr, additional }));
  }
  for (const r of CURRENT_JOB) {
    const employer = cleanName(r.exec(s)?.[1]);
    if (employer && !out.some((i) => i.employer === employer)) {
      out.push(job(ctx, employer, { status: 'current', additional }));
    }
  }

  for (const r of ROLE_RES) {
    const m = r.exec(s);
    const role = cleanRole(m?.[1]);
    if (!role) continue;
    const employer =
      cleanName(m?.[2]) || out.find((i) => i.kind === 'job' && i.status !== 'past')?.employer;
    if (employer) {
      const existing = out.find((i) => i.employer === employer);
      if (existing) out.splice(out.indexOf(existing), 1, { ...existing, role });
      else out.push(job(ctx, employer, { status: 'current', role, additional }));
    } else {
      patch.role = role;
    }
  }
  const promoted = PROMOTED.exec(s);
  if (promoted) {
    const role = cleanRole(promoted[1]);
    if (role) patch.role = role;
    out.push(
      item(ctx, 'win', role ? `promoted to ${role}` : 'got promoted', {
        title: role ? `Promoted to ${role}` : 'Got promoted',
        status: 'past',
        startDate: thisMonthStr,
      })
    );
  }
  const team = TEAM.exec(s);
  if (team?.[1]) patch.team = `${team[1].trim()} team`;

  const done = PROJECT_DONE.exec(s);
  if (done?.[1]) {
    const name = done[1].trim();
    out.push(
      item(ctx, 'project', name, {
        title: sentenceCase(name),
        status: 'past',
        endDate: thisMonthStr,
      })
    );
    out.push(
      item(ctx, 'win', `finished ${name}`, {
        title: `Finished the ${name}`,
        status: 'past',
        startDate: thisMonthStr,
      })
    );
  } else {
    const active = PROJECT_ACTIVE.exec(s);
    if (active?.[1])
      out.push(
        item(ctx, 'project', active[1].trim(), {
          title: sentenceCase(active[1].trim()),
          status: 'current',
        })
      );
  }
  for (const [r, label] of WINS) {
    const m = r.exec(s);
    if (!m) continue;
    const title = label.replace('$1', m[1] ?? '');
    out.push(
      item(ctx, 'win', title.toLowerCase(), { title, status: 'past', startDate: thisMonthStr })
    );
  }

  const load = STRESS_LOAD.exec(s);
  if (load)
    out.push(
      item(ctx, 'stress', 'workload', {
        title: `Work has been ${load[1].toLowerCase()}`,
        status: 'current',
      })
    );
  const boss = STRESS_BOSS.exec(s);
  if (
    boss &&
    /\b(micromanag|yell|ignor|unfair|toxic|difficult|hard|impossible|stress|criticiz|undermin|takes credit|won['’]t|never)\w*/i.test(
      boss[2]
    )
  ) {
    const who = boss[1].toLowerCase().replace('co-worker', 'coworker');
    out.push(
      item(ctx, 'stress', who, {
        title: `Friction with their ${who}: ${boss[2].trim()}`,
        status: 'current',
      })
    );
  }
  if (STRESS_BURNOUT.test(s))
    out.push(item(ctx, 'stress', 'burnout', { title: 'Feeling burned out', status: 'current' }));

  const past = /\b(had|went|was|were|did)\b/.test(s);
  for (const [r, type] of EVENT_RES) {
    const m = r.exec(s);
    if (!m) continue;
    const employer = type === 'interview' ? cleanName(m[1]) : '';
    if (type === 'interview' && !employer) continue;
    const rest =
      type === 'interview' ? (m[2] ?? '') : type === 'presentation' ? (m[2] ?? '') : (m[1] ?? '');
    const startDate = dateFromPhrase(rest, ctx.now, past ? 'past' : 'future');
    if (type !== 'interview' && !startDate) continue; // "the deadline" alone isn't an event
    const label =
      type === 'interview'
        ? `Interview at ${employer}`
        : type === 'review'
          ? 'Performance review'
          : type === 'presentation'
            ? sentenceCase(`${m[1]}`)
            : 'Work deadline';
    out.push(
      item(ctx, 'event', type === 'interview' ? `interview ${employer}` : `${type} ${startDate}`, {
        title: label,
        eventType: type,
        employer: employer || undefined,
        status: past ? 'done' : 'planned',
        startDate,
      })
    );
  }

  const goal = GOAL.exec(s);
  if (goal?.[1]) {
    const text = goal[1]
      .replace(/\bmy own\b/, 'their own')
      .replace(/\s+/g, ' ')
      .trim();
    out.push(item(ctx, 'goal', text, { title: sentenceCase(text), status: 'planned' }));
  }
  return left;
}

/** Work statements in one piece of user text. */
export function parseWorkStatements(
  text: string,
  source: LifeSource,
  confidence: number,
  opts: { conversationId?: string; now?: Date } = {}
): WorkCapture {
  const ctx: Ctx = {
    source,
    confidence,
    conversationId: opts.conversationId,
    now: opts.now ?? new Date(),
  };
  const inputs: LifeInput[] = [];
  const patch: { role?: string; team?: string } = {};
  let leftCurrentJob = false;
  for (const s of sentences(text)) {
    if (parseSentence(s, ctx, inputs, patch)) leftCurrentJob = true;
  }
  return {
    inputs,
    ...(patch.role || patch.team ? { currentJobPatch: patch } : {}),
    ...(leftCurrentJob ? { leftCurrentJob } : {}),
  };
}

/** Work statements in a third-person conversation summary (inferred, lower confidence). */
export function parseWorkSummary(
  summary: string,
  opts: { conversationId?: string; now?: Date } = {}
): WorkCapture {
  return parseWorkStatements(firstPerson(summary), 'inferred', 0.6, opts);
}
