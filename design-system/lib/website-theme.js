/**
 * Website theme sets from design-system/tokens/semantic-colors.json.
 *
 * Each role there names one custom property and its value per theme, as a
 * path into colors.json (or spacing.json) or a literal. This module resolves
 * the roles and emits the theme blocks of the website _tokens.css, so a dark
 * value is declared once (in the JSON) instead of being listed by hand in the
 * generator. Every value is a literal: a var() alias declared on :root would
 * not follow a [data-surface] override further down the tree.
 */

const TOKEN_PATH = /^[A-Za-z_]\w*(\.[\w-]+)+$/;

/** The value at a dotted path in a token file (colors.json by default), or the literal itself. */
export function resolveRef(tokens, ref, file = 'colors.json') {
  if (!TOKEN_PATH.test(ref)) return ref;
  const value = ref.split('.').reduce((node, key) => node?.[key], tokens);
  if (typeof value !== 'string') {
    throw new Error(`semantic-colors.json: ${ref} is not a colour in ${file}`);
  }
  return value;
}

/** A role's inverse context, resolved; dark falls back to light. */
function resolveInverse(tokens, inverse, file) {
  if (!inverse) return undefined;
  const light = resolveRef(tokens, inverse.light, file);
  return {
    light,
    dark: inverse.dark === undefined ? light : resolveRef(tokens, inverse.dark, file),
  };
}

/**
 * Resolved roles in emit order: [{ label, ownsLight, roles: [{ name, light, dark, inverse }] }].
 * `dark` is undefined for a light-only role (and a persona with no dark value);
 * `inverse` ({ light, dark }) is set only on roles with an inverse context.
 */
export function themeRoleGroups(semantic, colors, spacing = {}) {
  const groups = semantic.groups.map(
    ({ label, ownsLight = false, prefix = '--color-', source, roles }) => {
      const [tokens, file] =
        source === 'spacing' ? [spacing, 'spacing.json'] : [colors, 'colors.json'];
      return {
        label,
        ownsLight,
        roles: Object.entries(roles).map(([name, ref]) => ({
          name: `${prefix}${name}`,
          light: resolveRef(tokens, ref.light, file),
          dark: ref.dark === undefined ? undefined : resolveRef(tokens, ref.dark, file),
          inverse: resolveInverse(tokens, ref.inverse, file),
        })),
      };
    }
  );
  const personaRoles = [];
  for (const [personaId, persona] of Object.entries(colors.personas)) {
    if (personaId.startsWith('_')) continue;
    const shortId = personaId.split('-')[0];
    for (const [suffix, keys] of Object.entries(semantic.personaRoles.roles)) {
      personaRoles.push({ name: `--color-${shortId}-${suffix}`, light: persona[keys.light], dark: persona[keys.dark] });
    }
  }
  groups.push({ label: semantic.personaRoles.label, roles: personaRoles });
  return groups;
}

/** One theme's declarations (`pick(role)`), grouped under comments, at the given indent. */
export function themeBlockLines(groups, pick, indent) {
  const value = typeof pick === 'string' ? (role) => role[pick] : pick;
  const lines = [];
  for (const { label, roles } of groups) {
    const declarations = roles.filter((role) => value(role) !== undefined);
    if (declarations.length === 0) continue;
    if (lines.length > 0) lines.push('');
    lines.push(`${indent}/* ${label} */`);
    for (const role of declarations) lines.push(`${indent}${role.name}: ${value(role)};`);
  }
  return lines;
}

/**
 * The [data-surface="inverse"] blocks. The dark ones are emitted only for
 * roles whose inverse value changes in dark mode.
 */
export function inverseThemeLines(groups) {
  const light = themeBlockLines(groups, (role) => role.inverse?.light, '  ');
  const darkValue = (role) =>
    role.inverse && role.inverse.dark !== role.inverse.light ? role.inverse.dark : undefined;
  const lines = [
    '',
    '/* Inverse context: always-dark sections set data-surface="inverse" */',
    '[data-surface="inverse"] {',
    ...light,
    '}',
  ];
  if (themeBlockLines(groups, darkValue, '').length === 0) return lines;
  return [
    ...lines,
    '',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) [data-surface="inverse"] {',
    ...themeBlockLines(groups, darkValue, '    '),
    '  }',
    '}',
    '',
    ':root[data-theme="dark"] [data-surface="inverse"] {',
    ...themeBlockLines(groups, darkValue, '  '),
    '}',
  ];
}

/**
 * The end of the website light :root (the light values of the groups this
 * module owns, then its closing brace), followed by the dark and inverse blocks.
 */
export function websiteThemeLines(semantic, colors, spacing) {
  const groups = themeRoleGroups(semantic, colors, spacing);
  const owned = groups.filter((group) => group.ownsLight);
  return [
    '  /* ============================================',
    '     THEME ROLES (design-system/tokens/semantic-colors.json)',
    '     ============================================ */',
    ...themeBlockLines(owned, 'light', '  '),
    '}',
    '',
    '/* ============================================================================',
    '   DARK THEME OVERRIDES',
    '   Midnight theme (Night Ink) - warm near-black field, paper type, sage actions',
    '   All persona text colors are WCAG AA compliant (4.5:1+ contrast)',
    '   ============================================================================ */',
    '',
    '@media (prefers-color-scheme: dark) {',
    '  :root {',
    ...themeBlockLines(groups, 'dark', '    '),
    '  }',
    '}',
    '',
    // Manual toggle: data-theme on <html> only
    ':root[data-theme="dark"] {',
    ...themeBlockLines(groups, 'dark', '  '),
    '}',
    ...inverseThemeLines(groups),
  ];
}
