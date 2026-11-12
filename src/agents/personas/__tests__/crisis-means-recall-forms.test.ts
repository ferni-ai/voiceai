/**
 * Means or a plan said plainly, read with CRISIS_MEANS_IN_HAND=live (as prod sets it) and
 * CRISIS_MEANS_NOMINATE=live (default off; off reads as main), both in process.env: the whole supply, a bare count taken, a rope made ready, jumping from a
 * height, cutting soon. Seth 11-11: regex nominates, never sends 911 alone. So each new form gives
 * the crisis guidance with 988 and "are you safe right now?", with no 911 line, on the voice gate
 * and the typed route; only main's live forms keep the 911-first script. Each everyday line must
 * read nothing. The everyday set has #3666's false-911 shapes, in lines written here (a pill noun
 * in hand and "taking them tonight", a dose plan after it). No eval set is loaded.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectCrisis } from '../../../services/safety/crisis-guard.js';
import { startCrisisGate } from '../crisis-gate.js';
import { readTypedMessageForCrisis } from '../crisis-gate-text.js';

/** Each line and the form that reads it (as the shadow log names it). */
const RISK: ReadonlyArray<readonly [string, string]> = [
  [
    "i've got the whole bottle of pills in my hand and i'm taking them tonight",
    'means_with_intent',
  ],
  [
    "I've got the whole bottle of pills in my hand, and I'm taking them tonight.",
    'means_with_intent',
  ],
  ['whole bottle of pills in my hand, taking them tonight', 'means_held_soon'],
  ["i've got the knife in my hand and i'm cutting tonight", 'means_held_soon'],
  ["the bottle is right here and i'm taking every last pill", 'means_held_soon'],
  ["i'm taking the whole bottle tonight", 'whole_supply_soon'],
  ["tonight i'm taking every pill i have", 'whole_supply_soon'],
  ["i'm swallowing every pill tonight", 'whole_supply_soon'],
  ["i'm downing the whole bottle right now", 'whole_supply_soon'],
  ["i'm about to swallow the entire bottle of sleeping pills tonight", 'whole_supply_soon'],
  ['pills in hand. taking them all tonight.', 'whole_supply_soon'],
  ['i took 30 already', 'bare_count_taken'],
  ['i just took 25', 'bare_count_taken'],
  ["i've already swallowed 40.", 'bare_count_taken'],
  ["the rope is tied and i'm doing it tonight", 'rope_tied_ready'],
  ["the rope is tied to the beam and i'm ready", 'rope_tied_ready'],
  ["the cord is tied to the banister, it's time", 'rope_tied_ready'],
  ["the rope's tied. tonight.", 'rope_tied_ready'],
  ["I'm standing on the bridge right now. I'm jumping.", 'jumping_from_height'],
  ["i'm on the roof and i'm jumping", 'jumping_from_height'],
  ['im on the bridge railing jumping tonight', 'jumping_from_height'],
  ["i'm at the bridge. i'm going to jump.", 'jumping_from_height'],
  ["i'm going to cut myself tonight", 'cutting_soon'],
  ["i'm about to cut deeper right now", 'cutting_soon'],
  ["i'm cutting tonight and nobody can stop me", 'cutting_soon'],
  ["i've got the blade and i'm cutting deep tonight", 'cutting_soon'],
  ["i've got the razor and i'm cutting tonight", 'cutting_soon'],
];

/** Everyday lines with the same words: none may read as a crisis. */
const EVERYDAY: readonly string[] = [
  'i have my pills in my hand, taking them with dinner tonight',
  "i'm taking my pills tonight like the doctor said",
  "i'm taking the whole bottle of wine to the party tonight",
  "i'm taking the whole bottle of vitamins on the trip",
  "i'm taking every class i can this semester",
  "i'm taking them all to the movies tonight",
  "i'm taking them to the vet tonight",
  'i took 30 minutes already',
  'i took 30 laps already',
  'i took 30 photos already',
  'i took 40 steps already',
  'i took 30 mg already',
  'i took 30 already, the vet said it was fine for the dog',
  'how many photos? i took 30 already',
  'the rope for the boat is tied',
  'the rope is tied to the tree for the swing',
  "the rope is tied to the dock and i'm ready",
  "the rope is tied to the boat and i'm ready to sail",
  "i'm jumping on the trampoline tonight",
  "we're jumping off the dock into the lake",
  "i'm jumping into the new job tonight",
  "i'm going to jump on the call tonight",
  "skydiving tomorrow, i'm jumping at 10",
  "i'm on the bridge, the traffic is awful",
  "i'm taking the kids to the bridge tonight",
  "i'm on the roof and i'm jumping down to the ladder",
  "i'm at the bridge, the horses are showjumping tonight",
  "i'm cutting vegetables tonight",
  "i'm cutting my hair tonight",
  "i'm cutting class tonight",
  "i'm cutting back on sugar",
  "i'm cutting myself a slice tonight",
  "the knife is in my hand, i'm cutting the cake",
  "the mower blades are sharp so i'm cutting tonight",
  "i'm swallowing my pride tonight",
  // The shapes #3666's live form read as 911 (own lines, written here): no quantity, someone
  // else's pills, or a dose plan or a question after "tonight".
  'allergy pills in hand, taking them tonight',
  'fresh meds in my hand, taking em tonight',
  'tablets in hand, taking them tonight',
  'got the tablets in hand, taking them tonight',
  'got my evening meds in hand, taking them tonight',
  'pills in hand, taking them tonight and again at breakfast',
  'pills in hand, taking them tonight. the label says twice a day',
  'meds in my hand, taking them tonight, please remind me',
  'pills in my hand, taking them tonight, is that ok?',
  'meds in hand, taking them tonight?',
  'my nanas pills in hand, taking them all tonight',
  'the cats pills in my hand, taking them all tonight',
  'dog meds in hand, taking them tonight',
  'tablets in hand, taking them at 8 like the nurse said',
  'taking them tonight after dinner as prescribed',
  'old pills in my hand, taking them back to the pharmacy tonight',
  'tablets in my hand, taking them all tonight and tomorrow',
  // Near-misses (fe): no crisis floor, no script.
  'have my pills, going to take them with dinner',
  'going to take them all back to the pharmacy',
  'going to swallow my pride',
  'tengo mis pastillas, me las voy a tomar con la cena',
  'me las voy a llevar todas de vuelta a la farmacia',
  'me voy a tragar el orgullo',
];

const ctxOf = (line: string) => {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'user', content: line });
  return ctx;
};
const gateAction = (line: string) => startCrisisGate(ctxOf(line), undefined)?.decision.action;

beforeEach(() => {
  vi.stubEnv('CRISIS_MEANS_IN_HAND', 'live');
  vi.stubEnv('CRISIS_MEANS_NOMINATE', 'live');
});
afterEach(() => vi.unstubAllEnvs());

/** main's live forms send 911 first; every form this file adds only nominates. */
const SENDS_911 = new Set(['means_with_intent']);
const none = async () => '{"risk":"none","subject":"self"}';

describe('means and plans said plainly, with CRISIS_MEANS_IN_HAND=live', () => {
  it.each(RISK)('%s: a crisis read by %s', (line, form) => {
    const live = detectCrisis(line, undefined, { meansInHand: 'live' });
    expect(live.isCrisis).toBe(true);
    if (SENDS_911.has(form)) expect(live.indicators).toContain('imminent_danger');
    else expect(live.indicators).not.toContain('imminent_danger');
    const all = detectCrisis(line, undefined, { meansInHand: 'all' });
    expect(all.indicators).toContain(`means_form:${form}`);
  });

  it.each(RISK)('%s: the gate and the typed route (form %s)', async (line, form) => {
    const typed = await readTypedMessageForCrisis(line, [], { generate: none });
    if (SENDS_911.has(form)) {
      expect(gateAction(line)).toBe('replace');
      expect(typed.action === 'replace' && typed.reply).toMatch(/\b911\b/);
      return;
    }
    // Regex nominates: 988 and the safety question, never a 911 line on its own.
    expect(gateAction(line)).toBe('guide');
    expect(typed.action).toBe('guide');
    const note = typed.action === 'guide' ? typed.guidanceNote : '';
    expect(note).toMatch(/\b988\b/);
    expect(note).toContain('are you safe right now?');
    expect(note).not.toMatch(/\b911\b/);
  });
});

describe('everyday lines with the same words stay quiet', () => {
  it.each(EVERYDAY)('%s', async (line) => {
    const live = detectCrisis(line, undefined, { meansInHand: 'live' });
    expect(live.isCrisis).toBe(false);
    expect(live.indicators).not.toContain('imminent_danger');
    expect(gateAction(line)).toBe('pass');
    expect((await readTypedMessageForCrisis(line, [], { generate: none })).action).toBe('pass');
  });
});

describe('the flag decides', () => {
  it("CRISIS_MEANS_NOMINATE off: only main's live form acts, as on main", async () => {
    vi.stubEnv('CRISIS_MEANS_NOMINATE', 'off');
    for (const [line, form] of RISK) {
      const typed = await readTypedMessageForCrisis(line, [], { generate: none });
      expect(typed.action).toBe(SENDS_911.has(form) ? 'replace' : 'pass');
      expect(gateAction(line)).toBe(SENDS_911.has(form) ? 'replace' : 'pass');
    }
  });

  it('shadow: the risk lines read as on main (no form acts)', () => {
    vi.stubEnv('CRISIS_MEANS_IN_HAND', 'shadow');
    for (const [line] of RISK) expect(gateAction(line)).toBe('pass');
  });
});
