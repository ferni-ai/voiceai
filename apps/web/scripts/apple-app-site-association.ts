/**
 * apple-app-site-association (AASA) for the iPhone app, the iOS twin of
 * asset-links.ts.
 *
 * app.ferni.ai is Firebase Hosting. With no file at
 * /.well-known/apple-app-site-association, Hosting answers with its own
 * generated `{"applinks":{"apps":[],"details":[]}}` (private, no-store). A file in
 * the deployed directory overrides it, exactly as assetlinks.json does, so the
 * build writes one. firebase.json gives it Content-Type application/json, since
 * the name has no extension.
 *
 * The links list is an allowlist, never `/*`: only the paths a Ferni link is
 * shared on open the app. Everything else (the call screen at `/`, OAuth
 * callbacks under /auth/ and /__/auth/, approval pages, anything marketing,
 * blog or legal) keeps opening in Safari. The app has to handle these paths
 * (onContinueUserActivity) before it adds `applinks:app.ferni.ai` to its
 * entitlements, or a referral code would be dropped on the floor.
 */
import type { Plugin } from 'vite';

export const AASA_PATH = '.well-known/apple-app-site-association';
export const APPLE_TEAM_ID = 'XT8W26YE9U';
export const IOS_BUNDLE_ID = 'com.sethdford.ferni';

const TEAM_ID = /^[A-Z0-9]{10}$/;
const BUNDLE_ID = /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/;

/** One applinks component (iOS 13+ format). Patterns use `*` (any run) and `?` (one character). */
export interface AasaComponent {
  '/': string;
  '?'?: Record<string, string>;
  exclude: boolean;
  comment: string;
}

export interface AppleAppSiteAssociation {
  applinks: { details: { appIDs: string[]; components: AasaComponent[] }[] };
  webcredentials: { apps: string[] };
}

/**
 * The only links that open the app, each one a link Ferni hands out for
 * someone else to tap. `exclude: false` is spelled out on purpose: each entry
 * is a deliberate yes.
 */
export const APP_LINK_COMPONENTS: readonly AasaComponent[] = [
  {
    '/': '/grow/?*',
    exclude: false,
    comment: 'Referral invite: /grow/<code> (src/api/seeds-routes.ts referralLink)',
  },
  {
    '/': '/',
    '?': { ref: '?*' },
    exclude: false,
    comment: 'Referral on the app root: /?ref=<code> (apps/web referral.service.ts)',
  },
  {
    '/': '/',
    '?': { referral: '?*' },
    exclude: false,
    comment: 'Referral on the app root: /?referral=<code> (apps/web referral.service.ts)',
  },
];

export function appId(teamId: string = APPLE_TEAM_ID, bundleId: string = IOS_BUNDLE_ID): string {
  if (!TEAM_ID.test(teamId)) {
    throw new Error(`Apple team id "${teamId}" is not 10 upper-case letters and digits`);
  }
  if (!BUNDLE_ID.test(bundleId)) throw new Error(`"${bundleId}" is not a bundle id`);
  return `${teamId}.${bundleId}`;
}

export function buildAppleAppSiteAssociation(): AppleAppSiteAssociation {
  const id = appId();
  return {
    applinks: {
      details: [{ appIDs: [id], components: APP_LINK_COMPONENTS.map((c) => ({ ...c })) }],
    },
    // Password and passkey autofill in the app for accounts saved on this domain.
    webcredentials: { apps: [id] },
  };
}

/** Vite plugin: emits dist/.well-known/apple-app-site-association (no extension) at build time. */
export function appleAppSiteAssociationPlugin(): Plugin {
  return {
    name: 'ferni-apple-app-site-association',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: AASA_PATH,
        source: `${JSON.stringify(buildAppleAppSiteAssociation(), null, 2)}\n`,
      });
    },
  };
}
