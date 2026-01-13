/**
 * Home Assistant Integration
 *
 * Control smart home devices via Home Assistant.
 * Works with any device supported by Home Assistant:
 * - Lights (on/off, brightness, color)
 * - Switches/plugs
 * - Thermostats
 * - Locks
 * - Covers (blinds, garage doors)
 * - Scenes
 * - And 1000+ more integrations
 *
 * Setup:
 * 1. Set up Home Assistant (https://www.home-assistant.io)
 * 2. Create a long-lived access token in HA
 * 3. Set environment variables:
 *    - HOME_ASSISTANT_URL (e.g., http://homeassistant.local:8123)
 *    - HOME_ASSISTANT_TOKEN (long-lived access token)
 */
import { getLogger } from '../../utils/safe-logger.js';
const log = getLogger();
const HA_URL = process.env.HOME_ASSISTANT_URL || '';
const HA_TOKEN = process.env.HOME_ASSISTANT_TOKEN || '';
/**
 * Check if Home Assistant is configured
 */
export function isHomeAssistantConfigured() {
    return !!(HA_URL && HA_TOKEN);
}
/**
 * Make authenticated request to Home Assistant API
 */
async function haRequest(endpoint, method = 'GET', body) {
    if (!isHomeAssistantConfigured()) {
        throw new Error('Home Assistant not configured');
    }
    const response = await fetch(`${HA_URL}/api${endpoint}`, {
        method,
        headers: {
            Authorization: `Bearer ${HA_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
        const error = await response.text();
        log.error({ status: response.status, error, endpoint }, '🏠 Home Assistant API error');
        throw new Error(`Home Assistant error: ${response.status}`);
    }
    return response.json();
}
/**
 * Get all entities
 */
export async function getEntities() {
    if (!isHomeAssistantConfigured()) {
        log.warn('Home Assistant not configured');
        return [];
    }
    try {
        const entities = await haRequest('/states');
        return entities;
    }
    catch (error) {
        log.error({ error: String(error) }, '🏠 Failed to get entities');
        return [];
    }
}
/**
 * Get entity by ID
 */
export async function getEntity(entityId) {
    if (!isHomeAssistantConfigured())
        return null;
    try {
        const entity = await haRequest(`/states/${entityId}`);
        return entity;
    }
    catch {
        return null;
    }
}
/**
 * Call a Home Assistant service
 */
export async function callService(call) {
    if (!isHomeAssistantConfigured()) {
        log.warn('Home Assistant not configured');
        return false;
    }
    log.info({ call }, '🏠 Calling Home Assistant service');
    try {
        const endpoint = `/services/${call.domain}/${call.service}`;
        const body = { ...call.service_data };
        if (call.entity_id) {
            body.entity_id = call.entity_id;
        }
        await haRequest(endpoint, 'POST', body);
        log.info({ call }, '🏠 Service call successful');
        return true;
    }
    catch (error) {
        log.error({ call, error: String(error) }, '🏠 Service call failed');
        return false;
    }
}
// ============================================================================
// HIGH-LEVEL CONTROL FUNCTIONS
// ============================================================================
/**
 * Turn on a light
 */
export async function turnOnLight(entityId, brightness, color) {
    const serviceData = {};
    if (brightness !== undefined) {
        serviceData.brightness_pct = Math.max(0, Math.min(100, brightness));
    }
    if (color) {
        serviceData.rgb_color = [color.r, color.g, color.b];
    }
    const success = await callService({
        domain: 'light',
        service: 'turn_on',
        entity_id: entityId,
        service_data: Object.keys(serviceData).length > 0 ? serviceData : undefined,
    });
    const entity = await getEntity(entityId);
    const name = entity?.attributes?.friendly_name || entityId;
    if (success) {
        if (brightness !== undefined) {
            return `Turned on ${name} at ${brightness}% brightness.`;
        }
        return `Turned on ${name}.`;
    }
    return `Couldn't turn on ${name}.`;
}
/**
 * Turn off a light
 */
export async function turnOffLight(entityId) {
    const entity = await getEntity(entityId);
    const name = entity?.attributes?.friendly_name || entityId;
    const success = await callService({
        domain: 'light',
        service: 'turn_off',
        entity_id: entityId,
    });
    return success ? `Turned off ${name}.` : `Couldn't turn off ${name}.`;
}
/**
 * Toggle a light
 */
export async function toggleLight(entityId) {
    const entity = await getEntity(entityId);
    const name = entity?.attributes?.friendly_name || entityId;
    const success = await callService({
        domain: 'light',
        service: 'toggle',
        entity_id: entityId,
    });
    return success ? `Toggled ${name}.` : `Couldn't toggle ${name}.`;
}
/**
 * Set thermostat temperature
 */
export async function setThermostat(entityId, temperature, hvacMode) {
    const entity = await getEntity(entityId);
    const name = entity?.attributes?.friendly_name || entityId;
    const serviceData = { temperature };
    if (hvacMode) {
        serviceData.hvac_mode = hvacMode;
    }
    const success = await callService({
        domain: 'climate',
        service: 'set_temperature',
        entity_id: entityId,
        service_data: serviceData,
    });
    return success ? `Set ${name} to ${temperature}°F.` : `Couldn't set ${name} temperature.`;
}
/**
 * Lock/unlock a lock
 */
export async function setLock(entityId, lock) {
    const entity = await getEntity(entityId);
    const name = entity?.attributes?.friendly_name || entityId;
    const success = await callService({
        domain: 'lock',
        service: lock ? 'lock' : 'unlock',
        entity_id: entityId,
    });
    const action = lock ? 'Locked' : 'Unlocked';
    return success ? `${action} ${name}.` : `Couldn't ${action.toLowerCase()} ${name}.`;
}
/**
 * Activate a scene
 */
export async function activateScene(sceneId) {
    const entity = await getEntity(sceneId);
    const name = entity?.attributes?.friendly_name || sceneId;
    const success = await callService({
        domain: 'scene',
        service: 'turn_on',
        entity_id: sceneId,
    });
    return success ? `Activated ${name} scene.` : `Couldn't activate ${name}.`;
}
/**
 * Turn on/off a switch
 */
export async function setSwitch(entityId, on) {
    const entity = await getEntity(entityId);
    const name = entity?.attributes?.friendly_name || entityId;
    const success = await callService({
        domain: 'switch',
        service: on ? 'turn_on' : 'turn_off',
        entity_id: entityId,
    });
    const action = on ? 'Turned on' : 'Turned off';
    return success ? `${action} ${name}.` : `Couldn't ${action.toLowerCase()} ${name}.`;
}
/**
 * Find entities by name (fuzzy match)
 */
export async function findEntitiesByName(query, domain) {
    const entities = await getEntities();
    const queryLower = query.toLowerCase();
    return entities.filter((e) => {
        // Filter by domain if specified
        if (domain && !e.entity_id.startsWith(`${domain}.`)) {
            return false;
        }
        // Check friendly name and entity_id
        const friendlyName = (e.attributes?.friendly_name || '').toLowerCase();
        const entityId = e.entity_id.toLowerCase();
        return friendlyName.includes(queryLower) || entityId.includes(queryLower);
    });
}
/**
 * Get room/area status summary
 */
export async function getRoomStatus(roomName) {
    const entities = await findEntitiesByName(roomName);
    if (entities.length === 0) {
        return `I couldn't find any devices for "${roomName}".`;
    }
    const lights = entities.filter((e) => e.entity_id.startsWith('light.'));
    const switches = entities.filter((e) => e.entity_id.startsWith('switch.'));
    const climate = entities.filter((e) => e.entity_id.startsWith('climate.'));
    const parts = [];
    if (lights.length > 0) {
        const onLights = lights.filter((l) => l.state === 'on');
        parts.push(`${onLights.length} of ${lights.length} lights are on`);
    }
    if (switches.length > 0) {
        const onSwitches = switches.filter((s) => s.state === 'on');
        parts.push(`${onSwitches.length} of ${switches.length} switches are on`);
    }
    if (climate.length > 0) {
        const thermostat = climate[0];
        const temp = thermostat.attributes?.current_temperature;
        const target = thermostat.attributes?.temperature;
        if (temp) {
            parts.push(`temperature is ${temp}°F${target ? ` (set to ${target}°F)` : ''}`);
        }
    }
    return parts.length > 0
        ? `In ${roomName}: ${parts.join(', ')}.`
        : `${roomName} status: ${entities.length} devices found.`;
}
export default {
    isHomeAssistantConfigured,
    getEntities,
    getEntity,
    callService,
    turnOnLight,
    turnOffLight,
    toggleLight,
    setThermostat,
    setLock,
    activateScene,
    setSwitch,
    findEntitiesByName,
    getRoomStatus,
};
//# sourceMappingURL=home-assistant.js.map