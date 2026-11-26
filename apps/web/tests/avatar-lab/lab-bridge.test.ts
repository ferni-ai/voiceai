/**
 * The avatar lab's bridge: it runs a request only from the page framing it, on
 * its own origin, answers that page once with the request's id, answers an
 * unknown command not ok, never answers its own replies, and stops on dispose.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startLabBridge } from '../../src/avatar-lab/lab-bridge.js';
import type { LabDeps } from '../../src/avatar-lab/lab-commands.js';
import { LAB_MESSAGE_TYPE } from '../../src/ui/avatar-lab-protocol.js';
import { releaseCrisisFace } from '../../src/ui/face/crisis-face-hold.js';

function fakeDeps() {
  return {
    driver: { update: vi.fn(), shown: vi.fn(() => 'none' as const) },
    soul: {
      triggerWarmthBloom: vi.fn(),
      triggerMemorySpark: vi.fn(),
      startComfortPulse: vi.fn(),
      stopComfortPulse: vi.fn(),
      enterProtectiveMode: vi.fn(),
      exitProtectiveMode: vi.fn(),
      celebrateGrowth: vi.fn(),
      triggerCameoArrival: vi.fn(),
      triggerCameoReturn: vi.fn(),
      getState: () => ({
        isInitialized: true,
        reducedMotion: false,
        comfortPulseActive: false,
        protectiveMode: false,
      }),
    },
    setExpression: vi.fn(),
    playNameLift: vi.fn(),
    holdCrisisFace: vi.fn(),
    releaseCrisisFace: vi.fn(),
    personaColor: vi.fn(() => ''),
  };
}

const sparkRequest = {
  type: LAB_MESSAGE_TYPE,
  id: 'req-7',
  command: { name: 'moment', moment: 'memorySpark' },
};

/** The lab's window here is the top window, so its parent is itself. */
function post(data: unknown, init: { origin?: string; source?: Window | null } = {}): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data,
      origin: init.origin ?? window.location.origin,
      source: init.source === undefined ? window : init.source,
    })
  );
}

let deps: ReturnType<typeof fakeDeps>;
let postMessage: ReturnType<typeof vi.spyOn>;
let dispose: () => void;

beforeEach(() => {
  releaseCrisisFace();
  deps = fakeDeps();
  postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
  dispose = startLabBridge(window, deps as unknown as LabDeps);
});

afterEach(() => {
  dispose();
  vi.restoreAllMocks();
});

describe('startLabBridge', () => {
  it('runs a good request and replies once to the parent, on its own origin, with the same id', () => {
    expect(window.parent).toBe(window);
    post(sparkRequest);
    expect(deps.soul.triggerMemorySpark).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith(
      { type: LAB_MESSAGE_TYPE, id: 'req-7', ok: true, ran: 'triggerMemorySpark' },
      window.location.origin
    );
  });

  it('ignores a message from another origin: no reply, no call', () => {
    post(sparkRequest, { origin: 'https://evil.example' });
    expect(deps.soul.triggerMemorySpark).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('ignores a message from a window that is not the parent: no reply, no call', () => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    try {
      post(sparkRequest, { source: frame.contentWindow });
      post(sparkRequest, { source: null });
    } finally {
      frame.remove();
    }
    expect(deps.soul.triggerMemorySpark).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('answers an unknown command not ok, with its id, and runs nothing', () => {
    post({ type: LAB_MESSAGE_TYPE, id: 'req-8', command: { name: '__proto__' } });
    post({ type: LAB_MESSAGE_TYPE, id: 'req-9', command: { name: 'face', expression: 'smirk' } });
    expect(postMessage.mock.calls).toEqual([
      [
        { type: LAB_MESSAGE_TYPE, id: 'req-8', ok: false, why: 'unknown command' },
        window.location.origin,
      ],
      [
        { type: LAB_MESSAGE_TYPE, id: 'req-9', ok: false, why: 'unknown command' },
        window.location.origin,
      ],
    ]);
    expect(deps.setExpression).not.toHaveBeenCalled();
  });

  it('never answers a reply, so the unframed lab does not talk to itself', () => {
    post({ type: LAB_MESSAGE_TYPE, id: 'req-7', ok: true, ran: 'triggerMemorySpark' });
    post({ type: LAB_MESSAGE_TYPE, id: 'req-7', ok: false, command: { name: 'status' } });
    post({ type: 'other', id: 'x', command: { name: 'status' } });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('replies not ok when the export throws, and keeps answering', () => {
    deps.soul.triggerMemorySpark.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    post(sparkRequest);
    post(sparkRequest);
    expect(postMessage.mock.calls.map(([reply]) => reply)).toEqual([
      {
        type: LAB_MESSAGE_TYPE,
        id: 'req-7',
        ok: false,
        why: 'Something went wrong, so this did not play',
      },
      { type: LAB_MESSAGE_TYPE, id: 'req-7', ok: true, ran: 'triggerMemorySpark' },
    ]);
  });

  it('after dispose, nothing runs and nothing replies', () => {
    dispose();
    post(sparkRequest);
    expect(deps.soul.triggerMemorySpark).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });
});
