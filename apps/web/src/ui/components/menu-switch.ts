/**
 * An on/off row in the settings menu (See Our Words, Sound Effects).
 *
 * It is a real switch: role="switch" with aria-checked, so a screen reader says
 * whether it's on, and the signed-in walk (e2e/signed-in/feature-walk.spec.ts)
 * can see the state flip. It stays a <button>, so Enter and Space toggle it.
 *
 * @module ui/components/menu-switch
 */

const ON_CLASS = 'settings-menu__item--toggle-on';

export function renderMenuSwitch(
  action: string,
  icon: string,
  label: string,
  isOn: boolean
): string {
  return `
      <button role="switch" aria-checked="${isOn}" aria-label="${label}" class="settings-menu__item settings-menu__item--toggle ${isOn ? ON_CLASS : ''}" data-action="${action}" data-toggle="true">
        <span class="settings-menu__icon">${icon}</span>
        <span class="settings-menu__label">${label}</span>
        <span class="settings-menu__toggle-indicator" aria-hidden="true">
          <span class="settings-menu__toggle-track">
            <span class="settings-menu__toggle-thumb"></span>
          </span>
        </span>
      </button>
    `;
}

/** Show a switch's new state, to the eye and to assistive tech. */
export function setMenuSwitch(button: HTMLElement, isOn: boolean): void {
  button.classList.toggle(ON_CLASS, isOn);
  button.setAttribute('aria-checked', String(isOn));
}
