# Face engine: one owner for Ferni's face, drawn from the expression tokens

Status: plan. Seth approved the arrival prototype's expressions on 2026-10-12 ("Keep doing all the emoji like expressions! This is Gold!"). Owner: arrival/choreography lane; the c6 perf lane keeps performance-only fixes.

## Why

A map of origin/main 7d3e80998 (evidence: `voiceai-evidence/face-engine-2026-10-12/`, from the call-join and face-pipeline audits) shows that **most of Ferni's designed faces never reach the screen**:

- **The token expressions are invisible.**
  - The 100 expressions in `design-system/tokens/expressions.json` are applied by `luxo-expressions.ui.ts` through `[data-expression]` CSS rules on `.ferni-avatar` / `.eye-white`.
  - No element has those classes, and `expressions.generated.css` is never loaded.
  - Luxo's eye-scale writes find no elements, and its micro-expressions apply nothing.
- **What does show:**
  - `ferni-expressions.ui.ts`'s own hand-written table of 40 eyelid paths, GSAP-tweening the SVG `d` (about 27 layouts/s during a change).
  - Dimples.
  - About 10 legacy eye shapes under `.avatar-container[data-emotion]`, which the CSS idle-blink animation probably overrides while connected (unconfirmed at runtime).
- **Each face part has several writers:**
  - body pose: up to 9 (presence WAAPI, speaking-system inline transform, luxo inline transform, ferni and avatar-soul GSAP, lamp, persona-magic, moments);
  - blink: 3;
  - gaze: 2, both invisible or wrong (presence writes CSS variables nothing reads; avatar-soul moves the whole avatar);
  - eye shape: 2 systems, last writer wins.
- **One signal often drives both expression systems** (`humanization-bridge.service.ts` calls both on adjacent lines).
- **Name spaces:** ferni has 40 names, the tokens 100, and 21 are shared. The only alias table points at two names that don't exist.

## The engine

`apps/web/src/ui/face/`, a new module group. Every face part has exactly one writer.

| Entry point                               | Owns                                                                                                       | Replaces                                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `setFace(id, { hold, priority, source })` | eye-white shape, upper and lower lids, smile crease, halo strength                                         | ferni `setExpression` and its wrappers, luxo `setExpression`, `presence.setVoiceEmotion`'s data-emotion write |
| `setTurn(speaker)`                        | speaking, listening and thinking eye states, the lid mouth                                                 | `expressiveEyes.setVoiceState`, the turn-driver targets                                                       |
| `setGaze(point)`                          | the eye offset                                                                                             | presence's unread variables, avatar-soul's whole-avatar saccades                                              |
| `blink()`                                 | the one blink scheduler                                                                                    | the CSS loop, presence's zen blink, `.blinking`                                                               |
| `poseBody(layer, transform)`              | the `.avatar-container` / `#coachAvatar` transforms, as additive layers (`compositor.ts`'s one-owner rule) | the 9 body writers                                                                                            |

- **Names:** the token IDs are the one name space. A short, explicit alias table maps ferni's 19 extra names (e.g. `contemplative` → `thinking`, `farewell` → `warm`, `reconnecting` → `happy`), tested so every alias resolves to a real token.
- **Drawing from the tokens:**
  - Eye shape is `scaleX/scaleY` on the existing `.eye-main` ellipses.
  - The upper and lower lids are pre-drawn shapes moved with `translateY/scaleY`. A happy lower lid is the arch shape, crossfaded in by opacity. So no `d` is rewritten and nothing forces a layout.
  - Values come from `config/expressions.generated.ts`, the same data the arrival prototype drew from. The lid curve maps to a lid offset exactly as the prototype did.
- **Priority:** choreography (arrival, handoff) > a direct agent expression > reactions and moments > ambient. A lower priority can't replace a face held by a higher one until its hold ends. A repeat of the current face is dropped, which ends the 4× re-animation per handoff. `expression-arbiter.ts` already has this model, so build on it.
- **Reduced motion:** faces change by crossfade and snap, with no squash, hop or lean. The face itself is information, so it still changes.

## PRs (each ≤400 reviewable lines, behind `ferni:face-engine`, off by default)

| #   | PR                                                                                                                                                                                                                  | Needs                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| F1  | Pure face model: tokens → eye and lid transforms, the alias table, priority rules; plus this plan                                                                                                                   | none                 |
| F2  | Renderer: pre-drawn lid shapes in `#avatarEyes`, transform/opacity only; `setFace` / `blink` / `setGaze`. When the flag is on, ferni and luxo `setExpression` delegate to it (net-zero lines in those big files)    | F1                   |
| F3  | `poseBody` layers on the compositor; speaking-system and luxo body writes go through it                                                                                                                             | F2, c6's #1193/#1216 |
| F4  | The arrival player on the engine (the arrival_* sequences, #1253)                                                                                                                                                   | F2, #1253            |
| F5  | Measure (c6's probe-layouts / probe-expr, before and after), then on in dev for Seth, then delete the old paths: ferni's lid table and GSAP `d` tweens, luxo's dead CSS hooks, the duplicate blink and gaze writers | F2–F4                |

## How we'll know

- **Lid layouts:** about 0 per second during a face change, against about 27/s today. Measured with c6's probes.
- **Faces render:** every token expression renders. A visual check in the overlay gallery shows all 100.
- **One change per handoff:** the face changes once (probe count), against 4× today.
- **Seth hears and sees it on dev:** the arrival, plus a handoff.
