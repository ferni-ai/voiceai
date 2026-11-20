import type { FlagSpec } from '../flag-spec.js';

// off | on (#4249): the transfer awareness context for the caller's own medical emergency (a crisis transfer decision whose service is 911: chest pain, a heart attack or stroke, can't breathe, bleeding) tells the model to have them call 911 right now, first. Alone it gets no crisis-line push; with suicidal, self-harm or danger-to-others signals the 988 line follows as before. Every other decision keeps "Always mention 988". Off: the context is as before. Read from process.env (safety/medical-emergency-line.ts, called by human-transfer/index.ts).
export const CRISIS_MEDICAL_911_FIRST = {
  default: 'off',
  owner: 'intelligence',
  kind: 'experiment',
  expires: '2027-02-20',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4249',
  context:
    'Promote after an independent verify, the crisis owner yes and clean dev nights; then make permanent, else delete.',
} as const satisfies FlagSpec;
