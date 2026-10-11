/**
 * The per-reply "Right now" line (WORLD_NOW=on): the caller's time recomputed
 * every reply, in their zone, and nothing about the world that a tool should
 * look up instead.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { withTurnReminder } from '../../personas/turn-request.js';
import {
  formatAwarenessFacts,
  type AwarenessFacts,
} from '../../../intelligence/context-builders/behavioral/awareness.js';
import { cachedHomeWeather, warmWorldCache } from '../../../services/world-awareness/index.js';
import {
  holidayOn,
  rightNowLine,
  shortWeather,
  WORLD_NOW_RULE,
  worldNowEnabled,
  worldNowNote,
} from '../world-now.js';

const weather = vi.hoisted(() => ({
  current: vi.fn(
    async (place: string) => `Right now in ${place}: 84°F with partly cloudy, feels like 90°F.`
  ),
  forecast: vi.fn(async () => '3-day forecast'),
}));
vi.mock('../../../tools/domains/information/weather.js', () => ({
  getCurrentWeather: weather.current,
  getWeatherForecast: weather.forecast,
}));

const tokens = (text: string): number => Math.ceil(text.length / 4);
// 3:18 pm Eastern on Sunday, Oct 11 2026: the dev call where Ferni said "seven fifteen in the evening".
const AT = new Date('2026-10-11T19:18:00Z');

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('rightNowLine', () => {
  it("states the caller's local day, time and part of the day, not the server's UTC", () => {
    const line = rightNowLine({ now: AT, callerZone: 'America/New_York' });
    expect(line).toBe('Right now for the caller: Sunday, Oct 11, 3:18 PM EDT, afternoon.');
    expect(line).not.toContain('7:18');
  });

  it('crosses an hour and a day boundary between replies of one call', () => {
    const zone = 'America/New_York';
    expect(rightNowLine({ now: new Date('2026-10-12T03:55:00Z'), callerZone: zone })).toContain(
      'Sunday, Oct 11, 11:55 PM EDT, night'
    );
    expect(rightNowLine({ now: new Date('2026-10-12T04:10:00Z'), callerZone: zone })).toContain(
      'Monday, Oct 12, 12:10 AM EDT, night'
    );
  });

  it("says the caller's time is unknown (a phone call with no zone) instead of guessing", () => {
    const line = rightNowLine({ now: AT });
    expect(line).toContain("the caller's local time is unknown");
    expect(line).not.toMatch(/afternoon|evening|morning/);
  });

  it("adds Ferni's own clock, a holiday and the home weather, and stays within 40 tokens", () => {
    const line = rightNowLine({
      now: new Date('2026-11-27T01:30:00Z'),
      callerZone: 'America/Chicago',
      ferniClock: true,
      homeWeather: 'Right now in Austin, Texas: 61°F with clear sky. Wind 5 mph.',
    });
    expect(line).toBe(
      'Right now for the caller: Thursday, Nov 26, 7:30 PM CST, evening. For you: 6:30 PM mountain. Today is Thanksgiving. At their home: 61°F, clear sky.'
    );
    expect(tokens(line)).toBeLessThanOrEqual(40);
  });
});

describe('holidays and weather', () => {
  it('finds moving holidays on their real dates', () => {
    expect(holidayOn(2026, 11, 26)).toBe('Thanksgiving');
    expect(holidayOn(2026, 11, 19)).toBeUndefined();
    expect(holidayOn(2026, 5, 25)).toBe('Memorial Day');
    expect(holidayOn(2027, 1, 18)).toBe('Martin Luther King Jr. Day');
    expect(holidayOn(2026, 10, 31)).toBe('Halloween');
    expect(holidayOn(2026, 10, 11)).toBeUndefined();
  });

  it('never passes a failed weather lookup on as weather', () => {
    expect(
      shortWeather('Right now in Tampa, Florida: 84°F with partly cloudy, feels like 90°F.')
    ).toBe('84°F, partly cloudy');
    expect(
      shortWeather('I couldn\'t find weather data for "Nowhere". Try a major city name?')
    ).toBe(undefined);
  });
});

describe('worldNowNote', () => {
  const web = { userData: { callerTimezone: 'America/New_York', services: { sessionId: 's1' } } };
  const phone = {
    userData: {
      services: { sessionId: 's2', userProfile: { contactInfo: { timezone: 'America/Denver' } } },
    },
  };

  it('is empty unless WORLD_NOW=on', () => {
    expect(worldNowEnabled({})).toBe(false);
    expect(worldNowEnabled({ WORLD_NOW: 'true' })).toBe(false);
    expect(worldNowNote(web, AT)).toBe('');
  });

  it("uses the browser's zone on the web and the profile's on a phone call", () => {
    vi.stubEnv('WORLD_NOW', 'on');
    expect(worldNowNote(web, AT)).toContain('3:18 PM EDT');
    expect(worldNowNote(phone, AT)).toContain('1:18 PM MDT');
  });

  it('gives a fresh time each reply', () => {
    vi.stubEnv('WORLD_NOW', 'on');
    const later = new Date(AT.getTime() + 47 * 60_000);
    expect(worldNowNote(web, AT)).toContain('3:18 PM');
    expect(worldNowNote(web, later)).toContain('4:05 PM');
  });

  it('reaches the reply request only with the flag on', () => {
    const chat = llm.ChatContext.empty();
    chat.addMessage({ role: 'user', content: 'what time is it?' });
    const sent = (): string =>
      (withTurnReminder(chat, web).items.at(-1) as llm.ChatMessage).textContent ?? '';
    const off = sent();
    expect(off).not.toContain('Right now');
    vi.stubEnv('WORLD_NOW', 'on');
    expect(sent()).toContain('(Right now for the caller:');
  });
});

describe('the per-turn context note', () => {
  const facts: AwarenessFacts = {
    currentDate: 'October 11, 2026',
    dayOfWeek: 'Sunday',
    currentTime: '7:18 PM',
    userName: 'Seth',
  };

  it('drops its server-clock time with WORLD_NOW on, keeps it off', () => {
    expect(formatAwarenessFacts(facts)).toContain(
      '**Date/Time:** October 11, 2026 (Sunday) at 7:18 PM'
    );
    vi.stubEnv('WORLD_NOW', 'on');
    expect(formatAwarenessFacts(facts)).not.toContain('Date/Time');
    expect(formatAwarenessFacts(facts)).toContain('**Talking to:** Seth');
  });

  it('tells the model to look up news, games and weather rather than guess', () => {
    expect(WORLD_NOW_RULE).toMatch(/getNews, getSports, getWeather/);
    expect(WORLD_NOW_RULE).toMatch(/never make one up/);
  });
});

describe('cachedHomeWeather', () => {
  it('fetches only the current weather at call start, then refreshes after 30 minutes', async () => {
    weather.current.mockClear();
    weather.forecast.mockClear();
    expect(cachedHomeWeather('nobody')).toBeUndefined();

    await warmWorldCache('u-home', { location: 'Tampa, FL' }, { weatherOnly: true });
    await vi.waitFor(() => expect(cachedHomeWeather('u-home')).toContain('84°F'));
    expect(weather.current).toHaveBeenCalledTimes(1);
    expect(weather.forecast).not.toHaveBeenCalled();

    // Within 30 minutes: served from the cache, no fetch.
    cachedHomeWeather('u-home', Date.now() + 10 * 60_000);
    expect(weather.current).toHaveBeenCalledTimes(1);
    // Older: still served once, and one background refresh starts.
    expect(cachedHomeWeather('u-home', Date.now() + 31 * 60_000)).toContain('84°F');
    await vi.waitFor(() => expect(weather.current).toHaveBeenCalledTimes(2));
  });

  it('fetches nothing without a saved home', async () => {
    weather.current.mockClear();
    await warmWorldCache('u-nohome', {}, { weatherOnly: true });
    expect(cachedHomeWeather('u-nohome')).toBeUndefined();
    expect(weather.current).not.toHaveBeenCalled();
  });
});
