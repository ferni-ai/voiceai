/**
 * Icon names a workflow template, built-in workflow or saved routine may carry.
 * The web client draws each one from its brand set with getIdeaIcon()
 * (apps/web/src/ui/icons/idea-icons.ts); the server only ever sends the name.
 * Keep the two lists in step: apps/web/tests/idea-icons.test.ts checks them.
 */
export type TemplateIconName =
  | 'sunrise'
  | 'lotus'
  | 'thought'
  | 'target'
  | 'droplet'
  | 'leaf'
  | 'home'
  | 'moon'
  | 'car'
  | 'wallet'
  | 'sparkles'
  | 'notebook'
  | 'wind'
  | 'heart'
  | 'message'
  | 'eye'
  | 'trophy'
  | 'flame'
  | 'check'
  | 'calendar'
  | 'briefcase'
  | 'chart'
  | 'cart';
