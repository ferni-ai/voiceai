/**
 * The admin side of the avatar lab bridge: posts one LabRequest to the
 * /avatar-lab frame and resolves with the lab's LabReply of the same id. A
 * reply counts only when it comes from that frame's window, on this page's
 * origin, and parses as a LabReply; anything else is ignored. No reply in
 * time, or no frame window, resolves as "lab not ready", never as a success.
 *
 * @module admin/sections/avatar-lab-client
 */
import {
  LAB_MESSAGE_TYPE,
  parseLabReply,
  type LabCommand,
  type LabReply,
  type LabRequest,
} from '../../ui/avatar-lab-protocol.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('AvatarLabClient');

type LabNotReady = { ok: false; why: 'lab not ready' };
export type LabAnswer = LabReply | LabNotReady;

const notReady = (): LabNotReady => ({ ok: false, why: 'lab not ready' });

export function isLabNotReady(answer: LabAnswer): answer is LabNotReady {
  return !('type' in answer);
}

interface Pending {
  resolve: (answer: LabAnswer) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function createLabClient(
  frame: HTMLIFrameElement,
  win: Window,
  timeoutMs = 2000
): { send(command: LabCommand): Promise<LabAnswer>; dispose(): void } {
  const origin = win.location.origin;
  const pending = new Map<string, Pending>();
  let next = 0;
  let disposed = false;

  const settle = (id: string, answer: LabAnswer): void => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    entry.resolve(answer);
  };

  const onMessage = (event: MessageEvent): void => {
    const lab = frame.contentWindow;
    if (event.origin !== origin || lab === null || event.source !== lab) return;
    const reply = parseLabReply(event.data);
    if (reply) settle(reply.id, reply);
  };
  win.addEventListener('message', onMessage);

  return {
    send(command) {
      const lab = frame.contentWindow;
      if (disposed || lab === null) return Promise.resolve(notReady());
      next += 1;
      const id = `admin-${next}-${Math.random().toString(36).slice(2, 8)}`;
      return new Promise<LabAnswer>((resolve) => {
        const timer = setTimeout(() => settle(id, notReady()), timeoutMs);
        pending.set(id, { resolve, timer });
        const request: LabRequest = { type: LAB_MESSAGE_TYPE, id, command };
        try {
          lab.postMessage(request, origin);
        } catch (error) {
          log.warn('Could not post to the avatar lab', {
            name: command.name,
            error: String(error),
          });
          settle(id, notReady());
        }
      });
    },
    dispose() {
      disposed = true;
      win.removeEventListener('message', onMessage);
      for (const id of [...pending.keys()]) settle(id, notReady());
    },
  };
}
