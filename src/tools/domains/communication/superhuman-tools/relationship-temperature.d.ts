/**
 * Relationship Temperature Monitor - Better Than Human Service
 *
 * What no human friend can do: Track gradual drift in relationships.
 *
 * "Your exchanges with Sarah have shifted from warm → transactional over the
 * last month. That's often a sign of unaddressed tension. Want to check in
 * with her before it grows?"
 *
 * @module tools/domains/communication/superhuman-tools/relationship-temperature
 */
import type { RelationshipTemperature, CommunicationEvent } from './types.js';
/**
 * Update temperature for a contact based on new data.
 */
export declare function updateTemperature(userId: string, contactName: string, sentiment: number, event?: string): Promise<RelationshipTemperature>;
/**
 * Get temperature for a specific contact.
 */
export declare function getTemperature(userId: string, contactName: string): Promise<RelationshipTemperature | null>;
/**
 * Get all relationships needing attention.
 */
export declare function getRelationshipsNeedingAttention(userId: string): Promise<RelationshipTemperature[]>;
/**
 * Build temperature context for LLM injection.
 */
export declare function buildTemperatureContext(userId: string): Promise<string>;
/**
 * Build context for a specific relationship.
 */
export declare function buildContactTemperatureContext(userId: string, contactName: string): Promise<string>;
/**
 * Process a communication event and update temperatures.
 */
export declare function processEventForTemperature(userId: string, event: CommunicationEvent): Promise<void>;
export declare const relationshipTemperature: {
    update: typeof updateTemperature;
    get: typeof getTemperature;
    getNeedingAttention: typeof getRelationshipsNeedingAttention;
    buildContext: typeof buildTemperatureContext;
    buildContactContext: typeof buildContactTemperatureContext;
    processEvent: typeof processEventForTemperature;
};
export default relationshipTemperature;
//# sourceMappingURL=relationship-temperature.d.ts.map