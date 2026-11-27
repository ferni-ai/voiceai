/**
 * How the blog checks end, as blog-drafts.yml reads them: 0 is a pass,
 * REJECTED is a verdict (the post didn't clear the gate or the editorial bar),
 * and anything else is an error. An uncaught error exits 1, so a crash is never
 * read as a verdict.
 */
export const REJECTED = 3;
