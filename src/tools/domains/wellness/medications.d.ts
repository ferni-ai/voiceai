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
export type MedicationFrequency = 'once_daily' | 'twice_daily' | 'three_times_daily' | 'four_times_daily' | 'every_other_day' | 'weekly' | 'as_needed' | 'custom';
export type DoseTime = 'morning' | 'afternoon' | 'evening' | 'bedtime' | 'with_food' | 'custom';
export interface Medication {
    id: string;
    userId: string;
    name: string;
    dosage: string;
    frequency: MedicationFrequency;
    scheduledTimes: string[];
    doseLabels: DoseTime[];
    instructions?: string;
    purpose?: string;
    prescriber?: string;
    pharmacy?: string;
    pillsRemaining?: number;
    refillAt?: number;
    lastRefillDate?: Date;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface DoseLog {
    id: string;
    medicationId: string;
    userId: string;
    scheduledTime: string;
    takenAt?: Date;
    skipped: boolean;
    notes?: string;
    date: Date;
}
declare function getUserMedications(userId: string): Medication[];
declare function getDueDoses(userId: string): Array<{
    medication: Medication;
    scheduledTime: string;
    label: DoseTime;
}>;
declare function getUpcomingDoses(userId: string): Array<{
    medication: Medication;
    scheduledTime: string;
    label: DoseTime;
}>;
declare function getMedsNeedingRefill(userId: string): Medication[];
export declare function addMedication(params: {
    userId: string;
    name: string;
    dosage: string;
    frequency: MedicationFrequency;
    customTimes?: string[];
    instructions?: string;
    purpose?: string;
    pillsRemaining?: number;
    refillAt?: number;
}): Promise<Medication>;
export declare function logDose(params: {
    medicationId: string;
    userId: string;
    scheduledTime: string;
    taken: boolean;
    notes?: string;
}): DoseLog;
export declare function updateMedication(medId: string, updates: Partial<Pick<Medication, 'dosage' | 'frequency' | 'instructions' | 'pillsRemaining'>>): Medication | null;
export declare function discontinueMedication(medId: string): boolean;
export { getDueDoses, getUpcomingDoses, getMedsNeedingRefill, getUserMedications };
export declare function createMedicationTools(): {
    addMedication: llm.FunctionTool<{
        name: string;
        dosage: string;
        frequency: "weekly" | "as_needed" | "every_other_day" | "once_daily" | "twice_daily" | "three_times_daily" | "four_times_daily";
        instructions?: string | undefined;
        purpose?: string | undefined;
        pillCount?: number | undefined;
    }, unknown, string>;
    takeMedication: llm.FunctionTool<{
        medicationName: string;
        notes?: string | undefined;
    }, unknown, string>;
    skipMedication: llm.FunctionTool<{
        medicationName: string;
        reason?: string | undefined;
    }, unknown, string>;
    getMedicationSchedule: llm.FunctionTool<Record<string, never>, unknown, string>;
    getAllMedications: llm.FunctionTool<Record<string, never>, unknown, string>;
    updatePillCount: llm.FunctionTool<{
        medicationName: string;
        newCount: number;
    }, unknown, string>;
    stopMedication: llm.FunctionTool<{
        medicationName: string;
        confirm: boolean;
        reason?: string | undefined;
    }, unknown, string>;
    medicationCheckIn: llm.FunctionTool<Record<string, never>, unknown, string>;
};
export default createMedicationTools;
//# sourceMappingURL=medications.d.ts.map