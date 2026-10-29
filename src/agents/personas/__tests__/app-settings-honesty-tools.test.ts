/**
 * Every tool the APP_SETTINGS_HONESTY prompt names is a registered tool, looked up by name in
 * the registry: rename one and the prompt would offer a setting Ferni cannot set.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { toolRegistry } from '../../../tools/registry/index.js';
import { autoRegisterAllDomains, loadToolDomainsLazy } from '../../../tools/registry/loader.js';
import { appSettingsHonesty, SETTING_TOOL_IDS } from '../app-settings-honesty.js';

beforeAll(async () => {
  await autoRegisterAllDomains();
  await loadToolDomainsLazy(['ambient-mode', 'information', 'simple-utilities']);
}, 180_000);

describe('tools the settings prompt names', () => {
  it.each(Object.values(SETTING_TOOL_IDS))('%s is in the tool registry and in the prompt', (id) => {
    expect(toolRegistry.get(id), id).toBeDefined();
    expect(appSettingsHonesty()).toContain(`(${id})`);
  });

  it('the prompt names no tool the list does not', () => {
    const named = [...appSettingsHonesty().matchAll(/\((set[A-Za-z]+)\)/g)].map((m) => m[1]);
    expect(named.sort()).toEqual(Object.values(SETTING_TOOL_IDS).sort());
  });
});
