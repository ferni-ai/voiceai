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
  /** "false" turns gate-first paint off: Home paints first, the gate fades in over it (ui/gate-first.ui.ts). */
  readonly VITE_GATE_FIRST?: string;
  /** "on" or "true" turns an avatar motion switch on for the build (config/motion-flags.ts). */
  readonly VITE_NATURAL_BLINK?: string;
  readonly VITE_LID_BLEND?: string;
  readonly VITE_GAZE?: string;
  readonly VITE_LISTEN_NODS?: string;
  readonly VITE_SPRING_BODY?: string;
  readonly VITE_WEIGHTED_EASING?: string;
  readonly VITE_SPEECH_BEATS?: string;
  readonly VITE_THINKING_GLANCE?: string;
  readonly VITE_TURN_GESTURES?: string;
  readonly VITE_FACE_ENGINE?: string;
  readonly VITE_EXPRESSION_ARBITER?: string;
  readonly VITE_REPLY_TONE?: string;
  readonly VITE_SOUND_DIRECTOR?: string;
  /** "true" starts the seeds economy, toast and display (config/seeds-flag.ts). Off: seeds are cut. */
  readonly VITE_SEEDS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** The app's version, set by vite.config.ts `define`. Undefined under vitest. */
declare const __FERNI_APP_VERSION__: string | undefined;
