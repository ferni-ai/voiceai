/**
 * Delegation Service
 *
 * Manages inter-persona task delegations:
 * - Delegation creation and tracking
 * - Status updates and communication
 * - Handoff coordination between personas
 *
 * Part of the background tasks system, split for maintainability.
 */
import { EventEmitter } from 'events';
import type { BackgroundData, Delegation } from './background-types.js';
export declare class DelegationService extends EventEmitter {
    private getUserData;
    private markDirty;
    constructor(getUserData: (userId: string) => Promise<BackgroundData>, markDirty: (userId: string) => void);
    /**
     * Delegate a task to another persona
     */
    createDelegation(params: {
        userId: string;
        taskDescription: string;
        context: Record<string, unknown>;
        fromPersona: string;
        toPersona: string;
        originalRequest: string;
    }): Promise<Delegation>;
    /**
     * Get delegation by ID from all user data
     */
    getDelegationFromData(allData: Map<string, BackgroundData>, delegationId: string): {
        delegation: Delegation;
        userId: string;
    } | undefined;
    /**
     * Update delegation status
     */
    updateDelegation(allData: Map<string, BackgroundData>, delegationId: string, update: {
        status?: Delegation['status'];
        message?: string;
        from?: string;
        outcome?: string;
    }): void;
    /**
     * Accept a delegation
     */
    acceptDelegation(allData: Map<string, BackgroundData>, delegationId: string, acceptingPersona: string): void;
    /**
     * Mark delegation as in progress
     */
    startDelegation(allData: Map<string, BackgroundData>, delegationId: string, workingPersona: string): void;
    /**
     * Complete a delegation
     */
    completeDelegation(allData: Map<string, BackgroundData>, delegationId: string, completingPersona: string, outcome: string): void;
    /**
     * Return a delegation to the original persona
     */
    returnDelegation(allData: Map<string, BackgroundData>, delegationId: string, returningPersona: string, reason: string): void;
    /**
     * Get user's delegations
     */
    getUserDelegations(userId: string, filter?: {
        status?: Delegation['status'];
        fromPersona?: string;
        toPersona?: string;
    }): Promise<Delegation[]>;
    /**
     * Get active delegations for a persona
     */
    getActiveDelegationsForPersona(userId: string, personaId: string): Promise<Delegation[]>;
    /**
     * Get pending delegations for a persona to accept
     */
    getPendingDelegationsForPersona(userId: string, personaId: string): Promise<Delegation[]>;
}
//# sourceMappingURL=delegation-service.d.ts.map