/**
 * Appointment Follow-up Service
 *
 * Manages follow-up on appointments that are in "calling" status:
 * - Tracks call attempts
 * - Schedules retry calls
 * - Sends status updates to users
 * - Coordinates with Jordan for life event appointments
 *
 * This ensures no appointment request falls through the cracks.
 *
 * PERSISTENCE: Appointments are persisted to Firestore to survive server restarts.
 */
import { EventEmitter } from 'events';
import admin from 'firebase-admin';
import { removeUndefined } from '../../utils/firestore-utils.js';
import { clearNamedInterval, registerInterval } from '../../utils/interval-manager.js';
import { getLogger } from '../../utils/safe-logger.js';
import { getAgentBus } from '../agent-bus.js';
// ============================================================================
// FIRESTORE SETUP
// ============================================================================
const APPOINTMENTS_COLLECTION = 'tracked_appointments';
function getFirestore() {
    try {
        return admin.firestore();
    }
    catch {
        return null;
    }
}
const DEFAULT_CONFIG = {
    maxCallAttempts: 3,
    retryDelayMinutes: 30,
    escalateAfterAttempts: 2,
    notifyUserAfterAttempts: 1,
};
// ============================================================================
// FOLLOW-UP SERVICE
// ============================================================================
class AppointmentFollowUpService extends EventEmitter {
    appointments = new Map();
    followUpTimers = new Map();
    config;
    isRunning = false;
    checkInterval = null;
    initialized = false;
    constructor(config = {}) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Initialize and load pending appointments from Firestore
     */
    async initialize() {
        if (this.initialized)
            return;
        const db = getFirestore();
        if (db) {
            try {
                // Load all pending/calling appointments
                const snapshot = await db
                    .collection(APPOINTMENTS_COLLECTION)
                    .where('status', 'in', ['pending', 'calling', 'awaiting_callback'])
                    .get();
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    const appointment = {
                        ...data,
                        requestedDateTime: data.requestedDateTime?.toDate?.() || new Date(data.requestedDateTime),
                        confirmedDateTime: data.confirmedDateTime?.toDate?.() ||
                            (data.confirmedDateTime ? new Date(data.confirmedDateTime) : undefined),
                        lastCallAt: data.lastCallAt?.toDate?.() ||
                            (data.lastCallAt ? new Date(data.lastCallAt) : undefined),
                        nextFollowUpAt: data.nextFollowUpAt?.toDate?.() ||
                            (data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : undefined),
                        createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
                        updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
                    };
                    this.appointments.set(appointment.id, appointment);
                    // Reschedule follow-ups for pending appointments
                    if (appointment.status === 'calling' || appointment.status === 'pending') {
                        this.scheduleFollowUp(appointment.id);
                    }
                });
                getLogger().info({ count: this.appointments.size }, '📞 Loaded pending appointments from Firestore');
            }
            catch (error) {
                getLogger().error({ error }, 'Failed to load appointments from Firestore');
            }
        }
        this.initialized = true;
    }
    /**
     * Save appointment to Firestore
     */
    async saveAppointment(appointment) {
        const db = getFirestore();
        if (!db)
            return;
        try {
            await db
                .collection(APPOINTMENTS_COLLECTION)
                .doc(appointment.id)
                .set(removeUndefined({
                ...appointment,
                requestedDateTime: appointment.requestedDateTime,
                confirmedDateTime: appointment.confirmedDateTime || null,
                lastCallAt: appointment.lastCallAt || null,
                nextFollowUpAt: appointment.nextFollowUpAt || null,
                createdAt: appointment.createdAt,
                updatedAt: appointment.updatedAt,
            }));
        }
        catch (error) {
            getLogger().error({ error, appointmentId: appointment.id }, 'Failed to save appointment to Firestore');
        }
    }
    /**
     * Start the follow-up service
     */
    async start() {
        if (this.isRunning)
            return;
        // Initialize first
        await this.initialize();
        this.isRunning = true;
        // Check for appointments needing follow-up every 5 minutes
        registerInterval('appointment-followup-checker', () => {
            this.checkPendingAppointments();
        }, 5 * 60 * 1000);
        getLogger().info('📞 Appointment follow-up service started');
    }
    /**
     * Stop the follow-up service
     */
    stop() {
        this.isRunning = false;
        clearNamedInterval('appointment-followup-checker');
        this.checkInterval = null;
        // Clear all timers
        for (const timer of this.followUpTimers.values()) {
            clearTimeout(timer);
        }
        this.followUpTimers.clear();
        getLogger().info('📞 Appointment follow-up service stopped');
    }
    /**
     * Track a new appointment for follow-up
     */
    trackAppointment(appointment) {
        const tracked = {
            ...appointment,
            callAttempts: 0,
            // Use provided maxCallAttempts if set, otherwise use config default
            maxCallAttempts: appointment.maxCallAttempts || this.config.maxCallAttempts,
            notes: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        this.appointments.set(tracked.id, tracked);
        // Persist to Firestore
        void this.saveAppointment(tracked);
        getLogger().info({
            id: tracked.id,
            business: tracked.businessName,
            status: tracked.status,
        }, '📞 Tracking appointment for follow-up');
        // If already in calling status, schedule follow-up
        if (tracked.status === 'calling' || tracked.status === 'pending') {
            this.scheduleFollowUp(tracked.id);
        }
        return tracked;
    }
    /**
     * Update appointment status
     */
    updateStatus(id, status, additionalInfo) {
        const appointment = this.appointments.get(id);
        if (!appointment)
            return null;
        appointment.status = status;
        appointment.updatedAt = new Date();
        if (additionalInfo?.confirmationNumber) {
            appointment.confirmationNumber = additionalInfo.confirmationNumber;
        }
        if (additionalInfo?.confirmedDateTime) {
            appointment.confirmedDateTime = additionalInfo.confirmedDateTime;
        }
        if (additionalInfo?.note) {
            appointment.notes.push(`[${new Date().toISOString()}] ${additionalInfo.note}`);
        }
        this.appointments.set(id, appointment);
        // Persist to Firestore
        void this.saveAppointment(appointment);
        // Cancel any pending follow-up if resolved
        if (['confirmed', 'failed', 'cancelled'].includes(status)) {
            this.cancelFollowUp(id);
            this.emit('appointment_resolved', appointment);
        }
        // Notify relevant parties
        this.notifyStatusChange(appointment);
        getLogger().info({
            id,
            business: appointment.businessName,
            status,
        }, '📞 Appointment status updated');
        return appointment;
    }
    /**
     * Record a call attempt
     */
    recordCallAttempt(id, result) {
        const appointment = this.appointments.get(id);
        if (!appointment)
            return;
        appointment.callAttempts++;
        appointment.lastCallAt = new Date();
        appointment.notes.push(`[${new Date().toISOString()}] Call attempt ${appointment.callAttempts}: ${result}`);
        appointment.updatedAt = new Date();
        if (result === 'connected') {
            appointment.status = 'awaiting_callback';
            this.emit('call_connected', appointment);
        }
        else if (appointment.callAttempts >= appointment.maxCallAttempts) {
            appointment.status = 'failed';
            appointment.notes.push(`Max call attempts (${appointment.maxCallAttempts}) reached`);
            this.emit('max_attempts_reached', appointment);
            void this.notifyMaxAttemptsReached(appointment);
        }
        else {
            // Schedule retry
            this.scheduleFollowUp(id);
            // Notify user if threshold reached
            if (appointment.callAttempts >= this.config.notifyUserAfterAttempts) {
                void this.notifyUserOfDelay(appointment);
            }
        }
        this.appointments.set(id, appointment);
        // Persist to Firestore
        void this.saveAppointment(appointment);
    }
    /**
     * Schedule a follow-up call
     */
    scheduleFollowUp(id) {
        const appointment = this.appointments.get(id);
        if (!appointment)
            return;
        // Cancel existing timer
        this.cancelFollowUp(id);
        const delayMs = this.config.retryDelayMinutes * 60 * 1000;
        appointment.nextFollowUpAt = new Date(Date.now() + delayMs);
        const timer = setTimeout(() => {
            this.executeFollowUp(id);
        }, delayMs);
        this.followUpTimers.set(id, timer);
        getLogger().debug({
            id,
            nextFollowUp: appointment.nextFollowUpAt.toISOString(),
        }, 'Follow-up scheduled');
    }
    /**
     * Cancel a scheduled follow-up
     */
    cancelFollowUp(id) {
        const timer = this.followUpTimers.get(id);
        if (timer) {
            clearTimeout(timer);
            this.followUpTimers.delete(id);
        }
    }
    /**
     * Execute a follow-up action
     */
    executeFollowUp(id) {
        const appointment = this.appointments.get(id);
        if (!appointment || appointment.status === 'confirmed' || appointment.status === 'cancelled') {
            return;
        }
        getLogger().info({
            id,
            business: appointment.businessName,
            attempt: appointment.callAttempts + 1,
        }, '📞 Executing follow-up');
        // Emit event for the voice agent to handle
        this.emit('follow_up_needed', appointment);
    }
    /**
     * Check all pending appointments
     */
    checkPendingAppointments() {
        const now = new Date();
        for (const appointment of this.appointments.values()) {
            // Skip resolved appointments
            if (['confirmed', 'failed', 'cancelled'].includes(appointment.status)) {
                continue;
            }
            // Check if follow-up is overdue
            if (appointment.nextFollowUpAt && appointment.nextFollowUpAt < now) {
                this.executeFollowUp(appointment.id);
            }
            // Check if appointment date has passed without confirmation
            if (appointment.requestedDateTime < now && appointment.status !== 'confirmed') {
                appointment.notes.push('Appointment date passed without confirmation');
                this.updateStatus(appointment.id, 'failed', {
                    note: 'Appointment time passed without confirmation',
                });
            }
        }
    }
    /**
     * Notify relevant parties of status change
     */
    notifyStatusChange(appointment) {
        // Notify Jordan if this is a life event appointment
        if (appointment.linkedMilestoneId || appointment.type === 'life_event') {
            getAgentBus().notify('alex', 'jordan', 'appointment_status_update', {
                appointmentId: appointment.id,
                eventName: appointment.linkedEventName,
                vendor: appointment.businessName,
                status: appointment.status,
                confirmationNumber: appointment.confirmationNumber,
                confirmedDateTime: appointment.confirmedDateTime?.toISOString(),
            }, appointment.userId);
        }
    }
    /**
     * Notify user of delay in booking
     */
    async notifyUserOfDelay(appointment) {
        // Note: In production, we'd look up the user's phone from their profile
        // For now, we log the notification intent
        getLogger().info({
            userId: appointment.userId,
            business: appointment.businessName,
            attempts: appointment.callAttempts,
        }, '📱 Would notify user of booking delay');
    }
    /**
     * Notify user that max attempts reached
     */
    async notifyMaxAttemptsReached(appointment) {
        // Note: In production, we'd look up the user's phone from their profile
        getLogger().info({
            userId: appointment.userId,
            business: appointment.businessName,
            attempts: appointment.callAttempts,
        }, '📱 Would notify user of max attempts reached');
        // Also notify Jordan if life event
        if (appointment.linkedMilestoneId) {
            getAgentBus().notify('alex', 'jordan', 'appointment_needs_help', {
                appointmentId: appointment.id,
                eventName: appointment.linkedEventName,
                vendor: appointment.businessName,
                attempts: appointment.callAttempts,
                message: `Couldn't reach ${appointment.businessName} for the ${appointment.linkedEventName}. User has been notified.`,
            }, appointment.userId);
        }
    }
    /**
     * Get all appointments for a user
     */
    getAppointments(userId) {
        return Array.from(this.appointments.values()).filter((a) => a.userId === userId);
    }
    /**
     * Get pending appointments needing attention
     */
    getPendingAppointments() {
        return Array.from(this.appointments.values()).filter((a) => ['pending', 'calling', 'awaiting_callback'].includes(a.status));
    }
    /**
     * Get appointment by ID
     */
    getAppointment(id) {
        return this.appointments.get(id);
    }
    /**
     * Clean up old resolved appointments (older than 30 days)
     */
    cleanup() {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        for (const [id, appointment] of this.appointments.entries()) {
            if (['confirmed', 'failed', 'cancelled'].includes(appointment.status) &&
                appointment.updatedAt < thirtyDaysAgo) {
                this.appointments.delete(id);
            }
        }
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let followUpService = null;
export function getAppointmentFollowUpService() {
    if (!followUpService) {
        followUpService = new AppointmentFollowUpService();
    }
    return followUpService;
}
export function startAppointmentFollowUp() {
    void getAppointmentFollowUpService().start();
}
export function stopAppointmentFollowUp() {
    if (followUpService) {
        followUpService.stop();
        followUpService = null;
    }
}
export default AppointmentFollowUpService;
//# sourceMappingURL=appointment-followup.js.map