/**
 * Crisis Guard - Hard Safety Rails
 *
 * Runs on the caller's words BEFORE the LLM (see turn-processor/process-turn.ts):
 *
 * 1. detectCrisis scores the caller's message:
 *    - explicit (0.9): current intent, plan, means, an attempt, or ongoing self-harm
 *    - passive (0.75): passive ideation, preparatory behavior, a risk to someone
 *      else, and explicit language softened by a joke, a condition or the past
 *    - implicit (0.6): hopelessness, burdensomeness, withdrawal; two distinct
 *      implicit signals in one message, or one after earlier distress in the
 *      session, count as passive
 *    Voice distress amplifies a text signal; on its own it never makes a crisis.
 * 2. guardPreResponse replaces the reply with a pre-written one that includes
 *    988 resources when severity >= 0.85.
 *
 * Below that threshold a crisis reaches the LLM as injected guidance
 * (buildCrisisGuidance); nothing inspects or rewrites the reply afterwards.
 *
 * services/safety/crisis-detection.ts delegates suicide and self-harm to this
 * module, so the prompt context and the override always agree.
 *
 * @module CrisisGuard
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CrisisGuard' });

// ============================================================================
// TYPES
// ============================================================================

export interface VoiceEmotionContext {
  primary: string;
  intensity: number;
  confidence?: number;
}

export interface CrisisGuardResult {
  /** If true, block the response entirely and use replacement */
  shouldBlock: boolean;
  /** Reason for blocking (for logging) */
  reason?: string;
  /** Complete replacement response (if shouldBlock is true) */
  replacementResponse?: string;
  /** Detected crisis severity (0-1) */
  crisisSeverity: number;
  /** Whether this is a crisis situation */
  isCrisis: boolean;
}

/** Who is at risk: the caller, or someone the caller is worried about. */
export type CrisisSubject = 'self' | 'third_party';

export interface CrisisDetectionResult {
  isCrisis: boolean;
  severity: number;
  indicators: string[];
  /** Set when any text signal matched. */
  subject?: CrisisSubject;
  /** 'es' when the crisis language matched was Spanish. */
  language?: 'en' | 'es';
  suggestedResponse?: string;
}

export interface CrisisDetectionOptions {
  /**
   * The caller's earlier messages this session, oldest first. A copy of the
   * current message is ignored, so userData.recentTranscripts can be passed as is.
   */
  recentMessages?: readonly string[];
}

// ============================================================================
// CRISIS PATTERNS
// ============================================================================

type PatternTag = 'suicidal' | 'self_harm';

interface TaggedPattern {
  re: RegExp;
  tag: PatternTag;
  /** An attempt underway or means in hand: the reply leads with 911. */
  imminent?: true;
}

/**
 * Explicit crisis indicators - immediate red flags.
 *
 * Only language that is unambiguous about current risk belongs here: a match
 * alone replaces the model's reply with the 988 script, unless it is negated,
 * framed as a joke or a condition, or placed in the past (see explicitModifier).
 * Everyday idioms that merely sound hopeless ("what's the point of this
 * meeting", "I want to die of embarrassment") live in IMPLICIT_DISTRESS_PATTERNS.
 */
const EXPLICIT_CRISIS_PATTERNS: TaggedPattern[] = [
  // Suicidal ideation. "die" excludes idioms: die of/from embarrassment, die laughing,
  // and "<this traffic> makes me want to die", which is implicit distress below.
  {
    re: /(?<!(makes|made|making) me )\b(want(ing)?|wanna) (to )?(die\b(?! (of|from|laughing|for)\b)|kill myself|not (be here|exist|wake up)|unalive myself|be dead)/,
    tag: 'suicidal',
  },
  // "end it" only when nothing follows (or "all"): excludes "end it with him".
  { re: /\b(want(ing)?|wanna) (to )?end (it all|my life|it\s*[.!?]*$)/, tag: 'suicidal' },
  {
    re: /\b(going to|gonna|about to|i'?ll|i will|plan(ning)? (on|to)|ready to|decided to) (kill myself|end (it all|my life)|take my (own )?life\b(?! (back|in|into|to|forward)\b)|unalive myself|commit suicide|overdose)\b/,
    tag: 'suicidal',
  },
  {
    re: /\b(going to|gonna|i'?ll|i will) end it (all )?(tonight|today|this weekend|for good|soon)\b|\b(night|day) i end it\b/,
    tag: 'suicidal',
  },
  { re: /\bdon'?t want to (live|be alive)\b/, tag: 'suicidal' },
  {
    re: /\b(i'?m|i am) ending (it all|my life|it\s*[.!?]*$|it (tonight|today|this weekend))/,
    tag: 'suicidal',
  },
  {
    re: /\b(going to|about to|planning (on|to)|plan to|ready to|decided to|want to|i'?ll|i will) (hang|shoot|drown|poison|gas) myself\b|\bhang(ing)? myself\b/,
    tag: 'suicidal',
  },
  {
    re: /\bjump(ing)? (off|from) (the|a|this|my) (bridge|roof|building|balcony|ledge|cliff|overpass|parking garage)\b|\bbefore i jump\b/,
    tag: 'suicidal',
  },
  {
    re: /\b(on|up on|at|standing on|on top of) (the|a|my) (roof|rooftop|bridge|ledge|edge|top floor)\b[^.!?]{0,60}\b(jump|going to do it|end it)\b/,
    tag: 'suicidal',
    imminent: true,
  },
  {
    re: /\b(i'?m|i am) (driving|going to drive) (my car |the car )?(into|off) (the|a) (river|lake|wall|tree|cliff|bridge|ocean)\b/,
    tag: 'suicidal',
  },
  {
    re: /\bby the time (anyone|you|they|someone|somebody) (hears|reads|sees|finds)\b[^.!?]{0,30}\b(i'?ll be gone|i won'?t be (here|alive|around))\b/,
    tag: 'suicidal',
    imminent: true,
  },
  {
    re: /\b(thinking about|consider(ing)?|thoughts of) (suicide|ending (it|my life)|killing myself|unaliving myself)/,
    tag: 'suicidal',
  },
  {
    re: /\bno (point|reason) (in|to) (go(ing)? on |keep )?(liv(e|ing)|going on|continuing|be alive)\b/,
    tag: 'suicidal',
  },
  {
    re: /\b(i'?m|i'?d be|i would be|i am) better off dead\b|\bsuicide plan\b|\bplan (for|to commit) suicide\b/,
    tag: 'suicidal',
  },
  // "end/take my (own) life" — excludes recovery language: "take my life back / in a new direction".
  { re: /\b(end|take) my (own )?life\b(?! (back|in|into|to|forward)\b)/, tag: 'suicidal' },
  { re: /\b(have|got|made|making) a plan to (kill myself|end (it|my life))/, tag: 'suicidal' },
  { re: /\bcan'?t go on living\b/, tag: 'suicidal' },
  {
    re: /\bbetter off (without me|if i (was|were|'?m) (gone|dead|not here|never born))\b|\b(better|happier) without me\b/,
    tag: 'suicidal',
  },
  {
    re: /\b(tried|attempted|trying) (to kill myself|suicide|to end (it|my life)|to take my (own )?life|to (overdose|hang myself|od))\b/,
    tag: 'suicidal',
  },
  {
    re: /\bsuicid(e|al) (note|letter)\b|\bgoodbye (note|letter)s?\b(?! (from|to) (the|my) (team|class|job|company))/,
    tag: 'suicidal',
  },
  // Coded language.
  { re: /\bkms\b|\bunalive (myself|me)\b|\bsewer ?slide\b/, tag: 'suicidal' },
  // Means in hand or an attempt underway.
  {
    re: /\b(took|taken|swallowed|downed) (like |about |maybe |over |almost )?([2-9]\d|\d{3}|a (bunch|handful|lot|whole bottle)|all|too many|the (whole|entire|rest of the) (bottle|pack))\b[^.!?]{0,25}\b(pills|meds|medication|tablets)\b/,
    tag: 'suicidal',
    imminent: true,
  },
  {
    re: /\bswallowed (everything|all the pills|whatever) in the (medicine )?cabinet\b|\bpills (are )?(already )?kicking in\b/,
    tag: 'suicidal',
    imminent: true,
  },
  {
    re: /\b(going to|about to) (take|swallow) (all|every one|every single one) of (them|these|those|my pills|the pills)\b/,
    tag: 'suicidal',
  },
  { re: /\bi('?ve| have)? (just )?overdosed\b/, tag: 'suicidal', imminent: true },
  {
    re: /\b(gun|pistol) (to|against|in) my (head|mouth)\b|\brope (is )?(around|on) my neck\b|\b(have|got|holding) (a|the|my) (gun|pistol) in my hand\b/,
    tag: 'suicidal',
    imminent: true,
  },
  {
    re: /\b(gun|pistol|revolver)\b[^.!?]{0,40}\b(in my lap|in my mouth|to my head)\b|\bloaded and (it'?s )?(sitting )?(in my lap|next to me|in my hand)\b/,
    tag: 'suicidal',
    imminent: true,
  },
  {
    re: /\bengine running\b[^.!?]{0,50}\bgarage\b|\bgarage\b[^.!?]{0,50}\bengine running\b/,
    tag: 'suicidal',
    imminent: true,
  },
  {
    re: /\b(standing|sitting) on (the|a) (ledge|edge of (the|a) (roof|bridge|building|cliff))\b/,
    tag: 'suicidal',
    imminent: true,
  },
  { re: /\bthinking (about|of) jumping\b(?! (in|into|on|rope|ship|back|at)\b)/, tag: 'suicidal' },

  // Spanish.
  {
    re: /\b(quiero|quisiera) (morir(me)?|matarme|suicidarme)\b|\bme quiero (matar|morir)\b|\bya no quiero vivir\b|\bvoy a (matarme|suicidarme)\b|\bpensando en (suicidarme|matarme)\b/,
    tag: 'suicidal',
  },

  // Self-harm. Excludes "cutting myself a slice", "burning myself out".
  { re: /\b(want to|going to|gonna|thinking about) hurt(ing)? myself/, tag: 'self_harm' },
  { re: /\bthinking about (self[- ]?harm(ing)?|cutting( myself)?( again)?)\b/, tag: 'self_harm' },
  { re: /\bi used to (cut|self[- ]?harm|burn myself|hurt myself)\b/, tag: 'self_harm' },
  {
    re: /\b(cutting|burning|harming) myself\b(?! (a|an|some|off|out|slack|short)\b)/,
    tag: 'self_harm',
  },
  // Disclosure of ongoing or past self-harm ("I've been hurting myself again").
  {
    re: /\b(been|keep|kept|started|still) (hurting|cutting|harming|burning) myself\b(?! (a|an|some|off|out|slack|short|at the gym|playing|lifting|working out)\b)/,
    tag: 'self_harm',
  },
  { re: /\bhurting myself again\b/, tag: 'self_harm' },
  { re: /\bi('?ve| have)? (been )?self[- ]?harm(ing|ed)?\b/, tag: 'self_harm' },
  {
    re: /\b(relapsed|started|back to) (and )?(self[- ]?harm(ing)?|cutting (myself )?again|cut (myself )?again|cutting myself)\b|\brelapsed and (cut|burned|hurt)\b/,
    tag: 'self_harm',
  },
  {
    re: /\b(cut|cutting|burn|burning|scratch|scratching|carve|carving) my (thighs?|wrists?|arms?|legs|skin|stomach|hips?)\b(?! (on|with the|while|shaving|by|accidentally|cooking)\b)/,
    tag: 'self_harm',
  },
  {
    re: /\bi (burn|cut|hurt|hit|punch|scratch) myself (with [^.!?]{0,20} )?(when (it gets bad|i'?m (sad|upset|angry|overwhelmed))|until (it )?(bleeds?|i bleed)|on purpose|to (feel|cope|punish))/,
    tag: 'self_harm',
  },
  {
    re: /\b(bang|banging|slam|slamming|hit|hitting) my head (into|against) (the |a )?wall\b[^.!?]{0,30}\b(bleed|bleeds|bled|until)\b/,
    tag: 'self_harm',
  },
  {
    re: /\b(razor|blade)\b[^.!?]{0,40}\babout to (start|do it|cut)( again)?\b|\babout to (cut|start cutting) again\b/,
    tag: 'self_harm',
  },
  {
    re: /\bi cut (myself|my (wrists?|arms?|thighs?))\b(?! (shaving|cooking|chopping|opening|on|with|by|while|doing|accidentally)\b)|\bi (burned|burnt|hurt) myself on purpose\b/,
    tag: 'self_harm',
  },
];

/**
 * Passive suicidal ideation, coded language and behavioral warning signs.
 *
 * A match marks the turn as a crisis (the LLM gets crisis guidance and the 988
 * suggestion) but does not replace the reply on text alone; voice distress
 * lifts it past the block threshold.
 */
const PASSIVE_IDEATION_PATTERNS: TaggedPattern[] = [
  {
    re: /\bwish (that )?i (could (just )?disappear|(was|were) (dead|gone|never born)|could (just )?not wake up)\b/,
    tag: 'suicidal',
  },
  {
    re: /\b(want|wanna|just want) to (just )?(disappear|vanish|stop existing|cease to exist)\b(?! (into|for|to|from|on)\b)/,
    tag: 'suicidal',
  },
  {
    re: /\b(hope|wish) (that )?i (just |would |could )?(don'?t|won'?t|wouldn'?t|didn'?t|never|not) wake up\b/,
    tag: 'suicidal',
  },
  {
    re: /\b(go to sleep|fall asleep|sleep) and (never|not) wake up\b|\b(want|wish|wanna) to sleep forever\b/,
    tag: 'suicidal',
  },
  {
    re: /\bwouldn'?t (really |even )?mind if (something|anything|a (car|truck|bus|train)|i)\b[^.!?]{0,30}\b(happened to me|hit me|died|didn'?t wake up|got hit)\b/,
    tag: 'suicidal',
  },
  {
    re: /\bif i (died|didn'?t wake up|was gone|were gone|was dead)\b[^.!?]{0,30}\b(that'?d|it would|it'?d|that would) be (fine|okay|ok|nice|a relief|better)\b/,
    tag: 'suicidal',
  },
  {
    re: /\bwhat'?s (even )?the point (of|in) (trying|living|anything|going on|being alive)\b/,
    tag: 'suicidal',
  },
  { re: /\bnothing (is ever going to|will ever) get better\b/, tag: 'suicidal' },
  {
    re: /\b(so )?tired of (living|life|being alive|existing|it all|everything)\b(?! (about|at|with|in|on)\b)/,
    tag: 'suicidal',
  },
  {
    re: /\bcan'?t see (a|any) future (for )?(myself|me)\b|\bno future for me\b|\b(don'?t|can'?t) see (a|any) future\b(?! for (this|the|that|our|his|her|their|my (job|company|career|team|project|business|relationship|marriage)))/,
    tag: 'suicidal',
  },
  {
    re: /\bi shouldn'?t (even )?(exist|be alive)\b|\bi shouldn'?t even be here\b/,
    tag: 'suicidal',
  },
  { re: /\bdon'?t want to (exist|be here anymore)\b/, tag: 'suicidal' },
  { re: /\blife (isn'?t|is not|ain'?t) worth living\b/, tag: 'suicidal' },
  {
    re: /\bdon'?t (think i )?want to (keep going|go on)\b(?! (to|with|down|at)\b)/,
    tag: 'suicidal',
  },
  // Method-seeking.
  {
    re: /\b(does|would|will|do you think) it hurts? to die\b|\bpainless ways? to (die|go|end it)\b/,
    tag: 'suicidal',
  },
  {
    re: /\bhow (much|many)\b[^.?!]{0,40}\b(to die|fatal|lethal|would be too (much|many)|too (much|many) to take|to (overdose|od)|so i (definitely |never )?don'?t wake up)\b/,
    tag: 'suicidal',
  },
  {
    re: /\b(looking up|looked up|googl\w*|research\w*|reading about)\b[^.!?]{0,30}\b(how (people|to) (end it|kill (themselves|yourself|myself)|commit suicide)|ways to (die|end it|kill myself)|suicide methods)\b/,
    tag: 'suicidal',
  },
  {
    re: /\b(tallest|highest) (bridge|building|cliff|parking garage)s? (near|around|close to) me\b/,
    tag: 'suicidal',
  },
  {
    re: /\b(thinking about|thought about|keep thinking about|want to|feel like) (swerv|crash|driv)\w* (my car |the car )?(into|off)\b|\b(swerv|crash|driv)\w* (my car |the car )?(into|off) [^.!?]{0,30}\bon purpose\b/,
    tag: 'suicidal',
  },
  {
    re: /\b(saving|stockpiling|hoarding|saved|stockpiled) (up )?(my )?(meds|pills|medication|sleeping pills)\b/,
    tag: 'suicidal',
  },
  {
    re: /\b(how|way|ways) to (end|stop) the pain\b(?! (in|of) (my )?(back|knee|neck|tooth|head|joints?|legs?|arms?|shoulders?)\b)/,
    tag: 'suicidal',
  },
  { re: /\b(looking for|want|need|found) a permanent solution\b(?! (to|for)\b)/, tag: 'suicidal' },
  { re: /\b(at|reached) the end of my rope\b/, tag: 'suicidal' },
  // Preparatory behavior and goodbyes.
  { re: /\bgiving away (all )?my (stuff|things|belongings|possessions)\b/, tag: 'suicidal' },
  {
    re: /\bthis is (my )?goodbye\b|\bthe last time you'?ll (hear from|talk to) me\b/,
    tag: 'suicidal',
  },
  {
    re: /\b(i won'?t|i'?m not going to|not going to) be (around|here|alive) (much longer|for much longer|anymore|tomorrow|for long|next (week|month|year))\b(?! (at|in|on|with|for|because)\b)/,
    tag: 'suicidal',
  },
  {
    re: /\b(wrote|written|left) my notes?\s*[.!?]*$|\b(wrote|written|left) my note\b(?! (to|for) (the|my) (teacher|boss|landlord|school|work|neighbor))/,
    tag: 'suicidal',
  },
  {
    re: /\b(writing|wrote|written) (letters|notes|goodbyes?) to (everyone|everybody|my (family|kids|mom|parents|friends))\b/,
    tag: 'suicidal',
  },
  {
    re: /\bi won'?t be needing (them|it|these|this|those|any of (it|this|them))\b/,
    tag: 'suicidal',
  },
  {
    re: /\b(made sure|making sure|arranged|set up|sorted out)\b[^.!?]{0,50}\bif (anything|something) (happens|were to happen) to me\b/,
    tag: 'suicidal',
  },
  // Spanish.
  {
    re: /\bno tengo ganas de vivir\b|\bmejor sin m[ií](?![a-z])|\bno vale la pena vivir\b|\bquisiera desaparecer\b|\bsoy una carga\b|\bojal[aá] no despertar/,
    tag: 'suicidal',
  },
  // Location alone, said with nothing after it ("I'm standing on the bridge").
  {
    re: /\bi'?m (standing|sitting) on (the|a) (bridge|roof|rooftop|ledge)\s*[.!?]*$/,
    tag: 'suicidal',
  },
  // Self-harm as the only way to feel or cope.
  {
    re: /\bonly (thing|way) (that )?(makes|lets) me feel (anything|something|alive|real) is (the )?(pain|hurting|cutting|bleeding)\b/,
    tag: 'self_harm',
  },
  {
    re: /\burges? to (cut|self[- ]?harm|hurt myself|burn myself)\b|\bthe urges? (are|is) (coming back|back|getting (stronger|worse|bad))\b/,
    tag: 'self_harm',
  },
];

/**
 * Plan, means or preparation. Any self-directed signal plus one of these is
 * treated as explicit: ideation with a plan is the clearest marker of
 * imminent risk.
 */
const PLAN_OR_MEANS_PATTERNS = [
  /\btonight'?s the night\b|\b(do|doing) it (tonight|tomorrow|this weekend|when|after|once|before)\b|\bit'?s happening (tonight|tomorrow)\b/,
  /\b(have|got|holding|bought|saved( up)?|stockpiled|counted out)\b[^.!?]{0,25}\b(pills|meds|bottles|a gun|the gun|a rope|the rope|a razor|the razor|blades?|enough)\b/,
  /\b(pills|gun|rope|razor|blade|knot)\b[^.!?]{0,25}\b(ready|in my hand|in my lap|loaded|next to me|right here)\b/,
  /\btested the knot\b|\bpicked (out )?(the|a) (spot|place|date|day|time)\b|\bset a date\b/,
];

/** Implicit distress indicators - need gentle exploration */
const IMPLICIT_DISTRESS_PATTERNS = [
  /everything('?s| is) (falling apart|too much|overwhelming)/,
  /can'?t (breathe|handle|cope|function)/,
  /nobody (cares|would (even |really )?(miss|notice|care))/,
  /\bif i (was|were) gone\b/,
  /\bi'?m the problem\b|\beverything i touch (falls apart|turns to)\b/,
  /\bfeel(ing)? (so |really |completely )?(empty|numb|hollow)\b|\bgoing through the motions\b/,
  /\bdon'?t (even )?care how\b/,
  /\b(thinking|think) about (death|dying) (a lot|all the time|constantly|every day)\b|\bcan'?t stop thinking about (death|dying)\b/,
  /\blife (isn'?t|is not|ain'?t) worth it\b/,
  /i'?m (such a|a complete) (failure|burden|mess)/,
  /\b(i'?m|i am|feel like) (just )?(a|such a) (burden|drain) (to|on) (everyone|everybody|my family|you|them|people)\b/,
  /\bi (hate|can'?t stand) myself/,
  /feeling (so )?alone/,
  /\bfeel(ing)? (so |really )?(trapped|stuck)\b|\bno way out\b/,

  // Hopelessness. Ambiguous on text alone ("there's no point arguing with him");
  // voice distress lifts these past the block threshold.
  /can'?t (do this|keep going|take it) anymore/,
  /nothing (will ever|is ever going to) (change|get better)/,
  /there'?s no (hope|point)/,
  /what'?s (even )?the point/,
  /\bwant (it|this|everything|the pain) to (stop|end)\b/,
  /\b(makes|made|making) me want to die\b/,

  // Withdrawal, flat affect and quiet finality: weak alone, a crisis signal in
  // combination or after earlier distress.
  /\bdon'?t care (about anything )?anymore\b/,
  /\bdon'?t bother (checking|calling|texting) (on |in on )?me\b/,
  /\bnot worth (your|anyone'?s) (time|effort)\b/,
  /\b(actually|really|seriously) not (okay|ok)\b/,
  /\bnone of (this|it) (will|is going to|gonna) matter\b/,
  /\b(it'?ll|it will) (all )?be over soon\b/,
  /\byou won'?t (have|need) to worry about me\b/,
];

/**
 * Warning signs that only mean something after earlier distress in the
 * session ("I wanted you to have this, just in case").
 */
const SESSION_CONTEXT_PATTERNS = [
  /\bjust in case\b/,
  /\bwanted you to have (this|it|these|them)\b/,
  /\bi'?ve made (up my mind|my decision|peace with (it|everything))\b/,
  /\bi'?m at peace (now|with it)\b/,
  /\btaking care of (everything|loose ends)\b/,
  /\bthank you for everything\b/,
];

/** Someone the caller knows is at risk. */
const THIRD_PARTY_PATTERNS = [
  /\b(wants?|going|gonna|threaten(s|ed|ing)?|talk(s|ed|ing)? about|tr(y|ies|ied|ying)|plan(s|ning)?|thinking about) (to )?(kill|killing|hurt|hurting|end|ending) (himself|herself|themselves|themself|(his|her|their) (own )?life)\b/,
  /\b(is|'s|been|keeps?|started) (cutting|harming) (himself|herself|themselves|themself)\b|\bhurting (himself|herself|themselves) on purpose\b/,
  /\b(he|she|they) (wants?|want) to (die\b(?! (of|from|laughing)\b)|end it\b(?! with\b))/,
  /\b(my|a) (friend|sister|brother|mom|mother|dad|father|son|daughter|kid|wife|husband|partner|boyfriend|girlfriend|cousin|roommate|coworker|classmate|student)\b[^.!?]{0,40}\b(suicidal|tried to kill|attempted suicide|overdosed|talking about (suicide|dying|ending it)|wants? to die)\b/,
  /\b(he|she|they|(my|a) \w+)('s| is| are| has| have)?( been)? giving away (all )?(his|her|their) (stuff|things|belongings|possessions)\b/,
  /\b(his|her|their) search history\b[^.!?]{0,50}\b(die|dying|suicide|kill)\b|\bposted (a|her|his|their) goodbye\b/,
  /\b(he|she)('s| is) (ready to (die|go\b(?! (to|for|out|home|shopping|back|on|in|get|see|now|with)\b))|done with life)/,
];

/** Explicit language softened by a joke. Still a crisis; not a scripted takeover. */
const JOKE_MARKERS =
  /\b(lol+|lmao+|lmfao|rofl|haha+|hehe|jk|just kidding)\b|[\u{1F602}\u{1F923}\u{1F480}\u{1F605}]/u;

/** A negator governing the matched phrase: "I don't want to die", "I'm not going to...". */
const NEGATION_PREFIX =
  /\b(don'?t|do not|didn'?t|never|not|wouldn'?t|won'?t|no longer|isn'?t|ain'?t)\s+((really|actually|even|ever|honestly|necessarily|going|gonna|planning|plan|to|on|saying|say|that|i|would|want|wanna)\s+)*$/;

/**
 * Blames an outside thing in the same breath: "my team is so bad I want to
 * unalive myself", like "this traffic makes me want to die". "I'm so sad I
 * want to die" does not match: the subject has to be something other than me.
 */
const HYPERBOLE_PREFIX =
  /\b(this|that|my|the|it'?s|it is|he'?s|she'?s|they'?re|[a-z]+ (is|are|was|were)) (\w+ )?(so|too) (bad|boring|annoying|cringey?|embarrassing|awful|slow|long|hard|dumb|stupid|terrible|loud|laggy|toxic)( that)? i $/;

/** Places the matched phrase in the past. */
const HISTORY_MARKERS =
  /\b(used to|(\w+ )?(years?|months?) ago|(in|back in|since) (19|20)\d\d|last (year|month|summer|spring|fall|winter)|when i was (a kid|little|younger|a teen(ager)?|in (middle school|high school|college))|back (then|in (high school|college|the day))|in (middle school|high school|college)|as a (kid|teen(ager)?)|in the past|a few years back)\b/;

/** The past is coming back: recovery language no longer softens it to distress. */
const RECURRENCE_MARKERS =
  /\b(again|lately|these days|recently|tonight|today|right now|coming back|creeping back|still)\b/;

/** Frequency or partial hedges: ideation without stated intent ("sometimes I think..."). */
const HEDGE_PREFIX =
  /\b(sometimes|some days|part of me|every now and then|occasionally|at times)\b/;

/** Stated protection against acting ("...but I don't have a plan"). */
const PROTECTIVE_MARKERS =
  /\b(don'?t|do not|wouldn'?t|won'?t|would never|will never) (have a plan|act on (it|them)|do (it|anything)|go through with it)\b|\bno plan\b|\bnot going to act on\b/;

/** History told as recovery: "I used to self-harm but I'm two years clean". */
const RECOVERY_MARKERS =
  /\b(clean|sober|recovered|in recovery|better now|doing (better|well|good)|proud|got help|haven'?t (done|felt) (that|it|this)|i don'?t (do (that|it) )?anymore)\b/;

/**
 * Someone else is the speaker or the source of the words that follow:
 * "my brother said he's thinking about ending it", "her journal about wanting
 * to die". Only applies when no first-person word comes after it.
 */
const THIRD_PERSON_SOURCE =
  /\b(he|she|they)('s|'re| is| are| was| were| has| have| keeps?| kept| said| says| told| wants?| texted| posted| wrote)\b|\b(said|says|told me|texted|wrote|posted)\b|\b(his|her|their) (journal|diary|notes?|texts?|messages?|posts?|letter|search history)\b/g;

const FIRST_PERSON = /\b(i|i'm|i've|i'd|i'll|me|my|myself)\b/;

const CLAUSE_BREAK = /[.!?;,]|\bbut\b|\band\b/;

/** Patterns that indicate high distress from voice */
const HIGH_DISTRESS_VOICE_EMOTIONS = [
  'distressed',
  'panicked',
  'desperate',
  'hopeless',
  'suicidal',
];

/** Patterns that indicate moderate distress requiring care */
const MODERATE_DISTRESS_VOICE_EMOTIONS = ['anxious', 'sad', 'hurt', 'scared', 'overwhelmed'];

const SEVERITY = { explicit: 0.9, passive: 0.75, implicit: 0.6, block: 0.85, crisis: 0.7 } as const;

// ============================================================================
// CRISIS DETECTION
// ============================================================================

/** Spoken and texted shorthand, so patterns can be written once in full form. */
const SHORTHAND: [RegExp, string][] = [
  [/\bgonna\b/g, 'going to'],
  [/\bwanna\b/g, 'want to'],
  [/\brn\b/g, 'right now'],
  [/\bim\b/g, "i'm"],
  [/\bive\b/g, "i've"],
  [/\b(he|she)s\b/g, "$1's"],
  [/\bid\b(?= (rather|be|have|never|just))/g, "i'd"],
  [/\b(don|can|won|didn|doesn|isn|wasn|wouldn|couldn|shouldn|haven|hasn|ain)t\b/g, "$1't"],
  [
    /\b(what|that|there|it)s\b(?= (the|even|no|not|going|been|a|all|over|happening|fine|okay))/g,
    "$1's",
  ],
];

function normalize(message: string): string {
  let text = message
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  for (const [re, full] of SHORTHAND) text = text.replace(re, full);
  return text;
}

type ExplicitModifier =
  | 'negated'
  | 'hyperbole'
  | 'recovered'
  | 'history'
  | 'joking'
  | 'conditional'
  | 'hedged'
  | 'protective'
  | 'third_party'
  | null;

/** True when the words right before the match attribute them to someone else. */
function attributedToOther(prefix: string, matched: string): boolean {
  if (FIRST_PERSON.test(matched)) return false;
  let lastEnd = -1;
  for (const m of prefix.matchAll(THIRD_PERSON_SOURCE)) lastEnd = (m.index ?? 0) + m[0].length;
  return lastEnd >= 0 && !FIRST_PERSON.test(prefix.slice(lastEnd));
}

/** How the clause around an explicit match softens it, if at all. */
function explicitModifier(
  text: string,
  start: number,
  end: number,
  imminent: boolean
): ExplicitModifier {
  const clauseStart = text.slice(0, start).split(CLAUSE_BREAK).pop() ?? '';
  const prefix = clauseStart.trim().length > 0 ? `${clauseStart.trim()} ` : '';
  const suffix = text.slice(end).split(/[.!?;,]|\bbut\b/)[0] ?? '';
  if (attributedToOther(prefix, text.slice(start, end))) return 'third_party';
  if (NEGATION_PREFIX.test(prefix)) return 'negated';
  if (HYPERBOLE_PREFIX.test(` ${text.slice(0, start).replace(/\s+$/, '')} `)) return 'hyperbole';
  if (HISTORY_MARKERS.test(`${prefix}${text.slice(start, end)}${suffix}`)) {
    return RECOVERY_MARKERS.test(text) && !RECURRENCE_MARKERS.test(text) ? 'recovered' : 'history';
  }
  if (JOKE_MARKERS.test(text)) return 'joking';
  // A conditional before the words ("if one more thing goes wrong I'll kms")
  // does not soften an imminent statement ("if you don't hear from me, I took
  // the pills").
  if (/\bif\b/.test(suffix) || (!imminent && /\bif\b/.test(prefix))) return 'conditional';
  if (HEDGE_PREFIX.test(prefix)) return 'hedged';
  if (PROTECTIVE_MARKERS.test(text.slice(end))) return 'protective';
  return null;
}

interface TextScore {
  severity: number;
  indicators: string[];
  subject?: CrisisSubject;
  language?: 'en' | 'es';
  implicitHits: number;
  contextHit: boolean;
}

/** Score one message from its words alone. */
function scoreText(text: string): TextScore {
  const indicators: string[] = [];
  let severity = 0;
  let implicitHits = 0;
  let language: 'en' | 'es' | undefined;
  const add = (indicator: string, level: number): void => {
    if (!indicators.includes(indicator)) indicators.push(indicator);
    severity = Math.max(severity, level);
  };

  // Spans already softened: a second pattern matching the same words
  // ("want to unalive myself" / "unalive myself") inherits the softening.
  const softened: [number, number][] = [];
  let thirdPartyHit = false;
  for (const { re, tag, imminent } of EXPLICIT_CRISIS_PATTERNS) {
    const match = re.exec(text);
    if (!match) continue;
    const start = match.index;
    const end = start + match[0].length;
    if (softened.some(([s, e]) => start < e && end > s)) continue;
    const modifier = explicitModifier(text, start, end, imminent === true);
    if (modifier) softened.push([start, end]);
    if (modifier === 'third_party') {
      thirdPartyHit = true;
      continue;
    }
    if (tag === 'self_harm') add('self_harm', 0);
    if (/quiero|matar|suicidar|vivir/.test(match[0])) language = 'es';
    if (modifier === 'negated' || modifier === 'hyperbole' || modifier === 'recovered') {
      add(`${modifier}_crisis_language`, 0);
      implicitHits++;
    } else if (modifier) {
      add(modifier === 'history' ? 'crisis_history' : `${modifier}_frame`, SEVERITY.passive);
    } else {
      add('explicit_crisis_language', SEVERITY.explicit);
      if (imminent) add('imminent_danger', SEVERITY.explicit);
      break;
    }
  }

  for (const { re, tag } of PASSIVE_IDEATION_PATTERNS) {
    if (re.test(text)) {
      add('passive_ideation', SEVERITY.passive);
      if (tag === 'self_harm') add('self_harm', 0);
      break;
    }
  }

  const softenedHits = implicitHits;
  implicitHits += IMPLICIT_DISTRESS_PATTERNS.filter((p) => p.test(text)).length;
  if (implicitHits > 0) add('implicit_distress', SEVERITY.implicit);
  if (implicitHits >= 2) add('compounded_distress', SEVERITY.passive);

  // A negation or idiom alone ("I'd never take the pills I have") is not a
  // signal a plan can escalate.
  const genuineSignal = severity >= SEVERITY.passive || implicitHits > softenedHits;
  if (
    genuineSignal &&
    severity < SEVERITY.explicit &&
    PLAN_OR_MEANS_PATTERNS.some((p) => p.test(text))
  ) {
    add('plan_or_means', SEVERITY.explicit);
  }

  let subject: CrisisSubject | undefined = severity > 0 ? 'self' : undefined;
  if (!subject && (thirdPartyHit || THIRD_PARTY_PATTERNS.some((p) => p.test(text)))) {
    add('third_party_risk', SEVERITY.passive);
    subject = 'third_party';
  }

  const contextHit = SESSION_CONTEXT_PATTERNS.some((p) => p.test(text));
  return { severity, indicators, subject, language, implicitHits, contextHit };
}

/**
 * Detect crisis indicators in user message
 */
export function detectCrisis(
  userMessage: string,
  voiceEmotion?: VoiceEmotionContext,
  options?: CrisisDetectionOptions
): CrisisDetectionResult {
  const text = normalize(userMessage);
  const score = scoreText(text);
  const indicators = [...score.indicators];
  let { severity, subject } = score;

  // Session trajectory: earlier distress turns a weak or contextual signal now
  // into a crisis ("Soon none of this will matter" after "I'm a burden").
  const prior = (options?.recentMessages ?? [])
    .map(normalize)
    .filter((m) => m.length > 0 && m !== text)
    .slice(-5)
    .map(scoreText)
    .filter((s) => s.subject === 'self');
  const priorPeak = Math.max(0, ...prior.map((s) => s.severity));
  const priorDistressTurns = prior.filter((s) => s.severity >= SEVERITY.implicit).length;
  const signalNow = (subject === 'self' && severity >= SEVERITY.implicit) || score.contextHit;
  if (signalNow && (priorPeak >= SEVERITY.passive || priorDistressTurns >= 2)) {
    indicators.push('session_escalation');
    severity = Math.max(severity, SEVERITY.passive);
    subject = 'self';
  }

  // Voice amplifies what the words say; on its own it is a reason to check in,
  // not a crisis. The 988 script is for the caller, so a worry about someone
  // else never escalates into it.
  const textSeverity = severity;
  const ceiling = subject === 'third_party' ? SEVERITY.block - 0.05 : 1.0;
  if (voiceEmotion?.confidence !== undefined && voiceEmotion.confidence > 0.5) {
    const high = HIGH_DISTRESS_VOICE_EMOTIONS.includes(voiceEmotion.primary);
    const moderate = MODERATE_DISTRESS_VOICE_EMOTIONS.includes(voiceEmotion.primary);
    if (high) {
      indicators.push('voice_high_distress');
      severity = textSeverity > 0 ? Math.max(severity, SEVERITY.block) : Math.max(severity, 0.5);
    } else if (moderate && textSeverity > 0.3) {
      indicators.push('voice_moderate_distress');
      severity = Math.min(1.0, severity + 0.15);
    }
    if ((high || moderate) && voiceEmotion.intensity > 0.8 && textSeverity > 0.3) {
      severity = Math.min(1.0, severity + 0.1);
      indicators.push('high_voice_intensity');
    }
  }
  severity = Math.min(severity, Math.max(ceiling, textSeverity));

  const isCrisis = severity >= SEVERITY.crisis;

  return {
    isCrisis,
    severity,
    indicators,
    subject,
    language: subject ? (score.language ?? 'en') : undefined,
    suggestedResponse: isCrisis
      ? getCrisisResponse(severity, subject, score.language, indicators.includes('imminent_danger'))
      : undefined,
  };
}

/**
 * Get appropriate crisis response based on severity
 */
function getCrisisResponse(
  severity: number,
  subject: CrisisSubject | undefined,
  language: 'en' | 'es' | undefined,
  imminent: boolean
): string {
  if (imminent && language !== 'es') {
    return `I'm really glad you told me. Your safety matters most right now.

If you've taken something or you're in danger right now, please call 911 or get to the nearest emergency room. You can also call or text 988 to talk to someone immediately.

I'm staying right here with you. Is anyone nearby who can be with you?`;
  }
  if (subject === 'third_party') {
    return `It sounds like you're really worried about them, and it matters that you're paying attention. You don't have to handle this alone either.

You can call or text 988, the Suicide & Crisis Lifeline, on their behalf to talk through how to help. If they're in immediate danger, call 911.

What's going on with them right now?`;
  }
  if (language === 'es') {
    return `Escucho cuánto dolor sientes ahora, y me alegra mucho que me lo cuentes. Lo que sientes importa, y no tienes que cargar con esto solo.

Puedes llamar al 988 y oprimir 2 para hablar en español, o enviar un mensaje de texto con la palabra AYUDA al 988. Hay consejeros disponibles las 24 horas. Si estás en peligro ahora mismo, llama al 911.

Estoy aquí contigo. ¿Me cuentas qué está pasando?`;
  }
  if (severity >= SEVERITY.block) {
    // Severe crisis - immediate support + resources
    return `I hear how much pain you're in right now, and I'm really glad you're sharing this with me. What you're feeling matters, and you don't have to carry this alone.

If you're in crisis or having thoughts of suicide, please reach out to the 988 Suicide & Crisis Lifeline by calling or texting 988. They have trained counselors available 24/7.

I'm here with you right now. Can you tell me more about what you're going through?`;
  }
  // High distress - validate + gentle support
  return `I can hear how difficult things are for you right now. What you're feeling is real and valid, and it takes courage to share it.

I want you to know that support is available. The 988 Suicide & Crisis Lifeline (call or text 988) is there 24/7 if you need to talk to someone.

I'm here to listen. What's weighing on you most right now?`;
}

/**
 * Instructions for the LLM when a crisis is detected but the reply is not
 * replaced. Tailored to who is at risk and how the risk was voiced.
 */
export function buildCrisisGuidance(crisis: CrisisDetectionResult): string {
  const header = `[CRITICAL - USER SAFETY]
Crisis indicators detected (severity: ${(crisis.severity * 100).toFixed(0)}%).
Indicators: ${crisis.indicators.join(', ')}`;

  if (crisis.subject === 'third_party') {
    return `${header}

The user is worried that someone they know is at risk. Your response MUST:
1. Take their worry seriously and thank them for caring
2. Help them think about how to check on the person directly and calmly
3. Tell them they can call or text 988 on the person's behalf, and to call 911 if there is immediate danger
4. Ask how THEY are holding up; supporting someone in crisis is hard
5. NEVER treat the user as the one at risk unless they say so`;
  }

  const lines = [
    '1. Acknowledge their pain with genuine empathy',
    '2. Create space for them to share (without pressure)',
    '3. Include the 988 Suicide & Crisis Lifeline (call or text 988)',
    '4. NEVER be dismissive or use platitudes like "it\'ll be okay"',
    '5. NEVER minimize their feelings',
  ];
  if (crisis.indicators.includes('joking_frame')) {
    lines.push(
      '6. They may be joking. Check in once, warmly and directly ("hey, I know that was a joke, but are you actually okay?"). Do not lecture, and drop it if they say they are fine'
    );
  }
  if (crisis.indicators.includes('crisis_history')) {
    lines.push('6. They mentioned a past crisis. Ask gently whether any of it is coming back now');
  }
  if (crisis.language === 'es') {
    lines.push('7. Reply in Spanish. 988 offers Spanish: call and press 2, or text AYUDA to 988');
  }

  return `${header}

Your response MUST:
${lines.join('\n')}

You are their lifeline right now. Be fully present.`;
}

/** The classifier's verdict, as crisis-classifier.ts returns it. */
export interface ClassifierVerdictLike {
  risk: 'imminent' | 'crisis' | 'none';
  subject: 'self' | 'third_party';
}

/**
 * Merge the semantic classifier's verdict into a pattern detection. It only
 * escalates: the patterns are precise, the classifier catches what they miss.
 * A missing verdict (timeout, error) leaves the detection unchanged.
 */
export function applyClassifierVerdict(
  crisis: CrisisDetectionResult,
  verdict: ClassifierVerdictLike | null
): CrisisDetectionResult {
  if (!verdict || verdict.risk === 'none') return crisis;

  const thirdParty = verdict.subject === 'third_party' && crisis.subject !== 'self';
  const subject: CrisisSubject = thirdParty ? 'third_party' : 'self';
  const imminent = verdict.risk === 'imminent' && !thirdParty;
  const target = imminent ? SEVERITY.explicit : SEVERITY.passive;
  if (crisis.severity >= target && crisis.subject === subject) return crisis;

  const severity = Math.max(crisis.severity, target);
  const indicators = [...crisis.indicators, `classifier_${verdict.risk}`];
  if (imminent && !indicators.includes('imminent_danger')) indicators.push('imminent_danger');
  if (thirdParty && !indicators.includes('third_party_risk')) indicators.push('third_party_risk');
  const alreadyImminent = crisis.indicators.includes('imminent_danger');
  return {
    ...crisis,
    isCrisis: true,
    severity,
    indicators,
    subject,
    language: crisis.language ?? 'en',
    suggestedResponse: getCrisisResponse(
      severity,
      subject,
      crisis.language,
      imminent || alreadyImminent
    ),
  };
}

// ============================================================================
// PRE-RESPONSE GUARD
// ============================================================================

/** The pre-response decision for an already computed detection. */
export function guardFromDetection(crisis: CrisisDetectionResult): CrisisGuardResult {
  if (crisis.isCrisis && crisis.severity >= SEVERITY.block) {
    // Severe crisis - override with crisis response
    log.warn(
      {
        severity: crisis.severity,
        indicators: crisis.indicators,
      },
      '🚨 CRISIS DETECTED - Overriding response'
    );

    return {
      shouldBlock: true,
      reason: `Crisis detected (severity: ${crisis.severity.toFixed(2)})`,
      replacementResponse: crisis.suggestedResponse,
      crisisSeverity: crisis.severity,
      isCrisis: true,
    };
  }

  return {
    shouldBlock: false,
    crisisSeverity: crisis.severity,
    isCrisis: crisis.isCrisis,
  };
}

/**
 * Guard that runs BEFORE LLM generates response
 *
 * Checks user message for crisis indicators.
 * If crisis detected, may provide replacement response.
 */
export function guardPreResponse(
  userMessage: string,
  voiceEmotion?: VoiceEmotionContext,
  options?: CrisisDetectionOptions
): CrisisGuardResult {
  return guardFromDetection(detectCrisis(userMessage, voiceEmotion, options));
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectCrisis,
  guardPreResponse,
  guardFromDetection,
  buildCrisisGuidance,
};
