# Ideas Backlog

**Started 2026-10-21.** This file holds ideas that aren't defects: measurements, tuning and exploration. The issue tracker holds work in progress: bugs and capabilities being built. When an idea is picked up, open an issue for it with a "done when" and link it here.

Each entry keeps the closed issue that first described it, so its history and data remain one click away. Ordered by expected value.

## 1. Time to first word (1.7–2.5 s today)

From #1505, with #1543 and #1545.

- **Where the time goes:** LLM time to first token first, then the TTS first byte, then endpointing. Rust/WASM work comes last.
- **Built but off and unmeasured:** context caching and the first-clause flush.
- **Next steps:**
  - Measure each lever with `TURN_RECEIPT` medians before and after: caching, the prompt and tool-schema diet, region pinning (#1543; Vertex location is still `global`), endpointing (#1545), and a warm Cartesia pool.
  - Report false cut-offs alongside the endpointing medians.

## 2. Prod reply length and filler

From #1425.

- **Observed:** prod replies run 35–40 words, with filler in 53% of replies.
- **Next steps:**
  - Confirm prod's `TURN_LENGTH` / `TURN_TEXTURE` / `HUMAN_TEXTURE` values.
  - Build a dev-vs-prod table against the human bands.
  - Try a per-reply filler cap behind an off-by-default flag, and measure it.

## 3. HONEST_FRIEND pushback, on vs off

From #1435.

- **Exists:** the scripted probe harness.
- **Missing:** the on-versus-off results table, with guardrail and warmth checks. That result feeds the HONEST_FRIEND ship decision (#1465).

## 4. Dev-only behaviour flags, measured in groups

From #1422.

- Before any prod flip, measure dev-only flags in groups:
  - Map each flag to a scenario and a metric.
  - Do at least 4 recorded runs per config, with the sha and flag values.
  - Record a keep or discard verdict per flag.

## 5. Template personas and cognitive quirks: reachable or dead?

From #1424.

- **Settled:** CANDOR is gone, and cognitive-quirks is wired in the loader.
- **Open:** `wellness-coach` and `generic-advisor` are still registered in `src/personas/index.ts`. Delete them, or document why they stay.
- **To confirm:** whether the COGNITIVE category runs on voice calls. A builder trace from one voice call would show it.

## Retired umbrellas

- **#1467 (better-than-human audit plan, 2026-10-15):** its open children were triaged one by one on 2026-10-21. Bugs and capabilities stay open as their own issues; ideas are on this page.
