/**
 * Running Jokes System
 *
 * Manages running jokes and callbacks that build relationship over time.
 * Now loads from persona bundles for variation and maintainability.
 *
 * @module intelligence/human-behaviors/running-jokes
 */
import type { UserProfile } from '../../types/user-profile.js';
export interface RunningJoke {
    id: string;
    setup: string;
    callback: string;
    context: string;
    usageCount: number;
    lastUsed?: Date;
}
/**
 * Get a running joke callback if appropriate
 */
export declare function getRunningJokeCallback(profile: UserProfile | null, currentTopic: string, personaId?: string): {
    joke: string;
    isCallback: boolean;
} | null;
export default getRunningJokeCallback;
//# sourceMappingURL=running-jokes.d.ts.map