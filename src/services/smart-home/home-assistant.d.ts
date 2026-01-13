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
export interface HAEntity {
    entity_id: string;
    state: string;
    attributes: Record<string, unknown>;
    last_changed: string;
    last_updated: string;
    friendly_name?: string;
}
export interface HAServiceCall {
    domain: string;
    service: string;
    entity_id?: string;
    service_data?: Record<string, unknown>;
}
/**
 * Check if Home Assistant is configured
 */
export declare function isHomeAssistantConfigured(): boolean;
/**
 * Get all entities
 */
export declare function getEntities(): Promise<HAEntity[]>;
/**
 * Get entity by ID
 */
export declare function getEntity(entityId: string): Promise<HAEntity | null>;
/**
 * Call a Home Assistant service
 */
export declare function callService(call: HAServiceCall): Promise<boolean>;
/**
 * Turn on a light
 */
export declare function turnOnLight(entityId: string, brightness?: number, color?: {
    r: number;
    g: number;
    b: number;
}): Promise<string>;
/**
 * Turn off a light
 */
export declare function turnOffLight(entityId: string): Promise<string>;
/**
 * Toggle a light
 */
export declare function toggleLight(entityId: string): Promise<string>;
/**
 * Set thermostat temperature
 */
export declare function setThermostat(entityId: string, temperature: number, hvacMode?: 'heat' | 'cool' | 'heat_cool' | 'off'): Promise<string>;
/**
 * Lock/unlock a lock
 */
export declare function setLock(entityId: string, lock: boolean): Promise<string>;
/**
 * Activate a scene
 */
export declare function activateScene(sceneId: string): Promise<string>;
/**
 * Turn on/off a switch
 */
export declare function setSwitch(entityId: string, on: boolean): Promise<string>;
/**
 * Find entities by name (fuzzy match)
 */
export declare function findEntitiesByName(query: string, domain?: string): Promise<HAEntity[]>;
/**
 * Get room/area status summary
 */
export declare function getRoomStatus(roomName: string): Promise<string>;
declare const _default: {
    isHomeAssistantConfigured: typeof isHomeAssistantConfigured;
    getEntities: typeof getEntities;
    getEntity: typeof getEntity;
    callService: typeof callService;
    turnOnLight: typeof turnOnLight;
    turnOffLight: typeof turnOffLight;
    toggleLight: typeof toggleLight;
    setThermostat: typeof setThermostat;
    setLock: typeof setLock;
    activateScene: typeof activateScene;
    setSwitch: typeof setSwitch;
    findEntitiesByName: typeof findEntitiesByName;
    getRoomStatus: typeof getRoomStatus;
};
export default _default;
//# sourceMappingURL=home-assistant.d.ts.map