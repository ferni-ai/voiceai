# Decision register

Seth's standing product and design decisions, one entry each, so every
platform builds to the same call. Before you change something one of these
covers, read its entry. To change a decision, ask Seth, then edit the entry
and its rule in the same PR.

Each entry says how it is enforced:

- **rule `<id>`**: checked in CI by
  `src/__tests__/decisions/decision-register.test.ts`, which reads the real
  source files. That test also fails when this file names a rule it doesn't
  have, or it has a rule this file doesn't name.
- **pending `<id>`**: the rule is written as a to-do in that test and is not
  enforced yet; the entry says why.
- **existing test**: another test already enforces it; the entry names it.
- **manual**: no mechanical check. Reviewers hold the line.

The rules run in the Unit Tests job's full suite, which the merge queue always
runs. On a pull request that job runs only tests whose imports reach a changed
file, and these rules read Swift, CSS and JSON as text, so a PR that breaks
one hears about it in the queue rather than at PR time.

## D1. Eyelid caps are white (ivory in dark mode)

- **Decision:** the avatar's lid caps are pure white #FFFFFF in light mode
  and warm ivory #E6DFD4 in dark mode. They are never the page or room
  colour, and never a shade of the face. The caps are domes over the top and
  bottom of the head, as on the web, and the light lid dropping over the eyes
  carries the expression.
- **Decided:** Seth, 2026-10-23 (web #2550). This replaces the 2026-10-11
  call (#995) that the caps take the page colour.
- **Why:** a page-coloured cap vanishes in dark mode (the 10-23 device build
  read as transparent), and a face-coloured lid cuts a crescent out of the
  avatar so the expression disappears (the iOS regression of 2026-10-20).
  Seth found pure white too bright in dark mode, hence ivory.
- **Enforcement:**
  - web: existing test `apps/web/tests/ui/avatar-motion/lid-colour.test.ts`:
    `inline-styles.css` fills `.lid-top`/`.lid-bottom` with `#ffffff`, the
    midnight theme with an ivory in a set luminance band (0.6 to 0.95), the
    lid paths are white without a stylesheet, and the injected expression
    styles set no lid fill.
  - iOS: pending `lid-caps-ios-alive`. On main the canvas avatar clips its
    lids and draws no caps. The white and ivory domes ride the iOS landing
    train in the Alive renderer (`AliveShader.swift`); turn the to-do into a
    rule when they land.
- **Scope:** web, iOS.

## D2. No "AI" in user-facing labels, and no on-screen AI notice

- **Decision:** no label, badge or banner in the apps says "AI", Ferni's
  included. The role pill shows just the role ("Life coach", fallback
  "Friend").
- **Decided:** Seth, 2026-10-12 (#1122).
- **Why:** Ferni is a friend in the app. Seth chose this after the
  companion-chatbot disclosure laws were raised. It doesn't change the rule
  that Ferni never denies being an AI when sincerely asked.
- **Exception:** on calls to third parties the opener says
  "<user>'s AI friend" (#624); see D3.
- **Enforcement:**
  - existing test `apps/web/tests/ui/ai-role-label.test.ts`: every role label
    in en-US/en-GB, and every speaker's label.
  - rule `no-ai-web-locales`: every string in every web locale file
    (`apps/web/src/i18n/locales/*.json`), for "AI", "A.I.", "KI", "IA" as
    whole words and "artificial intelligence".
  - rule `no-ai-ios-strings`: every string literal in the iOS app and package
    sources (not tests, not log calls), the usage descriptions in `Info.plist`,
    and any `*.xcstrings` catalogue.
  - manual: strings hard-coded in web TypeScript and HTML
    (`apps/web/src/**/*.ts`, `apps/web/index.html`); they also carry
    developer text, so a scan would not be exact. App Store copy
    (`apps/ios-native/AppStore/METADATA.md`) is marketing, not the app, and is
    out of scope.
- **Scope:** web, iOS.

## D3. Ferni speaks as himself; AI disclosure only in the third-party opener

- **Decision:** no AI-disclosure prompt changes, no start-of-call disclosure
  or reminders on users' own calls. On calls to other people the opener is
  "Hi <name>, it's Ferni, <user>'s AI friend", and nothing more.
- **Decided:** Seth, 2026-10-10 and 2026-10-11. Source: `AGENTS.md` ("No
  AI-disclosure prompt changes").
- **Why:** with users Ferni is a friend; with people who never signed up the
  disclosure is required and honest.
- **Enforcement:** existing test
  `src/agents/outbound-call/__tests__/call-screener.test.ts` pins the opener's
  words. Prompts: manual.
- **Scope:** server, spoken text.

## D4. No em dashes, ellipses or stage directions in spoken text

- **Decision:** what Ferni says has no em dashes, no ellipses and no stage
  directions. A hint asking for a restart or trailing off carries a written
  example in commas and full stops.
- **Decided:** source `AGENTS.md` (voice text rules) and
  `src/agents/personas/speech-markup-notes.ts`.
- **Why:** TTS reads dashes and ellipses badly, and the model writes `,,` when
  asked to trail off without an example.
- **Enforcement:** no repo-wide lint (persona content JSON has hundreds of em
  dashes in non-spoken fields, so a scan isn't exact). Existing tests guard
  the scripted lines module by module, e.g.
  `src/agents/voice-agent/phases/__tests__/demo-call-cap.test.ts`,
  `src/agents/multi-agent/__tests__/resume-after-drop.test.ts`,
  `src/agents/multi-agent/__tests__/family-table.test.ts`,
  `src/tools/domains/information/__tests__/web-search.test.ts`,
  `src/agents/outbound-call/__tests__/call-screener.test.ts`. Stage
  directions: `src/tests/stage-direction-*.test.ts` in
  `.github/workflows/stage-direction-tests.yml` (path-filtered and optional).
  Everything else: manual.
- **Scope:** spoken text.

## D5. At most 4 earcons a call

- **Decision:** a call plays at most four earcons (arrival, handoffs,
  goodbye), at least 20 s apart, never over someone talking.
- **Decided:** source: sound director (#1689, 2026-10-17) and the iOS
  EarconDirector (ios-motion-spec section 7.1 item 7).
- **Why:** before the director a call start was three chimes and chimes
  landed over Ferni's voice.
- **Enforcement:**
  - web: rule `earcon-cap-web`. `MAX_EARCONS_PER_CALL` in
    `apps/web/src/services/sound-director.ts` is 4.
    (`sound-director.test.ts` checks the director honours the constant,
    whatever its value.)
  - iOS: rule `earcon-cap-ios`. The `playedThisCall < 4` guard in
    `EarconDirector.swift`. That file is on the iOS train, so the rule is
    skipped until it lands on main and enforces from then on.
- **Scope:** web, iOS.

## D6. New behaviour ships behind a flag that is off by default

- **Decision:** a new behaviour merges behind an env flag that is off by
  default, defined as one file in `src/config/flags/`; it goes on in dev
  first, prod after it's been heard on dev.
- **Decided:** source `AGENTS.md` (How work ships, step 3) and
  `src/config/flag-manifest.ts` ("experiment: off by default").
- **Why:** unproven work can merge without changing what callers hear.
- **Enforcement:**
  - rule `experiment-flags-default-off`: every flag of kind `experiment` in
    `FLAG_MANIFEST` defaults to `off` or `shadow` (shadow logs and never
    acts).
  - existing test `src/config/__tests__/flag-manifest-contract.test.ts`:
    the `flags/` layout, one file per flag.
  - existing test `src/config/__tests__/flag-manifest.test.ts`: every env flag
    read in `src/` is in the manifest.
  - manual: whether a change needs a flag at all, and whether its kind is
    honest.
- **Scope:** server.

## D7. A friend never just goes silent

- **Decision:** a caller turn that got a reply attempt but no speech gets a
  short human line ("Sorry, I lost my train of thought there. Say that
  again?"), never silence.
- **Decided:** source `src/agents/multi-agent/never-silent.ts` (after the
  2026-10-11 silent-agent outage, #989). Behind `NEVER_SILENT`.
- **Why:** agents joined calls, heard every turn and said nothing; nothing in
  the call noticed.
- **Enforcement:** existing tests
  `src/agents/multi-agent/__tests__/never-silent.test.ts` and
  `never-silent.sdk.test.ts` (fault injection on a real session).
- **Scope:** server, spoken text.

## D8. Keep Ferni's cute feature names, with plain subtitles

- **Decision:** keep the warm names ("The Chronicle", "The Sanctuary", "Our
  Story"); pair each with a short plain subtitle; one name per feature
  everywhere (menu, screen title, voice).
- **Decided:** Seth, 2026-10-18.
- **Why:** the names are Ferni's character. Fix discoverability with
  subtitles, grouping, search and contextual entry points, not renaming.
- **Enforcement:** manual.
- **Scope:** web, iOS, spoken text.

## D9. Idle sounds and animation only when earned

- **Decision:** idle hums, whistles and idle animation are earned: never on a
  first call, only in light calls, the whistle at most every other call, and
  never after a heavy turn or a goodbye.
- **Decided:** Seth, 2026-10-22 (sounds audit).
- **Why:** an idle sound in a heavy moment, or every call, reads as a tic.
- **Enforcement:** the heavy-turn part is in #2413 ("no idle hum, whistle or
  yawn after a heavy turn or goodbye"). The rest: manual.
- **Scope:** web, iOS, server.
