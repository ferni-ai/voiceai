/**
 * The caller's own LIFX lights (SMART_HOME_LIFX).
 *
 * The legacy tools were built with no user, so a saved LIFX token was never
 * loaded. These run as the call's verified caller and read only that caller's
 * LIFX credential. They never go through getAllDevices / controlDevice, which
 * gather Sonos, Ecobee and HomeKit too and match any device type by name: a
 * light command must not reach someone's thermostat, speaker or lock.
 *
 * @module tools/domains/smart-home/caller-lifx-tools
 */

import { toolCallerId } from '../../registry/per-caller-tool.js';
import { isMemberIdentity } from '../../../services/identity/member-identity.js';
import { isUnverifiedUserId } from '../../../services/identity/unverified-user-id.js';
import { getCredential } from '../../../services/smart-home/user-credentials.js';
import { getLifxLights, setLifxLight, type SmartDevice } from './smart-home.js';

const NOT_VERIFIED = 'I can only change the lights for a signed-in account, so I left them alone.';
const NOT_LINKED =
  "Your LIFX lights aren't linked yet, so I left them alone. Open Set the Mood in the app's menu and paste your LIFX token.";
const NO_LIGHTS = "I don't see any LIFX lights on your account, so nothing changed.";

/**
 * The call's own caller (LiveKit's opts.ctx.userData, never a model argument),
 * when the server verified them (userData.verifiedCaller, voice-agent-entry):
 * never an anon:, device:, phone: or onbehalf: id. Null for anyone else.
 */
function verifiedCaller(opts: unknown): string | null {
  const userData = (opts as { ctx?: { userData?: { verifiedCaller?: unknown } } } | undefined)?.ctx
    ?.userData;
  if (userData?.verifiedCaller !== true) return null;
  const caller = toolCallerId(opts);
  return isMemberIdentity(caller) && !isUnverifiedUserId(caller) ? caller : null;
}

type CallerLights = { refused: string } | { token: string; lights: SmartDevice[] };

/** The verified caller's LIFX token and their LIFX lights; nothing from any other platform. */
async function callerLights(opts: unknown): Promise<CallerLights> {
  const caller = verifiedCaller(opts);
  if (!caller) return { refused: NOT_VERIFIED };
  const lifx = await getCredential(caller, 'lifx');
  const token = typeof lifx?.token === 'string' ? lifx.token.trim() : '';
  if (!token) return { refused: NOT_LINKED };
  const found = await getLifxLights({ lifx: { token } });
  const lights = found.filter((d) => d.platform === 'lifx' && d.type === 'light');
  return lights.length > 0 ? { token, lights } : { refused: NO_LIGHTS };
}

function describe(light: SmartDevice): string {
  return `${light.name}: ${light.state}${light.room ? ` (${light.room})` : ''}`;
}

export interface LightCommand {
  room: string;
  action: 'on' | 'off' | 'toggle';
  brightness?: number;
}

/** Turn one of the caller's LIFX lights on, off or to a brightness (the tool: index.ts). */
export async function controlCallerLight(
  { room, action, brightness }: LightCommand,
  opts: unknown
): Promise<string> {
  const own = await callerLights(opts);
  if ('refused' in own) return own.refused;
  const wanted = room.trim().toLowerCase();
  const light = own.lights.find(
    (d) => d.id === room || (wanted !== '' && d.name.toLowerCase().includes(wanted))
  );
  if (!light) {
    return `I couldn't find a LIFX light called "${room}". Your lights: ${own.lights.map((d) => d.name).join(', ')}.`;
  }
  const power =
    brightness !== undefined || action === 'on'
      ? 'on'
      : action === 'off'
        ? 'off'
        : light.state === 'on'
          ? 'off'
          : 'on';
  const ok = await setLifxLight({ lifx: { token: own.token } }, light.id, power, brightness);
  if (!ok) return `I couldn't reach ${light.name}, so it wasn't changed.`;
  return brightness !== undefined
    ? `💡 **${light.name}** is now at ${brightness}%`
    : `💡 **${light.name}** is now ${power}`;
}

/** List the caller's LIFX lights and their state (the tool: index.ts). */
export async function listCallerLights(opts: unknown): Promise<string> {
  const own = await callerLights(opts);
  if ('refused' in own) return own.refused;
  return `**Your LIFX lights**\n${own.lights.map((d) => `• ${describe(d)}`).join('\n')}`;
}
