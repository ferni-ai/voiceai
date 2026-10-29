# Team platform: what every agent must provide, and when we add one

Date: 2026-10-29. Status: plan, approved by Seth ("keep going"). Follows `2026-10-29-specialist-beats.md` (#3040) and the tool-routing report (summarized below).

## Why

Adding agents is already possible:

- **Custom agents:** `services/custom-agent/` stores them per user (`createCustomAgent`, `updateAgentVoice`, `getActiveCustomAgents`).
- **Marketplace:** `apps/marketplace-agents/` has a development guide and a registry.
- **Developer tool servers:** they register through `personas/bundles/mcp-loader.ts` (`developer_mcp_servers`, http only; stdio only from the first-party allowlist).

What's missing is a bar every agent must clear. The six built-in specialists show the cost:

- They arrive with no brief (`hadPreBriefing=False` on every arrival).
- Four of them had briefings that never ran (#3033, #3044).
- They share Ferni's tool menu.
- Their own tools go uncalled (about 0 beat-tool calls per arrival).

A seventh agent built the same way would have the same gaps. So: make the six good, write down what made them good, then open the team.

## Right-sizing keeps the call small; depth goes behind it

The routing evidence (`SOTA tool routing for voice agents`, 2026-10-29):

- First-token latency is flat from 20 to 127 offered tools when cached.
- The real accuracy loss is lookalike tools (about 13%).
- Gemini never used a search tool.
- Live per-turn retrieval lost its earlier test.

So the voice call keeps a fixed set of about 40 tools or fewer per persona, and capability grows behind it, not inside it:

1. **A service behind each beat.** The persona holds one or two beat tools (facades with an `action` parameter). The service behind them can use many tools, its own models and long-running analysis, in any language, over HTTP or MCP. Peter's finance service is the first.
2. **Work outside the call.** Heavy questions run asynchronously. The answer arrives by text or opens the next call (beats plan, rounds lane S5).
3. **Consult without a handoff.** Ferni can ask a teammate in the background and relay the answer, or the teammate joins for one line. Check whether the existing `cameo` tool domain fits before building anything new.
4. **Routing learns which agent owns what.** The capability funnel and real transcripts label which beat a request belonged to. Routing is then "which agent owns this", tuned on that data, not "which of 1,165 tools".

## What every agent must provide

Built-in, marketplace or user-made, every agent provides:

| Part              | Rule                                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Beat              | Declared in the manifest (beats plan S2); an item kind has exactly one owner.                                                                                                                                                                                                                                                                         |
| Toolset           | Fixed for the persona segment, 40 tools or fewer. It always contains the shared safety set, byte-identical; changing that set is a crisis-lane change that Seth signs.                                                                                                                                                                                |
| Service           | One or two beat facades backed by one service with a typed contract and its own tests.                                                                                                                                                                                                                                                                |
| Desk              | Arrival brief built from the caller's last request, open beat items and this persona's own history (beats plan S1, S3). A persona never claims a brief it didn't get.                                                                                                                                                                                 |
| Voice             | Its own voice (`SESSION_OWN_VOICE`). Cloned voices follow the consent rules: the signed-in person's own voice, or a living person's who consents aloud on their own call. A person who has died only with consent they gave while alive, or with estate consent attested by a custodian. Never an uploaded file of someone else without live consent. |
| Follow-up         | Only through the rounds job and guarded sender, signed as the persona, within the caps.                                                                                                                                                                                                                                                               |
| Honest edges      | Says plainly what isn't connected; never invents a reason.                                                                                                                                                                                                                                                                                            |
| Minors and crisis | Inherits minor-care and the crisis path unchanged; no persona can override them.                                                                                                                                                                                                                                                                      |

## The gates, the same for everyone

An agent joins a call only after passing:

1. **Package test:** it has a beat, a toolset of 40 or fewer, the safety set intact, a service contract test and a desk.
2. **Prober beat calls on dev:** it acts on what's open, scored on yes/no rubric items, with 0 invented access excuses.
3. **Crisis and minor-care held-out checks:** unchanged from the core agent.
4. **Capability-funnel row:** it is counted from day one (arrivals, briefings, beat-tool calls).

A user-made agent that fails a gate stays in draft. It is never silently degraded into a call.

## When we add an agent

Only when the data shows **a beat with no owner**:

- open items that fall back to Ferni;
- requests whose right tool sits outside every persona's set (shadow retrieval coverage, routing plan Phase 4);
- recurring topics in real calls that no beat covers.

The threshold is a beat seen in at least 5% of tool-needing turns over 4 weeks with no owner. Likely first candidates are health and fitness, and home and admin, but the data decides.

## Order

1. **Now (4–6 weeks):** beats plan lanes S0–S12, persona toolsets and facades (routing plan Phases 0–2), and Peter's finance service as the first beat service.
2. **Then:** an agent package spec and test kit (`personas/package/`), with the six moved onto it one at a time.
3. **Then:** new built-in agents where the threshold says so, and the marketplace and user-made agents behind the same gates.

## Done means

- All six built-in agents pass the package test and the gates.
- Every agent has a funnel row.
- At least one beat service is live (finance).
- A user-made agent from a template passes or fails the gates automatically, with no manual review step.
