/**
 * A tool result's text as the reply guards read it. The agent stores every tool result
 * JSON-encoded (agents-js generation: `output: JSON.stringify(toolOutput)`), so a string
 * output is decoded once; anything that isn't a JSON string is read as it is. Curly
 * apostrophes are straightened so the guards' patterns match either.
 *
 * @module agents/personas/tool-output-text
 */
export function outputText(output: unknown): string {
  if (typeof output !== 'string') return JSON.stringify(output ?? '');
  try {
    const value: unknown = JSON.parse(output);
    return (typeof value === 'string' ? value : output).replace(/[‘’]/g, "'").trim();
  } catch {
    return output.replace(/[‘’]/g, "'").trim();
  }
}
