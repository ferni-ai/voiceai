/**
 * Inside jokes in conversation summaries: the prompt tail that asks the summary
 * model for them, and the parser that cleans what it sends back.
 */

const MAX_INSIDE_JOKES = 3;
const MAX_INSIDE_JOKE_LENGTH = 140;

/** Closes the summary JSON shape with the insideJokes field and says what counts. */
export const INSIDE_JOKES_PROMPT_TAIL = `  "insideJokes": ["a few words on a bit you two shared"]
}

insideJokes: moments in THIS conversation that were genuinely funny between USER and ASSISTANT: both laughed, the user played along, or a bit got repeated. A few words each on what it was. Use [] if nothing was. Never invent one. Leave out stock jokes or lines the assistant told on its own: it has to be something that came out of this conversation.`;

/**
 * The inside jokes the summary model reported, cleaned: strings only, trimmed,
 * deduped, at most three, each kept short. Anything else (missing field, a
 * string instead of a list, objects) yields [] rather than failing the summary.
 */
export function parseInsideJokes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const jokes: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const text = item.trim().slice(0, MAX_INSIDE_JOKE_LENGTH);
    if (!text || jokes.some((j) => j.toLowerCase() === text.toLowerCase())) continue;
    jokes.push(text);
    if (jokes.length >= MAX_INSIDE_JOKES) break;
  }
  return jokes;
}
