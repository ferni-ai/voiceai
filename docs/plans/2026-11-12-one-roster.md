# One roster: every agent a caller can talk to, from one place

Status: draft for the owner's review, 2026-11-12. Docs only; no code or flag
changes. Builds on [the marketplace plan](./2026-11-07-marketplace-return.md)
and does not replace it. Part of #2840 and #2839.

## 1. Intent

The owner asked for five things on 2026-11-12:

1. Legends who are real people, speaking in voices cloned with their consent.
2. A digital twin of the owner that he can call, in his own cloned voice.
3. A transfer from any agent to any other agent that works every time.
4. Agent colours that are on brand.
5. The marketplace back, so a person can add more agents to their team.

These look like five projects. They are one: each fails today for the same
reason. "Who can this caller talk to, how does that agent sound, and what
colour is it" has no single answer in the code. This plan gives it one, then
hangs the five asks on it.

## 2. Today (audited read-only at `70a72a611f`)

### 2.1 The same question, answered in many places

| List               | Where                                                                                                                                          | Says                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Canonical ids      | `src/personas/persona-ids.ts` (`CANONICAL_IDS`, `FINANCIAL_LEGENDS`, `ALIAS_TO_CANONICAL`, `RETIRED_PERSONA_NAMES`)                            | A closed union type. A new agent means editing the type.                   |
| Preload            | `src/personas/bundles/preloader.ts:16`                                                                                                         | Six core ids, hard-coded.                                                  |
| Voices             | `src/config/voice-ids.ts` (`VOICE_IDS`, the alias table, `RETIRED_CLONE_VOICE_IDS`)                                                            | A hand list per persona, plus a block list of clones.                      |
| Web call start     | `apps/web/src/app/conversation-starter.ts:49`                                                                                                  | Rejects any id that is not a core persona.                                 |
| iOS call start     | `apps/ios-native/Packages/FerniKit/Sources/FerniKit/Team/TeamStore.swift:32-35`                                                                | Team ids only.                                                             |
| Token route        | `src/servers/api/routes/token.ts`, `token-persona-owner.ts`                                                                                    | Maps any id that is not built in to Ferni.                                 |
| Marketplace browse | `src/api/marketplace/browse-routes.ts:185`                                                                                                     | Filters the catalogue by `isKnownId`, so it returns nothing.               |
| Menu               | `apps/web/src/config/menu-visibility.ts:23,70`                                                                                                 | Marketplace row and panel hidden by a constant.                            |
| Unlocks            | `src/services/social/team-unlocks.ts:475-496`, `src/tools/handoff/handoff-unlock-check.ts:36-75`                                               | Who a caller may reach. Separate from "installed".                         |
| Installs           | `bogle_users/{uid}/marketplace_installs`                                                                                                       | Written by the web app. Nothing on the server or the voice agent reads it. |
| Colours            | `design-system/tokens/colors.json`, `personas.json`, `persona-kits.json`, `brand-guardrails.json`, `animation.json`, plus hex fallbacks in CSS | Agree for the core six primaries; disagree elsewhere (section 2.4).        |

### 2.2 The agents

| Group                      | State                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core team (6)              | Bundles in `src/personas/bundles/`, callable.                                                                                                                                                                                                                                                                                                                                   |
| Legends (2)                | `john-bogle` and `joel-dickson`, shown under fictional names on stock library voices since 2026-10-17 (#939, #971). Reachable only by transfer, and only when the caller's whole core team is unlocked. No eval covers a transfer to or from either. A third legend was retired by #3639.                                                                                       |
| Catalogue (15)             | `apps/marketplace-agents/registry.json`: names, blurbs and colours only. Seven had bundles in this repo until `ec970cd999` (2025-12-11) moved them to the repository the registry names. The marketplace plan says that repository holds all 15, last changed 2026-07-12; this audit could not read it.                                                                         |
| Roadmap (13)               | `apps/marketplace-agents/AGENT-RECOMMENDATIONS.md`: five with written specs, eight one-line ideas. Never built.                                                                                                                                                                                                                                                                 |
| Custom agents and the twin | A custom agent of type `twin` works as a text chat. On a call it needs `CUSTOM_AGENT_LIVE` (off), runs outside multi-agent mode, and is forced onto a stock voice (`custom-agent-live-persona.ts:83-84`, pinned by a test). Nothing can transfer to one. `twin_profiles/{uid}` is a profile of the caller fed to Ferni as context; it does not make anything speak as the twin. |

### 2.3 Transfers

- Every enabled agent already gets a `handoffTo<First>` tool for every other
  enabled agent (`src/tools/handoff/handoff-factory.ts:160-173,228`). Tools
  are generated from discovered bundles, so a new bundle becomes a transfer
  target without per-pair code.
- Consent gate: a real yes can be held (#3755, fix in #3759) and a wrong yes
  can pass (#3760).
- `executeHandoff` marks the target as the current agent before the swap is
  confirmed (`src/tools/handoff/executor.ts:405`) and puts it back when the
  handler reports a failure or never answers
  (`src/tools/handoff/unconfirmed-handoff.ts`). One path was missed: with one
  session per call the tool is told the handoff worked once the next persona
  is built, so a swap dropped after that left the tools naming a teammate who
  never joined, and a second ask was refused as "Already with" them (#3803,
  fix in #3804). A second handoff asked for while a swap is pending can still
  leave the same wrong record (#3807).
- The flags that make a held or failed transfer truthful
  (`HANDOFF_HELD_TRUTHFUL`, `HANDOFF_FAILED_SAY_SO`, `HANDOFF_EARLY_GOODBYE`)
  default off.
- Unconfirmed: whether a legend's turn still carries transfer tools after the
  tool-count cap; whether any transfer rate limit is enforced; dev and prod
  flag values.

### 2.4 Colours

The brand rule (`design-system/tokens/brand-guardrails.json`) allows six
persona colours, one per core teammate, on a warm, earthy palette.

- Nayan has three values: `#b8956a` in the tokens, `#8a7a6a` in the glow orb
  and two panels, `#9a7b5a` (the legacy cedar) in the macOS menubar.
- The two legends are near-identical saturated reds, `#8b0000` and
  `#9A0718`, and neither is in the allowed palette.
- Two catalogue agents are purple, which the `no-purple` rule and its lint
  both miss.
- White text on Maya, Jordan and Nayan measures 3.74, 3.04 and 2.78 to 1.
  `--color-<id>-text` resolves to white and is used as text in 30 places.
- Legends and custom ids have no `[data-persona]` rule, so tint and text
  keep the last core persona's values (by reading, not observed).
- Custom agents get a hash-generated colour. The twin has none.
- No check compares a persona's colour across files.

## 3. Design

### 3.1 One roster, inside the identity context

The roster lives in `src/personas/` (L3 identity), not in a new top-level
folder, and absorbs the lists in 2.1. Before adding it, the roster PR reads
`persona-registry.ts`, `registry/` (`AgentRegistry` in `unified-registry.ts`,
which the handoff tool factory already reads), `agent-directory.ts`,
`voice-registry.ts` and `team/` and says which of them it replaces; no second copy of any.

```
src/personas/roster/
  domain/      AgentListing, who may be offered, who may be transferred to
  ports/       BundleStore, MembershipStore, VoiceRecords
  adapters/    bundles on disk; Firestore for membership and custom agents
  use-cases/   rosterFor(caller), listingFor(id), addToTeam, removeFromTeam
  index.ts     the only import for callers
```

`AgentListing` is the one record per agent:

| Field                          | Meaning                                            |
| ------------------------------ | -------------------------------------------------- |
| `id`, `displayName`, `aliases` | Identity. Ids stop being a closed union type.      |
| `kind`                         | `core`, `legend`, `catalogue`, `custom` or `twin`. |
| `status`                       | `live`, `owner-only`, `hidden` or `retired`.       |
| `voice`                        | A reference to a voice record (3.3).               |
| `colour`                       | A token key, never a hex value (3.5).              |
| `riskTier`                     | Which extra crisis eval rows the agent must pass.  |
| `reachableBy`                  | The unlock rule, as data.                          |

Every consumer in 2.1 asks the roster: the token route, the preloader, the
handoff tool factory, the lock note, marketplace browse, the web and iOS
rosters, and the token build for colours. "Unlocked" and "added" become one
membership record per caller.

### 3.2 One package format

Core, legend and catalogue agents are first-party bundles in
`src/personas/bundles/`, one schema, no install-from-URL (as the marketplace
plan's P1 already says). A custom agent or twin is the same shape built from
stored fields, with the owner's text carried as data and never as
instructions, so it goes through the same prompt assembler, the same crisis
lines and the same transfer tools.

### 3.3 Voices carry a record

Replace the block list with records. A voice is one of:

- `stock`: a library voice;
- `designed`: made for one agent;
- `consented-clone`: cloned from a real person, with who consented, when,
  what the consent covers, and a pointer to the document (never the document).

A consented clone can be attached only to the listing its record names. The
voice a core teammate already speaks in with consent moves onto a record
first, as the worked example. The custom-agent voice policy reads the same
records, so the rule "a custom agent may not sound like Ferni" stays.

### 3.4 One admission gate, in CI

A listing reaches `live` only when all of these pass, and the gate is code:

1. Bundle schema.
2. Crisis: the gate is byte-equal to Ferni's for this id, and the canonical
   lines are in the assembled prompt in every prompt mode (#3595, owned by
   the crisis lane; a precondition for any call).
3. The persona bar, and the blind tell-apart test against every other live
   agent (#3764).
4. Voice record present and valid for this listing.
5. Colour check (3.5).
6. Transfer smoke: to and from Ferni, and one failure case.

Agents below the bar stay `hidden`. The panel shows only callable agents.

### 3.5 Colours come from the roster

Each listing names a token key. One generated map feeds web, iOS and the
menubar; hex fallbacks in CSS go. A quality check fails a listing with no
token, a colour outside the brand palette, text contrast under the stated
threshold, or a colour too close to another live agent's. Which new hues
join the palette for legends, catalogue agents and the twin is a brand
decision for the owner (section 6).

### 3.6 Transfers

1. Consent: land #3759, then tighten the named-offer path (#3760).
2. State: after any failed or dropped swap the tools name the persona the
   orchestrator has on the call (#3804, then #3807), and the caller hears a
   truthful line. `HANDOFF_FAILED_SAY_SO` already does the second part and
   is off, so that part is a dev run and a decision, not new code.
3. Proof: a nightly lane that tries every from-to pair in the roster,
   including legends and the failure cases, and fails on a broken pair.
4. Custom agents and the twin join multi-agent mode once they are bundles
   (3.2), which gives them transfer tools in both directions.

## 4. Order of work

Each step is one small PR behind an off-by-default flag unless it changes no
behaviour. Nothing here flips a prod flag.

| Step | What                                                                                                                                      | Depends on                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| R0   | #3759 (yes to a pronoun offer), then #3760                                                                                                | In flight                        |
| R1   | Roster module with the core six and two legends; move the preloader and the browse filter onto it. No behaviour change, pinned by tests.  | -                                |
| R2   | Move the remaining lists in 2.1 onto the roster, one consumer per PR.                                                                     | R1                               |
| R3   | Voice records; the existing consented voice first.                                                                                        | R1                               |
| R4   | Transfer state fixes (#3804, #3807), then a dev run of the truthful failure line (`HANDOFF_FAILED_SAY_SO`).                               | R0                               |
| R5   | Colour map from the roster, the cross-file check, and the fixes in 2.4 that need no brand decision (Nayan's three values, text contrast). | R1                               |
| R6   | Marketplace P1: bring bundles in, three or four per PR.                                                                                   | R2, #3595, access to the bundles |
| R7   | Marketplace P2: callable from web and iOS; every-pair transfer lane.                                                                      | R4, R6                           |
| R8   | Owner's twin as an owner-only listing in his own voice.                                                                                   | R2, R3, decision 6.2             |
| R9   | Real-person legends.                                                                                                                      | R3, decisions 6.1 and 6.3        |
| R10  | Gate (3.4), audition, then un-hide for the owner first (marketplace P3, P4).                                                              | R7                               |

## 5. What this changes in the marketplace plan

- P0 finding 1 and gap G5 are stale: `/token` and `/demo-token` now map any
  id that is not built in to Ferni (the demo-token flag was added in #3628
  and removed in #3639).
- P1's "the preloader and id mapping read the bundle list" becomes R1 and R2.
- P5 (custom agents last) stays, except the owner's own twin (R8).
- Rule 3 ("never a clone of a real person") stays as written until the owner
  decides 6.1.

## 6. Decisions for the owner (each has a default)

1. **Consented clones.** Default: the rule stays; no real-person clone
   beyond the one already in use. To change it, the owner records the
   decision in `docs/decisions/register.md` and the voice record carries the
   consent pointer.
2. **The twin's voice.** Default: owner-only, never listed, never offered to
   another caller, and never able to place a call or send a message as him.
3. **Real-person legends.** Default: legends stay fictional. Changing it
   needs 6.1, a named person per listing, written consent covering the name,
   the voice and new words, and a decision on what the legend says about
   being an AI version. The standing rule is no AI-disclosure prompt changes;
   a real person's listing is where that rule needs the owner's eye.
4. **New hues.** Default: legends and catalogue agents use neutral brand
   surfaces with the shared accent until the owner picks hues.
5. **Unlock rule for added agents.** Default: unchanged; a caller reaches an
   added agent under the same rule as a legend today.

## 7. Out of scope

- Crisis wording and the canonical lines (the crisis lane, #3595).
- Third-party publishers, billing and reviews (marketplace plan, question 4).
- Voice cloning for users (#2839, parked with no consent design).

## 8. Evidence and limits

Four read-only audits on 2026-11-12, each with file and line citations, plus
spot checks of their headline claims in the code. No builds or tests were
run, and nothing was observed in a browser or on a call. Contrast figures
were recomputed from the token hex values. The separate bundles repository,
iOS, and dev and prod flag values were not visible to the audit.
