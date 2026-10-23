/**
 * Text for CRISIS_CLASSIFIER_ONLY_CHECKIN (crisis-classifier-only.ts): the
 * escalate-only words that keep a turn off the eased path, and the check-in
 * guidance an eased turn gets.
 *
 * The words only ever ADD escalations: a match keeps the 988 guidance, and no
 * match changes nothing (the turn still needs every other condition and the
 * second read's checkin). They cover risk the agreement gate's broad list
 * (hasRiskContent) misses, found by the 2026-10-22 safety review: help and
 * crisis lines, "anymore", "much longer", asking someone to look after a pet
 * or person "for me", thanks for everything, things the caller "won't need",
 * logins or bank details handed over, giving things away, being with someone
 * again, being a waste of space, wanting everything to stop, and Spanish
 * written without accents ("ya no puedo mas", "no aguanto mas").
 *
 * @module CrisisClassifierOnlyText
 */

/** Lower case, NFKD with accents removed, every apostrophe variant as ', spaces collapsed. */
export function plain(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[‘’‛′´`ʼʹ＇]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const W = "[a-z0-9']+";
const ESCALATE_ONLY = new RegExp(
  `(?:${[
    // Help, crisis lines and clinicians, by name or number.
    '\\b(?:988|911|112|999)\\b|1 ?800 ?273|hot ?line|help ?line|life ?line|crisis (?:line|text|number|center|centre|team)',
    '\\b(?:therapist|therapy|counsel+or|psychiatrist|psychologist|ambulance|paramedics?)\\b',
    // Time running out, or not being around.
    "\\bany ?more\\b|\\bmuch longer\\b|\\b(?:wasn't|wasnt|weren't|was not|not) (?:here|around)\\b",
    // Arrangements and farewells.
    `\\b(?:(?:take|takes|taking|took) care of|looks? after|looking after|feed|walk) (?:${W} ){0,3}for me\\b`,
    '\\bthanks? (?:you )?(?:so much )?for everything\\b',
    "\\b(?:won't|wont|will not|not going to|not gonna) (?:be )?need(?:ing)?\\b",
    '\\b(?:log ?ins?|passcodes?|pin (?:number|code)|bank (?:login|details|info|account|card)s?)\\b',
    `\\b(?:gave|give|giving|given) (?:${W} ){1,4}away\\b|\\bgave (?:away )?(?:my|all my|all of my) ${W}(?: ${W})? to\\b`,
    `\\bmade (?:my )?peace\\b|\\b(?:see|be with|join) (?:${W} ){1,2}again\\b`,
    // Worthlessness and wanting it to stop.
    '\\bwaste of (?:space|air|oxygen|life)\\b',
    `\\bwant (?:${W} ){0,2}(?:everything|it all|all of it|this|it) to (?:stop|end)\\b`,
    '\\bno reason to\\b|\\bkeep going\\b',
    // Spanish written without accents.
    '\\bya no puedo\\b|\\bno aguanto\\b|\\bno puedo mas\\b|\\bcansad[oa] de (?:todo|vivir)\\b|\\bno quiero (?:vivir|seguir|estar)\\b',
  ].join('|')})`
);

/** True when the text holds an escalate-only word, or cannot be read. */
export function hasEscalateOnlyWords(text: unknown): boolean {
  if (typeof text !== 'string') return true;
  try {
    return ESCALATE_ONLY.test(plain(text));
  } catch {
    return true;
  }
}

/**
 * The guidance for a turn this path eases. Unlike SOFT_CRISIS_CHECK ("check in
 * once if it fits"), the check-in here is not optional: one gentle, direct
 * question in Ferni's own words about what the caller said.
 */
export const CLASSIFIER_ONLY_CHECK = `[SAFETY - CHECK IN]
A safety read of the caller's last words was unsure whether something heavier is going on; a second read judged it more likely everyday. Do not switch to crisis talk or list hotlines on this alone, but do check in:
1. In your own words, ask one gentle, direct question about what they just said ("hey, can I check, when you said that, are you doing okay?"), then follow their lead
2. Keep it warm and brief: no lecture, no list of resources
3. If they say anything about hurting themselves, not wanting to be here or not being around, take it seriously and offer the 988 Suicide & Crisis Lifeline (call or text 988)`;
