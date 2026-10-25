# Cohort rollout: a feature for one audience at a time

Ferni's behaviour switches are env flags (`CALL_WRAP_UP=on`, ...) set on the whole agent. A
**cohort** turns a set of them on for its members only, so a feature reaches Seth first, then
friends and family, then beta, before it becomes the prod default. The code is
`src/services/platform/cohort-flags.ts`, and the tool is `scripts/cohorts.ts`.

## The model

At call start, once the caller is known (`applyCallerFlags`,
`agents/voice-agent/user-identification-handler.ts`), the voice agent reads the caller's
flags from Firestore. It writes them into `process.env`, so every existing check sees them.

| Firestore document             | Shape                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `feature_cohorts/{cohort-id}`  | `{ name, description, enabled, members: [uid], flags: { FLAG: 'on'\|'off' }, updatedAt }` |
| `feature_flag_overrides/{uid}` | `{ flags: { FLAG: 'on'\|'off' }, updatedAt }`                                             |

Members are Firebase uids, never emails. A missing `enabled` counts as enabled.

**Resolution, per caller.** The caller's enabled cohorts apply in id order, so on a conflict
the later id wins. Their own overrides come last and beat every cohort. A disabled cohort
counts for nothing. Anyone in no cohort gets the agent's own values.

Only switches in `COHORT_FLAGS` can be set: behaviour, never infrastructure or secrets.
Anything else is dropped and logged. Values are `on` or `off`, except `TURN_LENGTH` and
`TURN_TEXTURE`, which take `learned` or `off`, and `PREEMPT_STABLE_CONTEXT`, which also
takes `defer`. The latency switches (`ACTION_CLAIM_STREAM`, `PREEMPT_STABLE_CONTEXT`,
`CACHE_WARM_PRIMARY`, `HANDOFF_CACHE_WARM`) are here so a dev A/B can give each eval
caller its arm and run both arms in the same hour.

## Audiences (cohort ids)

Cohort ids are kebab-case audience tiers, from the smallest to everyone:

| Id                      | Who                                                            |
| ----------------------- | -------------------------------------------------------------- |
| `seth`                  | Seth alone: the first real calls on anything new               |
| `team`                  | People building Ferni                                          |
| `friends-and-family`    | Seth, mom, Mindy and other people who know Ferni best          |
| `beta-waitlist-2026-10` | Waitlist beta users let in in October 2026 (one id per intake) |
| `everyone-else`         | Implicit: no document, just the agent's defaults               |

`everyone-else` is never created. To give everyone a feature, change the agent's own flag
(the last rung below).

## The rollout ladder

Before the first rung, the agent needs `COHORT_FLAGS=on`. It is off in prod until Seth flips
it, and while it is off no cohort applies. One call per process must also hold (see below).

1. **`seth`.** `create seth`, `add-member`, `set-flag seth FLAG on`. Make a few real calls.
   - Check the log `Cohort flags applied`. It names `cohorts` (ids) and `flags`, never members.
   - Check that the feature's own log lines appear, e.g. `CALL_WRAP_UP started` or
     `PHONE_GOODBYE_ATTACHED`.
   - Listen to the calls, and read the call reviewer's notes on them.
2. **`friends-and-family`.** Set the same flag there and let it run a few days.
   - Watch the call reviewer and error logs for those members' calls.
   - Ask them how it felt. Look for anything that sounds wrong only to someone else.
3. **`beta-waitlist-2026-10`.** Wider, less forgiving callers.
   - Compare their calls with and without the flag: hang-ups, call length, complaints.
   - Look for regressions in the eval or the judge.
4. **Prod default.** Set the flag on the agent (prod secrets). Then `unset-flag` it in each
   cohort, so the cohorts stop carrying a flag everyone already has.

At any rung, `who <uid|email>` shows the flags a person's next call gets.

## Turning something off fast

- **A whole audience:** `disable <cohort> --project <id> --apply`. Every member's next call
  gets the agent's own values. A call already in progress keeps its flags until it ends.
- **One flag:** `set-flag <cohort> FLAG off`, or `unset-flag` to fall back to the agent's own value.
- **One person:** `override <uid|email> FLAG off`. Their override beats every cohort.

Nothing is cached between calls. A change applies from each member's next call.

## Constraints

**One call per process.** Flags go into `process.env`, which a worker process shares. They
apply only while each process runs one call at a time: `AGENT_MAX_JOBS_PER_WORKER` unset or
1 (prod leaves it unset, so 1), or `AGENT_JOB_EXECUTOR=process`. Otherwise
`applyCallerFlags` applies nothing and logs `Cohort flags skipped`. Raising the job cap turns
every cohort off.

**After-call work must not read cohort-switched env.** After-call tasks can still be running
when the next call starts, and by then `process.env` holds the next caller's flags. Such
work reads the flag with `envForCaller(userId)` (#1690), which goes back to the ended call's caller.
It does not read `process.env`. The same applies to anything outside a call: the API server's
scheduled jobs resolve the person's flags with `resolveCallerFlags` and need `COHORT_FLAGS=on`
on that server.
Code below `services/platform` in the layers (memory stores, capabilities) asks
`personFlagOn(userId, FLAG)` (`src/config/person-flag.ts`) instead: the agent answers it with
`callerFlag`, the UI server with `flagForUser`. The person's own value beats the process's.

**Adding a flag to `COHORT_FLAGS`.** Find every read (`rg -w FLAG src`). Add the flag only if
each read happens after `applyCallerFlags`: at agent setup, on a turn, at a handoff, or after
the call through `envForCaller`. Any of these would silently ignore the cohort:

- a module-level constant;
- a read during deps load, persona build or room connect;
- a read in the worker parent.

Add a test that a cohort can set the flag.

## The tool

Every command is a **dry run** unless it has `--apply` **and** `--project <id>`. A dry run
prints the writes it would make. Reads (`list`, `show`, `who`, `--email`) need `--project`
and never write.

```sh
P=<firestore-project>   # the project the prod agent's Firestore and Firebase Auth live in
pnpm tsx scripts/cohorts.ts list --project $P
pnpm tsx scripts/cohorts.ts show seth --project $P
pnpm tsx scripts/cohorts.ts create seth --description "Seth only: first real calls" --project $P --apply
pnpm tsx scripts/cohorts.ts add-member seth --email <seth-account-email> --project $P --apply
pnpm tsx scripts/cohorts.ts set-flag seth CALL_WRAP_UP on --project $P --apply
pnpm tsx scripts/cohorts.ts who <seth-account-email> --project $P
pnpm tsx scripts/cohorts.ts disable seth --project $P --apply
```

The tool prints uids and the one email it was given, nothing from the environment. It uses
your gcloud application-default credentials.
