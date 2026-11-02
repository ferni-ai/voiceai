# caller-card

Private notes in every persona's `## Who You're Talking To`, so a handoff persona knows the caller
from its first reply. `CALLER_CARD` (off, cohort-capable); spec
`docs/plans/2026-10-31-right-moment-memory.md` §5.4. **Home only so far**; People, Recent calls and
Coming up (A2-2 to A2-4) add readers to `ports.ts` and `wiring.ts`.

- `index.ts`: `callerCardText` at every persona setup. Only with the owner proven on the line (`ownerProvenOnLine`, via `recent-texts-awareness.ts`), never on a call Ferni placed; the forgotten topics and the MINOR_CARE hold (strict: unreadable or late means held) are re-read each time.
- `load.ts`: single flight per session, 400 ms budget, members only; dropped at session end; logs counts and sources only. `wiring.ts`: the production readers.
- `place.ts`: saved home, then a GPS or typed profile city, then the home fact; at most 4 letter-run words, no line breaks or contact data; never an IP or device city.
- `render.ts`: the person model's line guard on every line, forgets matched like recall's (subject, key, value); 1,200-char cap drops whole lines. `who-block.ts`: byte-identical to before with no card.
