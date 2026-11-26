import type { FlagSpec } from '../flag-spec.js';

// on: a tool built straight from a domain's exported definitions (createDomainExport: the voice session's music-tool recovery, the domain tool executors) gets the user-id guard register() applies, so the session's user id wins over a model-supplied userId (tools/registry/tool-guards.ts). The outbound gate applies either way. Off: as on main.
export const DOMAIN_EXPORT_USER_ID_GUARD = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
  expires: '2027-02-20',
  issue: 'https://github.com/ferni-ai/voiceai/issues/4251',
  context:
    'Turn on in dev; promote after a dev night with no tool call acting on a userId other than the session one and no executor-path tool failing for a missing userId.',
} as const satisfies FlagSpec;
