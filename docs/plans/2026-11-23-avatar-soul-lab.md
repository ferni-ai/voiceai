# Avatar Soul lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the admin Avatar Soul page so it shows and drives the real webapp avatar, and shows how often each avatar moment fired on real calls in the last 24 h.

**Architecture:**

- The webapp gets a lab mode at `/avatar-lab`. It is the same `index.html` and SPA (like `/admin`), but it boots only the avatar, through the same `ui/avatar-boot.ts` function `app.ts` uses.
- The admin Avatar Soul section shows `/avatar-lab` in a same-origin iframe. Its controls post commands. The lab runs each one through a real export and answers what happened, and the admin section shows that answer.
- Field data comes from the soul stats store (#4298) and the browser sender, widened to every moment.

**Tech Stack:** TypeScript, Vite 8 SPA (`apps/web`), vitest + jsdom (`apps/web/vitest.config.ts`), Node UI server (`src/servers/api`), Playwright (`e2e/`).

**Spec:** the design section below (approved by Seth 2026-11-23); issue #4069 lane L6; `docs/plans/2026-11-18-admin-grounded-data.md`.

## Design (approved 2026-11-23), with the changes recon forced

The approved design, in short:

- the lab boots the real avatar with the function `app.ts` uses, inside an iframe;
- every control calls a real export, with the crisis hold, motion switches and reduced motion shown honestly;
- pupils, gaze and sliders with no real export behind them are removed;
- the counts widen to every moment and move here from Human Listening;
- no new effects, and no change to how the avatar behaves on a call.

Rulings made while planning, each with what it costs if wrong:

- **Ruling: the lab is `/avatar-lab` on the existing SPA, not a new `avatar-lab.html` entry.**
  - Why:
    - the Vite build has one entry (`index.html`, no input map);
    - a second entry re-chunks the whole app, and `vite.config.ts` warns that cyclic chunks have crashed `app.ferni.ai` before;
    - `index.html` already holds the real avatar markup and every avatar stylesheet, so the lab copies nothing and there is no markup to drift.
  - If wrong: the lab pays for loading the full `index.html` (its CSS and the GSAP script). Admin-only, so acceptable.
- **Ruling: `/avatar-lab` may be framed by its own origin, and every other path stays `DENY`.**
  - Why: `src/servers/shared/security-headers.ts` sends `X-Frame-Options: DENY` on every UI-server response, and that refuses even a same-origin frame. The CSP already says `frame-ancestors 'self'`.
  - If wrong: a test pins that only that one path changed.
- **Ruling: no feature flag for the lab.**
  - Why: it changes nothing a caller sees, reads no data, joins no call, sends nothing, and is reached from an admin-only section.
  - If wrong: a reviewer asks for one, which is easy to add.
- **Ruling: in lab mode the soul stats service records nothing.**
  - Why: the lab runs the real avatar-soul and micro-expression code, which would otherwise report lab clicks as field data.
- **Ruling: faces go through `ferniExpressions.setExpression`, the entry every caller uses.**
  - Why: it hands off to the face engine when `faceEngine` is on and runs the old lids when it is off. So the lab shows what a call shows in both states.

## Global Constraints

- PRs: about 400 reviewable lines or fewer, one concern each, branched from `origin/main`, merged through the queue after an independent verifier PASS on the exact head.
- Files over 500 lines may not grow (ratchet). `app.ts` (3238), `AvatarSoulSection.ts` (842), `avatar-soul.ui.ts` (2124) and `HumanListeningSection.ts` may only shrink.
- No `console.*`: use `createLogger` from `apps/web/src/utils/logger.ts`. Never swallow an error.
- No `any`. Colours, durations and shadows come from design tokens.
- Motion switch keys are read and written only in `apps/web/src/config/motion-flags.ts` (`tests/config/motion-flags.test.ts` enforces this).
- No number without a source: field data shows a count from the store, "not measured: <reason>" or "unavailable (HTTP <n>)", never a stand-in.
- Copy uses no em dashes or ellipses. Fixtures are fictional.
- Every admin control must show a visible effect in the admin document within 1.5 s, or the walk reports it dead.
- `BlindEvaluationPanel.ts` is never opened.

## Review Focus

1. **A message from another origin, or a non-parent window, posts a command.** The lab ignores it and runs nothing. Test in Task 3.
2. **A command name or argument the lab doesn't know** (`"__proto__"`, a face not in the list, an effect not in `NameLiftEffect`). The lab answers `{ ok: false, why: 'unknown command' }` and runs nothing. Test in Task 3.
3. **A click on a moment while the crisis hold is on.** The lab answers with the real predicate's refusal, and the admin shows it, not a success. Test in Task 3 (bridge) and Task 5 (section copy).
4. **The lab iframe hasn't finished booting when a control is clicked.** The admin shows "lab not ready" rather than nothing or a fake success. Test in Task 5.
5. **Leaving the section and coming back.** The message listener is removed, and repeat visits don't stack listeners (the Experiments bug from the audit). Test in Task 5.

## File structure

| File                                                                  | Responsibility                                                                                |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/web/src/ui/avatar-boot.ts` (new)                                | The one place the avatar's init calls live: order, delays, turn start                         |
| `apps/web/src/app.ts`                                                 | Calls `avatar-boot` instead of the inline calls; routes `/avatar-lab` to the lab (net shrink) |
| `apps/web/src/avatar-lab/lab-mode.ts` (new)                           | `isAvatarLab()`: the one predicate for "this page is the lab"                                 |
| `apps/web/src/avatar-lab/index.ts` (new)                              | Lab boot: hide the rest of the page, boot the avatar, start the bridge                        |
| `apps/web/src/avatar-lab/lab-commands.ts` (new)                       | The command table: name, argument check, real export, gate                                    |
| `apps/web/src/avatar-lab/lab-bridge.ts` (new)                         | `message` listener: origin and source checks, run, reply                                      |
| `src/servers/api/static.ts`, `src/servers/shared/security-headers.ts` | `/avatar-lab` serves `index.html` and may be framed same-origin                               |
| `apps/web/src/config/motion-flags.ts`                                 | Adds build-default and override read/write helpers                                            |
| `apps/web/src/admin/sections/AvatarSoulSection.ts`                    | Rewritten small: iframe, controls, status line, cleanup                                       |
| `apps/web/src/admin/sections/avatar-lab-client.ts` (new)              | Admin side of the protocol: send, await reply, timeout                                        |
| `apps/web/src/admin/sections/soul-stats-panel.ts`                     | Moves here from Human Listening, widened (Task 7)                                             |

The message protocol is shared:

- `apps/web/src/avatar-lab/lab-protocol.ts` (new): `LabRequest`, `LabReply`, `LAB_MESSAGE_TYPE = 'ferni:avatar-lab'`.

---

## PR 1: one avatar boot (no behaviour change)

Opened as #4306. This plan landed in its own docs PR, to keep #4306 at 229 reviewable lines.

### Task 1: Move the avatar init calls into `ui/avatar-boot.ts`

**Files:**

- Create: `apps/web/src/ui/avatar-boot.ts`
- Modify: `apps/web/src/app.ts`: `initializeUI()`, lines ~1196-1197 (`initCoachUI`, `initExpressiveEyes`) and the deferred avatar inits at ~1232-1237, 1245-1247, 1293-1296, 1320-1323, 1444-1462, 1514-1535.
- Test: `apps/web/tests/ui/avatar-boot.test.ts`

**Interfaces:**

- Produces:
  ```ts
  export interface AvatarBootRunner {
    now(name: string, fn: () => void | Promise<void>): void;
    later(name: string, delayMs: number, fn: () => void | Promise<void>): void;
  }
  export interface AvatarBootOptions {
    /** Starts turn following; returns whether turns are active (app: initSpeakerCues + initAvatarTurns). */
    startTurns: () => boolean;
  }
  /** Coach and expressive eyes, run where app.ts ran them (before roster/team/controls). */
  export function bootAvatarNow(run: AvatarBootRunner): void;
  /** Every deferred avatar init, each at its existing delay. */
  export function scheduleAvatar(run: AvatarBootRunner, opts: AvatarBootOptions): void;
  export const AVATAR_BOOT_STEPS: readonly { name: string; delayMs: number }[];
  ```
- `scheduleAvatar` covers, by app.ts name and delay:
  - ThinkingUI 100: `initThinkingUI`, then `initTurnGestures(opts.startTurns())`, then `initNaturalBlink`;
  - AvatarFeedback 100;
  - PresenceUI 300;
  - AvatarTapReactions 400;
  - FerniExpressions 300;
  - EmotionExpressionBridge 400;
  - LogoExpressions 400 (`initLogoExpressions` + `hookIntoAvatarFeedback`);
  - AvatarSoul 600 (with the `ferni:conversation-turn` → `recordInteraction(0.5)` listener);
  - AvatarLamp 700 (with `window.__avatarLamp`);
  - AmbientLife 800.

  Use the exact names and delays from app.ts; recon read them at the lines above.

- Not included (stay in app.ts): `initSpeakerCues` (moves into the app's `startTurns` callback), FerniEQ, sidekicks, unified indicator, animation orchestrator and `initSoul`, waveform, message, controls.

- [ ] **Step 1: Write the failing test** `avatar-boot.test.ts`:
  - `scheduleAvatar` with a recording runner registers exactly `AVATAR_BOOT_STEPS`, in order, with those delays;
  - running the recorded fns calls each mocked init once (`vi.mock` each module path);
  - `startTurns` is called once and its result is passed to `initTurnGestures`;
  - `bootAvatarNow` calls `initCoachUI` then `initExpressiveEyes` through `run.now`.

  Assert `AVATAR_BOOT_STEPS` equals the literal list of `{ name, delayMs }` copied from app.ts.

- [ ] **Step 2: Run it and see it fail.** `cd apps/web && pnpm vitest run tests/ui/avatar-boot.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `avatar-boot.ts`. Each step keeps app.ts's `await import(...)`, so chunking is unchanged.
- [ ] **Step 4: Replace the inline calls in app.ts.**
  - Call `bootAvatarNow(runner)` at the `initCoachUI` position and `scheduleAvatar(runner, { startTurns: () => { initSpeakerCues(); return initAvatarTurns(); } })` at the ThinkingUI position.
  - `runner` adapts `safeInit` / `deferredInit`.
  - Keep `initThinkingUI`'s `holdUntilFirstCall` behaviour: none of these steps used it.
  - Equal-delay timers registered by `scheduleAvatar` keep their relative order. Their order against non-avatar timers of the same delay registered later in `initializeUI` may change. List each such pair in the PR body.
- [ ] **Step 5: Prove no behaviour change.**
  - `pnpm vitest run tests/ui/avatar-boot.test.ts` passes, plus the existing `tests/app` and `tests/ui/avatar-motion` suites.
  - `cd apps/web && pnpm typecheck` passes.
  - The app.ts line count drops.
  - Mutant: change one delay in `AVATAR_BOOT_STEPS`'s source and see the test go red.
  - Load the dev UI signed in, start a call on dev and check the avatar breathes, blinks, shows thinking, and plays a memory spark (`window.__avatarSoul.triggerMemorySpark()`).
- [ ] **Step 6: Commit** `refactor(web): one avatar boot shared by the app and the lab`.

---

## PR 2: the lab page and its command bridge

Order: PR 2 starts after the browser sender PR (`fix/web-soul-stats-sender`) merges, because Task 2's lab guard goes into the sender's rewritten `soul-stats.service.ts`. PR 1 does not wait.

### Task 2: `/avatar-lab` route, framing and lab boot

**Files:**

- Create: `apps/web/src/avatar-lab/lab-mode.ts`, `apps/web/src/avatar-lab/index.ts`
- Modify:
  - `apps/web/src/app.ts`: in `initialize()`, next to the `pathname === '/admin'` branch (~464), add `if (isAvatarLab()) return this.initializeAvatarLab();`. `initializeAvatarLab` is a two-line method doing a dynamic `import('./avatar-lab/index.js')` and `startAvatarLab()`.
  - `src/servers/api/static.ts`: `handleStaticRoutes`, where `/admin` → `index.html` (~196): add `/avatar-lab`.
  - `src/servers/shared/security-headers.ts`: frame options become `SAMEORIGIN` when the request path is exactly `/avatar-lab`.
  - `apps/web/src/services/soul-stats.service.ts`: every record method returns without counting when `isAvatarLab()`.
- Test:
  - `apps/web/tests/avatar-lab/lab-mode.test.ts`
  - `src/servers/shared/__tests__/security-headers-frame.test.ts`
  - `src/servers/api/__tests__/static-avatar-lab.test.ts`
  - the soul stats service test (extend the sender's test file)

**Interfaces:**

- Produces:
  - `export function isAvatarLab(loc: Pick<Location, 'pathname'> = window.location): boolean`. True only for pathname `/avatar-lab` or `/avatar-lab/`.
  - `export async function startAvatarLab(): Promise<void>`:
    1. adds `data-avatar-lab="on"` on `<html>` (the lab CSS in `index.ts` hides everything except `#coach` and `#waveformContainer`);
    2. calls `initializeTheme`, `initWaveformUI`, `bootAvatarNow` and `scheduleAvatar`, with an immediate runner (each `later` uses `setTimeout(fn, delayMs)`) and `startTurns: () => true`;
    3. creates the turn driver: `createTurnDriver(defaultTargets, TURN_SETTLE_MS)`;
    4. starts the bridge (Task 3) with it.
  - The lab never imports the connection service, auth or LiveKit.

- [ ] **Step 1: Write the failing tests:**
  - `isAvatarLab` is true for `/avatar-lab` and `/avatar-lab/`, and false for `/`, `/admin`, `/avatar-lab-x` and `/a/avatar-lab`.
  - The security headers give `X-Frame-Options: SAMEORIGIN` for `/avatar-lab` and `DENY` for `/`, `/admin` and `/avatar-lab-x`.
  - Static: `GET /avatar-lab` serves `index.html` with 200.
  - With the location at `/avatar-lab`, the soul stats service's record calls leave nothing pending and nothing is sent.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass.** Mutants: drop the exact-path check (`startsWith`) → the `/avatar-lab-x` cases go red; drop the guard → the soul stats test goes red.
- [ ] **Step 5: Commit** `feat(web): avatar lab page that boots only the real avatar`.

### Task 3: The command table and bridge

**Files:**

- Create: `apps/web/src/avatar-lab/lab-protocol.ts`, `lab-commands.ts`, `lab-bridge.ts`
- Modify:
  - `apps/web/src/ui/ferni-expressions.ui.ts`: export `EMOTIONAL_EXPRESSIONS` as a `const` tuple and derive `EmotionalExpression` from it (one source; the file may not grow, so move one helper out if needed);
  - `apps/web/src/avatar-lab/index.ts`: start the bridge.
- Test: `apps/web/tests/avatar-lab/lab-commands.test.ts`, `lab-bridge.test.ts`

**Interfaces:**

- Produces (`lab-protocol.ts`):
  ```ts
  export const LAB_MESSAGE_TYPE = 'ferni:avatar-lab';
  export type LabCommand =
    | { name: 'turn'; speaker: 'ferni' | 'user' | 'thinking' | 'none' }
    | { name: 'face'; expression: EmotionalExpression }
    | { name: 'moment'; moment: LabMoment }
    | { name: 'nameLift'; effect: NameLiftEffect }
    | { name: 'crisisHold'; on: boolean }
    | { name: 'status' };
  export type LabMoment =
    | 'warmthBloom'
    | 'memorySpark'
    | 'comfortPulseStart'
    | 'comfortPulseStop'
    | 'protectiveOn'
    | 'protectiveOff'
    | 'celebrateGrowth'
    | 'cameoArrival'
    | 'cameoReturn';
  export interface LabRequest {
    type: typeof LAB_MESSAGE_TYPE;
    id: string;
    command: LabCommand;
  }
  export interface LabReply {
    type: typeof LAB_MESSAGE_TYPE;
    id: string;
    ok: boolean; // false: refused or unknown, and nothing ran
    ran?: string; // the real export that ran, e.g. 'triggerMemorySpark'
    why?: string; // a refusal, said for a person
    status?: LabStatus;
  }
  export interface LabStatus {
    ready: boolean;
    crisisHeld: boolean;
    reducedMotion: boolean;
    turn: Speaker;
  }
  export function parseLabRequest(data: unknown): LabRequest | null;
  ```
- Produces (`lab-commands.ts`): `export function runLabCommand(cmd: LabCommand, deps: LabDeps): Omit<LabReply, 'type' | 'id'>`, where `LabDeps` holds the turn driver and the real exports (injectable for tests).
  - `turn` → `driver.update(signals)`, with these signals per speaker:
    - ferni: `agentState 'speaking'`;
    - user: `'listening'` with `userSpeaking: true`;
    - thinking: `'thinking'`;
    - none: `'listening'`.

    Every signal has `userLevel: 0, canInterrupt: false`.

  - `face` → `ferniExpressions.setExpression(expression)`. It is refused when `!crisisFaceAllows(expression)`, with why `'The crisis hold allows only calm faces'`.
  - `moment` → the `avatar-soul.ui.ts` export:
    - `warmthBloom`: `triggerWarmthBloom(1)`;
    - `cameoArrival`: `triggerCameoArrival` with the persona colour token `var(--color-ferni)` resolved from computed style.

    There is no `shimmer` moment: `flashShimmer` draws on `irisShimmerElement`, which is always null, so a shimmer control could never play.

    Gate each moment on the real predicate for the affect it plays:
    - `memorySpark`, `celebrateGrowth`, `cameoArrival`: `crisisAffectAllows('sparkle' | 'celebration')`, whichever the export plays. The implementer reads each export and names the affect in the table.
    - `comfortPulseStart`: `avatarMotionAllowed('comfortPulse')`.
    - `protectiveOn`: refused when reduced motion is on, because `enterProtectiveMode` returns early then, with why `'Reduced motion is on, so protective mode does not play'`.

  - `nameLift` → `playNameLift({ effect })`.
  - `crisisHold` → `holdCrisisFace()` / `releaseCrisisFace()`.
  - `status` → `LabStatus`, from `isCrisisFaceHeld()`, the `prefers-reduced-motion` media query, and `driver.shown()`.
- Produces (`lab-bridge.ts`): `export function startLabBridge(win: Window, deps: LabDeps): () => void`. It acts only when `event.origin === win.location.origin` and `event.source === win.parent`, and posts the reply to `win.parent` with `targetOrigin = win.location.origin`. It returns the dispose function.

- [ ] **Step 1: Write the failing tests:**
  - `parseLabRequest` rejects:
    - the wrong `type`;
    - a missing `id`;
    - an unknown `name`;
    - a `face` not in `EMOTIONAL_EXPRESSIONS`;
    - a nameLift effect not in `'brighten' | 'attentive' | 'comfort'`;
    - a `moment` not in `LabMoment`;
    - `{ name: '__proto__' }`.
  - Each command calls exactly its export (spies in `LabDeps`) and replies with `ran` set to that export's name.
  - With the hold on, `face: 'excited'` replies `{ ok: false, why: 'The crisis hold allows only calm faces' }` and `setExpression` is not called, while `face: 'empathetic'` runs.
  - With reduced motion, `protectiveOn` replies refused and `enterProtectiveMode` is not called.
  - Bridge:
    - a message from another origin gets no reply and no call;
    - a message from a source that isn't the parent gets no reply;
    - a good message gets one reply with the same `id`;
    - after dispose, nothing runs.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass.** Mutants: drop the origin check; drop the hold gate on `face`; reply `ok: true` on an unknown command. Each must go red.
- [ ] **Step 5: Real browser check.**
  - Run the Vite dev server and open `/avatar-lab`.
  - From the console, `window.postMessage` a `turn: 'ferni'` request. It is accepted because `window.parent === window` when not framed.
  - Check `#coach` gains `is-speaking`, and that `moment: 'memorySpark'` adds the spark element under `#coachAvatar`.
- [ ] **Step 6: Commit** `feat(web): avatar lab runs real avatar exports on command`.

---

## PR 3: the admin section

### Task 4: Motion switch helpers

**Files:** Modify `apps/web/src/config/motion-flags.ts`. Test: `apps/web/tests/config/motion-flags.test.ts` (extend).

**Interfaces:**

- `export const MOTION_FLAGS: readonly MotionFlag[]`, in `SWITCHES` order.
- `export function motionFlagBuildDefault(flag: MotionFlag): boolean`: the `VITE_*` value only.
- `export function motionFlagOverride(flag: MotionFlag): 'on' | 'off' | null`: reads localStorage. `'true'` counts as `'on'` and `'false'` as `'off'`.
- `export function setMotionFlagOverride(flag: MotionFlag, value: 'on' | 'off' | null): void`: `null` removes the key. It logs, and never throws, when storage is unavailable.

- [ ] **Step 1: Write the failing tests:**
  - for each flag, an override of `'on'` makes `isMotionFlagOn` true, `'off'` makes it false, and `null` falls back to `motionFlagBuildDefault`;
  - `setMotionFlagOverride(flag, null)` removes `MOTION_FLAG_KEYS[flag]`;
  - a throwing `localStorage` gives `null` and no throw;
  - the existing "no direct key reads elsewhere" test still passes.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Commit** `feat(web): read and set motion switch overrides in one place`.

### Task 5: Rewrite `AvatarSoulSection`

**Files:**

- Create: `apps/web/src/admin/sections/avatar-lab-client.ts`
- Rewrite: `apps/web/src/admin/sections/AvatarSoulSection.ts`, from 842 lines to well under 300. Move control rendering into `avatar-lab-controls.ts` if needed.
- Modify:
  - `apps/web/src/admin/section-registry.ts`, the `avatar-soul` entry:
    - `description: 'The real avatar and its moments'`;
    - drop `badge: 'NEW'`;
    - add `cleanup: () => mod.cleanup()`.
  - `apps/web/src/admin/sections/index.ts` re-exports.
- Test: `apps/web/tests/admin/avatar-soul-section.test.ts`

**Interfaces:**

- Consumes: `LabRequest`, `LabReply`, `LabCommand`, `parseLabRequest` from Task 3; the motion helpers from Task 4.
- Produces (`avatar-lab-client.ts`):
  ```ts
  export function createLabClient(
    frame: HTMLIFrameElement,
    win: Window,
    timeoutMs = 2000
  ): {
    send(command: LabCommand): Promise<LabReply | { ok: false; why: 'lab not ready' }>;
    dispose(): void;
  };
  ```
  It accepts only replies with `event.source === frame.contentWindow` and the same origin, matched by `id`.
- Produces (`AvatarSoulSection.ts`): `render(): string`, `setupEvents(root: HTMLElement): Promise<void>`, `cleanup(): void`.

The UI (text sketch):

```
Avatar Soul                                  [the real avatar, live]
┌ iframe /avatar-lab ┐  Turn:    [Ferni speaking] [You speaking] [Thinking] [Nobody]
│   (the avatar)     │  Face:    <select of EMOTIONAL_EXPRESSIONS> [Show face]
└────────────────────┘  Moments: [Warmth bloom] [Memory spark] [Comfort pulse] [Stop pulse]
Status: Memory spark played (triggerMemorySpark)    [Protective on] [Protective off] ...
                        Name lift: [Brighten] [Attentive] [Comfort]
                        Crisis hold: [Hold] [Release]   Held: no
                        Reduced motion: off (follows this device; turn on in the OS or DevTools)
Motion switches (this browser; also changes your webapp)
  gaze        build: off   override: [default|on|off]
  ...
Field data, last 24 h  (Task 7)
```

- Every control's click writes the reply into `#avatarLabStatus` (`aria-live="polite"`):
  - "<Label> played (<ran>)" when the lab ran it;
  - "Not played: <why>" when it was refused;
  - "Lab not ready" when it timed out.
- A motion switch change calls `setMotionFlagOverride`, reloads the iframe (`frame.src = frame.src`) and writes "gaze is now on in this browser; the lab reloaded".
- The reduced motion line reads `matchMedia('(prefers-reduced-motion: reduce)')` and updates on its `change` event.
- `cleanup()` disposes the client and removes the `matchMedia` listener.
- Removed: `#adminSoulPreview`, the pupil and gaze controls, and the energy/warmth/breath sliders.

- [ ] **Step 1: Write the failing tests** (pattern: `tests/admin/admin-section-bindings.test.ts`):
  - render then setup contains an `iframe[src="/avatar-lab"]` and no `#adminSoulPreview`, `data-soul="pupil"` or `data-soul="gaze"`;
  - each control button, with a fake lab, posts the matching `LabCommand`, and on its reply the status shows "Memory spark played (triggerMemorySpark)" / "Not played: The crisis hold allows only calm faces";
  - with no reply, after the timeout (fake timers), the status reads "Lab not ready";
  - setup, cleanup, setup again, then one click → exactly one request posted;
  - flipping a motion switch writes the override and reloads the frame;
  - the reduced motion line follows a faked `matchMedia` change.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** together with `tests/admin` whole (`cd apps/web && pnpm vitest run tests/admin`). Mutants: drop `cleanup`'s dispose (the stacking test goes red); show "played" without reading the reply (the refusal test goes red).
- [ ] **Step 5: Commit** `feat(admin): avatar soul drives the real avatar in a lab frame`.

### Task 6: Prove it end to end

**Files:**

- Create: `e2e/avatar-lab.spec.ts` (no sign-in: the lab page needs none).
- Modify: `e2e/signed-in/admin-portal.spec.ts` only if the walk reports a finding. Fix the cause; never add a `KNOWN_DEAD` entry.

- [ ] **Step 1: Write `e2e/avatar-lab.spec.ts`:**
  - Open `/avatar-lab`.
  - Only `#coach` is visible (`#personaName` aside).
  - Post `turn: 'ferni'` → `#coach` has class `is-speaking`. `turn: 'none'` → it doesn't.
  - `moment: 'memorySpark'` → a reply with `ran: 'triggerMemorySpark'`.
  - `crisisHold on`, then `face: 'excited'` → `ok: false`, and no change to the eyes' `data-expression`.
  - A second context with `emulateMedia({ reducedMotion: 'reduce' })`: `status` reports `reducedMotion: true`, and `protectiveOn` is refused.
  - A message from a page on another origin gets no reply.
- [ ] **Step 1b: Make CI run it.** Add it to the workflow that already serves the built UI for the admin menu walk (find it with `git grep -n "admin-portal.spec" .github/`), so it runs on every PR. A spec no workflow runs proves nothing (the audit found `e2e/dev-panel.spec.ts` in that state).
- [ ] **Step 2: Run it against the local dev server and see it pass.** Mutate the bridge's origin check and see the last case fail.
- [ ] **Step 3: Run the signed-in admin walk locally, as menu-e2e does.** Expected: both tests pass with zero findings. Avatar Soul's controls each changed `#avatarLabStatus`.
- [ ] **Step 4: Commit** `test(e2e): avatar lab answers commands and refuses what it should`.

---

## PR 4: field data, after the browser sender PR merges

### Task 7: Every moment counted, shown on Avatar Soul

**Files:**

- Modify:
  - `src/api/soul-stats/soul-stats-input.ts` (`SOUL_COUNT_KEYS`, schema);
  - `src/api/soul-stats/soul-stats-store.ts` (totals);
  - the admin soul stats route;
  - `apps/web/src/services/soul-stats.service.ts` (`SoulCountKey`, record calls);
  - the call sites in `avatar-soul.ui.ts` and `name-lift.ts` (one line each; avatar-soul may not grow, so the record calls replace nothing and must fit in a moved helper if needed);
  - `apps/web/src/admin/sections/soul-stats-panel.ts`;
  - `HumanListeningSection.ts` (remove the panel, leaving a link to Avatar Soul);
  - `AvatarSoulSection.ts` (add the panel).
- Test: the existing soul stats tests, widened.

**Interfaces:**

- `SOUL_COUNT_KEYS` becomes, in this order:

  ```
  'micro_expression', 'protective_mode', 'comfort_pulse', 'memory_spark',
  'warmth_bloom', 'celebrate_growth', 'cameo_arrival', 'crisis_hold',
  'name_lift_brighten', 'name_lift_attentive', 'name_lift_comfort'
  ```
  - Each count is an integer from 0 to 500. The body stays under the 1 KB cap; the test proves it with all 11 keys at 500.
  - The admin GET answers `{ measured: true, windowHours: 24, counts: Record<SoulCountKey, number>, lastUpdated }`.

- `crisis_hold` is counted in `holdCrisisFace` only when the hold starts (not when it was already held).
- Old hourly docs without the new keys read as 0 for those keys. That is honest: they weren't counted then. The panel says "counted since <first day the key appears>"; drop this line if the reviewer finds it adds nothing.

- [ ] **Step 1: Write the failing tests:**
  - the schema accepts all 11 keys and rejects a 12th;
  - the store increments only the non-zero keys;
  - the GET sums each key over 24 docs;
  - each call site records its key once per real play and not when the play was refused (the hold, reduced motion);
  - in lab mode, nothing is recorded (Task 2 guard);
  - the panel renders 11 labelled counts with "last 24 h", or "not measured: <reason>".
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass.** Mutants: count `crisis_hold` on every call; record before the hold gate.
- [ ] **Step 5: Emulator check.** POST all 11 keys, then GET returns them.
- [ ] **Step 6: Commit** `feat(admin): count every avatar moment and show them on avatar soul`.

---

## Done means (L6)

- On dev, signed in as an admin:
  - Avatar Soul shows the real avatar;
  - every control changes it or says why not;
  - the crisis hold refuses playful moments;
  - reduced motion reports the device's setting;
  - the field data shows counts from real calls, or "not measured: SOUL_STATS is off".
- The walk and `e2e/avatar-lab.spec.ts` pass in CI.
- Prod: the same after merge. `SOUL_STATS` on in prod is the owner's step.
