/**
 * What the app does when an OAuth connect flow sends the user back.
 *
 * Wearable callbacks return to `/?<provider>_linked=true` or
 * `/?<provider>_error=<reason>` (src/servers/api/routes/wearables.ts). Nothing
 * read those, so a finished link looked like nothing happened. We now re-read
 * the connection status from the server, say the result, and tidy the URL.
 * LinkedIn's return is handled by its own service.
 *
 * @module app/oauth-return
 */
import {
  WEARABLE_PROVIDERS,
  fetchWearableProviders,
  getPlatformConfig,
} from '../services/biometrics.service.js';
import { handleLinkedInCallback } from '../services/linkedin.service.js';
import { toast } from '../ui/whisper.ui.js';

/** Handle `<provider>_linked` / `<provider>_error` for the first wearable named in the URL. */
export async function handleWearableOAuthReturn(): Promise<void> {
  const url = new URL(window.location.href);
  for (const provider of WEARABLE_PROVIDERS) {
    const linked = url.searchParams.get(`${provider}_linked`) === 'true';
    const error = url.searchParams.get(`${provider}_error`);
    if (!linked && error === null) continue;

    url.searchParams.delete(`${provider}_linked`);
    url.searchParams.delete(`${provider}_error`);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);

    const name = getPlatformConfig(provider)?.name ?? provider;
    if (error !== null) {
      toast.error(`Couldn't connect ${name}. Try again?`);
      return;
    }
    // Success is only reported once the server's status confirms the link.
    const providers = await fetchWearableProviders();
    if (providers?.some((p) => p.provider === provider && p.linked)) {
      toast.success(`${name} connected!`);
    } else {
      toast.error(`Couldn't confirm ${name}. Try again?`);
    }
    return;
  }
}

/** Run every OAuth return handler once the app has loaded. */
export function handleOAuthReturns(): void {
  handleLinkedInCallback();
  void handleWearableOAuthReturn();
}
