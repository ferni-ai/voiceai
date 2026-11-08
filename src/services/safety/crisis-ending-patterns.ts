/**
 * The first-person ending floor's words (#2525), read by crisis-ending-floor.ts. The tiered
 * patterns they back up are in crisis-patterns.ts.
 *
 * @module CrisisEndingPatterns
 */

/**
 * The floor (#2525): first-person ending words, whatever comes before them. The tiered
 * patterns above name the modal or connective ("want to", "going to"); "I might kill myself",
 * "before I kill myself", "until I end it all" matched none of them and scored 0 in both
 * detectors. detectCrisis scores this floor on its own, softened exactly as the tiers are
 * (crisis-modifiers.ts), unless the clause is one of ENDING_IDIOMS. Places and means never
 * exempt it ("killing myself in the garage tonight", "take my life in the garage").
 */
export const FIRST_PERSON_ENDING =
  /\b(kill(ed|ing)? my ?self|end(ed|ing)? (my (own )?life|it all)|tak(e|ing) my (own )?life\b(?! (back|savings|story|insurance|admin|seriously|more seriously|for granted|into my own hands|in (a|my|another) (new |different )?direction|to the next level|forward)\b)|unaliv(e|ing) my ?self|commit(ting)? suicide)\b/;

/**
 * Everyday idioms around the floor's words, anchored to the match itself: each is tested on the
 * match and what follows it in the clause, and an accident also needs "almost" or "nearly" just
 * before it (ENDING_IDIOM_BEFORE). Closed forms only: laughing, a named near accident, effort
 * (studying, at the gym "lately"), a named task, a game, and ending a life "as a" named role.
 * A place, a time or a means never exempts the words ("killing myself at the bridge tonight").
 */
export const ENDING_IDIOMS = [
  /^kill(ed|ing)? my ?self laughing\b/,
  /^kill(ed|ing)? my ?self (studying|working (two|three|double|extra|overtime)|training|cramming|trying to (make|please|keep up with) (her|him|them|everyone|my boss))\b/,
  /^kill(ed|ing)? my ?self (at (the gym|work)|in the gym) (lately|these days|every (day|night|week))\b/,
  /^kill(ed|ing)? my ?self every (day|night) at (the gym|work)\b/,
  /^kill(ed|ing)? my ?self over (this|that|these|those|my|the) (homework|spreadsheet|project|essay|paper|assignment|report|deadline|exam|code)\b/,
  /^kill(ed|ing)? my ?self in (minecraft|fortnite|roblox|gta|elden ring|the sims|skyrim|zelda|((the|a|this|that|my) )?(video )?games?)\b/,
  /^end(ed|ing)? my life as an? (bachelor|bachelorette|single (man|woman|guy|girl|person)|smoker|drinker|student|renter|teenager)\b/,
];

/** A near accident: "almost" or "nearly" right before the words, a named fall or ride after. */
export const ENDING_IDIOM_BEFORE = /\b(almost|nearly|practically|could have|could'?ve) $/;
export const ENDING_ACCIDENT =
  /^kill(ed)? my ?self ((falling|tripping|slipping|crashing|riding) (on|off|down|over|into) |(on|off) )(the|my|a|that|this) (stairs|steps|step|bike|ice|ladder|skateboard|scooter|curb|treadmill|trampoline|horse)\b/;
