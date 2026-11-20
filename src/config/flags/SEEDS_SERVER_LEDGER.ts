import type { FlagSpec } from '../flag-spec.js';

// on: GET /api/seeds answers serverLedger: true and POST /api/seeds/import-local takes a browser's one import (api/seeds-import.ts), so the web reads, buys and claims seeds on the server ledger once this browser's own ledger has been imported (apps/web seeds-ledger.service.ts). The import needs SEEDS_IMPORT_BEFORE; until it is set the import answers 503 and a browser that has a ledger keeps using it. Off (the kill switch): every browser uses its own ledger, as before, and the import answers 404. Default on since 2026-10-31 (Seth); remove after 21 days prod soak.
export const SEEDS_SERVER_LEDGER = {
  default: 'on',
  owner: 'platform',
  kind: 'kill-switch',
} as const satisfies FlagSpec;
