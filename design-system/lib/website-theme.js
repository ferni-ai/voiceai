/**
 * Website theme sets from design-system/tokens/semantic-colors.json.
 *
 * Each role there names one --color-* property and its value per theme, as a
 * path into colors.json or a literal. This module resolves the roles and emits
 * the theme blocks of the website _tokens.css, so a dark value is declared once
 * (in the JSON) instead of being listed by hand in the generator.
 */

const TOKEN_PATH = /^[A-Za-z_]\w*(\.[\w-]+)+$/;

/** The value at a dotted path in colors.json, or the literal itself. */
export function resolveRef(colors, ref) {
  if (!TOKEN_PATH.test(ref)) return ref;
  const value = ref.split('.').reduce((node, key) => node?.[key], colors);
  if (typeof value !== 'string') {
    throw new Error(`semantic-colors.json: ${ref} is not a colour in colors.json`);
  }
  return value;
}

/**
 * Resolved roles in emit order: [{ label, roles: [{ name, light, dark }] }].
 * Persona roles have `dark: undefined` when the persona has no dark value.
 */
export function themeRoleGroups(semantic, colors) {
  const groups = semantic.groups.map(({ label, roles }) => ({
    label,
    roles: Object.entries(roles).map(([name, ref]) => ({
      name: `--color-${name}`,
      light: resolveRef(colors, ref.light),
      dark: resolveRef(colors, ref.dark),
    })),
  }));
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

/** One theme's declarations, grouped under comments, at the given indent. */
export function themeBlockLines(groups, theme, indent) {
  const lines = [];
  groups.forEach(({ label, roles }, index) => {
    if (index > 0) lines.push('');
    lines.push(`${indent}/* ${label} */`);
    for (const role of roles) {
      if (role[theme] !== undefined) lines.push(`${indent}${role.name}: ${role[theme]};`);
    }
  });
  return lines;
}

/** The dark blocks that follow the light :root in the website _tokens.css. */
export function darkThemeLines(semantic, colors) {
  const groups = themeRoleGroups(semantic, colors);
  return [
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
    // Also add [data-theme="dark"] selector for manual toggle
    '[data-theme="dark"] {',
    ...themeBlockLines(groups, 'dark', '  '),
    '}',
  ];
}
