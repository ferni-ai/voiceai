/**
 * Labelled false alarms the ending floor stops raising (#2540 Z). Synthetic lines. Each is a time
 * word beside a named everyday idiom or a named everyday thing, with nothing else in the turn:
 * the only class of read the floor may lower against main (#2528). `expect` is the level after Z.
 * A worry about someone else keeps its own third-party guidance.
 */
export interface FloorFalseAlarm {
  text: string;
  label:
    'idiom_with_time' | 'everyday_subject_with_time' | 'third_party_worry_with_everyday_subject';
  expect: 'none' | 'guide';
}

export const CRISIS_FLOOR_FALSE_ALARMS: readonly FloorFalseAlarm[] = [
  { text: 'I killed myself laughing today', label: 'idiom_with_time', expect: 'none' },
  { text: 'I killed myself in minecraft today', label: 'idiom_with_time', expect: 'none' },
  { text: 'ending my life as a student tomorrow', label: 'idiom_with_time', expect: 'none' },
  { text: 'the show will end it all soon', label: 'everyday_subject_with_time', expect: 'none' },
  {
    text: 'the show will ended it all tonight',
    label: 'everyday_subject_with_time',
    expect: 'none',
  },
  {
    text: 'lol the show will ended it all soon',
    label: 'everyday_subject_with_time',
    expect: 'none',
  },
  {
    text: 'the finale will end it all tonight',
    label: 'everyday_subject_with_time',
    expect: 'none',
  },
  {
    text: 'the storm will end it all tonight',
    label: 'everyday_subject_with_time',
    expect: 'none',
  },
  {
    text: 'the band will end it all with their big hit tonight',
    label: 'everyday_subject_with_time',
    expect: 'none',
  },
  {
    text: 'the party will end it all with fireworks tonight',
    label: 'everyday_subject_with_time',
    expect: 'none',
  },
  {
    text: 'he texted me that he is going to kill himself. the show will ended it all tonight',
    label: 'third_party_worry_with_everyday_subject',
    expect: 'guide',
  },
  {
    text: 'my brother keeps talking about killing himself. the show will end it all soon',
    label: 'third_party_worry_with_everyday_subject',
    expect: 'guide',
  },
  {
    text: 'my brother keeps talking about killing himself. the show will end it all tonight',
    label: 'third_party_worry_with_everyday_subject',
    expect: 'guide',
  },
  {
    text: 'my mom said she wants to die. the show will end it all soon',
    label: 'third_party_worry_with_everyday_subject',
    expect: 'guide',
  },
];
