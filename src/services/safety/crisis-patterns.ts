/**
 * Crisis language patterns, by tier. Scored by detectCrisis in crisis-guard.ts.
 *
 * @module CrisisPatterns
 */

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
export const EXPLICIT_CRISIS_PATTERNS: TaggedPattern[] = [
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
export const PASSIVE_IDEATION_PATTERNS: TaggedPattern[] = [
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
export const PLAN_OR_MEANS_PATTERNS = [
  /\btonight'?s the night\b|\b(do|doing) it (tonight|tomorrow|this weekend|when|after|once|before)\b|\bit'?s happening (tonight|tomorrow)\b/,
  /\b(have|got|holding|bought|saved( up)?|stockpiled|counted out)\b[^.!?]{0,25}\b(pills|meds|bottles|a gun|the gun|a rope|the rope|a razor|the razor|blades?|enough)\b/,
  /\b(pills|gun|rope|razor|blade|knot)\b[^.!?]{0,25}\b(ready|in my hand|in my lap|loaded|next to me|right here)\b/,
  /\btested the knot\b|\bpicked (out )?(the|a) (spot|place|date|day|time)\b|\bset a date\b/,
];

/** Implicit distress indicators - need gentle exploration */
export const IMPLICIT_DISTRESS_PATTERNS = [
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
export const SESSION_CONTEXT_PATTERNS = [
  /\bjust in case\b/,
  /\bwanted you to have (this|it|these|them)\b/,
  /\bi'?ve made (up my mind|my decision|peace with (it|everything))\b/,
  /\bi'?m at peace (now|with it)\b/,
  /\btaking care of (everything|loose ends)\b/,
  /\bthank you for everything\b/,
];

/** Someone the caller knows is at risk. */
export const THIRD_PARTY_PATTERNS = [
  /\b(wants?|going|gonna|threaten(s|ed|ing)?|talk(s|ed|ing)? about|tr(y|ies|ied|ying)|plan(s|ning)?|thinking about) (to )?(kill|killing|hurt|hurting|end|ending) (himself|herself|themselves|themself|(his|her|their) (own )?life)\b/,
  /\b(is|'s|been|keeps?|started) (cutting|harming) (himself|herself|themselves|themself)\b|\bhurting (himself|herself|themselves) on purpose\b/,
  /\b(he|she|they) (wants?|want) to (die\b(?! (of|from|laughing)\b)|end it\b(?! with\b))/,
  /\b(my|a) (friend|sister|brother|mom|mother|dad|father|son|daughter|kid|wife|husband|partner|boyfriend|girlfriend|cousin|roommate|coworker|classmate|student)\b[^.!?]{0,40}\b(suicidal|tried to kill|attempted suicide|overdosed|talking about (suicide|dying|ending it)|wants? to die)\b/,
  /\b(he|she|they|(my|a) \w+)('s| is| are| has| have)?( been)? giving away (all )?(his|her|their) (stuff|things|belongings|possessions)\b/,
  /\b(his|her|their) search history\b[^.!?]{0,50}\b(die|dying|suicide|kill)\b|\bposted (a|her|his|their) goodbye\b/,
  /\b(he|she)('s| is) (ready to (die|go\b(?! (to|for|out|home|shopping|back|on|in|get|see|now|with)\b))|done with life)/,
];
