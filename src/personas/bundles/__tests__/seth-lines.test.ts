/**
 * Seth's twin speaks Seth's own approved lines, in every place the model or the
 * opening greeting reads them.
 *
 * The bundle manifest declares no content directories, so content/voice/example-lines.json
 * and content/behaviors/greetings.json are records, not runtime input. The model reads
 * identity/character.md (PROMPT_MODE=character) or identity/system-prompt.md (otherwise),
 * and the spoken first greeting comes from the seth entry in legend-greetings.ts. An
 * approved line that reaches only the JSON never reaches a call.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { LEGEND_INSTANT_GREETINGS } from '../../../agents/shared/legend-greetings.js';

const seth = join(dirname(fileURLToPath(import.meta.url)), '..', 'seth');
const read = (file: string): string => readFileSync(join(seth, file), 'utf8');

interface Line {
  text: string;
  draft?: boolean;
}

const examples = (JSON.parse(read('content/voice/example-lines.json')) as { lines: Line[] }).lines;
const greetings = JSON.parse(read('content/behaviors/greetings.json')) as Record<string, Line[]>;
const approved = examples.filter((line) => !line.draft).map((line) => line.text);
const allGreetings = Object.values(greetings).flat();
const prompts = ['identity/character.md', 'identity/system-prompt.md'] as const;

/** The spoken words of an instant greeting, its Cartesia tags removed. */
const spoken = (ssml: string): string =>
  ssml
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe("Seth's twin bundle", () => {
  it('carries his approved example lines', () => {
    expect(approved.length).toBeGreaterThanOrEqual(60);
    expect(allGreetings.every((g) => !g.draft)).toBe(true);
  });

  it.each(prompts)('%s quotes every approved line, word for word', (file) => {
    const text = read(file);
    expect(approved.filter((line) => !text.includes(`"${line}"`))).toEqual([]);
  });

  it('opens a call with his approved first-time greetings', () => {
    const spokenGreetings = LEGEND_INSTANT_GREETINGS.seth.map(spoken);
    expect(spokenGreetings).toEqual(greetings.first_time.map((g) => g.text));
  });

  it("calls itself Seth's twin, and never claims to be Seth live", () => {
    const manifest = JSON.parse(read('persona.manifest.json')) as {
      identity: { self_reference: string };
    };
    expect(manifest.identity.self_reference).toBe("Seth's twin");
    for (const file of [...prompts, 'identity/biography.md']) {
      expect(read(file), file).not.toMatch(/Seth's voice on the team/);
    }
    for (const file of prompts) {
      expect(read(file), file).toContain(`"No, I'm Seth's twin, not Seth live.`);
    }
    expect(
      allGreetings.filter((g) => g.text.includes('Seth') && !/Seth's twin/.test(g.text))
    ).toEqual([]);
  });

  it('follows the voice text rules: no em dashes, ellipses or stage directions', () => {
    const said = [...examples, ...allGreetings].map((line) => line.text);
    expect(said.filter((t) => /—|…|\.\.\.|\(|\*/.test(t))).toEqual([]);
  });
});
