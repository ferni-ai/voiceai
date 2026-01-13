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
import { getLogger } from '../../utils/safe-logger.js';
// ============================================================================
// DELEGATION SERVICE
// ============================================================================
export class DelegationService extends EventEmitter {
    getUserData;
    markDirty;
    constructor(getUserData, markDirty) {
        super();
        this.getUserData = getUserData;
        this.markDirty = markDirty;
    }
    // ============================================================================
    // DELEGATION OPERATIONS
    // ============================================================================
    /**
     * Delegate a task to another persona
     */
    async createDelegation(params) {
        const delegation = {
            id: `delegation_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            userId: params.userId,
            taskDescription: params.taskDescription,
            context: params.context,
            fromPersona: params.fromPersona,
            toPersona: params.toPersona,
            status: 'delegated',
            originalRequest: params.originalRequest,
            updates: [
                {
                    timestamp: new Date(),
                    from: params.fromPersona,
                    message: `Delegated to ${params.toPersona}: ${params.taskDescription}`,
                },
            ],
            createdAt: new Date(),
        };
        const userData = await this.getUserData(params.userId);
        userData.delegations.push(delegation);
        this.markDirty(params.userId);
        getLogger().info({
            delegationId: delegation.id,
            from: params.fromPersona,
            to: params.toPersona,
        }, '🤝 Task delegated');
        this.emit('delegation_created', delegation);
        return delegation;
    }
    /**
     * Get delegation by ID from all user data
     */
    getDelegationFromData(allData, delegationId) {
        for (const [userId, data] of allData.entries()) {
            const delegation = data.delegations.find((d) => d.id === delegationId);
            if (delegation)
                return { delegation, userId };
        }
        return undefined;
    }
    /**
     * Update delegation status
     */
    updateDelegation(allData, delegationId, update) {
        const result = this.getDelegationFromData(allData, delegationId);
        if (!result)
            return;
        const { delegation, userId } = result;
        if (update.status) {
            delegation.status = update.status;
            if (update.status === 'accepted')
                delegation.acceptedAt = new Date();
            if (update.status === 'completed')
                delegation.completedAt = new Date();
        }
        if (update.outcome)
            delegation.outcome = update.outcome;
        if (update.message && update.from) {
            delegation.updates.push({
                timestamp: new Date(),
                from: update.from,
                message: update.message,
            });
        }
        this.markDirty(userId);
        this.emit('delegation_updated', delegation);
    }
    /**
     * Accept a delegation
     */
    acceptDelegation(allData, delegationId, acceptingPersona) {
        this.updateDelegation(allData, delegationId, {
            status: 'accepted',
            from: acceptingPersona,
            message: `Delegation accepted by ${acceptingPersona}`,
        });
    }
    /**
     * Mark delegation as in progress
     */
    startDelegation(allData, delegationId, workingPersona) {
        this.updateDelegation(allData, delegationId, {
            status: 'in_progress',
            from: workingPersona,
            message: `Work in progress by ${workingPersona}`,
        });
    }
    /**
     * Complete a delegation
     */
    completeDelegation(allData, delegationId, completingPersona, outcome) {
        this.updateDelegation(allData, delegationId, {
            status: 'completed',
            from: completingPersona,
            message: `Delegation completed: ${outcome}`,
            outcome,
        });
    }
    /**
     * Return a delegation to the original persona
     */
    returnDelegation(allData, delegationId, returningPersona, reason) {
        this.updateDelegation(allData, delegationId, {
            status: 'returned',
            from: returningPersona,
            message: `Delegation returned: ${reason}`,
        });
    }
    /**
     * Get user's delegations
     */
    async getUserDelegations(userId, filter) {
        const userData = await this.getUserData(userId);
        let delegations = userData.delegations;
        if (filter?.status) {
            delegations = delegations.filter((d) => d.status === filter.status);
        }
        if (filter?.fromPersona) {
            delegations = delegations.filter((d) => d.fromPersona === filter.fromPersona);
        }
        if (filter?.toPersona) {
            delegations = delegations.filter((d) => d.toPersona === filter.toPersona);
        }
        return delegations;
    }
    /**
     * Get active delegations for a persona
     */
    async getActiveDelegationsForPersona(userId, personaId) {
        return this.getUserDelegations(userId, {
            toPersona: personaId,
            status: 'in_progress',
        });
    }
    /**
     * Get pending delegations for a persona to accept
     */
    async getPendingDelegationsForPersona(userId, personaId) {
        return this.getUserDelegations(userId, {
            toPersona: personaId,
            status: 'delegated',
        });
    }
}
//# sourceMappingURL=delegation-service.js.map