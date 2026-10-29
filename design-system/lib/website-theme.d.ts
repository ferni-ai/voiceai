/** Types for the parts of website-theme.js that TypeScript callers use. */

export interface ThemeRole {
  name: string;
  light: string;
  dark?: string;
  inverse?: { light: string; dark: string };
}

export interface ThemeRoleGroup {
  label: string;
  ownsLight?: boolean;
  roles: ThemeRole[];
}

export function themeRoleGroups(
  semantic: unknown,
  colors: unknown,
  spacing?: unknown
): ThemeRoleGroup[];
