/** Which model judges an eval: Flash unless JUDGE_MODEL asks for Pro or names a model. */
import { describe, expect, it } from 'vitest';

import { PROVIDERS } from '../../voice-eval/judge.mjs';
import { JUDGE_FLASH, JUDGE_PRO, judgeModel } from '../judge-model.mjs';

describe('judgeModel', () => {
  it('defaults to the Flash id when JUDGE_MODEL is unset or blank', () => {
    expect(judgeModel({})).toBe('gemini-3.5-flash');
    expect(judgeModel({ JUDGE_MODEL: '  ' })).toBe(JUDGE_FLASH);
    expect(judgeModel({ JUDGE_MODEL: 'flash' })).toBe(JUDGE_FLASH);
  });

  it('maps JUDGE_MODEL=pro to the Pro id', () => {
    expect(judgeModel({ JUDGE_MODEL: 'pro' })).toBe('gemini-3.1-pro-preview');
    expect(JUDGE_PRO).not.toBe(JUDGE_FLASH);
  });

  it('passes any other value through as the model id', () => {
    expect(judgeModel({ JUDGE_MODEL: 'gemini-2.5-flash-lite' })).toBe('gemini-2.5-flash-lite');
    expect(judgeModel({ JUDGE_MODEL: 'gemini-3.1-pro-preview' })).toBe(JUDGE_PRO);
  });

  it('uses the fallback only when JUDGE_MODEL is unset', () => {
    expect(judgeModel({}, 'pro')).toBe(JUDGE_PRO);
    expect(judgeModel({ JUDGE_MODEL: 'flash' }, 'pro')).toBe(JUDGE_FLASH);
  });

  it('reads process.env by default', () => {
    const was = process.env.JUDGE_MODEL;
    try {
      delete process.env.JUDGE_MODEL;
      expect(judgeModel()).toBe(JUDGE_FLASH);
      process.env.JUDGE_MODEL = 'pro';
      expect(judgeModel()).toBe(JUDGE_PRO);
    } finally {
      if (was === undefined) delete process.env.JUDGE_MODEL;
      else process.env.JUDGE_MODEL = was;
    }
  });

  it('keeps the call judge (judge.mjs) on Pro unless JUDGE_MODEL=flash', () => {
    expect(PROVIDERS.gemini.model({})).toBe(JUDGE_PRO);
    expect(PROVIDERS.gemini.model({ JUDGE_MODEL: 'flash' })).toBe(JUDGE_FLASH);
    expect(PROVIDERS.gemini.model({ JUDGE_MODEL: 'gemini-2.5-flash' })).toBe('gemini-2.5-flash');
  });
});
