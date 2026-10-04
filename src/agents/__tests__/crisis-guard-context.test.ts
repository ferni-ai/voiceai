/**
 * Crisis Guard — how context changes a decision
 *
 * The same words can be a plan, a joke, a memory or a worry about someone
 * else. These tests pin how each framing moves the decision between the three
 * outcomes: replace the reply (shouldBlock), guide the LLM (isCrisis), or
 * neither.
 */

import { describe, expect, it } from 'vitest';
import { buildCrisisGuidance, detectCrisis, guardPreResponse } from '../safety/crisis-guard.js';
import { detectCrisis as detectServiceCrisis } from '../../services/safety/crisis-detection.js';

const outcome = (text: string, recentMessages?: string[]): 'block' | 'crisis' | 'none' => {
  const guard = guardPreResponse(text, undefined, { recentMessages });
  if (guard.shouldBlock) return 'block';
  return guard.isCrisis ? 'crisis' : 'none';
};

describe('softened explicit language', () => {
  it.each([
    ["I don't want to die, I'm scared of the surgery", 'none'],
    ["I'm not going to kill myself, don't worry", 'none'],
    ['lol I want to die, this meme', 'crisis'],
    ["I'm gonna kill myself if this meeting runs long", 'crisis'],
    ['I used to want to kill myself in high school', 'crisis'],
    ["I tried to kill myself years ago but I'm doing better now", 'none'],
    ['I tried to kill myself years ago and it is coming back', 'crisis'],
    ['sometimes I think everyone would be better off without me', 'crisis'],
    ["I've been thinking about suicide but I don't have a plan", 'crisis'],
    ['My team is so bad I want to unalive myself', 'none'],
    ['if my landlord raises the rent again im gonna kms', 'crisis'],
    ['I attempted suicide back in 2019 and the thoughts are back this week', 'crisis'],
    ["I don't know if I can keep going, I want to kill myself", 'block'],
  ])('%s -> %s', (text, expected) => {
    expect(outcome(text)).toBe(expected);
  });

  it('an unsoftened statement still blocks', () => {
    expect(outcome("I don't know why I want to die")).toBe('block');
  });

  it('negated language still counts toward compounding', () => {
    expect(
      outcome("I'm not saying I want to die, but nothing matters and I'm a burden to everyone")
    ).toBe('crisis');
  });
});

describe('plan, means and imminent danger', () => {
  it.each([
    'i took like 30 of my sleeping pills an hour ago',
    "I'm sitting in the car with the engine running and the garage door shut",
    'the gun is loaded and sitting in my lap',
  ])('leads with 911: %s', (text) => {
    const result = guardPreResponse(text);
    expect(result.shouldBlock).toBe(true);
    expect(result.replacementResponse).toContain('911');
    expect(detectCrisis(text).indicators).toContain('imminent_danger');
  });

  it('passive ideation plus a plan blocks', () => {
    const result = detectCrisis("I've been saving up my meds and tonight's the night");
    expect(result.indicators).toContain('plan_or_means');
    expect(
      guardPreResponse("I've been saving up my meds and tonight's the night").shouldBlock
    ).toBe(true);
  });

  it('a plan cue alone, with no self-directed signal, does not block', () => {
    expect(outcome('I have the pills ready for the trip tonight')).toBe('none');
  });
});

describe('third party at risk', () => {
  it('flags the worry without treating the caller as at risk', () => {
    const result = detectCrisis('my friend told me she wants to kill herself');
    expect(result.isCrisis).toBe(true);
    expect(result.subject).toBe('third_party');
    expect(result.suggestedResponse).toContain('on their behalf');
    expect(buildCrisisGuidance(result)).toContain('NEVER treat the user as the one at risk');
  });

  it('never escalates into the self-directed script, even with a distressed voice', () => {
    const result = guardPreResponse('my brother wants to die and I do not know what to do', {
      primary: 'distressed',
      intensity: 0.9,
      confidence: 0.9,
    });
    expect(result.isCrisis).toBe(true);
    expect(result.shouldBlock).toBe(false);
  });

  it.each([
    'my roommate told me shes thinking about ending it',
    'I read his texts about wanting to die',
  ])('words reported from someone else are a worry about them: %s', (text) => {
    const result = detectCrisis(text);
    expect(result.subject).toBe('third_party');
    expect(guardPreResponse(text).shouldBlock).toBe(false);
  });

  it('reported words about the caller are still the caller', () => {
    expect(outcome('my sister said I should talk to someone because I want to kill myself')).toBe(
      'block'
    );
  });

  it.each(['he hurt himself playing football', 'she wants to die of embarrassment'])(
    'ignores idioms about others: %s',
    (text) => {
      expect(outcome(text)).toBe('none');
    }
  );
});

describe('session trajectory', () => {
  it('quiet finality after earlier distress is a crisis', () => {
    expect(outcome('Soon none of this will matter')).toBe('none');
    expect(
      outcome('Soon none of this will matter', [
        'I feel like a burden to everyone',
        'nobody would miss me',
      ])
    ).toBe('crisis');
  });

  it('a goodbye gift after passive ideation is a crisis', () => {
    expect(outcome('I wanted you to have this, just in case')).toBe('none');
    expect(
      outcome('I wanted you to have this, just in case', ["I hope I don't wake up tomorrow"])
    ).toBe('crisis');
  });

  it('ignores the copy of the current message in recentTranscripts', () => {
    expect(outcome('nobody would miss me', ['nobody would miss me'])).toBe('none');
  });

  it('a worry about someone else does not escalate the caller', () => {
    expect(
      outcome('none of it is going to matter', ['my friend tried to kill himself last week'])
    ).toBe('none');
  });
});

describe('voice', () => {
  const distressed = { primary: 'distressed', intensity: 0.9, confidence: 0.9 };

  it('a distressed voice on its own is a check-in, not a crisis', () => {
    const result = guardPreResponse('ugh traffic', distressed);
    expect(result.isCrisis).toBe(false);
    expect(result.shouldBlock).toBe(false);
  });

  it('a distressed voice escalates a text signal', () => {
    expect(guardPreResponse('nobody cares', distressed).shouldBlock).toBe(true);
  });

  it('stress without a distress emotion does not add intensity', () => {
    const angry = { primary: 'angry', intensity: 0.95, confidence: 0.9 };
    expect(detectCrisis('nobody cares', angry).severity).toBe(
      detectCrisis('nobody cares').severity
    );
  });
});

describe('language', () => {
  it('Spanish crisis language gets the Spanish 988 script', () => {
    const result = guardPreResponse('quiero morirme');
    expect(result.shouldBlock).toBe(true);
    expect(result.replacementResponse).toContain('oprimir 2');
    expect(detectCrisis('quiero morirme').language).toBe('es');
  });

  it('shorthand and curly apostrophes match the full form', () => {
    expect(outcome('i dont want to live anymore')).toBe('block');
    expect(outcome('im gonna end it tonight')).toBe('block');
    expect(outcome('i don’t want to live anymore')).toBe('block');
  });
});

describe('guidance for the LLM', () => {
  it('asks for a single warm check-in when the statement was a joke', () => {
    const guidance = buildCrisisGuidance(
      detectCrisis('I want to kill myself lmao that test was brutal')
    );
    expect(guidance).toContain('They may be joking');
  });

  it('asks whether a past crisis is coming back', () => {
    const guidance = buildCrisisGuidance(
      detectCrisis('I used to want to kill myself in high school')
    );
    expect(guidance).toContain('coming back now');
  });
});

describe('safety service agrees with the guard', () => {
  it.each([
    ['I want to kill myself', 'critical'],
    ['I wish I was dead', 'high'],
    ["I can't do this anymore", 'medium'],
  ])('%s -> %s', (text, severity) => {
    expect(detectServiceCrisis(text).primary?.severity).toBe(severity);
  });

  it('protective statements do not trigger an interruption', () => {
    expect(detectServiceCrisis('I would never kill myself').requiresImmediateAction).toBe(false);
  });

  it('an overdose leads with the substance emergency', () => {
    expect(detectServiceCrisis('I took too many pills').primary?.type).toBe('substance_crisis');
  });

  it('a partner hitting the caller is domestic abuse', () => {
    expect(detectServiceCrisis('my husband hits me').primary?.type).toBe('domestic_abuse');
  });
});
