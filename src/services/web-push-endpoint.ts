/**
 * Which URLs a web push may be sent to.
 *
 * A browser hands us its push endpoint, and web-push POSTs to it from inside the
 * VPC. Accepting any URL would let a signed-in user aim those requests at internal
 * hosts (SSRF), so only https endpoints on the browsers' push services are allowed.
 */

/** Push service hosts, matched exactly or as a parent domain. */
const PUSH_SERVICE_HOSTS = [
  'fcm.googleapis.com', // Chrome, Chromium browsers, Android
  'android.googleapis.com', // legacy GCM endpoints still held by old Chrome installs
  'push.services.mozilla.com', // Firefox (updates.push.services.mozilla.com)
  'push.apple.com', // Safari (web.push.apple.com)
  'notify.windows.com', // Edge on Windows (*.notify.windows.com)
] as const;

export function isAllowedWebPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  if (url.port && url.port !== '443') return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}
