/**
 * Energy & Fatigue Awareness Context Builder
 *
 * Adjusts persona behavior based on:
 * - Time of day (morning energy vs late-night tiredness)
 * - Day of week (Monday blues, Friday vibes)
 * - Conversation duration (long chats = natural fatigue)
 *
 * This makes personas feel more human - they have natural rhythms
 * and energy fluctuations just like real people.
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
type EnergyLevel = 'low' | 'rising' | 'peak' | 'declining' | 'winding_down';
interface TimeEnergy {
    level: EnergyLevel;
    description: string;
    voiceHint: string;
    paceHint: string;
}
declare function getTimeBasedEnergy(): TimeEnergy;
interface DayEnergy {
    modifier: string;
    vibe: string;
}
declare function getDayBasedEnergy(): DayEnergy;
declare function buildEnergyAwareness(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildEnergyAwareness, getTimeBasedEnergy, getDayBasedEnergy };
//# sourceMappingURL=energy-awareness.d.ts.map