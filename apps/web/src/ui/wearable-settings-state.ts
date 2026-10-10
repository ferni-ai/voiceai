/**
 * Wearable settings - what each provider row can do.
 *
 * Whether a web OAuth wearable can be connected is the server's answer
 * (/wearables/status `configured`), the same one the Integrations screen uses.
 * It used to be a hard-coded "coming soon" flag per provider.
 */

import type {
  BiometricsPlatform,
  WearableProviderStatus,
} from '../services/biometrics.service.js';

/**
 * Connection state for one row. Apple Health is read on the iPhone, so its state
 * is the panel's own status; the OAuth wearables take theirs from the server
 * (`null` when the server couldn't be reached, so none are offered).
 */
export function wearableRowState(
  id: BiometricsPlatform,
  appleStatus: string | undefined,
  server: WearableProviderStatus[] | null
): { connected: boolean; available: boolean } {
  if (id === 'apple_health') return { connected: appleStatus === 'connected', available: true };
  const row = server?.find((p) => p.provider === id);
  return { connected: !!row?.linked, available: !!(row?.configured || row?.linked) };
}
