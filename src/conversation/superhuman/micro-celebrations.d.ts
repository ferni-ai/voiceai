/**
 * Micro-Celebrations System
 *
 * Real-time reactions to small wins - the "I see you" moments.
 *
 * When someone mentions they did something hard, made progress, or overcame
 * even a tiny obstacle, we celebrate it. This creates the feeling of being
 * truly witnessed.
 *
 * @module conversation/superhuman/micro-celebrations
 */
export interface MicroWin {
    type: WinType;
    magnitude: 'tiny' | 'small' | 'medium' | 'big';
    trigger: string;
    celebration: string;
    followUp?: string;
}
export type WinType = 'did_hard_thing' | 'showed_up' | 'spoke_up' | 'set_boundary' | 'made_progress' | 'tried_new_thing' | 'self_care' | 'asked_for_help' | 'finished_something' | 'overcame_fear' | 'chose_healthy' | 'practiced_skill' | 'stayed_consistent' | 'let_go' | 'stood_ground';
/**
 * Detect if a message contains a micro-win
 * Now LLM-powered with template fallback!
 */
export declare function detectMicroWin(message: string): MicroWin | null;
/**
 * Format a micro-win celebration for the prompt
 */
export declare function formatMicroWinForPrompt(win: MicroWin): string;
declare const _default: {
    detectMicroWin: typeof detectMicroWin;
    formatMicroWinForPrompt: typeof formatMicroWinForPrompt;
};
export default _default;
//# sourceMappingURL=micro-celebrations.d.ts.map