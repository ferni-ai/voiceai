# call-sheet

The nightly call sheet (`person_model/current`, PERSON_MODEL) in a call: `PERSON_MODEL_READ` (off).
Plan `docs/plans/2026-10-27-memory-call-sheet.md` §4 (M6).

- `index.ts`: `startCallSheet` at persona setup start, `take()` (synchronous) just before the model
  is made in `agent-setup.ts`; never awaited, so a slow read means no sheet, never a later first
  word. Re-rendered with the forgets read now (never the stored `rendered`), capped at 1,500
  chars, as its own `## Your Notes On This Caller` block after "Who You're Talking To".
- Skipped (a counts-only log reason): not a verified member, owner not proven, a call Ferni
  placed, a MINOR_CARE hold (account strict; this call re-checked at take), crisis risk on the
  call (re-checked at take) or a crisis signal in CRISIS_QUIET_DAYS, any forget since the build
  (generation), unreadable forgets, a sheet 3 days old or more.
- `wiring.ts` (crisis lane, code-owned): the production readers. `ports.ts`: their shape.
