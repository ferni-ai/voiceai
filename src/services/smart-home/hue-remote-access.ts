/**
 * Why Hue shows as not connected.
 *
 * A Hue bridge lives on the user's home network, which neither Cloud Run (the
 * web server) nor LiveKit Cloud (the agent) can reach. Fetching a
 * user-supplied bridge address from those hosts never worked, and it was an
 * SSRF surface (redirects, internal ranges), so nothing server-side contacts a
 * bridge. The saved credentials are kept, sealed, for a future Hue Remote API
 * integration.
 */
export const HUE_NEEDS_REMOTE_ACCESS =
  "Your Hue bridge is saved, but I can't reach it from here: it lives on your home " +
  'network, and controlling it from Ferni needs Hue remote access, which isn’t set up yet.';
