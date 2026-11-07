# Bring back the agent marketplace

Status: plan, approved to write 2026-11-07. Docs only; no code or flag changes.

## 1. Intent

Ferni used to offer more friends than the core team: the "Meet More Friends"
marketplace (15 specialist agents) and "My Creations" (agents people build
themselves). Both were hidden on 2026-10-18 because nobody could actually talk
to them. This plan brings them back, in this order:

1. A marketplace agent can be called, end to end, on every surface.
2. Each agent is as safe and as human as the core team before anyone sees it.
3. People find them the way they find the core team: Ferni hands them off.
4. Only then, custom agents people build themselves.

The bar is the same one the core team is held to. An extra agent that is less
safe, less human, or more generic than the core team makes Ferni worse, not
bigger.

## 2. Today

| Piece | Where | State |
|---|---|---|
| Menu row "Meet More Friends" | `apps/web/src/config/menu-visibility.ts:23` (`discover-agents`) | Hidden (#1683). Reason in code: "no marketplace agent has a real persona bundle". |
| Marketplace panel | `apps/web/src/config/menu-visibility.ts:70` (`marketplace`) | Hidden; deep links do nothing. |
| My Creations / Digital Twin wizard | `apps/web/src/config/custom-agents-ui-flag.ts` (`VITE_CUSTOM_AGENTS_UI`, off) | Hidden (#1939). The 10-18 audit: no way to start a call with a custom agent, library voices were invented ids the server refuses, preview clips missing, cloning gated off, no calls in 30 days. |
| Agent catalogue | `apps/marketplace-agents/registry.json` | 15 entries: metadata only (name, blurb, category, colours). |
| Agent bundles | Private agent-bundles repository, last changed 2026-07-12 | 15 bundles, manifest v2, `identity/` + `content/`. No `hooks.json` or `commands/` (the core bundles have both). Voices are Cartesia ids read from per-agent env vars with a fallback id. |
| Core bundles | `src/personas/bundles/<id>/` | The core team, loaded and preloaded. |
| Preloader | `src/personas/bundles/preloader.ts:16` | Hard-coded list of the 6 core ids. A marketplace id is not preloaded. |
| Server marketplace API | `src/api/marketplace/` (browse, install, billing, publisher), `src/api/routes/marketplace-*`, `src/api/review-queue.ts` | Present. Live state UNCONFIRMED. |
| Custom agent API | `src/api/custom-agent/` (agents, voice, prompt, memory, journal, update policy) | Present. Call path UNCONFIRMED. |
| Session start | `src/agents/voice-agent/session-init-handler.ts` | Takes a `publisherId` for marketplace and custom personas (developer tools, webhooks). |

The catalogue:

| Group | Agents |
|---|---|
| Themed companions | Moxie (accountability), River (grief), Zen (presence), Luna (sleep), Atlas (career), Spark (creativity), Sage (relationships), Pixel (tech in plain words) |
| Named friends | Amara (chronic illness), Carmen (parenting), Kenji (3am, insomnia), Sasha (creative work), Eli (ADHD), Marcus (sobriety), Ray (layoffs, career pivots) |

Two pairs overlap: Luna and Kenji (sleep), Atlas and Ray (career).

## 3. Rules every returning agent meets

1. **Crisis is not the agent's job, and never lower.** The crisis kernel runs
   on every turn of every agent, outside its prompt, and the canonical safety
   lines the loader appends (#3595) reach every agent's assembled prompt. Each
   agent gets a test that proves the canonical crisis lines and resources come
   out the same as with Ferni, and an agent's bundle cannot remove or soften
   them. Any line that reads lower than main is a FAIL.
2. **Human, and different.** Each agent passes the same persona quality bar
   as the core team (`scripts/persona-eval/bar.ts`, blind AI-judge panel,
   cross-family judge) and is told apart from the others by voice and way of
   talking, not just by name.
3. **Voices are auditioned.** Two or three designed or library voices per
   agent, rendered on the same lines, ranked by the blind panel; the owner
   picks from the top two. Never a clone of a real person. Nothing goes live
   before a dev A/B.
4. **One team.** Ferni hands off to the specialist; the agent can hand back.
   No agent gets its own proactive asker: all of them share the one per-call
   proactive budget from the right-moment plan. No agent starts contact with
   anyone but the caller; an idea that involves a third party can only become
   a one-tap suggestion to the owner, the same rule as the right-moment plan.
5. **Memory and privacy.** What a caller tells an agent follows the same
   memory, forget and export rules as the core team. Logs carry hashes, not
   text.
6. **Holds win.** A DV hold, `MINOR_CARE`, an opt-out or STOP, and a forget
   request apply to every agent the same way, through the same holds port as
   the right-moment plan, so a hold added there covers every agent.
7. **Off by default.** Every step lands behind a flag that is off; rollout is
   dev, then the owner, then friends and family, then wider.

## 4. Phases

### P0: Prove the path (no user-facing change, ~1 PR)

Answer, with file:line and a dev call, each of:

- Can a session start with a persona id outside the core 6? What breaks
  (preloader, id mapping, handoff targets, greeting, memory scope)?
- Does the crisis kernel run unchanged for a non-core persona? Prove it with
  a test, not a read.
- Do the canonical safety lines (#3595) reach a non-core agent's assembled
  prompt in every `PROMPT_MODE` (`full` and `character`)? One test per mode,
  asserting the lines are present in the assembled prompt.
- What do the marketplace and custom-agent APIs do today: live, dead or
  half-wired? "Dead" only after every caller is checked; otherwise
  UNCONFIRMED.
- Web and iOS: what would "start a call with agent X" call?

Output: a gap table appended to this plan. Size: tests plus notes, under
200 lines.

### P1: Bring the bundles in (flag `MARKETPLACE_AGENTS`, off)

- Move the bundles into the repo as first-party bundles under
  `src/personas/bundles/`, brought up to the core format (`hooks.json`,
  `commands/`, current humanization fields). No install-from-URL step.
- Replace per-agent voice env vars with the core voice setup; voices come
  from P3's audition, a placeholder until then.
- The preloader and id mapping read the bundle list instead of a hard-coded
  array, and only load marketplace agents while the flag is on.
- One validation test per bundle: schema, crisis lines present and
  unchanged, no invented personal loss, no scripted lines.
- Each import PR gets a privacy check, because the content moves from a
  private repository into this public one: fictional people and data only,
  no real people, no owner data, no private paths.
- Size: one PR per 3–4 agents, each under ~400 reviewable lines.

### P2: Make them callable (same flag)

- Start a call with a chosen agent from web and iOS.
- Ferni and Alex can hand off to a marketplace agent when the topic fits, and
  the agent can hand back.
- Session start for a marketplace agent adds no measurable latency at p50 vs
  a core persona.
- Proven on dev with scripted calls for each agent.

### P3: Earn the slot (measurement before launch)

- Run each agent through the persona bar and the voice audition.
- An agent launches only if it meets the core team's floor on every bar item
  and its crisis tests pass. Agents below the floor wait; we don't lower the
  floor.
- Crisis-heavy domains get extra eval rows before launch: grief (River),
  sobriety (Marcus), chronic illness (Amara), 3am insomnia (Kenji),
  relationships including abuse (Sage), parenting including child safety
  (Carmen).

### P4: Un-hide "Meet More Friends"

- Remove `discover-agents` and `marketplace` from the hide lists only for
  agents that passed P3, owner cohort first.
- The panel shows only callable agents. No "coming soon" tiles.

### P5: My Creations (custom agents), later

Starts only after P4 is live for friends and family.

- Real library voices and preview clips; no invented ids.
- Reuses P2's call path.
- The crisis kernel cannot be changed by a creator's prompt. Creator prompts
  go through the update policy and review queue before anyone else can call
  them.
- Then `VITE_CUSTOM_AGENTS_UI=true`, owner first.

## 5. Launch waves

- **Wave 1 (lower risk):** Pixel, Spark, Atlas, Moxie, Luna.
- **Wave 2 (crisis-adjacent, after the extra eval rows):** River, Zen, Sage,
  Carmen, Eli, Sasha, Ray (job loss).
- **Wave 3 (highest risk):** Marcus, Amara, Kenji.
- **Overlaps:** Kenji may fold into Luna, and Ray into Atlas, unless P3 shows
  the two are told apart and both earn a place. A merged slot takes the
  higher-risk wave and its eval rows: Luna + Kenji goes in wave 3 with the
  3am-insomnia crisis rows, and Atlas + Ray in wave 2 with the job-loss rows.
  Luna and Atlas can launch alone in wave 1; the merge happens only when the
  higher-risk wave is reached.

## 6. Metrics

- Calls started with a marketplace agent, and repeat calls within 14 days.
- Handoff accepted vs declined when Ferni suggests an agent.
- Persona bar score per agent vs the core-team floor; persona-ID accuracy
  (can the judges tell agents apart).
- Crisis: 0 lines lower than main for every agent (hard gate).
- Session-start latency vs a core persona.

## 7. Open questions (each has a default)

1. **Price.** The catalogue marks every agent "premium" and billing routes
   exist. Default: free for the owner and friends-and-family cohorts; decide
   pricing before wider rollout.
2. **Wave 1 list.** Default: section 5.
3. **Overlaps.** Default: merge unless P3 shows both earn a place; a merged
   slot takes the higher-risk wave (section 5).
4. **Outside publishers.** Publisher routes exist. Default: no third-party
   agents until the review queue is proven on first-party ones.
5. **Custom agents.** Default: after P4, as P5.

## 8. Out of scope

- Changing the core team.
- New proactive askers (the right-moment budget owns that).
- Any prod flag flip; those are separate, owner-approved steps.
