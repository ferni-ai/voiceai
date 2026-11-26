/**
 * The admin Avatar Soul section drives the real avatar in an /avatar-lab frame
 * (#4069: every admin control is real). Each control posts one lab command and
 * shows what the lab answered: the export that ran, the reason it was refused,
 * or that the lab did not answer. It never says "played" on its own.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LAB_MESSAGE_TYPE,
  type LabCommand,
  type LabRequest,
  type LabStatus,
} from '../../src/ui/avatar-lab-protocol.js';
import { createLabClient } from '../../src/admin/sections/avatar-lab-client.js';
import { motionFlagOverride, setMotionFlagOverride } from '../../src/config/motion-flags.js';
import { SOUL_COUNT_KEYS } from '../../src/services/soul-stats.service.js';

/** The field data's one request, faked: no request leaves the test. */
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
vi.mock('../../src/admin/admin-fetch.js', () => ({
  adminFetch: (url: string, init?: RequestInit) => fetchMock(url, init),
}));
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

const { ADMIN_SECTIONS } = await import('../../src/admin/section-registry.js');
const soul = await import('../../src/admin/sections/AvatarSoulSection.js');

const entry = () => {
  const found = ADMIN_SECTIONS.find((s) => s.id === 'avatar-soul');
  if (!found) throw new Error('no avatar-soul section');
  return found;
};

type Answer = { ok: boolean; ran?: string; why?: string; status?: LabStatus } | null;

/** A fake lab behind the frame: records each request and answers it as `answer` says. */
function fakeLab(frame: HTMLIFrameElement, answer: (command: LabCommand) => Answer) {
  const target = frame.contentWindow;
  if (!target) throw new Error('the frame has no window');
  const requests: LabRequest[] = [];
  vi.spyOn(target, 'postMessage').mockImplementation((message: unknown) => {
    const request = message as LabRequest;
    requests.push(request);
    const reply = answer(request.command);
    if (!reply) return;
    queueMicrotask(() => replyFrom(target, { type: LAB_MESSAGE_TYPE, id: request.id, ...reply }));
  });
  return { requests, commands: () => requests.map((r) => r.command) };
}

function replyFrom(source: Window, data: unknown, origin = window.location.origin): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
}

async function mount(): Promise<{ root: HTMLElement; frame: HTMLIFrameElement }> {
  document.body.innerHTML = `<div id="adminContent">${await entry().component()}</div>`;
  const root = document.getElementById('adminContent') as HTMLElement;
  await entry().setup?.(root);
  return { root, frame: root.querySelector('iframe') as HTMLIFrameElement };
}

const status = () => document.getElementById('avatarLabStatus')?.textContent ?? '';
const button = (label: string): HTMLButtonElement => {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent?.trim() === label
  );
  if (!found) throw new Error(`no button "${label}"`);
  return found;
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    Promise.resolve(json({ measured: false, reason: 'SOUL_STATS is off' }))
  );
});

afterEach(() => {
  soul.cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the Avatar Soul section', () => {
  it('frames the real avatar at /avatar-lab, with no drawn preview, pupil or gaze controls', async () => {
    const { root } = await mount();
    expect(root.querySelector('iframe[src="/avatar-lab"]')).not.toBeNull();
    expect(root.querySelector('#adminSoulPreview')).toBeNull();
    expect(root.querySelector('[data-soul="pupil"]')).toBeNull();
    expect(root.querySelector('[data-soul="gaze"]')).toBeNull();
    expect(root.querySelector('input[type="range"]')).toBeNull();
    expect(root.querySelector('#avatarLabStatus')?.getAttribute('aria-live')).toBe('polite');
  });

  it('is listed with its new description, no NEW badge, and a cleanup', () => {
    expect(entry().description).toBe('The real avatar and its moments');
    expect(entry().badge).toBeUndefined();
    expect(entry().cleanup).toBeTypeOf('function');
  });

  it('each control posts its own lab command', async () => {
    const { root, frame } = await mount();
    const lab = fakeLab(frame, () => ({ ok: true, ran: 'x' }));
    const face = root.querySelector('select[data-lab-face]') as HTMLSelectElement;
    face.value = 'happy';
    for (const b of root.querySelectorAll<HTMLButtonElement>('button[data-lab-control]')) {
      b.click();
      await flush();
    }
    expect(lab.commands()).toEqual([
      { name: 'turn', speaker: 'ferni' },
      { name: 'turn', speaker: 'user' },
      { name: 'turn', speaker: 'thinking' },
      { name: 'turn', speaker: 'none' },
      { name: 'face', expression: 'happy' },
      { name: 'moment', moment: 'warmthBloom' },
      { name: 'moment', moment: 'memorySpark' },
      { name: 'moment', moment: 'comfortPulseStart' },
      { name: 'moment', moment: 'comfortPulseStop' },
      { name: 'moment', moment: 'protectiveOn' },
      { name: 'moment', moment: 'protectiveOff' },
      { name: 'moment', moment: 'celebrateGrowth' },
      { name: 'moment', moment: 'cameoArrival' },
      { name: 'moment', moment: 'cameoReturn' },
      { name: 'nameLift', effect: 'brighten' },
      { name: 'nameLift', effect: 'attentive' },
      { name: 'nameLift', effect: 'comfort' },
      { name: 'crisisHold', on: true },
      { name: 'status' },
      { name: 'crisisHold', on: false },
      { name: 'status' },
    ]);
  });

  it('offers every face in EMOTIONAL_EXPRESSIONS', async () => {
    const { EMOTIONAL_EXPRESSIONS } = await import('../../src/ui/ferni-expressions.ui.js');
    const { root } = await mount();
    const options = [...root.querySelectorAll('select[data-lab-face] option')].map(
      (o) => (o as HTMLOptionElement).value
    );
    expect(options).toEqual([...EMOTIONAL_EXPRESSIONS]);
  });

  it('says it is asking the lab at once, then which export ran', async () => {
    const { frame } = await mount();
    fakeLab(frame, () => ({ ok: true, ran: 'triggerMemorySpark' }));
    button('Memory spark').click();
    expect(status()).toBe('Memory spark: asking the lab');
    await flush();
    expect(status()).toBe('Memory spark played (triggerMemorySpark)');
  });

  it('says why the lab refused, and never "played"', async () => {
    const { root, frame } = await mount();
    fakeLab(frame, () => ({ ok: false, why: 'The crisis hold allows only calm faces' }));
    (root.querySelector('select[data-lab-face]') as HTMLSelectElement).value = 'excited';
    button('Show face').click();
    await flush();
    expect(status()).toBe('Not played: The crisis hold allows only calm faces');
  });

  it('says "Not played" for a refusal that has no reason', async () => {
    const { frame } = await mount();
    fakeLab(frame, () => ({ ok: false }));
    button('Warmth bloom').click();
    await flush();
    expect(status()).toBe('Not played');
  });

  it('says "Lab not ready" when the lab does not answer in time', async () => {
    const { frame } = await mount();
    vi.useFakeTimers();
    fakeLab(frame, () => null);
    button('Memory spark').click();
    await vi.advanceTimersByTimeAsync(1999);
    expect(status()).toBe('Memory spark: asking the lab');
    await vi.advanceTimersByTimeAsync(1);
    expect(status()).toBe('Lab not ready');
  });

  it('ignores a reply from another window or another origin', async () => {
    const { frame } = await mount();
    vi.useFakeTimers();
    const lab = fakeLab(frame, () => null);
    button('Memory spark').click();
    const id = lab.requests[0]?.id;
    const ran = { type: LAB_MESSAGE_TYPE, id, ok: true, ran: 'triggerMemorySpark' };
    replyFrom(window, ran);
    replyFrom(frame.contentWindow as Window, ran, 'https://elsewhere.example');
    await vi.advanceTimersByTimeAsync(0);
    expect(status()).toBe('Memory spark: asking the lab');
    await vi.advanceTimersByTimeAsync(2000);
    expect(status()).toBe('Lab not ready');
  });

  it('opened, left and opened again, one click posts exactly one request', async () => {
    const { root, frame } = await mount();
    const lab = fakeLab(frame, () => ({ ok: true, ran: 'triggerMemorySpark' }));
    entry().cleanup?.();
    await flush();
    button('Memory spark').click();
    await flush();
    expect(lab.commands()).toEqual([]); // left: the section no longer answers clicks
    await entry().setup?.(root);
    button('Memory spark').click();
    await flush();
    expect(lab.commands()).toEqual([{ name: 'moment', moment: 'memorySpark' }]);
  });

  it('set up twice without a cleanup, one click still posts exactly one request', async () => {
    const { root, frame } = await mount();
    await entry().setup?.(root);
    const lab = fakeLab(frame, () => ({ ok: true, ran: 'triggerMemorySpark' }));
    button('Memory spark').click();
    await flush();
    expect(lab.commands()).toEqual([{ name: 'moment', moment: 'memorySpark' }]);
  });

  it('a late answer never replaces the status of a newer click', async () => {
    const { frame } = await mount();
    const lab = fakeLab(frame, () => null);
    button('Memory spark').click();
    button('Warmth bloom').click();
    const [spark, bloom] = lab.requests;
    const lab$ = frame.contentWindow as Window;
    replyFrom(lab$, { type: LAB_MESSAGE_TYPE, id: bloom?.id, ok: true, ran: 'triggerWarmthBloom' });
    await flush();
    expect(status()).toBe('Warmth bloom played (triggerWarmthBloom)');
    replyFrom(lab$, { type: LAB_MESSAGE_TYPE, id: spark?.id, ok: true, ran: 'triggerMemorySpark' });
    await flush();
    expect(status()).toBe('Warmth bloom played (triggerWarmthBloom)');
  });

  it('a request that times out after a switch change does not replace the switch status', async () => {
    const { root, frame } = await mount();
    vi.useFakeTimers();
    fakeLab(frame, () => null);
    button('Memory spark').click();
    const select = root.querySelector('select[data-motion-flag="gaze"]') as HTMLSelectElement;
    select.value = 'on';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(status()).toBe('gaze is now on in this browser; the lab reloaded');
    setMotionFlagOverride('gaze', null);
  });

  it('leaving the section stops listening for lab replies', async () => {
    const added = vi.spyOn(window, 'addEventListener');
    const removed = vi.spyOn(window, 'removeEventListener');
    await mount();
    const listeners = added.mock.calls.filter(([type]) => type === 'message').map(([, fn]) => fn);
    expect(listeners).toHaveLength(1);
    entry().cleanup?.();
    await flush();
    const gone = removed.mock.calls.filter(([type]) => type === 'message').map(([, fn]) => fn);
    expect(gone).toEqual(listeners);
  });

  it('when the lab loads, asks whether the hold is on until the booting lab answers', async () => {
    const { frame } = await mount();
    vi.useFakeTimers();
    let booted = false;
    const lab = fakeLab(frame, () =>
      booted
        ? {
            ok: true,
            status: { ready: true, crisisHeld: false, reducedMotion: false, turn: 'none' },
          }
        : null
    );
    frame.dispatchEvent(new Event('load'));
    expect(document.getElementById('avatarLabHeld')?.textContent).toBe('Held: not known yet');
    booted = true;
    await vi.advanceTimersByTimeAsync(2000);
    expect(lab.commands()).toEqual([{ name: 'status' }, { name: 'status' }]);
    expect(document.getElementById('avatarLabHeld')?.textContent).toBe('Held: no');
  });

  it('shows whether the crisis hold is on, from the lab status', async () => {
    const { frame } = await mount();
    fakeLab(frame, (command) =>
      command.name === 'status'
        ? {
            ok: true,
            status: { ready: true, crisisHeld: true, reducedMotion: false, turn: 'none' },
          }
        : { ok: true, ran: 'holdCrisisFace' }
    );
    button('Hold').click();
    await flush();
    await flush();
    expect(status()).toBe('Hold played (holdCrisisFace)');
    expect(document.getElementById('avatarLabHeld')?.textContent).toBe('Held: yes');
  });
});

describe('field data', () => {
  const fieldData = () => document.getElementById('avatarSoulFieldData');

  it('measured: shows the eleven counts from the admin soul stats route', async () => {
    const counts = Object.fromEntries(SOUL_COUNT_KEYS.map((k, i) => [k, i + 3]));
    fetchMock.mockResolvedValueOnce(
      json({ measured: true, windowHours: 24, counts, lastUpdated: null })
    );
    await mount();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/admin/soul/stats', undefined);
    const values = [...(fieldData()?.querySelectorAll('.soul-stat-value') ?? [])];
    expect(values.map((v) => v.textContent)).toEqual(SOUL_COUNT_KEYS.map((_, i) => `${i + 3}`));
    expect(fieldData()?.querySelector('#soulCrisisHolds')?.textContent).toBe('10');
    expect(fieldData()?.textContent).toContain('Crisis Holds (last 24 h)');
  });

  it('not measured: says why, and shows no number', async () => {
    await mount();
    expect(fieldData()?.textContent).toContain('not measured: SOUL_STATS is off');
    expect(fieldData()?.querySelector('.soul-stat-value')).toBeNull();
  });

  it('a failed request: "unavailable (HTTP 503)", and no number', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'down' }, 503));
    await mount();
    expect(fieldData()?.textContent).toContain('unavailable (HTTP 503)');
    expect(fieldData()?.querySelector('.soul-stat-value')).toBeNull();
  });

  it('left before the counts arrive: nothing is written', async () => {
    let answer: (r: Response) => void = () => undefined;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    document.body.innerHTML = `<div id="adminContent">${await entry().component()}</div>`;
    const root = document.getElementById('adminContent') as HTMLElement;
    const setup = soul.setupEvents(root);
    const before = fieldData()?.innerHTML;
    soul.cleanup();
    answer(json({ measured: false, reason: 'SOUL_STATS is off' }));
    await setup;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fieldData()?.innerHTML).toBe(before);
  });
});

describe('motion switches', () => {
  beforeEach(() => setMotionFlagOverride('gaze', null));

  it('says nothing changed, and does not reload the lab, when the browser cannot store it', async () => {
    const { root, frame } = await mount();
    // once: the shared localStorage mock (tests/setup.ts) outlives restoreAllMocks
    vi.spyOn(window.localStorage, 'setItem').mockImplementationOnce(() => {
      throw new Error('storage is blocked');
    });
    const reloads: MutationRecord[] = [];
    new MutationObserver((records) => reloads.push(...records)).observe(frame, {
      attributeFilter: ['src'],
    });
    const select = root.querySelector('select[data-motion-flag="gaze"]') as HTMLSelectElement;
    select.value = 'on';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(status()).toBe('Could not store gaze in this browser, so nothing changed');
    expect(reloads).toHaveLength(0);
    expect(frame.getAttribute('src')).toBe('/avatar-lab');
    expect(select.value).toBe('default');
    expect(motionFlagOverride('gaze')).toBeNull();
  });

  it('a switch change stores the override, reloads the lab and says so', async () => {
    const { root, frame } = await mount();
    const reloads: MutationRecord[] = [];
    new MutationObserver((records) => reloads.push(...records)).observe(frame, {
      attributeFilter: ['src'],
    });
    const select = root.querySelector('select[data-motion-flag="gaze"]') as HTMLSelectElement;
    expect(select.value).toBe('default');
    select.value = 'on';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(motionFlagOverride('gaze')).toBe('on');
    expect(reloads).toHaveLength(1);
    expect(status()).toBe('gaze is now on in this browser; the lab reloaded');
  });

  it('shows each switch with its build value and the stored override', async () => {
    setMotionFlagOverride('gaze', 'off');
    const { root } = await mount();
    const row = root.querySelector('[data-motion-row="gaze"]');
    expect(row?.textContent).toContain('build: off');
    expect((root.querySelector('select[data-motion-flag="gaze"]') as HTMLSelectElement).value).toBe(
      'off'
    );
  });
});

describe('reduced motion line', () => {
  it('follows the device setting as it changes, and stops listening on cleanup', async () => {
    const listeners = new Set<(e: MediaQueryListEvent) => void>();
    const query = {
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) =>
        listeners.delete(fn),
    };
    vi.spyOn(window, 'matchMedia').mockReturnValue(query as unknown as MediaQueryList);
    await mount();
    const line = () => document.getElementById('avatarLabReducedMotion')?.textContent ?? '';
    expect(line()).toContain('Reduced motion: off');
    query.matches = true;
    for (const fn of listeners) fn({ matches: true } as MediaQueryListEvent);
    expect(line()).toContain('Reduced motion: on');
    expect(listeners.size).toBe(1);
    soul.cleanup();
    expect(listeners.size).toBe(0);
  });
});

describe('the lab client', () => {
  function frameWithLab() {
    document.body.innerHTML = '<iframe src="/avatar-lab"></iframe>';
    const frame = document.querySelector('iframe') as HTMLIFrameElement;
    const lab = fakeLab(frame, () => null);
    return { frame, lab };
  }

  it('a post that throws answers "lab not ready" at once', async () => {
    document.body.innerHTML = '<iframe src="/avatar-lab"></iframe>';
    const frame = document.querySelector('iframe') as HTMLIFrameElement;
    vi.spyOn(frame.contentWindow as Window, 'postMessage').mockImplementation(() => {
      throw new Error('cannot clone');
    });
    const client = createLabClient(frame, window, 60_000);
    await expect(client.send({ name: 'status' })).resolves.toEqual({
      ok: false,
      why: 'lab not ready',
    });
    client.dispose();
  });

  it('dispose answers a waiting request "lab not ready" at once', async () => {
    const { frame } = frameWithLab();
    const client = createLabClient(frame, window, 60_000);
    const answer = client.send({ name: 'status' });
    client.dispose();
    await expect(answer).resolves.toEqual({ ok: false, why: 'lab not ready' });
  });

  it('after dispose it posts nothing and hears no reply', async () => {
    const { frame, lab } = frameWithLab();
    const client = createLabClient(frame, window, 50);
    client.dispose();
    await expect(client.send({ name: 'status' })).resolves.toEqual({
      ok: false,
      why: 'lab not ready',
    });
    expect(lab.requests).toEqual([]);
  });

  it('matches a reply to its request by id', async () => {
    const { frame, lab } = frameWithLab();
    const client = createLabClient(frame, window, 60_000);
    const first = client.send({ name: 'moment', moment: 'memorySpark' });
    const second = client.send({ name: 'moment', moment: 'warmthBloom' });
    const [a, b] = lab.requests;
    replyFrom(frame.contentWindow as Window, {
      type: LAB_MESSAGE_TYPE,
      id: b?.id,
      ok: false,
      why: 'no',
    });
    replyFrom(frame.contentWindow as Window, {
      type: LAB_MESSAGE_TYPE,
      id: a?.id,
      ok: true,
      ran: 'triggerMemorySpark',
    });
    await expect(first).resolves.toMatchObject({ ok: true, ran: 'triggerMemorySpark' });
    await expect(second).resolves.toMatchObject({ ok: false, why: 'no' });
    client.dispose();
  });
});
