import type { FlagSpec } from '../flag-spec.js';

// on: the light tools run as the call's verified caller with that caller's own saved LIFX token, in the smart-home domain the words "lights", "lamp", "bulb", "brightness", "dim" and "thermostat" load (domains/smart-home/index.ts); thermostat, lock, scene and the always-failing speaker tools are not offered. Off: the tools are built with no caller, as before.
export const SMART_HOME_LIFX = {
  default: 'off',
  owner: 'tools',
  kind: 'experiment',
} as const satisfies FlagSpec;
