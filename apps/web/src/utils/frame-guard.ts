/**
 * The approval (/p/:id) and answer card (/a/:id) pages must never be framed:
 * a framed approve button is a clickjacking target. The hosting and server
 * headers (X-Frame-Options DENY, frame-ancestors 'none') are the defense;
 * this is the fallback for a host that drops them.
 *
 * @module utils/frame-guard
 */

/** True, with the page emptied, when this window is inside a frame. */
export function refuseFraming(win: Window = window): boolean {
  let framed: boolean;
  try {
    framed = win.top !== win.self;
  } catch {
    framed = true; // a cross-origin parent can make even the comparison throw
  }
  if (framed) win.document.body.replaceChildren();
  return framed;
}
