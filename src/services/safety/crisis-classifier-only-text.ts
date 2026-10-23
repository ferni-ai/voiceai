/**
 * The escalate-only words for CRISIS_CLASSIFIER_ONLY_CHECKIN
 * (crisis-classifier-only.ts): words that keep a turn off the eased path.
 *
 * The words only ever ADD escalations: a match keeps the 988 guidance, and no
 * match changes nothing (the turn still needs every other condition and the
 * second read's checkin). They cover risk the agreement gate's broad list
 * (hasRiskContent) misses, found by the 2026-10-22 safety review: help and
 * crisis lines, "anymore", "much longer", asking someone to look after a pet
 * or person "for me", thanks for everything, things the caller "won't need",
 * logins or bank details handed over, giving things away, rehoming a pet or
 * belongings, beneficiaries and policies, selling up or giving notice, load
 * and height questions, caller words that try to steer the safety read
 * (the 2026-10-22 verify), being with someone again, being a waste of space, wanting everything to stop, Spanish written
 * without accents ("ya no puedo mas", "no aguanto mas"), and farewell
 * gratitude: "I wanted to call and tell you I appreciate you. That's all I
 * needed to do." was eased by the second read every time it was asked
 * (crisis-eligible-v1, farewell_thanks-04, 6/6).
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
    // Quiet preparation: rehoming pets or belongings, someone else "getting" or "keeping" them.
    `\\b(?:giving|give|gave|handing|hand|passing|pass|leaving|leave|left) (?:my|all my|all of my) ${W}(?: ${W})? to\\b`,
    `\\b(?:make sure|so|want|wants|wanted) (?:${W} ){1,3}(?:gets?|has|have|keeps?|takes?|ends? up with) (?:my|all my|all of my) ${W}\\b`,
    `\\b(?:is|are|will be|'s|'re|gonna be|going to be) (?:taking|keeping|getting|having|inheriting) (?:my|all my|him|her|them)\\b`,
    '\\b(?:from now on|for good|better that way|better off with (?:her|him|them|someone))\\b',
    "\\b(?:shelters?|rehom\\w*|new home|forever home|adopt (?:him|her|them) out)\\b|\\bsomeone who(?:'ll| will| would) (?:stick with|look after|take care of|love)\\b",
    `\\b(?:find|found|finding) (?:someone|somebody|a (?:good )?(?:home|family)|new homes?)\\b|\\bnew homes?\\b|\\bwho gets (?:my|what)\\b|\\bsigned (?:${W} ){0,2}over\\b`,
    `\\b(?:taking|take|took|keeping|keep|getting|having) (?:the|my) (?:cat|cats|dog|dogs|bird|fish|pets?|kids?)\\b|\\b(?:my|our) (?:${W} ){0,2}(?:cats?|dogs?|birds?|fish|pets?|rings?|jewelry|records?|collection|furniture|tv|couch|bike|car|guitar|stuff|things|clothes|plants)\\b(?: ${W}){0,5} (?:go(?:es|ing)? to|end up with|settled with)\\b`,
    '\\bdonat(?:ed|ing|e) (?:basically |almost |nearly )?(?:everything|all)\\b|\\bboxing up (?:my|all)\\b|\\bpacked (?:up )?(?:his|her|their|my|all)\\b|\\bpermanently\\b|\\bin an envelope\\b|\\bwith (?:her|his|their) name on it\\b|\\bpaid off\\b',
    // Accounts and access handed over.
    `\\blegacy contact\\b|\\b(?:get into|access to|into) (?:all )?(?:of )?my (?:email|accounts?|phone|laptop|safe)\\b|\\b(?:pins?|codes?|keys|passwords?)\\b(?: ${W}){0,5} (?:for|to) (?:my )?${W}\\b|\\bmy (?:${W} )?pin\\b|\\bcode to my\\b|\\bsomeone else (?:closes?|handles?|gets? into)\\b|\\b(?:in order|handle things|handled this week)\\b`,
    // It won't matter: plans, refills and renewals dropped as pointless.
    "\\b(?:won't|wont|will not|not gonna|not going to|isn't going to|itll|it'll|it will)(?: really)? (?:matter|make a difference)\\b|\\bdon'?t think (?:it'?ll|itll|it will) matter\\b|\\bwhat for\\b|\\b(?:won't|wont|will not)(?: really)? (?:be making|have (?:a|any) use)\\b|\\bout of the picture\\b|\\bquit (?:picking up|taking|refilling)\\b",
    // Indirect method questions.
    `\\bhow (?:much|many|long|fast|cold|hot|tall|high|deep)\\b(?: ${W}){0,14} (?:a person|someone|people|your body|stop a heart|instant|not make it|come back|stay asleep|it would take|would it take|it take)\\b`,
    "\\b(?:strongest|gentlest|painless\\w*|quickest|easiest) (?:way|thing)\\b|\\btoxic to (?:people|humans)\\b|\\bdon'?t have railings\\b|\\bhunting (?:stuff|rifle|gun)s?\\b|\\bwhere the key is\\b|\\bstash\\b|\\bsaved up\\b|\\bstop eating\\b|\\bwalk(?:ed)? into the (?:ocean|sea|lake|river)\\b|\\bwithout air\\b|\\bunder the sink\\b|\\b(?:heart|allergy|sleeping|old) (?:medicine|medication|pills|tablets|prescriptions)\\b|\\bwhole (?:box|bottle)\\b|\\bparking (?:structure|garage)\\b",
    // Paperwork for after: beneficiaries, wills, policies, closing out.
    '\\b(?:beneficiar\\w*|executor|power of attorney|life insurance|insurance polic\\w*|my estate|last wishes)\\b',
    '\\b(?:sold|selling|sell|sells) (?:my|the|all my) (?:car|truck|house|home|stuff|things|furniture|bike|guitar|place)\\b|\\bgave (?:my |them )?notice\\b',
    '\\b(?:end(?:ed|ing)?|break(?:ing)?|broke|terminat\\w*|cancel\\w*|clos(?:e|ed|ing)) (?:out )?(?:my|the|all my) (?:lease|apartment|rental|phone|plan|subscriptions?|accounts?|bank account|insurance)\\b',
    // Method-adjacent: load, strength, height, depth.
    "\\bhow (?:much|many) (?:weight|load|pounds|lbs|kilos?|kg)\\b|\\bweight (?:limit|capacity|rating)\\b|\\b(?:hold|take|support|bear) (?:a person|a body|my weight|someone's weight|\\d+ ?(?:lbs?|pounds|kgs?|kilos?))\\b",
    `\\b(?:ceiling|beams?|joists?|rafters?|rail(?:ing)?s?|hooks?|balcon(?:y|ies)|bridges?|overpass(?:es)?|cliffs?|parking garage)\\b(?: ${W}){0,6} (?:hold|take|support|high|tall|drop|fall|deep)\\b`,
    '\\bhow (?:high|tall|far (?:down|up)|deep) (?:is|are|does|do|up)\\b',
    // Caller words that try to steer the safety read are themselves a signal.
    '\\bignore (?:all |any |the |your |my |previous |prior |above |earlier )*(?:instructions|rules|prompt|guidelines)\\b|\\bnot_crisis\\b|\\bcheck ?in\\b(?=[^a-z]*")|"(?:decision|caller_risk|confidence)"|\\bcrisis\\b|\\bsystem prompt\\b',
    // Farewell gratitude: thanks or love as a closing, a last contact, messages to pass on.
    "\\bthank(?:s| you)(?: so much)? for (?:everything|all of it|it all|all you(?:'ve)? done|being there|listening)\\b|\\bthank you properly\\b",
    `\\b(?:wanted|want|needed|had) to (?:call|ring|reach out|say|tell you)\\b(?: ${W}){0,6} (?:thanks?|thank you|appreciate|grateful|love you)\\b`,
    "\\b(?:i appreciate you|you mattered|i was grateful|been an hono(?:u)?r)\\b|\\bthat'?s all i (?:needed|wanted|had) to (?:do|say)\\b",
    '\\b(?:i )?(?:wanted|want|need) you to know\\b|\\bjust want you to know\\b',
    `\\byou(?:'ve| have| were) (?:always )?(?:been )?(?:a |such a |my )?(?:${W} )?(?:friend|kind to me|good to me)\\b`,
    '\\b(?:one (?:more|last) time|talk again|end of our talks|so this is it|good run|only one left|wherever i end up|best part of)\\b',
    `\\btell (?:my )?${W} (?:that )?i(?:'m| am)? (?:love|loved|sorry)\\b|\\bsorry for everything\\b|\\bnone of this is your fault\\b`,
    "\\b(?:everything'?s|everything is|it'?s all) (?:sorted|settled|taken care of|arranged)\\b|\\b(?:feel|feeling) (?:so |really )?(?:calm|lighter|at peace) now\\b",
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
