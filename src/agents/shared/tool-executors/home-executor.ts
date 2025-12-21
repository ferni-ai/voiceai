/**
 * Smart Home Domain Tool Executor
 *
 * Handles smart home tools: setLights, getHomeStatus, setThermostat,
 * lockDoors, controlDevice
 *
 * Note: These are conversational fallbacks. Full smart home integration
 * requires connecting to Home Assistant, Google Home, or Apple HomeKit.
 *
 * @module agents/shared/tool-executors/home-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

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
] as const;

/**
 * Execute smart home tools
 *
 * Note: Smart home integration is not yet implemented. These are conversational
 * fallbacks that acknowledge the request and suggest connecting smart home devices.
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

  // ========================================
  // SET LIGHTS
  // ========================================
  if (fnLower === 'setlights') {
    const room = args.room as string;
    const brightness = args.brightness as number;
    const color = args.color as string;
    const state = args.state as string; // on/off

    log.info({ room, brightness, color, state, userId: ctx.userId }, '💡 Setting lights');

    // Conversational fallback - no smart home integration yet
    if (state === 'off') {
      return room
        ? `I'd turn off the ${room} lights, but I'm not connected to your smart home yet.`
        : "I can't control lights without a smart home connection.";
    }

    let response = "I'd set the ";
    response += room ? `${room} lights` : 'lights';
    if (brightness !== undefined) {
      response += ` to ${brightness}%`;
    }
    if (color) {
      response += ` with ${color} color`;
    }
    response += ", but I'm not connected to your smart home yet. Would you like to connect your devices?";

    return response;
  }

  // ========================================
  // GET HOME STATUS
  // ========================================
  if (fnLower === 'gethomestatus') {
    log.info({ userId: ctx.userId }, '🏠 Getting home status');
    return "I can't check your home status without a smart home connection. Would you like to set up a connection?";
  }

  // ========================================
  // SET THERMOSTAT
  // ========================================
  if (fnLower === 'setthermostat') {
    const temperature = args.temperature as number;
    const mode = args.mode as string; // heat/cool/auto

    log.info({ temperature, mode, userId: ctx.userId }, '🌡️ Setting thermostat');

    if (!temperature && !mode) {
      return 'What temperature would you like?';
    }

    return `I'd set the thermostat to ${temperature ? `${temperature}°F` : mode}, but I'm not connected to your smart home.`;
  }

  // ========================================
  // LOCK/UNLOCK DOORS
  // ========================================
  if (fnLower === 'lockdoors') {
    const door = args.door as string; // specific door or 'all'
    const action = args.action as string; // lock/unlock

    log.info({ door, action, userId: ctx.userId }, '🔒 Locking doors');

    return `I can't control your locks without a smart home connection. Would you like to set one up?`;
  }

  // ========================================
  // CONTROL DEVICE
  // ========================================
  if (fnLower === 'controldevice' || fnLower === 'turnon' || fnLower === 'turnoff') {
    const device = args.device as string;
    const action = fnLower === 'turnon' ? 'on' : fnLower === 'turnoff' ? 'off' : (args.action as string);

    log.info({ device, action, userId: ctx.userId }, '🔌 Controlling device');

    if (!device) {
      return 'Which device would you like to control?';
    }

    return `I can't control ${device} without a smart home connection.`;
  }

  // ========================================
  // GET DEVICES
  // ========================================
  if (fnLower === 'getdevices') {
    log.info({ userId: ctx.userId }, '📱 Getting devices');
    return 'No smart home devices connected. Would you like to set up a connection?';
  }

  // ========================================
  // SET SCENE
  // ========================================
  if (fnLower === 'setscene') {
    const scene = args.scene as string;

    log.info({ scene, userId: ctx.userId }, '🎬 Setting scene');

    if (!scene) {
      return 'Which scene would you like to activate?';
    }

    return `I can't activate "${scene}" without a smart home connection.`;
  }

  // ========================================
  // SECURITY ARM/DISARM
  // ========================================
  if (fnLower === 'armsecurity' || fnLower === 'disarmsecurity') {
    const mode = args.mode as string; // away/stay/night
    const action = fnLower === 'armsecurity' ? 'arm' : 'disarm';

    log.info({ action, mode, userId: ctx.userId }, '🛡️ Security control');

    return `I can't control security without a smart home connection.`;
  }

  return null;
}

export const homeExecutor: DomainExecutor = {
  domain: 'home',
  handles: HANDLED_TOOLS,
  execute,
};

export default homeExecutor;
