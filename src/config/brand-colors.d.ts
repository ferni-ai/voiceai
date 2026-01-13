/**
 * Brand Colors - Single Source of Truth for Backend
 *
 * These colors match the design system tokens in design-system/tokens/colors.json
 * For frontend, use CSS variables (--color-ferni, --persona-primary, etc.)
 * For backend (emails, push notifications, API responses), use these constants.
 *
 * @see design-system/tokens/colors.json for canonical definitions
 */
/**
 * Primary accent color for CTAs and buttons
 */
export declare const BRAND_ACCENT = "#3D5A45";
/**
 * Natural Ink - Primary text color (warm dark brown)
 */
export declare const BRAND_TEXT_PRIMARY = "#2C2520";
/**
 * Paper Cream - Background color
 */
export declare const BRAND_BACKGROUND = "#FFFDFB";
/**
 * Persona primary colors for server-side use (emails, notifications, API responses)
 * These should match design-system/tokens/colors.json → personas
 */
export declare const PERSONA_COLORS: {
    readonly ferni: "#4a6741";
    readonly 'maya-santos': "#a67a6a";
    readonly 'alex-chen': "#5a6b8a";
    readonly 'peter-john': "#3a6b73";
    readonly 'jordan-taylor': "#c4856a";
    readonly 'nayan-patel': "#b8956a";
};
/**
 * Persona secondary colors (darker variant for gradients)
 */
export declare const PERSONA_SECONDARY_COLORS: {
    readonly ferni: "#3d5a35";
    readonly 'maya-santos': "#8a635a";
    readonly 'alex-chen': "#4a5a73";
    readonly 'peter-john': "#2d5359";
    readonly 'jordan-taylor': "#a86d55";
    readonly 'nayan-patel': "#9a7a52";
};
/**
 * Persona glow colors (with alpha for effects)
 */
export declare const PERSONA_GLOW_COLORS: {
    readonly ferni: "rgba(74, 103, 65, 0.5)";
    readonly 'maya-santos': "rgba(166, 122, 106, 0.5)";
    readonly 'alex-chen': "rgba(90, 107, 138, 0.5)";
    readonly 'peter-john': "rgba(58, 107, 115, 0.5)";
    readonly 'jordan-taylor': "rgba(196, 133, 106, 0.5)";
    readonly 'nayan-patel': "rgba(184, 149, 106, 0.5)";
};
export type PersonaId = keyof typeof PERSONA_COLORS;
/**
 * Get persona primary color with fallback to Ferni
 */
export declare function getPersonaColor(personaId: string): string;
/**
 * Get persona secondary color with fallback to Ferni
 */
export declare function getPersonaSecondaryColor(personaId: string): string;
/**
 * Get persona glow color with fallback to Ferni
 */
export declare function getPersonaGlowColor(personaId: string): string;
export declare const STATUS_COLORS: {
    readonly success: "#4a6741";
    readonly warning: "#b8956a";
    readonly error: "#c4856a";
    readonly info: "#5a6b8a";
};
declare const _default: {
    BRAND_ACCENT: string;
    BRAND_TEXT_PRIMARY: string;
    BRAND_BACKGROUND: string;
    PERSONA_COLORS: {
        readonly ferni: "#4a6741";
        readonly 'maya-santos': "#a67a6a";
        readonly 'alex-chen': "#5a6b8a";
        readonly 'peter-john': "#3a6b73";
        readonly 'jordan-taylor': "#c4856a";
        readonly 'nayan-patel': "#b8956a";
    };
    PERSONA_SECONDARY_COLORS: {
        readonly ferni: "#3d5a35";
        readonly 'maya-santos': "#8a635a";
        readonly 'alex-chen': "#4a5a73";
        readonly 'peter-john': "#2d5359";
        readonly 'jordan-taylor': "#a86d55";
        readonly 'nayan-patel': "#9a7a52";
    };
    PERSONA_GLOW_COLORS: {
        readonly ferni: "rgba(74, 103, 65, 0.5)";
        readonly 'maya-santos': "rgba(166, 122, 106, 0.5)";
        readonly 'alex-chen': "rgba(90, 107, 138, 0.5)";
        readonly 'peter-john': "rgba(58, 107, 115, 0.5)";
        readonly 'jordan-taylor': "rgba(196, 133, 106, 0.5)";
        readonly 'nayan-patel': "rgba(184, 149, 106, 0.5)";
    };
    STATUS_COLORS: {
        readonly success: "#4a6741";
        readonly warning: "#b8956a";
        readonly error: "#c4856a";
        readonly info: "#5a6b8a";
    };
    getPersonaColor: typeof getPersonaColor;
    getPersonaSecondaryColor: typeof getPersonaSecondaryColor;
    getPersonaGlowColor: typeof getPersonaGlowColor;
};
export default _default;
//# sourceMappingURL=brand-colors.d.ts.map