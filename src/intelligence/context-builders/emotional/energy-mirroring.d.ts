/**
 * Energy Mirroring Context Builder
 *
 * Great friends match your energy. When you're exhausted, they don't
 * bombard you with enthusiasm. When you're excited, they share the joy.
 * This builder helps Ferni mirror the user's energy appropriately.
 *
 * Energy levels:
 * - Exhausted/Depleted → Calm, gentle, low-energy
 * - Low/Subdued → Quiet, steady, warm
 * - Neutral → Balanced engagement
 * - Engaged/Active → Match engagement, more animated
 * - Excited/High → Share enthusiasm, match excitement
 *
 * @module EnergyMirroringContextBuilder
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
type EnergyLevel = 'exhausted' | 'low' | 'neutral' | 'engaged' | 'excited';
interface EnergySignals {
    textEnergy: EnergyLevel;
    emotionEnergy: EnergyLevel;
    voiceEnergy?: EnergyLevel;
    timeContext?: 'late_night' | 'early_morning' | 'normal';
}
/**
 * Detect energy from text patterns
 */
declare function detectTextEnergy(text: string): EnergyLevel;
/**
 * Combine signals to get overall energy level
 */
declare function combineEnergySignals(signals: EnergySignals): EnergyLevel;
/**
 * Build energy mirroring context
 */
declare function buildEnergyMirroringContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildEnergyMirroringContext, detectTextEnergy, combineEnergySignals };
//# sourceMappingURL=energy-mirroring.d.ts.map