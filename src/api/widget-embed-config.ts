/**
 * Widget embed config resolution (browser-side, shipped inside embed.js).
 *
 * Kept as plain ES5-safe JavaScript source so the exact code served to
 * third-party sites is what the unit tests execute.
 *
 * Accepted configuration, highest priority first:
 *   1. window.FerniWidget  = { widgetId, apiBase }           (documented SDK form)
 *   2. window.FERNI_CONFIG = { agentId | widgetId, apiUrl }  (CLI-generated pages)
 *   3. <script data-widget-id="..." data-api-base="..." src=".../embed.js">
 *
 * apiBase defaults to the origin of embed.js itself, so on third-party sites
 * requests go back to Ferni rather than to the host page. Empty strings count
 * as "not set" (CLI pages emit apiUrl: '').
 *
 * @module api/widget-embed-config
 */

export const WIDGET_CONFIG_RESOLVER_JS = `
function resolveFerniWidgetConfig(win, script) {
  function pick() {
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (typeof v === 'string' && v.trim() !== '') return v.trim();
    }
    return undefined;
  }
  function attr(name) {
    return script && script.getAttribute ? script.getAttribute(name) : null;
  }
  var fw = win.FerniWidget || {};
  var fc = win.FERNI_CONFIG || {};
  var scriptOrigin;
  try {
    if (script && script.src) scriptOrigin = new URL(script.src, win.location && win.location.href).origin;
  } catch (e) {
    scriptOrigin = undefined;
  }
  var apiBase = pick(fw.apiBase, fc.apiUrl, fc.apiBase, attr('data-api-base'), scriptOrigin) || '';
  return {
    widgetId: pick(fw.widgetId, fc.widgetId, fc.agentId, attr('data-widget-id')),
    apiBase: apiBase.replace(/\\/+$/, '')
  };
}
`;
