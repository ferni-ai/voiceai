/**
 * How money feels: worries, wins, feelings, decisions in progress.
 *
 * @module services/finance-memory/detect-feelings
 */

import {
  MONEY_HINT,
  cap,
  moneyTopicOf,
  thirdPerson,
  tidy,
  type Detector,
  type FinanceMention,
} from './detect-helpers.js';

export const worry: Detector = (c, negated) => {
  const out: FinanceMention[] = [];
  const about = c.match(
    /\b(?:i'?m|i am|i'?ve been|i feel|feeling)\s+(?:really\s+|so\s+|a (?:bit|little)\s+|kind of\s+|pretty\s+)?(?:worried|stressed|anxious|scared|nervous|freaking out|panicking)\s+about\s+([^,.;!?]{3,40})/i
  );
  if (about?.[1] && !negated) {
    const what = tidy(about[1]).toLowerCase();
    const topic = moneyTopicOf(what);
    if (topic)
      out.push({
        kind: 'worry',
        subject: topic,
        text: `Worried about ${thirdPerson(what)}`,
        confidence: 0.85,
      });
  }
  const afford = c.match(/\b(?:i|we) can'?t afford\s+([^,.;!?]{2,40})/i);
  if (afford?.[1]) {
    const what = tidy(afford[1]).toLowerCase();
    if (what)
      out.push({
        kind: 'worry',
        subject: `affording ${what}`.slice(0, 60),
        text: `Can't afford ${thirdPerson(what)} right now`,
        confidence: 0.8,
      });
  }
  if (
    !negated &&
    /\bmoney(?:'s| is) (?:really\s+|so\s+|pretty\s+)?tight\b|\b(?:i'?m|we'?re) (?:totally\s+|completely\s+|so\s+|flat\s+)?broke\b|\bliving paycheck to paycheck\b|\bstruggling (?:with money|financially|to pay)\b/i.test(
      c
    )
  ) {
    out.push({ kind: 'worry', subject: 'money', text: 'Money is tight', confidence: 0.85 });
  }
  return out;
};

export const win: Detector = (c, negated) => {
  if (negated) return [];
  const out: FinanceMention[] = [];
  const hit = c.match(
    /\b(?:i|we)\s+(?:finally\s+|just\s+)?(?:hit|reached|met|made)\s+(?:my|our)\s+(savings goal|emergency fund(?: goal)?|budget(?: goal)?|money goal)/i
  );
  if (hit?.[1])
    out.push({
      kind: 'win',
      subject: hit[1].toLowerCase(),
      text: `Reached their ${hit[1].toLowerCase()}`,
      status: 'done',
      confidence: 0.9,
    });
  if (/\b(?:i|we)\s+(?:stuck to|stayed (?:on|under|within))\s+(?:my|our|the)\s+budget\b/i.test(c)) {
    out.push({
      kind: 'win',
      subject: 'budget',
      text: 'Stuck to their budget',
      status: 'done',
      confidence: 0.85,
    });
  }
  if (/\bmy credit score (?:went up|improved|is up|jumped)\b/i.test(c)) {
    out.push({
      kind: 'win',
      subject: 'credit score',
      text: 'Credit score went up',
      status: 'done',
      confidence: 0.85,
    });
  }
  return out;
};

export const feeling: Detector = (c) => {
  const stress = c.match(
    /\bmoney\s+(?:really\s+|always\s+)?(stresses me out|makes me (?:anxious|nervous|stressed|uneasy)|scares me)\b/i
  );
  if (stress?.[1])
    return [
      {
        kind: 'feeling',
        subject: 'money',
        text: `Money ${thirdPerson(stress[1])}`,
        confidence: 0.85,
      },
    ];
  const avoid = c.match(
    /\bi\s+(hate|avoid|dread|love|enjoy)\s+(?:thinking about|talking about|dealing with|looking at)\s+(money|my finances|my bank account|my budget)\b/i
  );
  if (avoid?.[1] && avoid[2]) {
    return [
      {
        kind: 'feeling',
        subject: 'money',
        text: `${cap(avoid[1].toLowerCase())}s dealing with ${thirdPerson(avoid[2].toLowerCase())}`,
        confidence: 0.8,
      },
    ];
  }
  const feel = c.match(
    /\bi feel\s+(?:so\s+|really\s+|pretty\s+)?(guilty|ashamed|embarrassed|good|great|proud|confident|hopeful|behind|clueless|lost)\s+about\s+(money|my finances|spending|my spending|my savings|my debt)\b/i
  );
  if (feel?.[1] && feel[2]) {
    return [
      {
        kind: 'feeling',
        subject: feel[2].toLowerCase().replace(/^my /, ''),
        text: `Feels ${feel[1].toLowerCase()} about ${thirdPerson(feel[2].toLowerCase())}`,
        confidence: 0.85,
      },
    ];
  }
  return [];
};

const DECISION_TOPIC =
  /\b(refinanc\w*|buy|sell|lease|invest\w*|retire\w*|switch banks|consolidat\w*|loan|mortgage|rent or buy|401k|ira|roth|pay off|savings|down payment|car|house|home|apartment|offer)\b/i;

export const decision: Detector = (c) => {
  const deciding = c.match(
    /\b(?:i'?m|i am|we'?re|we are)\s+(?:trying to decide|deciding|torn (?:about|on)|weighing|thinking about whether|not sure whether)\s+(?:whether\s+)?(?:or not\s+)?(?:to\s+)?([^,.;!?]{4,60})/i
  );
  if (deciding?.[1] && DECISION_TOPIC.test(deciding[1])) {
    const what = tidy(deciding[1]).toLowerCase();
    return [
      {
        kind: 'decision',
        subject: what.slice(0, 60),
        text: `Deciding whether to ${thirdPerson(what)}`,
        confidence: 0.8,
      },
    ];
  }
  const decided = c.match(/\b(?:i|we)\s+(?:finally\s+)?(?:decided|chose) to\s+([^,.;!?]{4,60})/i);
  if (decided?.[1] && DECISION_TOPIC.test(decided[1]) && MONEY_HINT.test(decided[1])) {
    const what = tidy(decided[1]).toLowerCase();
    return [
      {
        kind: 'decision',
        subject: what.slice(0, 60),
        text: `Decided to ${thirdPerson(what)}`,
        status: 'done',
        confidence: 0.85,
      },
    ];
  }
  return [];
};
