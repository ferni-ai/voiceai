/**
 * Meeting a new teammate: the intro's last screen shows the question they'll open with.
 *
 * Each intro defines a first-conversation question (Maya: "What's one small thing you've
 * been putting off?"), but it was only tucked into a persona-switch event that nothing
 * read, so nobody ever saw it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/modal-coordinator.service.js', () => ({
  modalCoordinator: {
    request: (_id: string, _priority: string, show: () => void) => {
      show();
      return true;
    },
    release: () => undefined,
  },
}));

// jsdom has no Web Animations; the intro animates its entrance
Element.prototype.animate ??= function () {
  return { finished: Promise.resolve(), cancel() {}, onfinish: null } as unknown as Animation;
};

const { personaIntro } = await import('../../src/ui/persona-intro.ui.js');
const { t } = await import('../../src/i18n/index.js');

afterEach(() => personaIntro.hide());

describe("a new teammate's intro", () => {
  it('ends on the question they will open with', () => {
    personaIntro.show('maya-santos');
    const question = t('personaIntro.maya.firstConversationPrompt');
    const dialog = () => document.querySelector('.persona-intro-modal, .persona-intro')?.textContent ?? '';

    expect(dialog(), 'not on the first screen').not.toContain(question);
    personaIntro.next();
    personaIntro.next();
    expect(dialog(), 'on the last screen').toContain(question);
  });
});
