/**
 * The avatar lab's message bridge. It runs a lab request only when it comes
 * from the page that frames the lab, on the lab's own origin, and answers that
 * page alone. Anything else (another origin, another window) gets no answer
 * and runs nothing.
 */
import { createLogger } from '../utils/logger.js';
import {
  COMMAND_FAILED,
  runLabCommand,
  UNKNOWN_COMMAND,
  type LabDeps,
  type LabResult,
} from './lab-commands.js';
import {
  LAB_MESSAGE_TYPE,
  parseLabReply,
  parseLabRequest,
  unknownRequestId,
  type LabReply,
  type LabRequest,
} from '../ui/avatar-lab-protocol.js';

const log = createLogger('AvatarLabBridge');

function run(request: LabRequest, deps: LabDeps): LabResult {
  try {
    return runLabCommand(request.command, deps);
  } catch (error) {
    log.error('Lab command failed', { name: request.command.name, error: String(error) });
    return COMMAND_FAILED;
  }
}

/** Starts answering lab requests from `win.parent`; returns the function that stops it. */
export function startLabBridge(win: Window, deps: LabDeps): () => void {
  const reply = (id: string, result: LabResult): void => {
    const message: LabReply = { type: LAB_MESSAGE_TYPE, id, ...result };
    win.parent.postMessage(message, win.location.origin);
  };

  const onMessage = (event: MessageEvent): void => {
    if (event.origin !== win.location.origin || event.source !== win.parent) return;
    // A reply is never run or answered: unframed, the lab's parent is itself and hears its own replies.
    if (parseLabReply(event.data)) return;
    const request = parseLabRequest(event.data);
    if (request) return reply(request.id, run(request, deps));
    const unknownId = unknownRequestId(event.data);
    if (unknownId !== null) reply(unknownId, UNKNOWN_COMMAND); // a command the lab does not know
  };

  win.addEventListener('message', onMessage);
  return () => win.removeEventListener('message', onMessage);
}
