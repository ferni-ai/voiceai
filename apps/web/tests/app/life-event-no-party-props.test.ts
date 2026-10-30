/**
 * A life_event outreach shows no party props beside his face.
 *
 * It used to substring-match "birthday" / "anniversary" and float cake + gift
 * or heart + star with a springy entrance, while the face was set to
 * holdingSpace. "Since she died, her birthday is hard" matched. Sidekicks
 * spec S1, 2026-10-29.
 *
 * Drives the real data-message handler and the real sidekicks module, and
 * records every icon ever added, so one that mounts and leaves still counts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});

import { handleDataMessage } from '../../src/app/data-message-handlers.js';
import { dispose, initAvatarSidekicks } from '../../src/ui/avatar-sidekicks.ui.js';
import { soundUI } from '../../src/ui/sound.ui.js';
import type { DataMessage } from '../../src/types/events.js';

let added: Element[] = [];
let observer: MutationObserver;

function iconsEverAdded(): Element[] {
  const records = [...observer.takeRecords()];
  for (const record of records) {
    for (const node of Array.from(record.addedNodes)) {
      if (node instanceof Element && node.classList.contains('sidekick-icon')) added.push(node);
    }
  }
  return added;
}

const sendLifeEvent = (message: string, context?: string): void =>
  handleDataMessage({
    type: 'proactive_outreach',
    data: { id: 'o1', type: 'life_event', message, context, personaId: 'ferni' },
    timestamp: 1,
  } as unknown as DataMessage);

beforeEach(() => {
  vi.spyOn(soundUI, 'play').mockImplementation(() => undefined);
  const coach = document.createElement('div');
  coach.id = 'coach';
  const avatar = document.createElement('div');
  avatar.className = 'avatar-container';
  coach.appendChild(avatar);
  document.body.appendChild(coach);
  initAvatarSidekicks();

  added = [];
  observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (node instanceof Element && node.classList.contains('sidekick-icon')) added.push(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
});

afterEach(() => {
  observer.disconnect();
  dispose();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('life_event outreach', () => {
  it.each([
    ['grief that mentions a birthday', 'Since she died, her birthday has been hard.', undefined],
    ['a birthday in the context', 'Thinking of you today.', "mom's birthday"],
    ['an anniversary', 'The anniversary is this week.', 'anniversary of the accident'],
  ])('%s shows no sidekick icon', (_label, message, context) => {
    sendLifeEvent(message, context);
    vi.advanceTimersByTime(5000);

    expect(iconsEverAdded()).toHaveLength(0);
    expect(document.querySelectorAll('.sidekick-icon')).toHaveLength(0);
  });
});
