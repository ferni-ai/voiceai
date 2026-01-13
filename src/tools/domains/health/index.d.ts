/**
 * Health & Physical Wellness Domain Tools
 *
 * Tools for supporting physical health, exercise, nutrition, sleep, and energy.
 * This domain addresses the foundational importance of physical wellness.
 *
 * IMPORTANT: These tools do NOT provide medical advice. They support
 * healthy behaviors and encourage professional consultation when appropriate.
 *
 * DOMAIN: health
 * TOOLS:
 *   Exercise: logExercise, suggestWorkout, trackFitnessGoal
 *   Nutrition: coachOnNutrition, planMeals, trackHydration
 *   Sleep: analyzeSleepPattern, suggestSleepHygiene, trackSleepGoal
 *   Health Tracking: logSymptom, prepareForDoctorVisit, remindPreventiveCare
 *   Energy: assessEnergyLevel, suggestEnergyBoost
 */
import type { ToolDefinition } from '../../registry/types.js';
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { createMedicationTools, addMedication, logDose, updateMedication, discontinueMedication, getDueDoses, getUpcomingDoses, getMedsNeedingRefill, getUserMedications, } from '../wellness/medications.js';
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map