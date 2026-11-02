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
/** "with her", "at work", "early": the words are about something else ending, hurting or waking. */
const EVERYDAY_AFTER = String.raw`(?! (?:all )?(?:with|between|for|on|at|in|over|before|after|because|cause|since|early|off|by|while|when|during|playing|lifting|working|running|training|doing|falling|tripping|accidentally)\b)`;
/** A move, a new job or a clear-out: why someone says goodbye or gives things away. */
const LEAVING = String.raw`(?![^.!?]{0,60}\b(?:mov(?:e|es|ed|ing)|new job|leaving for|retir\w*|graduat\w*|transferr?\w*|last day|relocat\w*|declutter\w*|donat\w*|garage sale|yard sale|charity|goodwill)\b)`;

export const THIRD_PERSON_REPORTED: readonly RegExp[] = [
  // "she said she doesn't want to be here anymore"
  new RegExp(
    String.raw`\b${OTHER} (?:doesn'?t|does not|don'?t|do not|didn'?t|did not) want to (?:be here anymore|be alive|live anymore|exist anymore|wake up (?:anymore|again))\b`
  ),
  // "he talked about ending it"
  new RegExp(
    String.raw`\b${OTHER}${AUX} (?:talk(?:s|ed|ing)?|(?:keeps?|kept) talking|thinking|thought|mentioned|mentioning|brought up|bringing up) (?:about )?(?:ending it(?: all)?|not (?:being|wanting to be) (?:here|alive|around) anymore)\b${EVERYDAY_AFTER}`
  ),
  // "she has been hurting herself", "he's self-harming"
  new RegExp(
    String.raw`\b(?:is|'s|are|been|keeps?|kept|started) (?:hurting|burning) (?:himself|herself|themselves|themself)\b${EVERYDAY_AFTER}|\b${OTHER}${AUX} self[- ]?harm(?:s|ing|ed)?\b`
  ),
  // "she mentioned she has pills saved up"
  new RegExp(
    String.raw`\b${OTHER}${AUX} (?:saving|saved|stockpiling|stockpiled|hoarding|hoarded|stashing|stashed) (?:up )?(?:(?:all )?(?:his|her|their|the|some) )?${PILLS}\b|\b${OTHER}${AUX} (?:(?:a bunch of|a lot of|some|extra) )?${PILLS} (?:saved up|stockpiled|stashed away|hoarded|hidden away)\b`
  ),
  // "she keeps saying everyone would be better off without her": said by the person at risk.
  new RegExp(
    String.raw`\b${SAYS} (?:everyone|everybody|we|they|people|the world|(?:his|her|their) (?:family|kids|friends))(?:'d| would| will| are| is)? (?:be )?better off without (?:her|him|them)(?:self|selves)?(?=$|[.,!?;]| (?:and|but|so|anyway|anymore|around|now)\b)`
  ),
  // "my brother told me he doesn't see the point of going on"
  new RegExp(
    String.raw`\b${OTHER} (?:doesn'?t|does not|don'?t|do not|didn'?t|did not|can'?t|cannot|couldn'?t) see (?:the |a |any )?point (?:of|in|to) (?:(?:going|go) on(?! (?:a|an|the|this|that|these|those|my|his|her|their|our|vacation|holiday|trips?|dates?|tours?|walks?|runs?|about|with|to|at|like)\b)|living(?! (?:in|there|here|with|at|near|on|like|alone|together|by)\b)|being alive|being here|life|trying anymore|anything anymore)\b`
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

/** Down, and not getting up: "fell and can't get up", "collapsed and won't wake up". */
const DOWN = String.raw`(?:fell(?! (?:asleep|for|in love|behind|apart|short|silent|quiet|ill|sick|through)\b)|has fallen|had a fall|collapsed|passed out|fainted|blacked out)`;
/** "won't get up" is often just won't; "won't wake up" after a collapse is not. */
const NOT_UP = String.raw`(?:(?:can'?t|cannot|can not|couldn'?t|isn'?t able to|is not able to|still can'?t) (?:get up|stand(?: up)?|move|wake up|breathe|respond)|(?:won'?t|will not|still won'?t) (?:wake up|breathe|respond|answer)|(?:isn'?t|is not|still isn'?t) (?:breathing|responding|waking up|moving))(?! (?:early|on time|in time|for|until|till|before|when|in the morning|tomorrow)\b)(?![^.!?]{0,30}\bfor a (?:minute|second|sec|bit|while|moment)\b)`;
const EMERGENCY = [
  new RegExp(
    String.raw`\b${OTHER}(?: [a-z]+)?${AUX} ${DOWN}\b[^.!?]{0,40}?\b(?:and|but|now)(?: (?:he|she|they)(?:'s|'re)?)? ${NOT_UP}`
  ),
  // "he's not breathing", but not "unresponsive to my texts" or "not breathing a word".
  new RegExp(
    String.raw`\b${OTHER}(?: [a-z]+)?${AUX} (?:not breathing|stopped breathing|unconscious|unresponsive)\b(?! (?:a word|down|easy|bias|to|on|in|at|with|lately|these|for|about|again)\b)`
  ),
];

/** Someone else is down and not getting up, or not breathing: an emergency for them now. */
export const thirdPartyEmergency = (text: string): boolean => EMERGENCY.some((re) => re.test(text));
