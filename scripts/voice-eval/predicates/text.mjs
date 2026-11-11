// Text helpers the predicate files share (index.mjs, spectrum.mjs).

/** Curly apostrophes as straight ones, so "it’s" and "it's" match the same pattern. */
export const norm = (s) => s.replace(/[’‘]/g, "'");
export const sentences = (s) => norm(s).split(/(?<=[.!?…])\s+/);
/** The call's agent turns. */
export const agent = (call) => call.turns.filter((t) => t.who === 'agent');
