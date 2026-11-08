import type { FlagSpec } from '../flag-spec.js';

// on: the report of a call Ferni made for the owner reaches their next call: one compact While You Were Away block (calls first, newest first, at most 2) is offered on each of the first 3 caller turns until a reply request carries it, kept by the injection filter in every mode but crisis, never built on a turn with safety guidance; only the results it carried are marked delivered then, never when built, and a web-UI packet is noted as a ui notice, not voice delivery (call-report.ts, injection-filter.ts, turn-request.ts, unified-result-capture.ts)
export const CALL_REPORT_REACHES_YOU = {
  default: 'off',
  owner: 'outreach',
  kind: 'experiment',
} as const satisfies FlagSpec;
