/**
 * A flag may ADD to what a caller in crisis hears; it may never take any of it away.
 *
 * The seventh reader of the never-lower registry (crisis-all-flags-never-lower.test.ts): the
 * reply itself, through the real gatedReply. Fictional calls (crisis-reply.never-lower.ts) run
 * with the crisis classifier stubbed to answer none, crisis, imminent, imminent for someone
 * else, to throw, and to never answer. The model is a stub that says MODEL_SAYS, so a reply
 * is code's words exactly when the stub's are not in it.
 *
 * The gate takes three model calls as options: generate (the classifier), adjudicate and
 * groundedReads. The classifier has the six answers above. The adjudicator has one value here:
 * no answer, which is what a machine with no model key gets. So a flag that acts on a second
 * model's answer changes nothing in this grid yet. The grounded release is given nothing: no
 * call here reaches it, and one that did would build its own model calls. No model can be
 * reached from this file: a test fails if a model client was asked for, a connection was
 * opened or fetch was called while it ran, and the last test checks the total.
 *
 * Which flags are checked is measured, not listed: the calls run behind a process.env that
 * records each name read, at the defaults and with every flag found so far on, until no new
 * name turns up. Every flag the gate reads then gets every word in WORDS, whatever its default;
 * the default only decides which words are the inert ones, and an inert word must change
 * nothing at all. Every word is tried alone, and on top of every other flag set to on and to
 * live.
 *
 * The calls happen at 12:00, two at 0:00, on one date, on Ferni's home clock (America/Denver,
 * the zone FERNI_STATE reads; WORLD_NOW reads a call with no zone in UTC), whatever zone the
 * process runs in, with no timezone for the caller. That is
 * enough only for a reply that does not depend on the time of day, and three things keep it so:
 * - asking the clock inside a reply is counted. Reading the hour, the minute, the weekday, the
 *   date or the timezone off a Date (CLOCK_READS), or formatting one with Intl.DateTimeFormat,
 *   is allowed only with a flag listed in CLOCK_READ_BY set; any other is red;
 * - each listed flag is read at the moments in MOMENTS: every hour, the minutes where the
 *   hour is rounded, each weekday, each month, five timezones for the caller (one that does
 *   not exist, one empty), the eval clock and a long call. Alone and on top of every other
 *   flag, on and live, against the same setting without it at the same moment;
 * - every field of the session the gate reads is recorded and must be listed in
 *   SESSION_FIELDS_READ, so a reply keyed on a time worked out elsewhere and left on the
 *   session (a late-night mark, say) fails until the calls set that field.
 * Not seen: a reply keyed on one timezone by name, on one date (a holiday), or on the year; a
 * time kept in a module rather than on the session; arithmetic on the instant itself; a clock
 * read made directly inside a timer's callback. Every other flag is read at the calls' own
 * moments only, which is sound while it reads no clock and no unlisted session field.
 *
 * The prompt is not assembled here: the test hands the gate a bare chat. Notes that depend on
 * the hour (late night) are added there, and the rule that the crisis note stays the last one
 * whatever follows it is pinned in processors/turn-processor/__tests__/safety-note.test.ts.
 *
 * Calls must not see each other. FORGET_CALLS empties what the crisis modules remember before
 * each call; the list is kept by hand, so the calls are also placed last to first and must read
 * the same.
 *
 * Lowered means, turn by turn: the reply never came; code's words became the model's; 988 or
 * 911 left the reply; 911 stopped coming first; 988 or 911 left the last thing the model was
 * asked (unless code now says it); or a script kept its kind and lost one of its sentences.
 * Each turn also has a floor that holds under every setting, the defaults included. The floor
 * reads who speaks, 911, 988 and their order, and nothing else.
 *
 * So the wording itself is NOT read, and WORDING_NOT_READ counts how much (a test keeps the
 * counts true):
 * - a script sentence lost with the flag on and off alike is not seen by this file. A script
 *   is compared with itself at the defaults, and the floor reads only the numbers;
 * - a sentence that code speaks only with a flag set (a whole script, or a line added to one
 *   or after the model's reply) has no counterpart at the defaults, so dropping it is a
 *   lowering brought by a flag setting that this file does not see. Those flags are named in
 *   WORDING_NOT_READ.onlyWithFlag: what they add is read for the numbers and their order only;
 * - on a turn the model speaks, only the numbers in what it is asked are read: that they are
 *   asked for, not that the rest of the ask leaves them standing.
 * A hand-kept copy of each script's words, checked on every reading, closes the first two.
 *
 * Also not seen here, each a way a flag could still lower a reply:
 * - the model's own words: the stub says one fixed line, so only what the model is ASKED is read;
 * - how long a reply takes, short of FIRST_WORDS_MS to its first words and BOUND_MS to its end;
 * - the text (SMS) reply path, and everything after gatedReply (988 spoken as digits, speech);
 * - what a flag does outside the reply: records, alerts, transfers, follow-up texts, recorder holds;
 * - a caller the account says is under 18, a try-first caller, a persona other than Ferni;
 * - a flag read only off a copy of the environment, which nothing here would ever set. Two
 *   places copy it while a reply is made (ENV_COPIED). startCrisisClassifier, for the
 *   classifier's plain prompt, on a line with risk words while CRISIS_CLASSIFIER_EVERYDAY_RULES
 *   is on: that copy goes to crisisClassifierPrompt only. And the scripted turn's read
 *   (CRISIS_SCRIPT_IMMINENT_READ on or shadow), which gives startCrisisClassifier a copy with
 *   its own deadline: that copy goes there only, and what is read off it is recorded on the
 *   calls themselves. Each name read off either copy must also be read off the environment
 *   itself. Another copy, a copy under another flag, from another function, or handed
 *   anywhere else is red. Not counted: a reference to process.env kept from when a module
 *   loaded, a flag read once at import, and a flag the classifier reads off the scripted
 *   read's copy only on a line or under a pair of flags the calls do not have;
 * - what the classifier is asked. Its answers are given here, so a flag that changes its
 *   prompt (the everyday rules, the agreement gate) is not seen to change a read. A change to
 *   the classifier's prompt is covered by a held-out run by its holder, never by this grid;
 * - a lowering that needs two flags set and the others unset. Each word of a flag is tried
 *   alone, and on top of EVERY other flag on and live; no pair is tried by itself, but for
 *   the one in SCOPED;
 * - the crisis read's scope. The agreement gate on, or the adjudicator in shadow or live, has
 *   the gate gather the turn's crisis reads under the call. Each of those words is tried like
 *   any other, and SCOPED reads the two together with nothing else set. But the scope holds
 *   one read here: only gatedReply runs, so the turn pipeline's own read of the same turn
 *   never joins it. Two reads of one turn that disagree, a second read joining the first's
 *   (rememberRead in crisis-classifier.ts), and the lines the agreement gate eases (a bare
 *   "still here", a call of Ferni's name, a short question back about Ferni's own words)
 *   are not walked;
 * - a second model's answer changing a reply. The adjudicator gives no answer here, so a
 *   check-in it would hand a caller in place of crisis guidance is not seen. Production
 *   holds that off (liveAllowed in crisis-adjudicator.ts): CRISIS_ADJUDICATOR=live and
 *   CRISIS_CLASSIFIER_ONLY_CHECKIN=live both run held. "the holds this grid leans on" pins
 *   the hold and searches for others like it; lifting it is red until the adjudicator's
 *   answers are in this grid. The search is by name (an exported ...ForTests in either
 *   crisis folder) and by declaration (a module-level `let` under services/safety only). A
 *   hold kept in a module-level variable under agents/personas, or in a constant, an
 *   object's field or a flag of its own, and a lifter reached by a name built at run time,
 *   are seen by review only;
 * - the floors, the calls, the raises and NEVER_HEARD are pinned by a second copy
 *   (crisis-reply.never-lower.pin.ts): the data file may add, never take away. Lowering both
 *   files together is seen by review only;
 * - "call 911" said so that it means the opposite, beyond the NEVER_HEARD phrases;
 * - a flag that acts on a second model's answer (the adjudicator, the grounded release, the
 *   confirmed-risk read): those give no answer here, so the flags that soften a crisis reply
 *   change nothing. NOT_YET_COVERED never means the gate ignores a flag;
 * - a setting that is a number or a name (a time limit, a model), and any mode word other
 *   than those in WORDS. One misspelt word is tried (MISSPELT) and the empty one; a reply
 *   keyed on any other exact string, or on another case or spacing of a word, is not seen;
 * - any call no line here resembles. NOT_YET_COVERED (services/safety/__tests__/
 *   crisis-flag-homes.ts) names the crisis-lane flags no call shows yet.
 *
 * The grid is split over four files for CI time (vitest shards by file, and in one file it ran
 * ~17 min under coverage): this one, -base-on and -base-live (every flag's words on top of every
 * other flag, one base each) and -wall-clock (the clock reads and the moments). The shared setup
 * is crisis-reply-never-lower.grid.ts. Vitest puts a file on a shard by the sha1 of its path, and
 * these four names land on four different shards of CI's four: rename one only after checking it
 * still does, or two of the long ones share a shard's time again.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { CRISIS_FLAGS } from '../../../services/safety/__tests__/crisis-lane-flags.js';
import {
  adjudicatorCheckinsMayChangeReplies,
  resolveCrisisAdjudicatorMode,
} from '../../../services/safety/crisis-adjudicator.js';
import { resolveEasingMode } from '../../../services/safety/crisis-classifier-only-live.js';
import { crisisClassifierPrompt } from '../../../services/safety/crisis-classifier.js';
import { resolveGradedResponseMode } from '../../../services/safety/crisis-graded-shadow.js';
import { resolveGroundedReleaseMode } from '../../../services/safety/crisis-grounded-release.js';
import {
  adjudicatorAsks,
  allBut,
  at988,
  CASES,
  classifierCalls,
  codeSays,
  copies,
  copiesIn,
  declaredIn,
  defaultOf,
  EVERY_FLAG,
  type Gives,
  gives,
  HELD_IN_CODE,
  HOLD_FOLDERS,
  INERT,
  inReply,
  installGrid,
  isFlag,
  LIFT_FIRST,
  LIFTER,
  losses,
  MEETS,
  MISSPELT,
  MOMENTS,
  moved,
  NEW_VARIABLE,
  NO_ROW,
  noting,
  OTHER_WORDS,
  placeAllUnder,
  productionFiles,
  READ_BY_GATE,
  type Readings,
  readUnder,
  resetClassifierCalls,
  SAFETY_VARIABLES,
  says,
  SCOPED,
  sentences,
  sessionRead,
  sourceOf,
  TEST_ONLY_EXPORTS,
  under,
  WORDS,
} from './crisis-reply-never-lower.grid.js';
import { reached } from './crisis-reply-never-lower.reach.js';
import {
  ANSWERS,
  CALLS,
  ENV_COPIED,
  LOWERS_A_REPLY,
  NEVER_HEARD,
  SESSION_FIELDS_READ,
  SHOWN_ON,
  WORDING_NOT_READ,
} from './crisis-reply.never-lower.js';
import {
  PINNED_CALLS,
  PINNED_LOWERS_A_REPLY,
  PINNED_NEVER_HEARD,
  PINNED_SAYS,
  PINNED_SHOWN_ON,
} from './crisis-reply.never-lower.pin.js';

// The model client is replaced with none, as on a machine with no model key, so the grid reads
// the same where a key is set. A vi.mock factory is per file, so each grid file carries this.
vi.mock('../../../config/gemini-config.js', async (importOriginal) => {
  const { reached, STUBBED_CLIENT } = await import('./crisis-reply-never-lower.reach.js');
  const getGeminiClient = async (): Promise<null> => ((reached['model clients'] += 1), null);
  return {
    ...(await importOriginal<typeof import('../../../config/gemini-config.js')>()),
    getGeminiClient: Object.assign(getGeminiClient, { [STUBBED_CLIENT]: true }),
  };
});
installGrid();

describe('no flag lowers what a caller in crisis hears', () => {
  it('reads real replies: every kind of floor, a called classifier, the same twice', async () => {
    resetClassifierCalls();
    const defaults = await placeAllUnder({});
    // The classifier stub decided turns: a grid of pattern-only lines would never call it.
    expect(classifierCalls).toBeGreaterThan(CALLS.length * 3);
    expect(defaults).toEqual(await placeAllUnder({}));
    expect(under(defaults)).toEqual([]);
    const kinds = [...defaults.values()].flat().map(gives);
    // Each check below bites only where main gives the thing it guards.
    expect(kinds.filter((g) => g["code's words"] && g['911 first']).length).toBeGreaterThan(20);
    expect(kinds.filter((g) => g["code's words"] && g['988 spoken']).length).toBeGreaterThan(40);
    expect(kinds.filter((g) => g['988 asked of the model']).length).toBeGreaterThan(8);
    expect(kinds.filter((g) => g['911 asked of the model']).length).toBeGreaterThan(3);
    expect(kinds.filter((g) => !g["code's words"]).length).toBeGreaterThan(20);
  });

  // FORGET_CALLS is kept by hand. A module that remembers a call and is missing from it shows
  // here: placed last to first, every call follows a different one.
  it.each(EVERY_FLAG)(
    'reads every call the same placed last to first, every flag %s',
    async (_label, flags) => {
      const forwards = await readUnder(flags);
      const backwards = await placeAllUnder(flags, true);
      expect(Object.fromEntries(backwards)).toEqual(Object.fromEntries(forwards));
    }
  );

  it('checks every crisis-lane flag it says it does, and no flag it says it does not', async () => {
    const defaults = await readUnder({});
    for (const [name, { call, raises }] of Object.entries(SHOWN_ON)) {
      expect(READ_BY_GATE, `${name}: the gate no longer reads it`).toContain(name);
      expect(CRISIS_FLAGS, `${name} is no longer a crisis-lane flag`).toContain(name);
      const keys = await moved({ [name]: 'on' });
      expect(
        keys.some((key) => key.startsWith(`${call}/`)),
        `${name}=on changes no turn of "${call}"`
      ).toBe(true);
      if (!raises) continue;
      const [answer, floor, at = 0] = raises;
      const turn = (r: Readings): Gives => gives(r.get(`${call}/${answer}`)![at]);
      expect(MEETS[floor](turn(defaults)), `${call}/${answer} is ${floor} without ${name}`).toBe(
        false
      );
      expect(MEETS[floor](turn(await readUnder({ [name]: 'on' }))), `${name}=on: ${floor}`).toBe(
        true
      );
    }
  });

  // A flag that changes a reply here is checked here: give it a SHOWN_ON row.
  it.each(NO_ROW)('%s=%s changes no reply, so the flag needs no row', async (name, _l, word) => {
    expect(await moved({ [name]: word })).toEqual([]);
  });

  // The scope flags together and nothing else: the one pair read by itself. Every reply must be
  // exactly as at the defaults, so a change that has this state move a reply is red here.
  it.each(SCOPED)('%s, no other flag set: every reply as at the defaults', async (_l, flags) => {
    expect(READ_BY_GATE).toEqual(expect.arrayContaining(Object.keys(flags)));
    expect(await moved(flags)).toEqual([]);
    expect(await losses({}, flags)).toEqual([]);
  });

  it.each(CASES)('%s=%s alone lowers no reply', async (name, _label, word) => {
    expect(await losses({}, { [name]: word })).toEqual([]);
  });

  // A word the grid lacks is harmless only while no flag reader knows it. With every flag set
  // to it at once, the calls must read exactly as with every flag misspelt.
  it.each(OTHER_WORDS)('no flag reader knows the word %s', async (word) => {
    const [unknown, tried] = [
      await readUnder(allBut('', MISSPELT)),
      await readUnder(allBut('', word)),
    ];
    expect(Object.fromEntries(tried)).toEqual(Object.fromEntries(unknown));
  });

  // The data file's own floors, calls and rows could be lowered by editing it. A second copy
  // (crisis-reply.never-lower.pin.ts) says the least it may say; the data may add, never take.
  it('says no less than its pinned copy: calls, lines, hours, floors, phrases, rows', () => {
    const byName = new Map(CALLS.map((call) => [call.name, call]));
    for (const [name, pinned] of Object.entries(PINNED_CALLS)) {
      const call = byName.get(name);
      expect(
        call && {
          says: call.says,
          hour: call.hour ?? 12,
          held: call.held ?? false,
          floors: call.floors.map((set) =>
            ANSWERS.map((answer) => (typeof set === 'string' ? set : set[answer]))
          ),
        },
        name
      ).toEqual(pinned);
    }
    expect(PINNED_NEVER_HEARD.filter((words) => !NEVER_HEARD.includes(words))).toEqual([]);
    for (const [flag, row] of Object.entries(PINNED_SHOWN_ON))
      expect(SHOWN_ON[flag], flag).toEqual(row);
    expect(
      Object.keys(LOWERS_A_REPLY).filter((flag) => !PINNED_LOWERS_A_REPLY.includes(flag))
    ).toEqual([]);
    for (const [flag, says] of Object.entries(PINNED_SAYS))
      expect(WORDING_NOT_READ.onlyWithFlag[flag]?.says, flag).toEqual(
        expect.arrayContaining([...says])
      );
  });

  it.each(INERT)('%s=%s is its default and changes no reply', async (name, _label, word) => {
    expect(await moved({ [name]: word })).toEqual([]);
  });

  // The copy guard can fail: each way of copying is counted inside a reply, and only there.
  it('counts a copy of the environment made while a reply is being made, and no other', async () => {
    const copy = (): unknown => [
      { ...process.env },
      // eslint-disable-next-line prefer-object-spread -- the other way to copy, on purpose
      Object.assign({}, process.env),
      Object.keys(process.env),
      Object.entries(process.env),
      JSON.stringify(process.env),
    ];
    const [made, by] = [copies.made, [...copies.by]];
    copy();
    expect(copies.made).toBe(made);
    await inReply.run(true, async () => {
      await Promise.resolve();
      copy();
    });
    expect(copies.made).toBe(made + 5);
    copies.made = made;
    copies.by = new Set(by);
  });

  // A flag read off a copy of the environment is not recorded as read, so it is never set here.
  // So: where the copies are made, under which flag alone, and how many, are all listed.
  it('copies the environment where listed and as often as listed, and no more', async () => {
    expect(copiesIn.get(await readUnder({}))).toBe(ENV_COPIED.atDefaults);
    expect(copiesIn.get(await readUnder(allBut('', 'on')))).toBe(ENV_COPIED.everyFlagOn);
    expect(copiesIn.get(await readUnder(allBut('', 'live')))).toBe(ENV_COPIED.everyFlagLive);
    expect([...copies.by].sort()).toEqual(ENV_COPIED.by);
  });

  it.each(READ_BY_GATE)(
    '%s alone has a reply copy the environment exactly if it is listed',
    async (name) => {
      let made = 0;
      for (const word of WORDS) made += copiesIn.get(await readUnder({ [name]: word })) ?? NaN;
      expect(made > 0, `${made} copies`).toBe(ENV_COPIED.byFlagAlone.includes(name));
    }
  );

  // The classifier's copy is handed to its prompt and to nothing else (the line is pinned).
  // Every name read off it there must also be read off the environment itself, where every
  // word of the flag is tried: then no flag can act through the copy alone.
  it('reads off the copy no flag it does not also read off the environment', () => {
    const linesOf = (file: string): string[] =>
      readFileSync(join(__dirname, '../../../..', file), 'utf8')
        .split('\n')
        .map((line) => line.trim());
    for (const [file, lines] of Object.entries(ENV_COPIED.lines))
      expect(
        linesOf(file).filter((line) => /\.\.\.[\w.]*\benv\b/i.test(line)),
        file
      ).toEqual(lines);
    // A copy kept under a name goes where these lines send it, and nowhere else.
    for (const [file, { names, lines }] of Object.entries(ENV_COPIED.kept)) {
      const named = new RegExp(`\\b(${names.join('|')})\\b`);
      expect(
        linesOf(file).filter((line) => named.test(line)),
        file
      ).toEqual(lines);
      expect(Object.keys(ENV_COPIED.lines), file).toContain(file);
    }
    expect(ENV_COPIED.by.map((site) => site.split(' in ')[1])).toEqual(
      Object.keys(ENV_COPIED.lines)
    );
    const read = new Set<string>();
    let copiedOn = 0;
    for (const flags of [{}, allBut('', 'on'), allBut('', 'live')]) {
      const copy = new Proxy<Record<string, string | undefined>>(
        { ...flags, CRISIS_CLASSIFIER_EVERYDAY_RULES: 'off' },
        {
          get: (target, key) => (
            typeof key === 'string' && read.add(key),
            Reflect.get(target, key)
          ),
          has: (target, key) => (
            typeof key === 'string' && read.add(key),
            Reflect.has(target, key)
          ),
          ownKeys: (target) => ((copiedOn += 1), Reflect.ownKeys(target)),
        }
      );
      crisisClassifierPrompt(copy);
    }
    expect(copiedOn).toBe(0);
    expect([...read].sort()).toEqual(ENV_COPIED.readOffTheCopy);
    expect([...read].filter((name) => !READ_BY_GATE.includes(name))).toEqual([]);
  });

  // The scripted turn's read keeps its copy and hands it to startCrisisClassifier (the lines
  // are pinned above): the function the gate gives the environment itself on every turn the
  // patterns leave to the model. What it reads off the copy is recorded on the calls
  // themselves, with the flag alone and with every flag on and live: every flag in it must be
  // one the gate reads off the environment too, so every word of it is tried.
  it("reads off the scripted read's copy no flag it does not also read off the environment", async () => {
    const classifier = await import('../../../services/safety/crisis-classifier.js');
    const start = classifier.startCrisisClassifier;
    const read = new Set<string>();
    let handed = 0;
    const watched = vi
      .spyOn(classifier, 'startCrisisClassifier')
      .mockImplementation((input, options) => {
        if (!options.readBlocked) return start(input, options);
        handed += 1;
        return start(input, { ...options, env: noting(options.env ?? {}, read) });
      });
    try {
      for (const flags of [
        { CRISIS_SCRIPT_IMMINENT_READ: 'on' },
        allBut('', 'on'),
        allBut('', 'live'),
      ])
        await placeAllUnder(flags);
    } finally {
      watched.mockRestore();
    }
    // Not watched, this row would read nothing and pass: the copy must have been handed over.
    expect(handed).toBeGreaterThan(0);
    const flagsRead = [...read].filter(isFlag).sort();
    expect(flagsRead).toEqual(ENV_COPIED.readOffTheScriptedCopy);
    expect(flagsRead.filter((name) => !READ_BY_GATE.includes(name))).toEqual([]);
  });

  // A reply keyed on a session field the calls never set is never varied: list the field, and
  // give the calls its values, in the PR that makes the gate read it.

  // A key written twice in a table is not an error: the later row silently wins.
  // So the flag names written in each table's text are counted against the rows it ends up with.
  it('writes no row of its tables twice', () => {
    const text = readFileSync(join(__dirname, 'crisis-reply.never-lower.ts'), 'utf8');
    const written = (table: string): string[] => {
      const declared = text.indexOf(`export const ${table}`);
      const from = declared + text.slice(declared).search(/ =\s/);
      const next = text.indexOf('\n/**', from);
      const code = text
        .slice(from, next < 0 ? text.length : next)
        .split('\n')
        .filter((line) => !/^\s*\/\//.test(line))
        .join('\n');
      return [...code.matchAll(/\b([A-Z][A-Z0-9_]{2,}):/g)].map((match) => match[1]);
    };
    expect(written('SHOWN_ON')).toEqual(Object.keys(SHOWN_ON));
    expect(written('LOWERS_A_REPLY')).toEqual(Object.keys(LOWERS_A_REPLY));
    expect(written('WORDING_NOT_READ')).toEqual(Object.keys(WORDING_NOT_READ.onlyWithFlag));
    expect(new Set(CALLS.map((call) => call.name)).size).toBe(CALLS.length);
  });

  it('reads every listed field of the session, and no other', async () => {
    // The file has read the calls at the defaults and with every flag on by now; the eval
    // clock's own two fields are read only when a call carries one.
    await placeAllUnder({ FERNI_STATE: 'on' }, false, MOMENTS['the eval clock at night']);
    expect([...sessionRead].sort()).toEqual([...SESSION_FIELDS_READ].sort());
  });

  // The header's limits, counted. A new call or script changes a count here, and the limit
  // is then restated by hand in WORDING_NOT_READ.
  it('says how many turns it reads for the numbers only', async () => {
    const turns = [...(await readUnder({})).values()].flat().map(gives);
    expect({
      scripted: turns.filter((g) => g["code's words"]).length,
      guided: turns.filter((g) => !g["code's words"] && g['988 asked of the model']).length,
      unguided: turns.filter((g) => !g["code's words"] && !g['988 asked of the model']).length,
    }).toEqual(WORDING_NOT_READ.atDefaults);
  });

  it.each(READ_BY_GATE)('%s: a sentence only it brings is named as not read', async (name) => {
    const defaults = await readUnder({});
    const brought = new Set<string>();
    for (const word of WORDS) {
      const on = await readUnder({ [name]: word });
      for (const [key, off] of defaults)
        off.forEach((turn, i) => {
          for (const sentence of codeSays(on.get(key)![i]))
            if (!turn.spoken.includes(sentence)) brought.add(sentence);
        });
    }
    const row = WORDING_NOT_READ.onlyWithFlag[name];
    expect(brought.size, [...brought].join(' | ')).toBe(row?.sentences ?? 0);
    // The number the flag's sentences are there to give is in them.
    const carries = (number: string): boolean =>
      [...brought].some((s) => (number === '988' ? at988(s) : says(s, number)) >= 0);
    expect((row?.says ?? []).filter((number) => !carries(number))).toEqual([]);
  });

  it.each(Object.entries(LOWERS_A_REPLY))(
    '%s is off by default and still lowers',
    async (name, known) => {
      expect(defaultOf(name)).toBe('off');
      // Fixed? Delete the LOWERS_A_REPLY row and give the flag a SHOWN_ON row.
      expect(await losses({}, { [name]: known.value })).toEqual(known.lost);
    }
  );

  // Each loss a flag adds on top of THIRD_PARTY_SELF_HARM=live is red in that flag's own on-top row;
  // this pins the known lowering's own loss on the every-flag-live base, under its own name.
  it.each(Object.entries(LOWERS_A_REPLY))(
    '%s on top of every other flag set to live loses only what it loses alone',
    async (name, known) => {
      const base = allBut(name, 'live');
      const lost = known.onEveryLive ?? known.lost;
      expect(await losses(base, { ...base, [name]: known.value })).toEqual(lost);
    }
  );

  // The floor never lowers under the known lowering (crisis lead, 2026-11-17): with
  // THIRD_PARTY_SELF_HARM live, it only raises the friend-at-risk crisis turn to 988 spoken.
  it('CRISIS_GUIDED_LINE_FLOOR with THIRD_PARTY_SELF_HARM live raises only', async () => {
    const lowered = { THIRD_PARTY_SELF_HARM: 'live' };
    const floored = { ...lowered, CRISIS_GUIDED_LINE_FLOOR: 'on' };
    expect(await losses(lowered, floored)).toEqual([]);
    const friend = (r: Readings): Gives => gives(r.get('a friend at risk/crisis')![0]);
    expect(MEETS['988 spoken'](friend(await readUnder(lowered)))).toBe(false);
    expect(MEETS['988 spoken'](friend(await readUnder(floored)))).toBe(true);
  });

  describe('the holds this grid leans on', () => {
    // The grid gives the adjudicator no answer, so it cannot see a check-in the adjudicator
    // would hand a caller in place of crisis guidance. That is sound only while production
    // holds both live modes back. Lifting the hold is red here, by this message.
    it('the adjudicator and the easing read set to live are held, and change no reply', async () => {
      expect(adjudicatorCheckinsMayChangeReplies(), LIFT_FIRST).toBe(false);
      expect(resolveCrisisAdjudicatorMode({ CRISIS_ADJUDICATOR: 'live' }), LIFT_FIRST).toBe(
        'shadow'
      );
      expect(resolveEasingMode({ CRISIS_CLASSIFIER_ONLY_CHECKIN: 'live' }), LIFT_FIRST).toBe(
        'held'
      );
      // Two live words held with no lifter. The grid reads each word; this pins what it is.
      expect(resolveGradedResponseMode({ CRISIS_GRADED_RESPONSE: 'live' }), HELD_IN_CODE).toBe(
        'shadow'
      );
      // The grounded release is live only beside the reply gate set to the word live, in lower
      // case, space around it aside (MODES: how this grid runs it, with no answer from its
      // reads). Unset, or any other gate word, holds it.
      for (const guard of ['live', ' live\n'])
        expect(
          resolveGroundedReleaseMode({ CRISIS_GROUNDED_RELEASE: 'live', CRISIS_GUARD_MODE: guard })
        ).toBe('live');
      for (const guard of [undefined, '', 'shadow', 'off', 'Live', 'LIVE'])
        expect(
          resolveGroundedReleaseMode({ CRISIS_GROUNDED_RELEASE: 'live', CRISIS_GUARD_MODE: guard }),
          `the reply gate set to ${JSON.stringify(guard)}. ${HELD_IN_CODE}`
        ).toBe('shadow');
      for (const name of ['CRISIS_ADJUDICATOR', 'CRISIS_CLASSIFIER_ONLY_CHECKIN'])
        expect(await moved({ [name]: 'live' }), `${name}=live. ${LIFT_FIRST}`).toEqual([]);
      expect(
        await moved({ CRISIS_ADJUDICATOR: 'live', CRISIS_CLASSIFIER_ONLY_CHECKIN: 'live' }),
        LIFT_FIRST
      ).toEqual([]);
    });

    // Only a test may lift it: a production file that names the lifter could lift it in a
    // deploy, where no test of this file runs.
    it('no production file but its own names the lifter', () => {
      const naming = productionFiles('.').filter((file) => sourceOf(file).includes(LIFTER));
      expect(naming).toEqual(['./services/safety/crisis-adjudicator.ts']);
    });

    // A hold of the same kind, added later, is one more thing this grid cannot see.
    it('the crisis folders have no test-only lifter but the one pinned here', () => {
      const files = HOLD_FOLDERS.flatMap(productionFiles);
      expect(
        declaredIn(files, /^export (?:async )?(?:function|const) (\w+ForTests?)\b/gm),
        LIFT_FIRST
      ).toEqual(TEST_ONLY_EXPORTS);
    });

    it('services/safety has no module-level variable but those read and listed here', () => {
      const declared = declaredIn(
        productionFiles('services/safety'),
        /^(?:export )?(?:let|var) (\w+)/gm
      );
      expect(declared.sort(), NEW_VARIABLE).toEqual(SAFETY_VARIABLES);
    });
  });

  // The total, in whatever order the tests ran. A reader with its own model call shows up here.
  it('reaches no model: the second models are asked through the stub and nowhere else', async () => {
    await readUnder({ CRISIS_ADJUDICATOR: 'shadow' });
    expect(reached).toEqual({ 'model clients': 0, connections: 0, fetches: 0 });
    expect(adjudicatorAsks).toBeGreaterThan(0);
  });
});
