/**
 * Tailwind utilities for the website theme roles in semantic-colors.json.
 *
 * Each utility points at the role's custom property (never a literal), so it
 * follows every theme block website-theme.js emits: light, dark and the
 * [data-surface="inverse"] context. A role named here that semantic-colors.json
 * doesn't declare is an error, so a utility can't point at a missing variable.
 */

/** Utility key (as written after bg-, text- or border-) -> semantic-colors.json role. */
const ROLE_UTILITIES = {
  backgroundColor: {
    'surface-base': 'surface-base',
    'surface-sunken': 'surface-sunken',
    'surface-raised': 'surface-raised',
    'surface-overlay': 'surface-overlay',
  },
  textColor: {
    primary: 'text-primary',
    secondary: 'text-secondary',
    muted: 'text-muted',
  },
  borderColor: {
    subtle: 'border-subtle',
    strong: 'border-strong',
  },
};

/** Names of the --color-* roles semantic-colors.json declares. */
function colorRoleNames(semantic) {
  const names = new Set();
  for (const { prefix = '--color-', roles } of semantic.groups) {
    if (prefix !== '--color-') continue;
    for (const name of Object.keys(roles)) names.add(name);
  }
  return names;
}

/**
 * { backgroundColor, textColor, borderColor } for tailwind theme.extend, each
 * value a var(--color-<role>) reference.
 */
export function roleUtilities(semantic) {
  const declared = colorRoleNames(semantic);
  const result = {};
  for (const [property, keys] of Object.entries(ROLE_UTILITIES)) {
    result[property] = {};
    for (const [key, role] of Object.entries(keys)) {
      if (!declared.has(role)) {
        throw new Error(
          `semantic-colors.json has no --color-${role} role for the ${property} utility "${key}"`
        );
      }
      result[property][key] = `var(--color-${role})`;
    }
  }
  return result;
}
