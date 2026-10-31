# caller-card

Private notes in every persona's `## Who You're Talking To`, so a persona that arrives by
handoff knows the caller from its first reply. `CALLER_CARD` (off, cohort-capable); spec
`docs/plans/2026-10-31-right-moment-memory.md` §5.4. **Home only so far**; People, Recent calls
and Coming up (A2-2 to A2-4) add readers to `ports.ts` and `wiring.ts`.

- `index.ts`: `callerCardText` (every persona setup), gated like recent texts: the owner proven on the line (`ownerProvenOnLine` via `recent-texts-awareness.ts`), never a call Ferni placed.
- `load.ts`: single flight per session, 400 ms budget, members only, no MINOR_CARE account; dropped at session end.
- `place.ts`: Home precedence (saved home, GPS or typed profile city, home fact); letters only, no contact data. `render.ts`: the person model's line guard on every line; 1,200-char cap drops whole lines.
- `who-block.ts`: the block, byte-identical to before with no card. `wiring.ts`: the production readers.

Never Home: an IP or device city. Forgotten topics are re-read at every setup; a late read is
`null` (People and Coming up drop on it). Logs: counts and sources only.
