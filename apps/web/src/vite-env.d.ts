/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly BASE_URL: string;
  readonly SSR: boolean;
  /** "true" shows "Continue with Apple" on the web sign-in gate (config/apple-web-signin-flag.ts). */
  readonly VITE_APPLE_WEB_SIGNIN?: string;
  /** "on" or "true" gives the call its own room on phones (config/call-room-flag.ts). */
  readonly VITE_CALL_ROOM?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** The app's version, set by vite.config.ts `define`. Undefined under vitest. */
declare const __FERNI_APP_VERSION__: string | undefined;
