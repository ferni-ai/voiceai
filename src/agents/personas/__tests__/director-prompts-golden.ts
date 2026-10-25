/**
 * The director's and the deliberator's built prompts (system + prompt) across
 * the flags that shape them, captured through the real Director and
 * Deliberator with an injected writer. director-sees-scene.test.ts and
 * director-directs.test.ts compare them with director-prompts.golden.json,
 * what prod sends: with DIRECTOR_SEES_SCENE and DIRECTOR_DIRECTS unset or off,
 * every prompt must be byte-identical to it, even when the persona on the call
 * is handed to them.
 */
import { vi } from 'vitest';

import { Deliberator, type ThinkFn } from '../deliberation.js';
import { Director, type Line } from '../director-notes.js';

export const GOLDEN_ENVS: Record<string, Record<string, string>> = {
  default: {},
  lightTouch: { FERNI_LIGHT_TOUCH: 'on' },
  lookBack: { DIRECTOR_LOOK_BACK: 'on' },
  escalate: { DIRECTOR_ESCALATE: 'on' },
  noTools: { DIRECTOR_TOOL_STATE: 'off' },
};

const DIRECTOR_CALL: Line[] = [
  { speaker: 'user', text: 'Hey, can I talk to Jordan about the trip?' },
  { speaker: 'ferni', text: 'Sure, handing you over.', by: 'Ferni' },
  { speaker: 'ferni', text: "Hey, it's Jordan." },
  { speaker: 'user', text: 'My manager moved the deadline up again, so the trip is off.' },
  { speaker: 'ferni', text: 'Again? That trip mattered to you.' },
];

const WEIGHTY =
  "I got the offer in Denver, it's more money and the job I always said I wanted, but my mom just moved in with us and I keep putting off telling her.";

export type Captured = Record<string, { system: string; prompt: string }>;

/**
 * Every prompt the director and the deliberator would send, under `extra` env
 * on top of each combo. `personaId` is handed to both as the persona on the
 * call (DIRECTOR_DIRECTS reads it; nothing else may).
 */
export async function capturePrompts(
  extra: Record<string, string> = {},
  personaId?: string
): Promise<Captured> {
  const out: Captured = {};
  for (const [combo, env] of Object.entries(GOLDEN_ENVS)) {
    for (const [k, v] of Object.entries({ ...env, ...extra })) vi.stubEnv(k, v);
    for (const speaking of [undefined, 'Jordan']) {
      let got = { system: '', prompt: '' };
      const director = new Director({
        sessionId: 'golden',
        userName: 'Sam',
        writer: async (system, prompt) => {
          got = { system, prompt };
          return 'NONE';
        },
        speaking: speaking ? () => speaking : undefined,
        ...(personaId ? { personaId: () => personaId } : {}),
      });
      director.tools.started('c1', 'playMusic');
      await director.observe(DIRECTOR_CALL);
      out[`director.${combo}.${speaking ?? 'ferni'}`] = got;
    }
    for (const mode of ['reflect', 'anticipate'] as const) {
      let got = { system: '', prompt: '' };
      const think: ThinkFn = async (system, prompt) => {
        got = { system, prompt };
        return { text: '{"kind":"none"}' };
      };
      const d = new Deliberator({ sessionId: 'golden', userName: 'Sam', think, mode });
      await d.observe(
        [
          { speaker: 'user', text: WEIGHTY },
          { speaker: 'ferni', text: 'Huh, Denver.' },
        ],
        null,
        'Mom moved in last month.',
        '[HOW THEY ARE] Puts off hard talks until they are forced.',
        ...(personaId ? [personaId] : [])
      );
      out[`deliberation.${combo}.${mode}`] = got;
    }
    vi.unstubAllEnvs();
  }
  return out;
}
