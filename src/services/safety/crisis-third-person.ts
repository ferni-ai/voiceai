/**
 * Reported speech about someone else's risk, with no first-person crisis words in it (#3345: a
 * family check-in summary is told this way). Joins THIRD_PARTY_PATTERNS in crisis-patterns.ts, so
 * a match reads third_party_risk: never the caller's own crisis, never the 988 override. Each
 * pattern needs a third-person subject, so the caller's own words stay theirs.
 *
 * A physical emergency told the same way ("she fell and can't get up", "he collapsed and won't
 * wake up") is thirdPartyEmergency instead: imminent, and the reply leads with 911 for them.
 *
 * @module CrisisThirdPerson
 */

/** Someone the caller talks about, by a pronoun or by who they are to someone. */
const OTHER = String.raw`(?:he|she|they|(?:my|our|a|his|her|their) (?:best )?(?:friend|sister|brother|mom|mother|mum|dad|father|son|daughter|kid|wife|husband|partner|boyfriend|girlfriend|cousin|roommate|coworker|classmate|student|grandma|grandmother|grandpa|grandfather|aunt|uncle|niece|nephew|neighbou?r|stepmom|stepdad|parent|teen|teenager))`;
const AUX = String.raw`(?:'s|'d|'ve|'re| is| are| was| were| has| have| had)?(?: been)?(?: got)?`;
/** "my friend robin keeps saying", "she told me", "he's been saying that". */
const SAYS = String.raw`${OTHER}(?: [a-z]+)?${AUX} (?:keeps? saying|kept saying|saying|says|said|told (?:me|us|her|him|them)|thinks|thought|feels|felt|believes|mentioned|wrote|texted(?: me)?|posted)(?: that)?`;
const PILLS = String.raw`(?:pills|meds|medications?|tablets|sleeping pills|painkillers)`;
/** "saving her pills for the trip": a reason to keep them. Only after plain saving, never stockpiling. */
const FOR_A_TRIP = String.raw`(?![^.!?]{0,20}\bfor (?:the |a |an |our |his |her |their |my )?(?:trip|travel|vacation|holiday|flight|cruise|camping|allergy season|road trip)\b)`;
/** Ending a relationship: "ending it with his girlfriend". Only the named idiom, never a time or a reason. */
const ENDING_SOMETHING_ELSE = String.raw`(?! (?:all )?(?:with (?:(?:his|her|their|my|our|the) )?(?:girlfriend|boyfriend|partner|wife|husband|fianc\w*|ex|date|band|team|landlord|lease)|between them)\b)`;
/** Hurt in sport or by accident: "hurting herself at the gym", "playing soccer", "by accident". */
const HURT_BY_ACCIDENT = String.raw`(?! (?:(?:at|in|during) (?:the |her |his |their )?(?:gym|practice|training|soccer|football|basketball|hockey|rugby|tennis|yoga|pilates|games?|matches)|playing|lifting|working out|running|training|by accident|accidentally|falling|tripping)\b)`;
/** A move, a new job or a clear-out: why someone says goodbye or gives things away. */
const LEAVING = String.raw`(?![^.!?]{0,60}\b(?:mov(?:e|es|ed|ing)(?! on\b)|new job|leaving for|retir\w*|graduat\w*|transferr?\w*|last day|relocat\w*|declutter\w*|donat\w*|garage sale|yard sale|charity|goodwill)\b)`;

export const THIRD_PERSON_REPORTED: readonly RegExp[] = [
  // "she said she doesn't want to be here anymore"
  new RegExp(
    String.raw`\b${OTHER} (?:doesn'?t|does not|don'?t|do not|didn'?t|did not) want to (?:be here anymore|be alive|live anymore|exist anymore|wake up (?:anymore|again))\b`
  ),
  // "he talked about ending it"
  new RegExp(
    String.raw`\b${OTHER}${AUX} (?:talk(?:s|ed|ing)?|(?:keeps?|kept) talking|thinking|thought|mentioned|mentioning|brought up|bringing up) (?:about )?(?:ending it(?: all)?|not (?:being|wanting to be) (?:here|alive|around) anymore)\b${ENDING_SOMETHING_ELSE}`
  ),
  // "she has been hurting herself", "he's self-harming"
  new RegExp(
    String.raw`\b(?:is|'s|are|been|keeps?|kept|started) (?:hurting|burning) (?:himself|herself|themselves|themself)\b${HURT_BY_ACCIDENT}|\b${OTHER}${AUX} self[- ]?harm(?:s|ing|ed)?\b`
  ),
  // "she mentioned she has pills saved up"
  new RegExp(
    String.raw`\b${OTHER}${AUX} (?:saving|saved) (?:(?:all )?(?:his|her|their|the|some) )?${PILLS}\b${FOR_A_TRIP}|\b${OTHER}${AUX} (?:saving up|saved up|stockpiling|stockpiled|hoarding|hoarded|stashing|stashed) (?:up )?(?:(?:all )?(?:his|her|their|the|some) )?${PILLS}\b|\b${OTHER}${AUX} (?:(?:a bunch of|a lot of|some|extra) )?${PILLS} (?:saved up|stockpiled|stashed away|hoarded|hidden away)\b`
  ),
  // "she keeps saying everyone would be better off without her": said by the person at risk.
  new RegExp(
    String.raw`\b${SAYS} (?:everyone|everybody|we|they|people|the world|(?:his|her|their) (?:family|kids|friends))(?:'d| would| will| are| is)? (?:be )?better off without (?:her|him|them)(?:self|selves)?(?=$|[.,!?;]| (?:and|but|so|anyway|anymore|around|now)\b)`
  ),
  // "my brother told me he doesn't see the point of going on"
  new RegExp(
    String.raw`\b${OTHER} (?:doesn'?t|does not|don'?t|do not|didn'?t|did not|can'?t|cannot|couldn'?t) see (?:the |a |any )?point (?:of|in|to) (?:(?:going|go) on(?! (?:(?:a|an|the|this|that|these|those|my|his|her|their|our) )?(?:vacation|holiday|trips?|dates?|tours?|walks?|runs?|cruise|hike|retreat|camping|diet)\b| about\b)|living(?! (?:(?:in|at|near|on|by) (?:the|this|that|a|an|his|her|their|our) (?:city|town|apartment|house|place|neighbou?rhood|country|state|suburbs|dorm|area|building)|there|here|together)\b)|being alive|being here|life(?! (?:insurance|hacks?|coach(?:es|ing)?|of the party|jackets?|vests?|guards?|lessons?|skills?|drawing|admin|update)\b)|trying anymore|anything anymore)\b`
  ),
  // "my roommate wrote goodbye letters to all of us"
  new RegExp(
    String.raw`\b${OTHER}(?: [a-z]+)?${AUX} (?:wrote|written|writing|write|left|leaving|sent|sending) (?:us |me |them )?(?:a |some |these |those )?(?:goodbye|farewell|suicide) (?:letters?|notes?|messages?|videos?)\b${LEAVING}`
  ),
  // "he's been giving all his things away"
  new RegExp(
    String.raw`\b${OTHER}${AUX} (?:giv(?:ing|en|es|e)|gave) (?:(?:all|most) (?:of )?)(?:his|her|their) (?:\w+ )?(?:stuff|things|belongings|possessions) away\b${LEAVING}|\b${OTHER}${AUX} (?:giv(?:ing|en|es|e)|gave) everything away\b${LEAVING}`
  ),
];

/** Down: "fell", "collapsed", "passed out". The everyday "fell asleep" or "fell for" is masked first. */
const DOWN = String.raw`(?:fell|has fallen|had a fall|collapsed|passed out|fainted|blacked out)`;
/** Not getting up: "can't get up", "won't wake up", "isn't breathing", "she's not responding". */
const NOT_UP = String.raw`(?:(?:can'?t|cannot|can not|isn'?t able to|is not able to|still can'?t|couldn'?t) (?:get up|stand(?: up)?|move|wake up|breathe|respond)|(?:won'?t|will not|still won'?t) (?:wake up|breathe|respond|answer)|(?:isn'?t|is not|still isn'?t|not|still not) (?:breathing|responding|waking up|moving))`;
/**
 * Who went down: "my dad collapsed", or the same subject carried on past a first clause: "my dad
 * got dizzy, then fell". Never past an "i" or "we", so the caller's own fall stays theirs.
 */
const CLAUSE_START = String.raw`(?:^ *(?:[a-z]+ )?|[,;] ?|\b(?:and|so|but|then|because|now|okay|well|oh) )`;
const WHO_WENT_DOWN = String.raw`(?:\b${OTHER}(?: [a-z]+)?${AUX} |${CLAUSE_START}${OTHER}\b(?:(?!\b(?:i|we|you)\b)[^.!?]){0,60}?(?:,|\band|\bthen)(?: then)? )${DOWN}\b`;
const DOWN_NOT_UP = new RegExp(
  String.raw`${WHO_WENT_DOWN}[^.!?]{0,40}?(?:\b(?:and|but|now)|,)(?: (?:he|she|they)(?:'s|'re| is| are)?)? ${NOT_UP}`
);
const NOT_BREATHING = new RegExp(
  String.raw`\b${OTHER}(?: [a-z]+)?${AUX} (?:(?:not|isn'?t|wasn'?t|aren'?t|weren'?t|no longer|barely|still not) breathing|(?:stopped|stops) breathing|unconscious)\b`
);
const UNRESPONSIVE = new RegExp(String.raw`\b${OTHER}(?: [a-z]+)?${AUX} unresponsive\b`);

/**
 * Everyday idioms built from the same words. Each one masks only its own words, and the rest of
 * the sentence is read again, so "cracked up laughing, then he fell and can't get up" still reads.
 */
const EVERYDAY: readonly RegExp[] = [
  // A laughing fit or a prank, not a fall.
  /\b(?:collapsed|fell(?: over| down)?|cracked up|doubled over|keeled over)(?: (?:in|into|with|from)(?: (?:a fit of|fits of|hysterical))? (?:laughter|giggles|laughing|hysterics|stitches)| laughing)\b|\bfell for (?:the|a|my|his|her|their|our) (?:prank|joke|trick)\b/g,
  /\bfell (?:asleep|for|in love|behind|apart|short|silent|quiet|through)\b/g,
  // Not answering messages: "won't answer his phone", "won't respond to my texts".
  /\b(?:respond(?:ing)?|answer(?:ing)?) (?:to )?(?:[a-z]+'?s? )?(?:phone|texts?|calls?|messages?|e-?mails?|dms?|slack|voicemails?)\b/g,
  // A time or a reason: "won't wake up for dinner", "can't get up to date", "can't move after that meeting".
  // It masks the not-getting-up words too, so they can't force the unmasked re-read on their own.
  /\b(?:get up|stand(?: up)?|move|wake up|breathe|respond|answer|breathing|responding|waking up|moving) (?:early|on time|in time|in the morning|tomorrow|to (?:date|speed)|the (?:nerve|courage|energy|motivation)|(?:for|until|till) (?:dinner|lunch|breakfast|school|work|class|church|practice|the bus|noon|morning)|(?:for|until|till|after) (?:the|a|that|this|his|her|their|our|my) (?:show|movie|game|meeting|appointment|test|bus))\b/g,
  // Back up after a moment: "couldn't move his legs for a minute".
  /\bcouldn'?t (?:get up|stand(?: up)?|move|wake up|breathe|respond)[^.!?]{0,30}\bfor a (?:minute|second|sec|moment)\b/g,
  /\bstand(?: up)? straight\b/g,
  // "not breathing a word", "breathing down my neck", "unconscious bias", "stopped breathing for a second when".
  /\b(?:breathing|unconscious)(?: (?:a word|down (?:my|his|her|their|our) necks?|easy|bias|of)\b| for a (?:second|sec|moment) when\b)/g,
  // Unresponsive to messages, or at times: "unresponsive to my texts", "unresponsive lately".
  /\bunresponsive (?:(?:to|on|in|at|with|over) (?:(?:my|his|her|their|our|the|any|all|a) )?(?:e-?mails?|texts?|messages?|slack|dms?|calls?|chats?|group chat|work chat)|lately|these days|when|in the mornings?|since (?:i|we) (?:asked|told|mentioned|brought up))\b/g,
];
const mask = (said: string): string =>
  EVERYDAY.reduce((rest, idiom) => rest.replace(idiom, ' _ '), said);

/** Words that keep it an emergency, whatever idiom the sentence also holds. */
const STILL_EMERGENCY =
  /\b(?:not breathing|isn'?t breathing|stopped breathing|won'?t wake|can'?t wake|can'?t get up|can'?t move|isn'?t responding|isn'?t moving|unconscious|unresponsive|911|ambulance|paramedics?|cpr|emergency|floor|ground|stairs|bleeding|blood|turning blue|no pulse|seizure|(?:shook|shaking|shake) (?:him|her|them)|tried to wake)\b/;
/** Not answering messages: "unresponsive, I've emailed her five times". A physical word overrides it. */
const MESSAGES =
  /\b(?:e-?mails?|e-?mailed|texts?|texted|messages?|messaged|calls? (?:me )?back|slack|dms?|voicemails?)\b/;
const PHYSICAL =
  /\b(?:floor|ground|stairs|collapsed|fell|fallen|passed out|fainted|breathing|breathe|wake|awake|moving|move|911|ambulance|paramedics?|cpr|emergency|bleeding|blood|blue|pulse|seizure|hospital)\b/;

const reads = (said: string, masked: string): boolean =>
  DOWN_NOT_UP.test(said) ||
  NOT_BREATHING.test(said) ||
  (UNRESPONSIVE.test(said) && (PHYSICAL.test(masked) || !MESSAGES.test(masked)));

/**
 * Someone else is down and not getting up, or not breathing: an emergency for them now. Read with
 * the everyday idioms masked; and when a word that keeps it an emergency is left over, read again
 * with nothing masked, so no idiom ever outweighs "on the floor" or "I shook him".
 */
export const thirdPartyEmergency = (text: string): boolean =>
  text.split(/[.!?]+/).some((said) => {
    const masked = mask(said);
    return reads(masked, masked) || (STILL_EMERGENCY.test(masked) && reads(said, masked));
  });
