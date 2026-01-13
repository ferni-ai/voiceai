/**
 * Medication Reminders Tool
 *
 * Track medications, dosages, and schedules.
 * Critical health tool - reliability is paramount.
 *
 * Features:
 * - Multiple medication tracking
 * - Flexible schedules
 * - Refill reminders
 * - Missed dose alerts
 * - History logging
 */
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { sanitizePlainText } from '../../validation.js';
import { getProductivityStore, } from '../../../services/stores/productivity-store.js';
import { getLogger, generateId } from '../../utils/tool-helpers.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { syncMedicationToCalendar } from '../../../services/calendar/calendar-bridge.js';
// Bridge functions for persistence
function medDataToMed(data, userId) {
    return {
        id: data.id,
        userId,
        name: data.name,
        dosage: data.dosage,
        frequency: data.frequency,
        scheduledTimes: data.scheduledTimes,
        doseLabels: data.doseLabels,
        instructions: data.instructions,
        purpose: data.purpose,
        prescriber: data.prescriber,
        pharmacy: data.pharmacy,
        pillsRemaining: data.pillsRemaining,
        refillAt: data.refillAt,
        lastRefillDate: data.lastRefillDate ? new Date(data.lastRefillDate) : undefined,
        isActive: data.isActive,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
    };
}
function medToMedData(med) {
    return {
        id: med.id,
        name: med.name,
        dosage: med.dosage,
        frequency: med.frequency,
        scheduledTimes: med.scheduledTimes,
        doseLabels: med.doseLabels,
        instructions: med.instructions,
        purpose: med.purpose,
        prescriber: med.prescriber,
        pharmacy: med.pharmacy,
        pillsRemaining: med.pillsRemaining,
        refillAt: med.refillAt,
        lastRefillDate: med.lastRefillDate?.toISOString(),
        isActive: med.isActive,
        createdAt: med.createdAt.toISOString(),
        updatedAt: med.updatedAt.toISOString(),
    };
}
function logToLogData(log) {
    return {
        id: log.id,
        medicationId: log.medicationId,
        scheduledTime: log.scheduledTime,
        takenAt: log.takenAt?.toISOString(),
        skipped: log.skipped,
        notes: log.notes,
        date: log.date.toISOString(),
    };
}
// ============================================================================
// STORAGE - Uses ProductivityStore for persistence
// ============================================================================
const medsCache = new Map();
const logsCache = new Map();
const loadedUsers = new Set();
async function ensureUserMedsLoaded(userId) {
    if (loadedUsers.has(userId))
        return;
    try {
        const store = getProductivityStore();
        await store.loadUserData(userId);
        const medDataList = store.getUserMedications(userId);
        for (const data of medDataList) {
            medsCache.set(data.id, medDataToMed(data, userId));
        }
        const logDataList = store.getUserDoseLogs(userId);
        for (const data of logDataList) {
            logsCache.set(data.id, {
                id: data.id,
                medicationId: data.medicationId,
                userId,
                scheduledTime: data.scheduledTime,
                takenAt: data.takenAt ? new Date(data.takenAt) : undefined,
                skipped: data.skipped,
                notes: data.notes,
                date: new Date(data.date),
            });
        }
        loadedUsers.add(userId);
        getLogger().debug({ userId, meds: medDataList.length }, 'Loaded medications from store');
    }
    catch (error) {
        getLogger().warn({ error, userId }, 'Failed to load medications from store');
        loadedUsers.add(userId);
    }
}
function persistMed(userId, med) {
    try {
        const store = getProductivityStore();
        store.setMedication(userId, medToMedData(med));
    }
    catch (error) {
        getLogger().warn({ error, medId: med.id }, 'Failed to persist medication');
    }
}
function persistDoseLog(userId, doseLog) {
    try {
        const store = getProductivityStore();
        store.setDoseLog(userId, logToLogData(doseLog));
    }
    catch (error) {
        getLogger().warn({ error, logId: doseLog.id }, 'Failed to persist dose log');
    }
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function getUserMedications(userId) {
    return Array.from(medsCache.values())
        .filter((m) => m.userId === userId && m.isActive)
        .sort((a, b) => a.name.localeCompare(b.name));
}
function getScheduledTimesForFrequency(frequency) {
    switch (frequency) {
        case 'once_daily':
            return { times: ['08:00'], labels: ['morning'] };
        case 'twice_daily':
            return { times: ['08:00', '20:00'], labels: ['morning', 'evening'] };
        case 'three_times_daily':
            return { times: ['08:00', '14:00', '20:00'], labels: ['morning', 'afternoon', 'evening'] };
        case 'four_times_daily':
            return {
                times: ['08:00', '12:00', '18:00', '22:00'],
                labels: ['morning', 'afternoon', 'evening', 'bedtime'],
            };
        case 'every_other_day':
            return { times: ['08:00'], labels: ['morning'] };
        case 'weekly':
            return { times: ['08:00'], labels: ['morning'] };
        default:
            return { times: [], labels: [] };
    }
}
function getTodayLogs(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from(logsCache.values()).filter((log) => {
        if (log.userId !== userId)
            return false;
        const logDate = new Date(log.date);
        logDate.setHours(0, 0, 0, 0);
        return logDate.getTime() === today.getTime();
    });
}
function getDueDoses(userId) {
    const userMeds = getUserMedications(userId);
    const todayLogs = getTodayLogs(userId);
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const due = [];
    for (const med of userMeds) {
        for (let i = 0; i < med.scheduledTimes.length; i++) {
            const schedTime = med.scheduledTimes[i];
            const label = med.doseLabels[i] || 'custom';
            // Check if already taken today
            const alreadyLogged = todayLogs.some((log) => log.medicationId === med.id &&
                log.scheduledTime === schedTime &&
                (log.takenAt || log.skipped));
            if (!alreadyLogged && schedTime <= currentTime) {
                due.push({ medication: med, scheduledTime: schedTime, label });
            }
        }
    }
    return due;
}
function getUpcomingDoses(userId) {
    const userMeds = getUserMedications(userId);
    const todayLogs = getTodayLogs(userId);
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const upcoming = [];
    for (const med of userMeds) {
        for (let i = 0; i < med.scheduledTimes.length; i++) {
            const schedTime = med.scheduledTimes[i];
            const label = med.doseLabels[i] || 'custom';
            // Check if already taken today
            const alreadyLogged = todayLogs.some((log) => log.medicationId === med.id &&
                log.scheduledTime === schedTime &&
                (log.takenAt || log.skipped));
            if (!alreadyLogged && schedTime > currentTime) {
                upcoming.push({ medication: med, scheduledTime: schedTime, label });
            }
        }
    }
    return upcoming.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
}
function getMedsNeedingRefill(userId) {
    return getUserMedications(userId).filter((med) => {
        if (!med.pillsRemaining || !med.refillAt)
            return false;
        return med.pillsRemaining <= med.refillAt;
    });
}
function formatTime(time24) {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
export async function addMedication(params) {
    const schedule = params.customTimes
        ? { times: params.customTimes, labels: params.customTimes.map(() => 'custom') }
        : getScheduledTimesForFrequency(params.frequency);
    const medication = {
        id: generateId('med'),
        userId: params.userId,
        name: sanitizePlainText(params.name, 100),
        dosage: sanitizePlainText(params.dosage, 50),
        frequency: params.frequency,
        scheduledTimes: schedule.times,
        doseLabels: schedule.labels,
        instructions: params.instructions ? sanitizePlainText(params.instructions, 200) : undefined,
        purpose: params.purpose,
        pillsRemaining: params.pillsRemaining,
        refillAt: params.refillAt ?? 7, // Default: remind at 7 pills left
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    // Save to cache and persist
    medsCache.set(medication.id, medication);
    persistMed(params.userId, medication);
    getLogger().info({ medId: medication.id, name: medication.name }, 'Medication added');
    // Sync each scheduled time to calendar for today
    // This creates calendar events for medication reminders
    const today = new Date();
    for (const time of medication.scheduledTimes) {
        const [hours, minutes] = time.split(':').map(Number);
        const scheduledFor = new Date(today);
        scheduledFor.setHours(hours, minutes, 0, 0);
        // If time has passed today, schedule for tomorrow
        if (scheduledFor <= today) {
            scheduledFor.setDate(scheduledFor.getDate() + 1);
        }
        try {
            await syncMedicationToCalendar(params.userId, `${medication.id}_${time}`, medication.name, medication.dosage, scheduledFor, {
                instructions: medication.instructions,
                isRecurring: medication.frequency !== 'as_needed',
            });
        }
        catch (calendarError) {
            getLogger().warn({ error: String(calendarError), medId: medication.id }, 'Failed to sync medication to calendar');
        }
    }
    return medication;
}
export function logDose(params) {
    const med = medsCache.get(params.medicationId);
    const log = {
        id: generateId('dose'),
        medicationId: params.medicationId,
        userId: params.userId,
        scheduledTime: params.scheduledTime,
        takenAt: params.taken ? new Date() : undefined,
        skipped: !params.taken,
        notes: params.notes,
        date: new Date(),
    };
    // Save to cache and persist
    logsCache.set(log.id, log);
    persistDoseLog(params.userId, log);
    // Update pill count if taken
    if (params.taken && med?.pillsRemaining) {
        med.pillsRemaining -= 1;
        med.updatedAt = new Date();
        medsCache.set(med.id, med);
        persistMed(med.userId, med);
    }
    return log;
}
export function updateMedication(medId, updates) {
    const med = medsCache.get(medId);
    if (!med)
        return null;
    if (updates.dosage)
        med.dosage = updates.dosage;
    if (updates.frequency) {
        med.frequency = updates.frequency;
        const schedule = getScheduledTimesForFrequency(updates.frequency);
        med.scheduledTimes = schedule.times;
        med.doseLabels = schedule.labels;
    }
    if (updates.instructions !== undefined)
        med.instructions = updates.instructions;
    if (updates.pillsRemaining !== undefined)
        med.pillsRemaining = updates.pillsRemaining;
    med.updatedAt = new Date();
    // Save to cache and persist
    medsCache.set(medId, med);
    persistMed(med.userId, med);
    return med;
}
export function discontinueMedication(medId) {
    const med = medsCache.get(medId);
    if (!med)
        return false;
    med.isActive = false;
    med.updatedAt = new Date();
    // Save to cache and persist
    medsCache.set(medId, med);
    persistMed(med.userId, med);
    return true;
}
// ============================================================================
// TOOL DEFINITIONS
// ============================================================================
// Export helper functions for use by other modules
export { getDueDoses, getUpcomingDoses, getMedsNeedingRefill, getUserMedications };
export function createMedicationTools() {
    return {
        addMedication: llm.tool({
            description: getToolDescription('addMedication'),
            parameters: z.object({
                name: z.string().describe('Medication name'),
                dosage: z.string().describe('Dosage (e.g., "10mg", "2 tablets")'),
                frequency: z
                    .enum([
                    'once_daily',
                    'twice_daily',
                    'three_times_daily',
                    'four_times_daily',
                    'every_other_day',
                    'weekly',
                    'as_needed',
                ])
                    .describe('How often to take'),
                instructions: z
                    .string()
                    .optional()
                    .describe('Special instructions (e.g., "Take with food")'),
                purpose: z.string().optional().describe('What it\'s for (e.g., "Blood pressure")'),
                pillCount: z.number().optional().describe('Current pill count for refill tracking'),
            }),
            execute: async ({ name, dosage, frequency, instructions, purpose, pillCount }, { ctx }) => {
                const userData = ctx?.userData;
                const userId = userData?.userId || 'default';
                await ensureUserMedsLoaded(userId);
                const med = await addMedication({
                    userId,
                    name,
                    dosage,
                    frequency,
                    instructions,
                    purpose,
                    pillsRemaining: pillCount,
                });
                let response = `Added: **${med.name}** (${med.dosage})\n`;
                response += `Schedule: ${med.frequency.replace(/_/g, ' ')}\n`;
                if (med.scheduledTimes.length > 0) {
                    response += `Times: ${med.scheduledTimes.map(formatTime).join(', ')}\n`;
                }
                if (instructions) {
                    response += `Note: ${instructions}\n`;
                }
                if (pillCount) {
                    response += `${pillCount} pills - I'll remind you to refill\n`;
                }
                response += `\nI'll remind you when it's time to take your ${name}. Added to your calendar too.`;
                return response;
            },
        }),
        takeMedication: llm.tool({
            description: getToolDescription('takeMedication'),
            parameters: z.object({
                medicationName: z.string().describe('Which medication was taken'),
                notes: z.string().optional().describe('Any notes'),
            }),
            execute: async ({ medicationName, notes }, { ctx }) => {
                const userData = ctx?.userData;
                const userId = userData?.userId || 'default';
                await ensureUserMedsLoaded(userId);
                const userMeds = getUserMedications(userId);
                const med = userMeds.find((m) => m.name.toLowerCase().includes(medicationName.toLowerCase()));
                if (!med) {
                    return `I couldn't find "${medicationName}" in your medications. Your tracked medications:\n${userMeds.map((m) => `• ${m.name}`).join('\n') || 'None yet'}`;
                }
                // Find the current scheduled time
                const now = new Date();
                const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
                // Find closest scheduled time
                let scheduledTime = med.scheduledTimes[0] || currentTime;
                for (const time of med.scheduledTimes) {
                    if (time <= currentTime) {
                        scheduledTime = time;
                    }
                }
                const log = logDose({
                    medicationId: med.id,
                    userId,
                    scheduledTime,
                    taken: true,
                    notes,
                });
                let response = `✅ Logged: ${med.name} (${med.dosage}) taken`;
                if (med.pillsRemaining !== undefined) {
                    response += `\n💊 ${med.pillsRemaining} pills remaining`;
                    if (med.refillAt && med.pillsRemaining <= med.refillAt) {
                        response += `\n⚠️ Time to refill soon!`;
                    }
                }
                // Check remaining doses today
                const upcoming = getUpcomingDoses(userId);
                const todayRemaining = upcoming.filter((d) => d.medication.id === med.id);
                if (todayRemaining.length > 0) {
                    response += `\n\nNext dose: ${formatTime(todayRemaining[0].scheduledTime)}`;
                }
                return response;
            },
        }),
        skipMedication: llm.tool({
            description: getToolDescription('skipMedication'),
            parameters: z.object({
                medicationName: z.string().describe('Which medication'),
                reason: z.string().optional().describe('Why skipping'),
            }),
            execute: async ({ medicationName, reason }, { ctx }) => {
                const userData = ctx?.userData;
                const userId = userData?.userId || 'default';
                await ensureUserMedsLoaded(userId);
                const userMeds = getUserMedications(userId);
                const med = userMeds.find((m) => m.name.toLowerCase().includes(medicationName.toLowerCase()));
                if (!med) {
                    return `Couldn't find "${medicationName}".`;
                }
                const now = new Date();
                const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
                let scheduledTime = med.scheduledTimes[0] || currentTime;
                for (const time of med.scheduledTimes) {
                    if (time <= currentTime) {
                        scheduledTime = time;
                    }
                }
                logDose({
                    medicationId: med.id,
                    userId,
                    scheduledTime,
                    taken: false,
                    notes: reason,
                });
                let response = `⏭️ Skipped: ${med.name}`;
                if (reason) {
                    response += ` (${reason})`;
                }
                response += `\n\n⚠️ Talk to your doctor if you're having trouble with this medication.`;
                return response;
            },
        }),
        getMedicationSchedule: llm.tool({
            description: getToolDescription('getMedicationSchedule'),
            parameters: z.object({}),
            execute: async (_, { ctx }) => {
                const userData = ctx?.userData;
                const userId = userData?.userId || 'default';
                await ensureUserMedsLoaded(userId);
                const userMeds = getUserMedications(userId);
                if (userMeds.length === 0) {
                    return `No medications tracked. Say "add medication" to start tracking.`;
                }
                const due = getDueDoses(userId);
                const upcoming = getUpcomingDoses(userId);
                const todayLogs = getTodayLogs(userId);
                const taken = todayLogs.filter((l) => l.takenAt);
                let response = `💊 **Today's Medications**\n\n`;
                // Due now
                if (due.length > 0) {
                    response += `**⚠️ Due Now:**\n`;
                    due.forEach((d) => {
                        response += `  • ${d.medication.name} (${d.medication.dosage}) - ${d.label}\n`;
                    });
                    response += '\n';
                }
                // Upcoming
                if (upcoming.length > 0) {
                    response += `**Coming Up:**\n`;
                    upcoming.forEach((d) => {
                        response += `  • ${formatTime(d.scheduledTime)} - ${d.medication.name} (${d.medication.dosage})\n`;
                    });
                    response += '\n';
                }
                // Taken today
                if (taken.length > 0) {
                    response += `**✅ Taken Today:** ${taken.length}\n`;
                }
                // Refill warnings
                const needRefill = getMedsNeedingRefill(userId);
                if (needRefill.length > 0) {
                    response += `\n⚠️ **Need Refill:**\n`;
                    needRefill.forEach((m) => {
                        response += `  • ${m.name} - ${m.pillsRemaining} pills left\n`;
                    });
                }
                return response;
            },
        }),
        getAllMedications: llm.tool({
            description: getToolDescription('getAllMedications'),
            parameters: z.object({}),
            execute: async (_, { ctx }) => {
                const userData = ctx?.userData;
                const userId = userData?.userId || 'default';
                await ensureUserMedsLoaded(userId);
                const userMeds = getUserMedications(userId);
                if (userMeds.length === 0) {
                    return `No medications tracked. Say "add [medication name]" to start.`;
                }
                let response = `💊 **Your Medications** (${userMeds.length})\n\n`;
                userMeds.forEach((med) => {
                    response += `**${med.name}** - ${med.dosage}\n`;
                    response += `  Schedule: ${med.frequency.replace(/_/g, ' ')}\n`;
                    response += `  Times: ${med.scheduledTimes.map(formatTime).join(', ')}\n`;
                    if (med.purpose) {
                        response += `  For: ${med.purpose}\n`;
                    }
                    if (med.instructions) {
                        response += `  📝 ${med.instructions}\n`;
                    }
                    if (med.pillsRemaining !== undefined) {
                        response += `  💊 ${med.pillsRemaining} pills remaining\n`;
                    }
                    response += '\n';
                });
                return response;
            },
        }),
        updatePillCount: llm.tool({
            description: getToolDescription('updatePillCount'),
            parameters: z.object({
                medicationName: z.string().describe('Which medication'),
                newCount: z.number().describe('New pill count'),
            }),
            execute: async ({ medicationName, newCount }, { ctx }) => {
                const userData = ctx?.userData;
                const userId = userData?.userId || 'default';
                await ensureUserMedsLoaded(userId);
                const userMeds = getUserMedications(userId);
                const med = userMeds.find((m) => m.name.toLowerCase().includes(medicationName.toLowerCase()));
                if (!med) {
                    return `Couldn't find "${medicationName}".`;
                }
                const updated = updateMedication(med.id, { pillsRemaining: newCount });
                if (!updated)
                    return `Couldn't update that medication. Try again?`;
                updated.lastRefillDate = new Date();
                // Save to cache and persist
                medsCache.set(updated.id, updated);
                persistMed(updated.userId, updated);
                return `✅ Updated ${updated.name}: ${newCount} pills\nI'll remind you when you're running low.`;
            },
        }),
        stopMedication: llm.tool({
            description: getToolDescription('stopMedication'),
            parameters: z.object({
                medicationName: z.string().describe('Which medication'),
                reason: z.string().optional().describe('Why stopping'),
                confirm: z.boolean().describe('User confirmed'),
            }),
            execute: async ({ medicationName, reason, confirm }, { ctx }) => {
                if (!confirm) {
                    return `Are you sure you want to stop tracking "${medicationName}"? This should only be done if you've stopped taking this medication. Say "yes, stop tracking" to confirm.`;
                }
                const userData = ctx?.userData;
                const userId = userData?.userId || 'default';
                await ensureUserMedsLoaded(userId);
                const userMeds = getUserMedications(userId);
                const med = userMeds.find((m) => m.name.toLowerCase().includes(medicationName.toLowerCase()));
                if (!med) {
                    return `Couldn't find "${medicationName}".`;
                }
                discontinueMedication(med.id);
                let response = `✅ Stopped tracking: ${med.name}`;
                if (reason) {
                    response += ` (${reason})`;
                }
                response += `\n\n⚠️ Only stop medications as directed by your doctor.`;
                return response;
            },
        }),
        medicationCheckIn: llm.tool({
            description: getToolDescription('medicationCheckIn'),
            parameters: z.object({}),
            execute: async (_, { ctx }) => {
                const userData = ctx?.userData;
                const userId = userData?.userId || 'default';
                await ensureUserMedsLoaded(userId);
                const due = getDueDoses(userId);
                const todayLogs = getTodayLogs(userId);
                const taken = todayLogs.filter((l) => l.takenAt);
                const needRefill = getMedsNeedingRefill(userId);
                if (due.length === 0 && taken.length === 0) {
                    return `No medications due right now. Next check-in later!`;
                }
                let response = `💊 **Quick Check-In**\n\n`;
                if (due.length > 0) {
                    response += `**Time to take:**\n`;
                    due.forEach((d) => {
                        response += `  ⚠️ ${d.medication.name} (${d.medication.dosage})\n`;
                    });
                    response += '\n';
                }
                else {
                    response += `✅ All medications taken so far!\n\n`;
                }
                if (taken.length > 0) {
                    response += `**Taken today:** ${taken.length} dose${taken.length > 1 ? 's' : ''}\n`;
                }
                if (needRefill.length > 0) {
                    response += `\n🔔 Refill needed: ${needRefill.map((m) => m.name).join(', ')}`;
                }
                return response;
            },
        }),
    };
}
export default createMedicationTools;
//# sourceMappingURL=medications.js.map