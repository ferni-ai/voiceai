/**
 * Make It Yours extras flag. Off by default.
 *
 * Several catalog items change nothing yet: the sound packs play
 * public/sounds/ambient/*.mp3, which are identical 3,600-byte files of
 * silence; the Deep Forest and Cozy Cabin themes are the light and midnight
 * themes plus a --theme-accent-hue that no stylesheet reads; and voice packs
 * have no caller on the agent (getVoicePackModifiers). While off, Make It
 * Yours lists only what really changes something: the avatar styles and the
 * light (Zen Garden) and dark (Midnight) themes. Turn it on with
 * `VITE_PERSONALIZE_EXTRAS=true` once those items do something.
 */
export function isPersonalizeExtrasOn(): boolean {
  return import.meta.env.VITE_PERSONALIZE_EXTRAS === 'true';
}
