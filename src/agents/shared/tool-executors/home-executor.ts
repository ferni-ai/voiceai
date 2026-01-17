/**
 * Smart Home Domain Tool Executor
 *
 * Handles smart home tools: setLights, getHomeStatus, setThermostat,
 * lockDoors, controlDevice
 *
 * NOW CONNECTED TO REAL SMART HOME SERVICE!
 * Uses user credentials from Firestore to control actual devices.
 *
 * @module agents/shared/tool-executors/home-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';
import {
  getAllDevices,
  controlDevice,
  activateScene,
  setLightsForVibe,
  type SmartDevice,
} from '../../../tools/domains/smart-home/smart-home.js';
import { hasAnySmartHomeIntegration } from '../../../services/smart-home/user-credentials.js';

const log = createLogger({ module: 'HomeExecutor' });

/** Tools handled by this executor */
const HANDLED_TOOLS = [
  'setlights',
  'gethomestatus',
  'setthermostat',
  'lockdoors',
  'controldevice',
  'getdevices',
  'setscene',
  'turnon',
  'turnoff',
  'armsecurity',
  'disarmsecurity',
  'controllight',
  'listdevices',
] as const;

/**
 * Get a helpful message when no smart home is configured
 */
function getSetupMessage(): string {
  return "You haven't connected any smart home devices yet. Go to Settings → Your Home to connect your lights, thermostat, or speakers.";
}

/**
 * Execute smart home tools using the real smart-home service
 */
async function execute(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  const fnLower = fn.toLowerCase();

  if (!HANDLED_TOOLS.includes(fnLower as (typeof HANDLED_TOOLS)[number])) {
    return null;
  }

  const { userId } = ctx;

  // Need userId for smart home operations
  if (!userId) {
    return 'I need to know who you are to control your smart home. Please sign in first.';
  }

  // Check if user has any smart home configured
  const hasSmartHome = await hasAnySmartHomeIntegration(userId);

  // ========================================
  // SET LIGHTS / CONTROL LIGHT
  // ========================================
  if (fnLower === 'setlights' || fnLower === 'controllight') {
    const room = (args.room as string) || '';
    const brightness = args.brightness as number | undefined;
    const state = args.state as string; // on/off
    const action = args.action as string; // on/off/toggle

    log.info({ room, brightness, state, action, userId }, '💡 Setting lights');

    if (!hasSmartHome) {
      return getSetupMessage();
    }

    // Determine what action to take
    let controlAction: 'on' | 'off' | 'set' | 'toggle' = 'on';
    if (state === 'off' || action === 'off') {
      controlAction = 'off';
    } else if (action === 'toggle') {
      controlAction = 'toggle';
    } else if (brightness !== undefined) {
      controlAction = 'set';
    }

    // If room is specified, control that specific room/device
    if (room) {
      const result = await controlDevice(room, controlAction, brightness, userId);
      return result;
    }

    // If no room specified and brightness given, set all lights
    if (brightness !== undefined) {
      const result = await setLightsForVibe(userId, brightness);
      if (result.success) {
        return `💡 Set ${result.devices.length} light${result.devices.length === 1 ? '' : 's'} to ${brightness}%`;
      } else {
        return "Couldn't adjust the lights. They might be offline.";
      }
    }

    // Generic on/off for all lights
    const devices = await getAllDevices(userId);
    const lights = devices.filter((d) => d.type === 'light');

    if (lights.length === 0) {
      return 'No lights found. Make sure they are connected in Settings → Your Home.';
    }

    const results = await Promise.all(
      lights.map(async (light) => controlDevice(light.id, controlAction, undefined, userId))
    );

    const successCount = results.filter((r) => !r.includes('trouble')).length;
    return controlAction === 'off'
      ? `💡 Turned off ${successCount} light${successCount === 1 ? '' : 's'}`
      : `💡 Turned on ${successCount} light${successCount === 1 ? '' : 's'}`;
  }

  // ========================================
  // GET HOME STATUS / GET DEVICES / LIST DEVICES
  // ========================================
  if (fnLower === 'gethomestatus' || fnLower === 'getdevices' || fnLower === 'listdevices') {
    log.info({ userId }, '🏠 Getting home status');

    if (!hasSmartHome) {
      return getSetupMessage();
    }

    const devices = await getAllDevices(userId);

    if (devices.length === 0) {
      return 'No devices found. Your smart home devices might be offline.';
    }

    // Group by type
    const byType = devices.reduce(
      (acc, d) => {
        acc[d.type] = acc[d.type] || [];
        acc[d.type].push(d);
        return acc;
      },
      {} as Record<string, SmartDevice[]>
    );

    let response = '🏠 **Your Smart Home**\n\n';

    for (const [deviceType, deviceList] of Object.entries(byType)) {
      const emoji =
        deviceType === 'light'
          ? '💡'
          : deviceType === 'thermostat'
            ? '🌡️'
            : deviceType === 'lock'
              ? '🔒'
              : deviceType === 'speaker'
                ? '🔊'
                : '📱';
      response += `**${emoji} ${deviceType.charAt(0).toUpperCase() + deviceType.slice(1)}s**\n`;
      deviceList.forEach((d) => {
        response += `• ${d.name}: ${d.state}${d.room ? ` (${d.room})` : ''}\n`;
      });
      response += '\n';
    }

    return response;
  }

  // ========================================
  // SET THERMOSTAT
  // ========================================
  if (fnLower === 'setthermostat') {
    const temperature = args.temperature as number;
    const mode = args.mode as string; // heat/cool/auto

    log.info({ temperature, mode, userId }, '🌡️ Setting thermostat');

    if (!hasSmartHome) {
      return getSetupMessage();
    }

    if (!temperature && !mode) {
      return 'What temperature would you like?';
    }

    // Find thermostat device
    const result = await controlDevice('thermostat', 'set', temperature, userId);
    return result;
  }

  // ========================================
  // LOCK/UNLOCK DOORS
  // ========================================
  if (fnLower === 'lockdoors') {
    const door = (args.door as string) || 'all';
    const action = args.action as string; // lock/unlock

    log.info({ door, action, userId }, '🔒 Controlling locks');

    if (!hasSmartHome) {
      return getSetupMessage();
    }

    const controlAction = action === 'unlock' ? 'off' : 'on';

    if (door === 'all') {
      const devices = await getAllDevices(userId);
      const locks = devices.filter((d) => d.type === 'lock');

      if (locks.length === 0) {
        return 'No smart locks found.';
      }

      const results = await Promise.all(
        locks.map(async (lock) => controlDevice(lock.id, controlAction, undefined, userId))
      );

      const successCount = results.filter((r) => !r.includes('trouble')).length;
      return action === 'unlock'
        ? `🔓 Unlocked ${successCount} lock${successCount === 1 ? '' : 's'}`
        : `🔒 Locked ${successCount} lock${successCount === 1 ? '' : 's'}`;
    }

    const result = await controlDevice(door, controlAction, undefined, userId);
    return result;
  }

  // ========================================
  // CONTROL DEVICE / TURN ON / TURN OFF
  // ========================================
  if (fnLower === 'controldevice' || fnLower === 'turnon' || fnLower === 'turnoff') {
    const device = args.device as string;
    const action =
      fnLower === 'turnon'
        ? 'on'
        : fnLower === 'turnoff'
          ? 'off'
          : (args.action as 'on' | 'off' | 'toggle');

    log.info({ device, action, userId }, '🔌 Controlling device');

    if (!hasSmartHome) {
      return getSetupMessage();
    }

    if (!device) {
      return 'Which device would you like to control?';
    }

    const result = await controlDevice(device, action || 'toggle', undefined, userId);
    return result;
  }

  // ========================================
  // SET SCENE
  // ========================================
  if (fnLower === 'setscene') {
    const scene = args.scene as string;

    log.info({ scene, userId }, '🎬 Setting scene');

    if (!hasSmartHome) {
      return getSetupMessage();
    }

    if (!scene) {
      return 'Which scene would you like to activate?';
    }

    const result = await activateScene(scene, userId);
    return result;
  }

  // ========================================
  // SECURITY ARM/DISARM
  // ========================================
  if (fnLower === 'armsecurity' || fnLower === 'disarmsecurity') {
    const mode = args.mode as string; // away/stay/night
    const action = fnLower === 'armsecurity' ? 'arm' : 'disarm';

    log.info({ action, mode, userId }, '🛡️ Security control');

    if (!hasSmartHome) {
      return getSetupMessage();
    }

    // Security systems typically integrate through Home Assistant
    // For now, return a helpful message
    return `Security system control requires Home Assistant integration. Connect it in Settings → Your Home.`;
  }

  return null;
}

export const homeExecutor: DomainExecutor = {
  domain: 'home',
  handles: HANDLED_TOOLS,
  execute,
};

export default homeExecutor;
