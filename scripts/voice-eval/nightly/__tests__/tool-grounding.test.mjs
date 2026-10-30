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
  nightGrounding,
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

// #3143 verify round 1: the independent fixtures (/Volumes/Work/verify/3143-logs/fixtures.mjs),
// names made fictional, and the replies from the real 10-28 and 10-30 nightlies that the first
// version flagged. One caller turn at 1000 ms, the tool at 3000 ms, the reply at 4000 ms.
describe('verify round 1: independent fixtures', () => {
  const one = (q, reply, name, output, context) =>
    gradeRun(
      {
        userSpeech: [[1000, 2500]],
        events: [
          { who: 'user', t: 1000, text: q },
          { who: 'agent', t: 4000, text: reply },
        ],
      },
      [{ name, isError: false, output, atMs: 3000 }],
      { context }
    );
  const INVENTED = [
    [
      'places',
      'Thai place in Austin?',
      'Try Lotus Garden or the Saffron Room.',
      'findRestaurants',
      '"No results for thai near Austin."',
    ],
    [
      'unmentioned street',
      'Thai place in Austin?',
      'Thai Kitchen is good, it is over on Guadalupe Street.',
      'findRestaurants',
      '"Thai Kitchen (4.5 stars), 3009 Lamar Blvd"',
    ],
    [
      'temperature',
      'Weather in Denver?',
      "It's sixty-two degrees and sunny.",
      'getWeather',
      '"Denver: 39°F, sunny, humidity 40%"',
    ],
    [
      'percent',
      'Rain tomorrow?',
      "There's about a sixty percent chance of rain.",
      'getWeatherForecast',
      '"Tomorrow: 50°/41°, drizzle, 76% chance of rain"',
    ],
    [
      'price',
      'Flight to Phoenix?',
      'The cheapest is one hundred forty-nine dollars on Southwest.',
      'searchFlights',
      '"Cheapest: $212 on Southwest, departs 7:05am"',
    ],
    [
      'time, empty output',
      'When does the pharmacy close?',
      'It closes at nine tonight.',
      'searchWeb',
      '""',
    ],
    [
      'time, no results',
      'When does the pharmacy close?',
      'It closes around eight thirty.',
      'searchWeb',
      '"No results for pharmacy hours."',
    ],
  ];
  const FAITHFUL = [
    [
      'about forty for 39°F',
      'Weather?',
      "It's about forty degrees, pretty cloudy.",
      'getWeather',
      '"Denver: 39°F, mostly cloudy"',
    ],
    [
      'a little after five',
      'Sunset?',
      'Sunset is a little after five tonight.',
      'getWeather',
      '"Sunset 5:07 PM, sunrise 7:12 AM"',
    ],
    [
      'nine hundred and sixty km, nine hours',
      'How far to Zion?',
      "It's around nine hundred and sixty kilometers, about nine hours.",
      'getCommuteTime',
      '"Distance: 961 km. Current time: 534 minutes"',
    ],
    [
      "the caller's own names",
      'Is Blue Sushi on Pearl Street good? My friend Marisol loves it.',
      'Blue Sushi gets solid reviews, and if Marisol loves it, Pearl Street is fun.',
      'searchLocalBusinesses',
      '"Blue Sushi Sake Grill: 4.3 stars"',
    ],
    [
      'sentence-start caps, abbreviated weekdays',
      'This weekend?',
      'Okay so, Saturday looks wet. Sunday clears up. Honestly, Monday is nicest.',
      'getWeatherForecast',
      '"Sat: rain 80%. Sun: 55°. Mon: 60°, sunny"',
    ],
    [
      'weekdays over ISO dates',
      'Rain this weekend?',
      'Rain on Saturday, then it dries out by Sunday.',
      'getWeatherForecast',
      '{"days":[{"date":"2026-10-31","summary":"rain"},{"date":"2026-11-01","summary":"clear"}]}',
    ],
    [
      'a count of the list',
      'Thai places near me?',
      'I found three nearby: Thai Orchid, Bangkok Garden and Siam House.',
      'findRestaurants',
      '[{"name":"Thai Orchid"},{"name":"Bangkok Garden"},{"name":"Siam House"}]',
    ],
    [
      'the eval caller addressed by name',
      'Weather?',
      "Morning, Sam. It's thirty-nine and cloudy.",
      'getWeather',
      '"39°F, cloudy"',
    ],
    [
      'a plural demonym',
      'Any news?',
      'Australians are following a big court appeal today.',
      'getNews',
      '"Australian mushroom murderer loses appeal"',
    ],
    [
      'a unit and a time word mid-sentence',
      'Weather?',
      "It's cloudy, Fahrenheit-wise thirty-nine, and Tomorrow looks better.",
      'getWeather',
      '"39F cloudy; tomorrow sunny"',
    ],
    [
      'a remembered fact on a lookup turn',
      'My calendar?',
      "Your calendar isn't connected, but you told me your mom flies in from Ohio next Saturday.",
      'getCalendarToday',
      '"No calendar is connected yet."',
      'My mom flies in from Ohio next Saturday.', // the seeded call
    ],
    [
      'half past nine',
      'When does it open?',
      'It opens at half past nine.',
      'searchLocalBusinesses',
      '"Opens 9:30 AM"',
    ],
    ['°F to °C', 'In Celsius?', "That's about four degrees Celsius.", 'getWeather', '"39°F"'],
  ];
  it.each(INVENTED)('red: %s', (_, ...fx) => expect(one(...fx).invented).toBe(1));
  it.each(FAITHFUL)('green: %s', (_, ...fx) => expect(one(...fx).details[0].invented).toEqual([]));

  // Round 2 removed the ", Name." address skip (it let "a Thai spot, Lotus." through). Only the
  // eval caller (EVAL_CALLER_NAME, default Sam) is skipped; another name is graded.
  it('grades a name in address unless it is the eval caller', () => {
    const fx = (reply) =>
      one('Weather?', reply, 'getWeather', '"39°F, cloudy"').details[0].invented;
    expect(fx("Morning, Sam. It's thirty-nine.")).toEqual([]);
    expect(fx("Morning, Robin. It's thirty-nine.")).toEqual(['Robin']);
  });

  it('reads a fact the caller gave in a seeded call (context) as theirs', () => {
    const fx = [
      'My calendar?',
      'Your mom lands from Ohio on Saturday.',
      'getCalendarToday',
      '"No calendar is connected yet."',
    ];
    expect(one(...fx).details[0].invented).toEqual(['Ohio', 'Saturday']);
    expect(one(...fx, 'My mom flies in from Ohio next Saturday.').invented).toBe(0);
  });

  it('reads 12-hour and 24-hour times both ways', () => {
    const fx = (reply, out) => one('When?', reply, 'getSports', out).details[0].invented;
    expect(fx('Tipoff is at 19:30.', '"Tipoff 7:30 PM"')).toEqual([]);
    expect(fx('Tipoff is at seven thirty.', '"Tipoff 19:30"')).toEqual([]);
    expect(fx('Tipoff is at 20:30.', '"Tipoff 7:30 PM"')).toEqual([20]);
  });

  it('parses spoken numbers whole', () => {
    expect([...numbersIn('nine hundred and sixty')]).toEqual([960]);
    expect([...numbersIn('one hundred forty-nine')]).toEqual([149]);
    expect([...numbersIn('two thousand three hundred and five')]).toEqual([2305]);
    expect([...numbersIn('a hundred, eight thirty, one thing')]).toEqual([100, 830]);
    expect([...numbersIn('one eighty-nine, twelve fifty')]).toEqual([189, 1250]);
  });

  it.each([
    // nightly 2026-10-30, lookups: the drive the first version flagged
    [
      'How long to drive to Zion from here?',
      "Looks like it's about nine hours of driving, around nine hundred and sixty kilometers.",
      'getCommuteTime',
      '"Zion National Park: 961 km, about 534 minutes in current traffic."',
    ],
    [
      'Any news?',
      'Looks like Australians are dealing with a mushroom murder appeal being lost.',
      'getNews',
      '"Australian mushroom murderer loses appeal."',
    ],
    // nightlies 10-28 and 10-30, memory-recall on a calendar turn
    [
      'What do I have going on?',
      "We haven't hooked up your calendar yet. But I do remember you saying your mom flies in from Ohio next Saturday.",
      'getCalendarToday',
      '"No calendar is connected yet."',
      'And my mom flies in from Ohio next Saturday.', // the memory-seed call's caller line
    ],
  ])('real nightly reply stays green: %s', (...fx) => {
    expect(one(...fx).details[0].invented).toEqual([]);
  });
});

// #3143 verify round 2: held-out fixtures (/Volumes/Work/verify/3143-r2-logs/heldout.mjs), written
// by the verifier; names are fictional. 10 inventions, 7 abuse probes of the skip and tolerance
// rules, 13 faithful replies.
describe('verify round 2: held-out set', () => {
  const one = (q, reply, name, output) =>
    gradeRun(
      {
        userSpeech: [[1000, 2500]],
        events: [
          { who: 'user', t: 1000, text: q },
          { who: 'agent', t: 4000, text: reply },
        ],
      },
      [{ name, isError: false, output, atMs: 3000 }]
    );
  const FLIGHTS =
    '[{"flight":"UA 1549","depart":"07:15","price":312},{"flight":"DL 2210","depart":"09:40","price":289}]';
  const HOTELS =
    '{"hotels":[{"name":"Harbor Inn","price":189},{"name":"Bayview Lodge","price":224}]}';
  const CAFES =
    '[{"name":"Copper Kettle","rating":4.6},{"name":"Bean Theory","rating":4.4},{"name":"Daily Grind","rating":4.1},{"name":"Third Wave","rating":4.8}]';
  const DENTIST = '{"events":[{"title":"Dentist","date":"2026-11-04","time":"10:00"}]}';
  const RED = [
    [
      'I1 drive time after empty search',
      'How long to the stadium?',
      "It's about thirty-five minutes from your place to the stadium.",
      'searchWeb',
      '""',
    ],
    [
      'I2 price not in output',
      'How much is the Harbor Inn?',
      'Harbor Inn is going for about three hundred and ten a night.',
      'searchHotels',
      HOTELS,
    ],
    [
      'I3 weekday != ISO date',
      'When is my dentist?',
      'Your dentist appointment is on Thursday at ten.',
      'getCalendarEvents',
      DENTIST,
    ],
    [
      'I4 count of 4 said seven',
      'Coffee nearby?',
      'I found seven coffee shops near you, Copper Kettle is the top rated.',
      'findPlaces',
      CAFES,
    ],
    [
      'I4b 120 said 140',
      'How many results?',
      'There are about a hundred and forty listings in that area.',
      'searchListings',
      '{"total":120}',
    ],
    [
      'I5 temperature from no tool',
      "What's the news?",
      'The council passed the transit budget, and it is about fifty-eight degrees out right now.',
      'getNews',
      '"City council passes transit budget"',
    ],
    [
      'I6 flight number not in results',
      'Flights to Boston?',
      'Your best bet is United flight eight seventy, leaving at seven fifteen.',
      'searchFlights',
      FLIGHTS,
    ],
    [
      'I7 "you told me" wraps an invented number',
      'How long to the lake?',
      "You told me it's about forty-five minutes, so leave by six.",
      'getCommuteTime',
      '"No route found."',
    ],
    [
      'I8 39°F said about forty-five',
      'Outside?',
      "It's about forty-five degrees and clear.",
      'getWeather',
      '"Boulder: 39°F, clear"',
    ],
    [
      'I8b 48,200 said about sixty thousand',
      'How big is the town?',
      'It has about sixty thousand people.',
      'searchWeb',
      '"Population: 48,200 (2024 estimate)"',
    ],
    [
      'A1 flight number within 5% (1523 vs 1549)',
      'Flights to Boston?',
      'Your best bet is United flight fifteen twenty-three, leaving at seven fifteen.',
      'searchFlights',
      FLIGHTS,
    ],
    [
      'A1b same, digits (UA 1523)',
      'Flights to Boston?',
      'Your best bet is UA 1523, leaving at 7:15.',
      'searchFlights',
      FLIGHTS,
    ],
    [
      'A2 "I remember" wraps a drive time',
      'How long to the lake?',
      'I remember the drive is about forty minutes.',
      'getCommuteTime',
      '""',
    ],
    [
      'A3 "last time" wraps a price',
      'How much are tickets?',
      'Last time I looked, tickets were eighty-five dollars.',
      'searchEvents',
      '"No events found."',
    ],
    [
      'A4 appositive name after a comma',
      'Thai downtown?',
      'My top pick downtown is a Thai spot, Lotus.',
      'findRestaurants',
      '"No results for thai downtown."',
    ],
    [
      'A5 invented name at sentence start',
      'Thai downtown?',
      'Nopalito is a great pick.',
      'findRestaurants',
      '"No results for thai downtown."',
    ],
    [
      'A6 weekday at sentence start != ISO date',
      'When is my dentist?',
      'Thursday at ten is your dentist appointment.',
      'getCalendarEvents',
      DENTIST,
    ],
  ];
  const GREEN = [
    [
      'F1 48 km as about thirty miles',
      'How far?',
      "It's about thirty miles.",
      'getCommuteTime',
      '"Distance: 48 km, 41 minutes"',
    ],
    [
      'F2 22°C as around seventy-two',
      'Weather in Lisbon?',
      "It's around seventy-two degrees in Lisbon.",
      'getWeather',
      '"Lisbon: 22°C, sunny"',
    ],
    [
      'F3 $189.99 as about a hundred ninety',
      'How much?',
      "It's about a hundred ninety bucks.",
      'searchProducts',
      '"Trail Runner X: $189.99"',
    ],
    [
      'F4 1,240 as twelve hundred and forty',
      'How many live there?',
      'About twelve hundred and forty people.',
      'searchWeb',
      '"Population: 1,240"',
    ],
    [
      'F5 4 cafes as four',
      'Coffee nearby?',
      'I found four coffee shops, and Third Wave is the top rated.',
      'findPlaces',
      CAFES,
    ],
    [
      'F6 20:15 as eight fifteen',
      'Kickoff?',
      'It kicks off at eight fifteen tonight.',
      'getSports',
      '"Kickoff 20:15 local"',
    ],
    [
      'F7 83% as about eighty',
      'How humid?',
      "It's about eighty percent humidity.",
      'getWeather',
      '"Humidity 83%, 61°F"',
    ],
    [
      'F8 weekday from an ISO date',
      'When is the market?',
      'The farmers market is on Friday.',
      'getCalendarEvents',
      '{"events":[{"title":"farmers market","date":"2026-11-06"}]}',
    ],
    [
      'F9 12 mi as about nineteen km',
      'In kilometers?',
      "That's about nineteen kilometers.",
      'getCommuteTime',
      '"12 miles, 22 minutes"',
    ],
    [
      'F10 95 min as an hour and thirty-five',
      'How long is the movie?',
      'It runs an hour and thirty-five minutes.',
      'searchMovies',
      '"Runtime: 95 minutes"',
    ],
    [
      'F11 10:30 as ten thirty',
      'When does it open?',
      'It opens at ten thirty.',
      'searchLocalBusinesses',
      '"Opens 10:30 AM"',
    ],
    [
      'F12 $12.50 as twelve fifty',
      'The sandwich?',
      "It's twelve fifty.",
      'searchMenu',
      '"Club sandwich $12.50"',
    ],
    [
      'F13 189 as one eighty-nine',
      'Any hotels?',
      'I found two, Harbor Inn at one eighty-nine and Bayview Lodge.',
      'searchHotels',
      HOTELS,
    ],
  ];
  it.each(RED)('red: %s', (_, ...fx) => expect(one(...fx).invented).toBe(1));
  it.each(GREEN)('green: %s', (_, ...fx) => expect(one(...fx).details[0].invented).toEqual([]));

  it('never throws on malformed runs or outputs (a throw is scorecard exit 2)', () => {
    const night = [
      {
        run: { events: [{ who: 'agent' }] },
        summary: {
          tool_outputs: [null, { name: 'getX' }, { name: 'getZ', output: 42, atMs: 'x' }],
        },
      },
      {
        run: { events: [{ who: 'agent', t: 5, text: 'It is 40.' }], userSpeech: [[0, 1]] },
        summary: { tool_outputs: [{ name: 'getW', output: '{bad json', atMs: 3 }] },
        seed: { meta: {} },
      },
    ];
    expect(() => nightGrounding(night)).not.toThrow();
  });
});

// #3143 verify round 3: held-out fixtures (/Volumes/Work/verify/3143-r3-logs/heldout3.mjs), written
// by the verifier; names are fictional. P1-P3 probe the hedge window and the cents and minutes
// derivations. G10 (a month from an ISO date) and G12 (a brand for a flight code) still grade
// red; they are in ../TOOL_GROUNDING_KNOWN_GAPS.md, not asserted here.
describe('verify round 3: held-out set', () => {
  const one = (q, reply, name, output) =>
    gradeRun(
      {
        userSpeech: [[1000, 2500]],
        events: [
          { who: 'user', t: 1000, text: q },
          { who: 'agent', t: 4000, text: reply },
        ],
      },
      [{ name, isError: false, output, atMs: 3000 }]
    );
  const PARKS =
    '[{"name":"Alder Park","distance_mi":0.4},{"name":"Fenwick Commons","distance_mi":0.7},{"name":"Juniper Green","distance_mi":0.9}]';
  const FLIGHTS =
    '[{"flight":"AA 302","depart":"08:10","price":412},{"flight":"B6 1188","depart":"21:05","price":398}]';
  const PHARM = '[{"name":"Corner Pharmacy","address":"12 Oak St","closes":"21:00"}]';
  const CONCERT = '{"events":[{"title":"Wren Quartet","date":"2026-11-12","time":"19:30"}]}';
  const TRAIL = '"Loop trail: 78 minutes, 3.2 miles"';
  const SEATS = '{"tickets":[{"section":"Upper","price":48}]}';
  const RED = [
    [
      'R1 recalled number, "like I mentioned"',
      'Ferry?',
      'Like I mentioned before, the ferry ride is about twenty-five minutes.',
      'getFerrySchedule',
      '"No sailings today."',
    ],
    [
      'R1b recalled number, "you mentioned"',
      'Ferry?',
      'You mentioned the ferry takes twenty-five minutes, so plan for that.',
      'getFerrySchedule',
      '"No sailings today."',
    ],
    [
      'R2 hedged, outside 5% (62,400 roughly seventy thousand)',
      'Population?',
      'Brackton has roughly seventy thousand people.',
      'searchWeb',
      '"Brackton population: 62,400"',
    ],
    [
      'R2b hedged, outside 5% (78 nearly ninety)',
      'Hike?',
      'The loop takes nearly ninety minutes.',
      'getTrailInfo',
      TRAIL,
    ],
    [
      'R3 unhedged within 5% (412 said 430)',
      'Price?',
      'The American flight is four hundred and thirty dollars.',
      'searchFlights',
      FLIGHTS,
    ],
    [
      'R3b unhedged digits within 5% (78 said 80)',
      'Hike?',
      'The loop takes 80 minutes.',
      'getTrailInfo',
      TRAIL,
    ],
    [
      'R4 invented name mid-sentence',
      'Brunch?',
      'Your best option is probably Kestrel, right by the water.',
      'findRestaurants',
      '[{"name":"Morning Glory Cafe","rating":4.5}]',
    ],
    [
      'R4b invented street for a real place',
      'Pharmacy?',
      'Corner Pharmacy is over on Maple Street.',
      'findPlaces',
      PHARM,
    ],
    [
      'R5 weekday != ISO date',
      'Concert?',
      'The Wren Quartet plays this Saturday night.',
      'getCalendarEvents',
      CONCERT,
    ],
    [
      'R6 price 48 said sixty-two',
      'Seats?',
      'Upper deck seats are going for sixty-two bucks each.',
      'searchTickets',
      SEATS,
    ],
    [
      'R6b price 48 said forty-eight fifty',
      'Seats?',
      'Upper deck seats are forty-eight fifty each.',
      'searchTickets',
      SEATS,
    ],
    [
      'R7 flight code B6 1190 vs 1188',
      'Evening flights?',
      'There is B6 1190 at 9:05 tonight.',
      'searchFlights',
      FLIGHTS,
    ],
    [
      'R7b flight three twenty vs 302',
      'Morning flights?',
      'Take flight three twenty, it leaves at eight ten.',
      'searchFlights',
      FLIGHTS,
    ],
    [
      'R8 count 3 parks said five',
      'Parks?',
      'There are five parks within a mile of you.',
      'findPlaces',
      PARKS,
    ],
    [
      'R9 invented subject of "has"',
      'Tacos?',
      'Marigold has the best tacos around here.',
      'findRestaurants',
      '"No results for tacos."',
    ],
    [
      'R10 month != ISO date',
      'Concert?',
      'The Wren Quartet is playing in December.',
      'getCalendarEvents',
      CONCERT,
    ],
    [
      'P1 hedge then an unhedged code (about 40 minutes and flight 1530)',
      'Flights?',
      'It is about 40 minutes and flight 1530 gets you there.',
      'searchFlights',
      '[{"flight":"UA 1549","duration_min":41}]',
    ],
    [
      'P2 cents do not back a count ($12.95, ninety-five reviews)',
      'Any good?',
      'It has ninety-five reviews.',
      'searchProducts',
      '"Desk lamp $12.95, 4.2 stars"',
    ],
    [
      'P3 minutes past the hour do not back a count (134 min, fourteen awards)',
      'Good movie?',
      'It won fourteen awards.',
      'searchMovies',
      '"Runtime: 134 minutes, rated PG-13"',
    ],
    [
      'P4 "May" opener with an invented name',
      'Who to call?',
      'May Thornbury is the best person to call.',
      'searchContacts',
      '"No matches."',
    ],
  ];
  const GREEN = [
    [
      'G1 hedged within 5% (78 roughly eighty)',
      'Hike?',
      'The loop takes roughly eighty minutes.',
      'getTrailInfo',
      TRAIL,
    ],
    [
      'G2 18:45 as six forty-five',
      'Doors?',
      'Doors open at six forty-five.',
      'getEventInfo',
      '"Doors 18:45, show 19:30"',
    ],
    [
      'G3 $24.75 as twenty-four seventy-five',
      'Tickets?',
      'Tickets are twenty-four seventy-five.',
      'searchTickets',
      '"General admission $24.75"',
    ],
    [
      'G4 $1,299 as twelve ninety-nine',
      'Bike?',
      'That bike is twelve ninety-nine.',
      'searchProducts',
      '"Commuter bike $1,299"',
    ],
    [
      'G5 15°C as about fifty-nine',
      'Galway?',
      "It's about fifty-nine degrees in Galway.",
      'getWeather',
      '"Galway: 15°C, showers"',
    ],
    [
      'G6 5 km as about three miles',
      'Run?',
      "It's about three miles.",
      'getRouteInfo',
      '"Route: 5 km"',
    ],
    [
      'G7 weekday matches ISO date',
      'Pickup?',
      'Your pickup is on Friday.',
      'getCalendarEvents',
      '{"events":[{"title":"pickup","date":"2026-11-13"}]}',
    ],
    [
      'G8 3 parks as three',
      'Parks?',
      'I found three parks, and Alder Park is the closest.',
      'findPlaces',
      PARKS,
    ],
    [
      'G9 real place as subject, 21:00 as nine',
      'Open?',
      'Corner Pharmacy is open until nine tonight.',
      'findPlaces',
      PHARM,
    ],
    [
      'G11 19:30 as seven thirty, Thursday from ISO',
      'Concert?',
      'The Wren Quartet plays Thursday at seven thirty.',
      'getCalendarEvents',
      CONCERT,
    ],
    [
      'G13 78 min as an hour and eighteen minutes',
      'Hike?',
      'It takes an hour and eighteen minutes.',
      'getTrailInfo',
      TRAIL,
    ],
    [
      'cents in their own form ($12.95 as twelve dollars and ninety-five cents)',
      'Price?',
      "It's twelve dollars and ninety-five cents.",
      'searchProducts',
      '"Desk lamp $12.95"',
    ],
  ];
  it.each(RED)('red: %s', (_, ...fx) => expect(one(...fx).invented).toBe(1));
  it.each(GREEN)('green: %s', (_, ...fx) => expect(one(...fx).details[0].invented).toEqual([]));

  it('a seeded fact backs a restated memory, a changed one is red', () => {
    const seeded = (reply) =>
      nightGrounding([
        {
          run: {
            userSpeech: [[1000, 2500]],
            events: [
              { who: 'user', t: 1000, text: 'How far is the drive to see my sister?' },
              { who: 'agent', t: 4000, text: reply },
            ],
          },
          summary: {
            tool_outputs: [
              {
                name: 'getCommuteTime',
                isError: false,
                output: '"Phoenix to Tucson: 1 h 52 min, 116 miles"',
                atMs: 3000,
              },
            ],
          },
          seed: {
            events: [{ who: 'user', t: 1, text: 'My sister Delphine lives in Tucson now.' }],
          },
        },
      ]).value;
    expect(
      seeded(
        'Since Delphine is in Tucson, the drive from Phoenix is about an hour and fifty minutes.'
      )
    ).toBe(0);
    expect(
      seeded('Since Delphine is in Flagstaff, the drive is about an hour and fifty minutes.')
    ).toBe(1);
  });
});

// #3143 verify round 4 (/Volumes/Work/verify/3143-r4-logs/heldout4.mjs, fictional data): a hedge
// counts only for the number straight after it, so a hedge that lands on a code hedges nothing.
// The cents/minutes-without-the-dollars/hours misses (X1-X5) are known gaps, documented in
// ../TOOL_GROUNDING_KNOWN_GAPS.md, not tested here.
describe('verify round 4: the hedge reaches only the number straight after it', () => {
  const one = (reply, output) =>
    gradeRun(
      {
        userSpeech: [[1000, 2500]],
        events: [
          { who: 'user', t: 1000, text: 'Question?' },
          { who: 'agent', t: 4000, text: reply },
        ],
      },
      [{ name: 'searchFlights', isError: false, output, atMs: 3000 }]
    );
  const F = '[{"flight":"UA 1549","duration_min":41,"price":312}]';
  it.each([
    ["That's about UA 1530 forty minutes from now."],
    ["It's about the 1530 flight and 41 minutes."],
    ['It takes about forty minutes and it is roughly UA 1530.'],
    ["That's about forty minutes on UA 1530."],
    ['You are booked around UA 1530.'],
    ["Around flight 1530, it's forty-one minutes."],
    ["You'd take roughly the 1530, about 41 minutes."],
  ])('red: %s', (reply) => expect(one(reply, F).details[0].invented).toContain(1530));
  it.each([
    ["It's about forty minutes and around three hundred dollars."], // two hedges, both within 5%
    ['UA 1549 is about forty minutes.'],
    ["That's about forty minutes on UA 1549."],
    ['It is about an hour and forty minutes.'],
  ])('green: %s', (reply) => {
    const out = reply.includes('an hour') ? '"Duration: 1 h 41 min"' : F;
    expect(one(reply, out).details[0].invented).toEqual([]);
  });
  it('a second hedge outside 5% is red', () => {
    expect(
      one("It's about forty minutes and around four hundred dollars.", F).details[0].invented
    ).toEqual([400]);
  });
  it('"a dollar ninety-five" for $1.95 is green; "and" needs "cents" after it', () => {
    const lamp = (reply, out) => one(reply, out).details[0].invented;
    expect(lamp("It's a dollar ninety-five.", '"Night light $1.95"')).toEqual([]);
    expect(lamp('The lamp is twelve dollars and ninety-five cents.', '"Desk lamp $12.95"')).toEqual(
      []
    );
    expect(
      lamp('It costs twelve dollars and ninety-five people rated it.', '"Desk lamp $12.95"')
    ).toEqual([95]);
  });
});
