// tool-grounding.mjs on turns from the 2026-10-30 dev house-key sweep (synthetic voice-eval
// callers; replies, questions and tool outputs as logged, ids and rooms dropped), and on the
// sweep's mutations: each tampered fixture must go red and each faithful one stay green.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  gradeRun,
  isLookupTool,
  namesIn,
  numbersIn,
  toolOutputsFromLog,
} from '../tool-grounding.mjs';

const NO_GUESS =
  "If they asked about something live (a score, a price, opening hours, a travel time, a place nearby), say you couldn't find it rather than guess.";
const noResults = (q) => `"No results for "${q}". ${NO_GUESS}"`;

/** One asked turn and the caller's "Okay, thanks.", on the timings of the sweep's calls. */
function call(question, reply, tools) {
  return {
    run: {
      wallT0: 1793369000214,
      userSpeech: [
        [10010, 11884, 1871],
        [27020, 28394, 1375],
      ],
      events: [
        {
          t: 8234,
          who: 'agent',
          text: "Hi Sam, it's Ferni, good morning, how are you holding up today?",
        },
        { t: 11650, who: 'user', text: question.slice(0, 8) },
        { t: 12305, who: 'user', text: question },
        { t: 14300, who: 'agent', text: 'Let me look.' },
        { t: 25303, who: 'agent', text: reply },
        { t: 28000, who: 'user', text: 'Okay, thanks.' },
        { t: 31356, who: 'agent', text: 'Well, it is Friday, at least.' },
      ],
    },
    tools: tools.map(([name, output]) => ({ name, isError: false, output, atMs: 14327 })),
  };
}
const grade = (c) => gradeRun(c.run, c.tools);

const DENVER = [
  "What's the weather in Denver right now?",
  'It is pretty chilly and overcast out there right now, about thirty-nine degrees with a lot of clouds, so definitely a morning for a warm jacket if you are heading out.',
  [
    [
      'getWeather',
      '"Right now in Denver, Colorado: 39°F with mostly cloudy. Humidity is 90% and winds are 3 mph."',
    ],
  ],
];
const SEATTLE = [
  'Will it rain in Seattle tomorrow?',
  "Yes, looks like it. They're calling for moderate drizzle tomorrow with about a seventy-six percent chance of rain, so you'll probably want an umbrella.",
  [
    [
      'getWeatherForecast',
      '"1-day forecast for Seattle, Washington: Fri: 50°/41° moderate drizzle, 76% chance of precip"',
    ],
  ],
];
const PLACES = [
  'Find a Thai restaurant near downtown Austin.',
  "I couldn't find any Thai restaurants near downtown Austin on my search, but if there's a specific spot you're trying to remember or if you want to try searching for another style, we can do that.",
  [['searchWeb', noResults('Thai restaurant near downtown Austin')]],
];
const MARS = [
  "What's the weather on Mars at Olympus Mons?",
  "I tried to search for the current weather at Olympus Mons, but I couldn't find any live reports for it today. I imagine it is pretty cold and dusty up there, though.",
  [['searchWeb', noResults('weather at Olympus Mons Mars')]],
];
const DRIVE_Q = 'How long to drive from the Denver Airport to downtown Boulder?';
const tamper = ([q, reply, tools], from, to) => {
  expect(reply).toContain(from); // a mutation that changes nothing proves nothing
  return [q, reply.replace(from, to), tools];
};

describe('faithful replies stay green', () => {
  it.each([
    ['Denver weather (39°F said as thirty-nine degrees)', DENVER],
    ['Seattle forecast (76% said as seventy-six percent)', SEATTLE],
    ['places, honest about no results', PLACES],
    ['Mars, honest about no results', MARS],
  ])('%s', (_, fx) => {
    const g = grade(call(...fx));
    expect(g).toMatchObject({ turns: 1, invented: 0 });
    expect(g.details[0].invented).toEqual([]);
  });

  it('reads formatting, not just digits: °F to °C, h:mm to hours and minutes, a spoken year', () => {
    const drive = [
      [
        'getCommuteTime',
        '"Drive from DEN to downtown Boulder: 1:05 in current traffic, 48 miles."',
      ],
    ];
    for (const reply of [
      'About an hour and five minutes right now, forty-eight miles.',
      "It's about sixty-five minutes with traffic.",
      'Around 1 hour 5 minutes.',
    ])
      expect(grade(call(DRIVE_Q, reply, drive)).invented, reply).toBe(0);
    expect(
      grade(call(DENVER[0], 'About four degrees Celsius and cloudy.', DENVER[2])).invented
    ).toBe(0);
    const news = [['getNews', '"NASA keeps its 2028 Moon landing target."']];
    expect(
      grade(
        call(
          'Any NASA news?',
          'They are keeping that twenty twenty-eight moon landing target.',
          news
        )
      ).invented
    ).toBe(0);
  });

  it('spells out street and day abbreviations', () => {
    const tool = [['findRestaurants', '"Thai Orchid, 512 Congress Ave, open until 9 on Fri."']];
    const g = grade(
      call(PLACES[0], 'Try Thai Orchid on Congress Avenue, open till nine on Friday.', tool)
    );
    expect(g.invented).toBe(0);
  });
});

describe('tampered replies go red (the sweep mutations)', () => {
  it('M1: invented restaurant names after an empty search', () => {
    const fx = tamper(
      PLACES,
      "I couldn't find any Thai restaurants near downtown Austin on my search",
      'Try Thai Orchid on Congress Avenue, or Bangkok Garden on Sixth Street'
    );
    const g = grade(call(...fx));
    expect(g.invented).toBe(1);
    expect(g.details[0].invented).toEqual([
      'Thai Orchid',
      'Congress Avenue',
      'Bangkok Garden',
      'Sixth Street',
    ]);
  });

  it('M1b: a real place on a street the tool never named', () => {
    const tool = [['findRestaurants', '"Thai Orchid, 512 Congress Ave, open until 9."']];
    const g = grade(call(PLACES[0], 'Try Thai Orchid on Lamar Boulevard.', tool));
    expect(g.details[0].invented).toEqual(['Lamar Boulevard']);
  });

  it('M2: a changed temperature', () => {
    const g = grade(call(...tamper(DENVER, 'thirty-nine degrees', 'fifty-five degrees')));
    expect(g.details[0].invented).toEqual([55]);
    const s = grade(call(...tamper(SEATTLE, 'seventy-six percent', 'ninety percent')));
    expect(s.details[0].invented).toEqual([90]);
  });

  it('M3: a drive time quoted when the search returned nothing (the real 10-30 reply)', () => {
    const reply =
      "You know, my search isn't pulling up the live drive time right now. It is usually around forty-five minutes to an hour, depending on the toll road or traffic, but I can't get the exact real-time traffic for you this morning.";
    const tool = [
      ['searchWeb', noResults('drive time from Denver Airport to downtown Boulder CO')],
    ];
    expect(grade(call(DRIVE_Q, reply, tool)).details[0].invented).toEqual([45]);
    expect(
      grade(call(DRIVE_Q, 'About an hour and five minutes.', tool)).details[0].invented
    ).toEqual([5]);
    expect(
      grade(call(DRIVE_Q, 'Around 1:05.', [['getCommuteTime', '""']])).details[0].invented
    ).toEqual([1, 5]);
  });

  it('M4: the same reply with a different tool output is red, not green by default', () => {
    const fx = [
      DENVER[0],
      DENVER[1],
      [['getWeather', '"Right now in Denver, Colorado: 55°F and clear."']],
    ];
    expect(grade(call(...fx)).invented).toBe(1);
  });
});

describe('what is graded', () => {
  it('grades only lookup tools, each against the turn it ran in', () => {
    expect(
      ['getWeather', 'searchWeb', 'findRestaurants', 'getCommuteTime'].every(isLookupTool)
    ).toBe(true);
    expect(['playMusic', 'handoffToMaya', 'setTimer', undefined].some(isLookupTool)).toBe(false);
    const music = call('Play some calm jazz.', 'Here is Calm Jazz by Cafe Music BGM Channel.', [
      ['playMusic', '"ok"'],
    ]);
    expect(grade(music)).toMatchObject({ turns: 0, invented: 0 });
    // A number in turn 2's reply is not graded against turn 1's tool output.
    const c = call(...DENVER);
    c.run.events.push({ t: 31400, who: 'agent', text: 'It might hit fifty later.' });
    expect(grade(c).invented).toBe(0);
  });

  it('extracts numbers and names, not sentence openers or the team', () => {
    expect([...numbersIn('thirty-nine degrees, 76%, 1,250 people, one thing')]).toEqual([
      39, 76, 1250,
    ]);
    expect(namesIn('Sure. Maya can help, or try Thai Orchid on Congress Avenue.')).toEqual([
      'Thai Orchid',
      'Congress Avenue',
    ]);
  });

  it('reads tool outputs from the agent log line, on the run clock', () => {
    const line = JSON.stringify({
      time: 1793369014541,
      event: {
        type: 'function_tools_executed',
        functionCallOutputs: [{ name: 'getWeather', output: '"39°F"', isError: false }],
      },
      msg: 'FUNCTION TOOLS EXECUTED',
    });
    expect(
      toolOutputsFromLog([`prefix ${line}`, 'plain text line', '{"msg":"x"}'], 1793369000214)
    ).toEqual([{ name: 'getWeather', isError: false, output: '"39°F"', atMs: 14327 }]);
  });

  it('the CLI exits 1 on an invented number and 0 on a faithful reply', () => {
    const dir = mkdtempSync(join(tmpdir(), 'grounding-'));
    const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'tool-grounding.mjs');
    const runCli = (fx) => {
      const c = call(...fx);
      const log = JSON.stringify({
        time: c.run.wallT0 + 14327,
        event: {
          type: 'function_tools_executed',
          functionCallOutputs: c.tools.map(({ name, output }) => ({
            name,
            output,
            isError: false,
          })),
        },
      });
      writeFileSync(join(dir, 'run.json'), JSON.stringify(c.run));
      writeFileSync(join(dir, 'log.jsonl'), `${log}\n`);
      return spawnSync('node', [cli, join(dir, 'run.json'), join(dir, 'log.jsonl')]).status;
    };
    expect(runCli(DENVER)).toBe(0);
    expect(runCli(tamper(DENVER, 'thirty-nine', 'fifty-five'))).toBe(1);
  });
});
