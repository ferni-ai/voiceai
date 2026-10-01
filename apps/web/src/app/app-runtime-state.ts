/**
 * App Runtime State
 *
 * The app's mutable session flags, shared by the app/ modules. There is one
 * app instance, so this is the single copy of that state.
 */

export interface AppRuntimeState {
  isInitialized: boolean;
  /** Stops the agent audio visualization attached in onAudioTrack */
  audioCleanup: (() => void) | null;
  isConnecting: boolean;
  isDisconnecting: boolean;
  /** One automatic reconnect after mid-session errors; then honest retry copy */
  autoReconnectAttempted: boolean;
}

export const appRuntime: AppRuntimeState = {
  isInitialized: false,
  audioCleanup: null,
  isConnecting: false,
  isDisconnecting: false,
  autoReconnectAttempted: false,
};
