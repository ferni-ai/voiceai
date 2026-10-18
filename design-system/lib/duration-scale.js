/**
 * The CSS duration scale: tokens/animation.json `durations` plus the older
 * CSS names in `durationAliases`, each resolved to the step it points at.
 * TS (DURATION) uses `durations` alone; aliases exist only so existing
 * var(--duration-*) users keep resolving.
 */
export function cssDurations(animation) {
  const scale = { ...animation.durations };
  for (const [alias, target] of Object.entries(animation.durationAliases ?? {})) {
    if (!(target in animation.durations)) {
      throw new Error(`animation.json durationAliases.${alias} -> "${target}" is not a step in durations`);
    }
    scale[alias] = animation.durations[target];
  }
  return scale;
}
