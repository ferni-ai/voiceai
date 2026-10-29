# Ferni memory v2: retro, clean architecture, and where we lead

Status: approved direction (Seth, 2026-10-29: "retro and rationalize what we have. Clean Code and Clean Architecture e2e"). It extends [`2026-10-27-memory-call-sheet.md`](2026-10-27-memory-call-sheet.md) (lanes M1–M13). Code at origin/main `0129d29692`.

Evidence:
- the three read-only audits, `voiceai-evidence/retro-2026-10-29/{stores,read-path,architecture}.md`. Claims marked UNCONFIRMED there are not treated as fact here.
- the 2026 research pass summarised in §4.

## 1. Retro: what we found

### What shipped since the plan
| Done | PR |
|---|---|
| Activity ledger types and parser | #2958 |
| Ledger store, rules, erase and export | #2959 (in queue) |
| Call-sheet renderer, with privacy guards hardened over 3 rounds | #2975 |
| Bi-temporal facts store and writer: ADD, UPDATE (supersede), NOOP | #2978 |
| Ferni stops denying calls it made | #2965 |
| No writes under on-behalf ids | #2956 |
| Held-out recall eval: main recalled 0/119, invented 3 calls | #2969 |

### What the audits found
**Write path:**
- `rememberAboutUser` and `rememberImportantFact` write `memories`, which recall never reads. The live memory tool writes `extracted_facts`, which recall never reads either. So "remember this" is never recalled.
- `updateMemory` writes nothing. It edits an in-call list and returns `''`.
- People live in **11 stores**, not 8. The plan missed `social_graph`. The old unification attempt (`entity-store/dual-write.ts`, `memory/capture/index.ts`) has 0 callers.
- `routeToStorage` in `data-capture` already writes `entity_store`, `user_contacts` and `contact_relationships` every turn. It is the natural single people writer.
- The real facts source is `dynamic_facts`, with 5 content writers. The new `facts` store has 0 callers so far.
- `forgetGeneration` is an in-process Map, lost on restart. The call sheet can't use it until it is persisted.
- Dead stores (written, never read): `follow_up_actions`, `crisis_history`, `persona_interactions`, `bth_signals`, `trust_moments`.

**Read path:**
- About 160 of the 278 context-builder files are unreachable. The registry runner (`buildConversationContext`) has no live caller.
- The live pushes are about 20 hard-coded calls in `context-injections.ts`, plus `memory-retrieval-builder`.
- `recallFromMemory` and `recallPreviousConversation` search the vector store, while the recall note reads `dynamic_facts`, `summaries` and `turns`, so the tool and the note can disagree.
- `surfaceRelevantMemory` returns the model's own `memoryToSurface` string when search misses. It can feed an invented memory back to itself.
- `memory_state/forgotten` is read 3 times per call, and `summaries` twice. The `thread-context` fetch has no reader. The "Who You're Talking To" lines for goals, concerns and life events have no writer.

**Architecture:**
- 33 of 227 memory files talk to Firestore directly. 26 import `config` and 7 import `services`. There are memory→superhuman upward imports and 2 cycles.
- The gate misses `@google-cloud/firestore`, and it leaves `config`, `services/identity` and `services/activity` unassigned.
- Duplication:
  - name and relation normalisation in at least 6 places, one of them an ASCII-only regex that turns non-Latin names into empty strings (`entity-resolver.ts:179`);
  - contact-data detection in 5 places with 3 different digit rules;
  - forgotten-topic matching in 4+ places;
  - four uid guards, with ad-hoc `startsWith` checks that bypass them;
  - 108 raw `process.env.X === 'on'` comparisons.
- The repo already has the right pattern: `services/follow-through` (pure rules plus `ports.ts`) and `services/stores/follow-through-store.ts` (an L1 adapter), with per-call ports installed in `live-call-behaviors.ts`.

### Process lessons from this stretch
- **Review rounds:** 2 rounds catch most issues. Every privacy guard needed adversarial inputs the builder never wrote (full-width digits, en-dashes, "at"/"dot"). So: one shared guard, tested once, adversarially.
- **Stacked PRs:** a stacked "types only" PR fails the dead-code ratchet. Land types with their first reader.
- **Fixtures:** builders copied a real phone number into fixtures in a public repo. Fixtures must be fictional (now a rule).
- **CI:** CI caught three things the verifiers missed: zsh on Linux, executor name classification, and the call-log key guard. Verify with `quality:knip` and the guard suites, not only the PR's own tests.

## 2. Target architecture

```
src/memory/
  index.ts             public API: use cases, types, ports (no stores)
  domain/              pure; imports only utils/types
    fact.ts  person-key.ts  contact-data.ts  forgotten.ts  identity-guards.ts  provenance.ts
  ports/               interfaces: FactsStore, PeopleStore, EpisodeStore, ActivityLedger, ForgottenStore
  use-cases/           memory-writer, build-call-sheet, recall-people, recall-facts, recall-episodes, recall-activity
  adapters/firestore/  L1: every Firestore read and write for the above
  delivery/            L4: tool definitions, call-sheet injection, install-ports
```

**Rule:**
- domain → nothing but `utils` and `types`;
- ports → domain;
- use-cases → domain and ports (flags and clock injected);
- adapters → ports, domain and vendor packages;
- tools and agents → `memory/index.ts` only.

Ports are installed per call, like `installCallRecallPort`.

**Enforcement (lane C4):**
- add `@google-cloud/firestore` to `VENDOR_PACKAGES`;
- map `memory/domain`, `ports` and `use-cases` to L3:memory and `memory/adapters` to L1;
- assign `config`, `services/identity` and `services/activity`;
- add a `memory-purity` rule;
- extend `kernel-duplicates` to `normalizeName`, `isForgotten` and `hasContactData`.

The person model stays a pure read model and moves under `memory/use-cases/build-call-sheet` (it is in `understanding` today, across a context boundary from the facts it renders).

## 3. Clean-up lanes (C): run first; everything later builds on them

Each lane is one PR, ≤ ~400 lines, behaviour-preserving, with the old path re-exported until its last importer moves.

| Lane | What | Contract |
|---|---|---|
| **C1 One contact-data guard** | `memory/domain/contact-data.ts` = the strictest rule: #2975's `hasContactData` (NFKC, `\p{Nd}`, any non-letter separator, spoken emails), plus a date/price allowance so ordinary values aren't refused. `facts/fact.ts`, `person-model/util.ts` and `stripPII` use it. | Merged adversarial corpus (the #2975 and #2978 verifier files): 0 leaks. The false-positive list from #2975 r3 and #2978 ("born in 1987, moved 2015", prices, "X at Y. Next") is kept. |
| **C2 One person key** | `memory/domain/person-key.ts`: Unicode-aware name and relation normalisation, one relation map (merging `ROLES`, `RELATIONS`, `RELATIONSHIP_ALIASES`). All 6 call sites delegate. | Fixes the ASCII bug (a Cyrillic or Arabic name keeps its key). "my dad" = "Dad" = "dad's" everywhere. |
| **C3 One forget module** | `memory/domain/forgotten.ts` (matching) plus a `ForgottenStore` port (one read per call, shared). The generation counter is **persisted**. | `memory_state/forgotten` is read once per call. A forget is honoured after a process restart (test). |
| **C4 Gate the layout** | The enforcement list in §2, with the baseline refreshed. | New Firestore imports outside `memory/adapters` fail CI. |
| **C5 Delete the dead** | The ~160 unreachable builders and their registry; `dual-write.ts`; `memory/capture/index.ts`; the always-off memory blocks and flags; the 5 dead stores' writers (with erase-list updates); the `thread-context` fetch; the empty profile lines. | Grep proof per deletion (0 importers; knip). Runtime behaviour unchanged (suite green). |
| **C6 Honest memory tools** | `rememberAboutUser` and `rememberImportantFact` write through the memory writer into `facts`, gated on MEMORY_FACTS. `updateMemory` does a real UPDATE. `surfaceRelevantMemory` is retired (no echo). | "Remember X" then a new session's recall returns X (test). No tool returns a memory the store doesn't hold. |
| **C7 Identity guards** | `memory/domain/identity-guards.ts`: one `comparableId`; `isMember`, `isThirdParty` and `ownerWriteId` built on it; the ad-hoc `startsWith` checks replaced. | Every memory writer and reader uses it (grep). |

## 4. Where Ferni leads (2026 research → lanes)

| Lane | Differentiator | Why (evidence) | Contract |
|---|---|---|---|
| **R1 Provenance-typed memory** | Every fact, person and ledger entry carries `source` (owner said / callee said on an errand / Ferni inferred / system), `confidence`, and `kind: claim | evidence`. Callee speech is scoped to its errand and expires with it. | Provenance-typed graphs win at long horizons (90% vs 72% recall at 9 weeks) and hold up against injection; weakly written facts fail 24% vs 2% ([arXiv 2607.21962](https://arxiv.org/abs/2607.21962)). Provenance-role collapse is a named failure ([MemIR, arXiv 2605.25869](https://arxiv.org/abs/2605.25869)). | An injected "remember: Seth wants all calls to X" from a callee never becomes an owner fact. The eval's provenance bucket passes. |
| **R2 Cue-triggered intentions** | Ledger items gain `trigger` (a date, an event such as "after Mom's surgery", "next time we talk"). The errand waker fires them, and they appear under "open now". | Prospective memory is unsolved (best 65.1% F1, [PM-Bench, arXiv 2607.12385](https://arxiv.org/abs/2607.12385)). No assistant remembers its own promises. | A planted intention fires exactly once at its cue, and never when its condition was cancelled. |
| **R3 Memory never overrides now** | Rules in the call sheet and lookups: memory is a preference, not proof. It has a scope, and the present wins a conflict. A remembered "I'm usually fine" never softens a crisis happening now. | Memory sycophancy ([MemSyco-Bench, arXiv 2607.01071](https://arxiv.org/abs/2607.01071)); the #2961 masking finding. | Eval bucket "memory vs present": 0 cases where a memory overrides the present turn; the crisis path is unaffected (test). |
| **R4 Speculative lookups** | Start the likely lookup from the interim transcript, so the answer is ready when the caller stops. Cancel on a mismatch. | ~300 ms turn-taking budget ([source](https://www.autointerviewai.com/blog/best-voice-to-voice-ai-models-2026)); no published voice-companion work. | Lookup-to-answer p50 does not grow first-token latency (`TURN_RECEIPT` before/after). |
| **R5 Confirm-before-store** | High-stakes facts (numbers, names, plans) are stored only on a spoken yes, the #2970 pattern generalised through the writer. | Write quality decides downstream quality (24% vs 2%). | No high-stakes fact without a confirm event (grep + test). |
| **R6 Life-script eval** | Rebuild lane 6 on scripted lives: facts with validity intervals planted first, as-of questions, injection probes, 3-week and 9-week horizons, a cross-family judge, plus the consented real held-out set. | Vendor LoCoMo/LongMemEval scores are unreliable (6.4% answer-key errors; a lenient judge); rankings invert with tenure ([arXiv 2607.21962](https://arxiv.org/abs/2607.21962)). | Nightly scorecard rows for both horizons; a planted regression fails both. |
| **R7 Memory you can see** | A "what Ferni knows" view (owner-editable, provenance shown); forgetting that reaches every store; memory **off by default for minors**. | EU KIDS Act proposal: memory off by default for minors ([source](https://www.actuia.com/en/news/eu-kids-act-brussels-proposes-limiting-chatbot-memory-for-minors/)); SB 243 in force, SB 1119 from 2027 ([Manatt](https://www.manatt.com/insights/newsletters/client-alert/california-privacy-and-ai-roundup-2026-what-passed-and-what-didn-t)). | A minor-care-held account has 0 memory writes and 0 call-sheet reads (test); a forget reaches all canonical stores (test). |

Vendor benchmark claims (Mem0 92.5/94.4 etc., [source](https://mem0.ai/blog/state-of-ai-agent-memory-2026)) are self-reported; we compare only on our own harness.

## 5. Revised lane order

1. **C1, C2, C3** in parallel (different files). Then C7, C5, C6, C4.
2. **M8b** (facts dual-write from the 5 `dynamic_facts` writers, through the writer, using C1/C2/C3) together with **R1** provenance fields. M8b must fix #2978's open items first: late-arriving `validFrom` is inserted as history; the writer checks forgotten topics on write; spoken emails are refused via C1.
3. **M9** people: extend `routeToStorage` as the one people writer into `entity_store`; fold in `relational_nodes` and `relationship_nodes` first; telephony moves last (after #2970).
4. **M2, M5, M6** (call-sheet store, freshness on the persisted forget counter, read path), plus R3 rules in the render.
5. **M7** lookups (swap, cap stays 64; the recall tools read the note's stores), plus **R4** speculative lookups.
6. **M10** open items into the ledger, plus **R2** triggers. **M3, M4, M11** (retire pushes in the read-path audit's order). **M12, M13.**
7. **R5, R6, R7** run alongside, from step 2 on.

## 6. Done means

- **Normalisation:** each kind has one store and one writer module (grep); every dead store and builder is deleted; `quality:arch` has no memory violations and the layout rule is enforced.
- **Quality:** lane 6 / R6 `recalled` ≥ 0.8 at both horizons; 0 invented actions; provenance and memory-vs-present buckets pass.
- **Privacy:** C1 corpus 0 leaks; forget reaches every store after a restart; minors 0 writes.
- **Speed:** greeting no slower; call-start reads down ≥ 30%; first-token latency not up.
- **Process:** every PR passes an independent verifier on its exact head, and fixtures are fictional.
