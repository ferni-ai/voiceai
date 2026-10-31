/**
 * Issue #2861: the money/credential screen on callee text replaced a whole
 * field when it saw one risky word, so "She said she wants to die, and asked
 * for my card number" reached the owner as "Mom said something about money..."
 * and the crisis was lost.
 *
 * The screen stays fail-closed (no word of a risky field is quoted), and a
 * crisis read by the crisis guard on the raw text always reaches the owner as
 * Ferni's own crisisCallerLine. Drives every consumer with the real code: the
 * call lifecycle (with and without the model's analysis), relayedMessage, the
 * owner's text and While You Were Away details, and the live report.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../superhuman/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

const {
  crisisCallerLine,
  isRiskyCallerText,
  riskyCallerLine,
  screenCallerParts,
  screenedCallerText,
} = await import('../caller-text.js');
const { relayedMessage } = await import('../relayed-message.js');
const { callResultDetails, callResultText } = await import('../call-result-text.js');
const { liveReportMessage } = await import('../call-result-live.js');
const { buildCallOutcome } =
  await import('../../../agents/outbound-call/on-behalf-call-lifecycle.js');
const { buildOnBehalfDispatch } = await import('../on-behalf-dispatch.js');
type Analysis = import('../call-transcript-intelligence.js').SuperhumanCallResult;
type Outcome = ReturnType<typeof buildCallOutcome>;

const CRISIS = crisisCallerLine('Mom');
const RISKY = riskyCallerLine('Mom');

const call = buildOnBehalfDispatch({
  callId: 'c-2861',
  requester: { userId: 'u-2861', name: 'Sam', timezone: 'UTC', originalSessionId: 's-2861' },
  contact: { name: 'Mom', phone: '+15555550100' },
  purpose: 'check in',
  objective: 'check_in',
  callType: 'personal',
});

function analysisSaying(text: string): Analysis {
  return {
    transcript: { callId: 'c-2861', contactName: 'Mom', turns: [], duration: 90, capturedAt: '' },
    friendlyReport: text,
    insights: {
      summary: text,
      detailedSummary: text,
      keyPoints: [],
      emotionalTone: { recipientMood: 'sad', overallSentiment: 'negative', notableEmotions: [] },
      actionItems: [],
      messagesForUser: [text],
      callbackRequested: false,
      relationshipSignals: [],
      topicsMentioned: [],
      objectiveAchieved: true,
      callQuality: 'good',
    },
  };
}

const said = (line: string) => [{ role: 'recipient' as const, content: line }];

/** Every owner-facing text a consumer builds when Mom said `line`; each carries her words. */
function ownerReports(line: string): Record<string, string> {
  const plain = buildCallOutcome(call, said(line), null, undefined, 120);
  const relayed = buildCallOutcome(call, said(`Tell him ${line}`), null, undefined, 120);
  const analysed = buildCallOutcome(call, said(line), analysisSaying(line), undefined, 120);
  const told = (where: string, o: Outcome) => ({
    [`${where}.text`]: callResultText('Mom', o),
    [`${where}.details`]: callResultDetails('Mom', o) ?? '',
    [`${where}.live`]: liveReportMessage('Mom', o),
  });
  return {
    screened: screenedCallerText(line, 'Mom', 600),
    relayedMessage: relayedMessage([`Tell him ${line}`], 'Sam', 'Mom') ?? '',
    'plain.outcome': plain.outcome,
    'plain.summary': plain.transcriptSummary ?? '',
    'plain.live': liveReportMessage('Mom', plain),
    'relayed.message': relayed.message ?? '',
    ...told('relayed', relayed),
    'analysed.outcome': analysed.outcome,
    'analysed.summary': analysed.transcriptSummary ?? '',
    'analysed.message': analysed.message ?? '',
    ...told('analysed', analysed),
  };
}

function expectEvery(reports: Record<string, string>, check: (text: string) => void): void {
  for (const [where, text] of Object.entries(reports)) {
    try {
      check(text);
    } catch (error) {
      throw new Error(`${where}: ${String(error)}\n${text}`);
    }
  }
}

describe('callee-text screen: crisis always reaches the owner, credentials never (#2861)', () => {
  it.each([
    ['She said she wants to die, and asked for my card number', /card|number/i],
    [
      "She said she's been cutting herself again, then gave me her bank account number",
      /\bbank\b|account number/i,
    ],
    ['She wants to die, call 555 0142 or visit evil.example/pay', /\d|evil|example|pay/i],
    // The guard reads a joke as passive ideation, so it counts; the code still never goes out.
    ['I want to die lol, anyway send the gift card code to me', /gift|card|code/i],
  ])('%j: crisis line and risky line, no caller words', (line, credential) => {
    expect(screenedCallerText(line, 'Mom', 600)).toBe(`${CRISIS} ${RISKY}`);
    expectEvery(ownerReports(line), (text) => {
      expect(text).toContain(CRISIS);
      expect(text.split(CRISIS).join('').split(RISKY).join('')).not.toMatch(credential);
    });
  });

  // KNOWN GAP: the crisis guard (and every other sync detector in the repo) has no
  // pattern for this; only the async classifier could read it. The PIN request is
  // still screened out (next test). Flip to `it` when a sync read catches it.
  it.fails('pills + PIN: the crisis line reaches the owner', () => {
    const line = 'He mentioned taking a whole bottle of pills, and asked for the PIN';
    expect(screenedCallerText(line, 'Mom')).toContain(CRISIS);
  });

  it('pills + PIN: the PIN request never reaches the owner', () => {
    const line = 'He mentioned taking a whole bottle of pills, and asked for the PIN';
    expectEvery(ownerReports(line), (text) => expect(text).not.toMatch(/\bpin\b|pills/i));
  });

  it.each([
    "Hi it's your bank. Your account is locked. Reply with the code",
    "I would never want to die, anyway what's your PIN",
    'Tell him the PIN is 4421',
  ])('%j: no crisis, so the risky line only and nothing quoted', (line) => {
    expect(screenedCallerText(line, 'Mom', 600)).toBe(RISKY);
    expectEvery(ownerReports(line), (text) => {
      expect(text).not.toContain(CRISIS);
      expect(text).not.toMatch(/locked|reply with|\bpin\b|4421|never want/i);
    });
  });

  it('crisis-only text is unchanged', () => {
    const line = 'She said she wants to die';
    expect(screenedCallerText(line, 'Mom', 600)).toBe(line);
  });

  it('crisis words cut by the length cap are carried by the safety line, first', () => {
    const chat = 'We talked about her garden and the tomatoes for a while. '.repeat(3);
    const out = screenedCallerText(`${chat}She said she wants to die.`, 'Mom', 120);
    expect(out.startsWith(CRISIS)).toBe(true);
    expect(out.length).toBeLessThanOrEqual(120);
  });

  it('the existing CVC false positive gets no worse', () => {
    expect(screenedCallerText('We practised CVC words', 'Mom')).toBe(RISKY);
  });

  it('a cut that leaves a link-shaped fragment is screened out', () => {
    const line = 'She kept saying www and laughed about it all afternoon';
    const out = screenedCallerText(line, 'Mom', line.indexOf('www') + 7);
    expect(out).not.toMatch(/www\./i);
  });

  it('a cut never ends a quote on half a domain', () => {
    const line = 'Lovely chat about the example.community garden and the bees';
    const out = screenedCallerText(line, 'Mom', line.indexOf('.com') + 7);
    expect(out).not.toMatch(/example\.com\b/);
  });

  it('call-result-text quotes nothing when the message held anything risky', () => {
    const base = buildCallOutcome(call, said('hello'), analysisSaying('Mom sounded fine.'));
    const o: Outcome = { ...base, message: `${RISKY} 555 0142 evil.example.com/pay` };
    for (const text of [callResultText('Mom', o), callResultDetails('Mom', o) ?? '']) {
      expect(text).toContain(RISKY);
      expect(text).not.toMatch(/\d{3}|example|asked me to tell you/i);
    }
  });

  // The parts call-result-text quotes from: each layer is fail-closed on its own.
  it.each([
    "Hi it's your bank. Your account is locked. Reply with the code",
    'She said she wants to die, and asked for my card number',
  ])('screenCallerParts keeps none of %j', (line) => {
    expect(screenCallerParts(line, 'Mom', 600)).toMatchObject({ said: '', risky: true });
  });

  it('screenCallerParts screens after its cut', () => {
    const line = 'She kept saying www and laughed about it all afternoon';
    const parts = screenCallerParts(line, 'Mom', line.indexOf('www') + 7);
    expect(parts.said).not.toMatch(/www\./i);
  });

  it('screening twice changes nothing', () => {
    for (const line of [
      'She said she wants to die, and asked for my card number',
      'Tell him the PIN is 4421',
      'She said she wants to die',
    ]) {
      const once = screenedCallerText(line, 'Mom', 200);
      expect(screenedCallerText(once, 'Mom', 200)).toBe(once);
    }
  });
});

// Round 2: the exact-string screen in call-result-text sees what no earlier
// screen can, because only it sees the final string: the cap's "..." and the
// quote joined to the summary. Each case is built by the real lifecycle, and
// each piece passes the earlier screens on its own.
describe('call-result-text final screen (#2861)', () => {
  const quiet = (base: Analysis, insights: Partial<Analysis['insights']>): Analysis => ({
    ...base,
    insights: { ...base.insights, messagesForUser: [], ...insights },
  });

  it('the cap\'s "..." after "www" is screened out of the owner\'s text', () => {
    let report = 'We talked about her garden';
    while (`It's Ferni. ${report} www`.length < 292) report += ' x';
    report += ' www supercalifragilisticexpialidocious and the tomatoes';
    const o = buildCallOutcome(call, said('hello'), quiet(analysisSaying(report), {}));
    expect(o.message).toBeUndefined();
    expect(isRiskyCallerText(o.outcome)).toBe(false);
    const text = callResultText('Mom', o);
    expect(text).not.toMatch(/\bwww\./i);
    expect(text).toBe(`It's Ferni. I talked to Mom. ${RISKY}`);
  });

  it('a quote and the summary that join into a money request are screened out of the details', () => {
    const o = buildCallOutcome(
      call,
      said('hello'),
      quiet(analysisSaying('Mom sounded fine.'), {
        messagesForUser: ['Tell him I will send'],
        detailedSummary: 'the money tomorrow.',
      })
    );
    expect(o.message).toBe('Tell him I will send');
    expect(isRiskyCallerText(o.message ?? '')).toBe(false);
    expect(isRiskyCallerText(o.transcriptSummary ?? '')).toBe(false);
    const details = callResultDetails('Mom', o) ?? '';
    expect(details).toBe(RISKY);
  });

  it('a contact whose name looks risky still gets the real outcome', () => {
    const bank = buildOnBehalfDispatch({
      callId: 'c-2861-bank',
      requester: { userId: 'u-2861', name: 'Sam', timezone: 'UTC', originalSessionId: 's-2861' },
      contact: { name: 'Chase Bank', phone: '+15555550101' },
      purpose: 'ask about the statement',
      objective: 'check_in',
      callType: 'business',
    });
    const o = buildCallOutcome(bank, null, null);
    expect(o.status).not.toBe('completed');
    expect(o.outcome).toContain('Chase Bank');
    expect(callResultText('Chase Bank', o)).toBe(`It's Ferni. ${o.outcome.trim()}`);
  });

  it('an empty contact name does not switch the final screen off (#2892)', () => {
    const o: Outcome = {
      callId: 'c-2892',
      status: 'no_answer',
      objectiveAchieved: false,
      outcome: 'They said to send the money tonight',
    };
    const text = callResultText('', o);
    expect(text).not.toContain('send the money');
    expect(text).toBe(`It's Ferni. ${riskyCallerLine('')}`);
  });

  it('a short contact name is not cut out of their words before the screen (#2892)', () => {
    const o: Outcome = {
      callId: 'c-2892',
      status: 'no_answer',
      objectiveAchieved: false,
      outcome: 'Pa said: Pay the money to him first',
    };
    const text = callResultText('Pa', o);
    expect(text).not.toContain('Pay the money');
    expect(text).toBe(`It's Ferni. ${riskyCallerLine('Pa')}`);
  });

  it('a call that never connected is never reported as "I talked to"', () => {
    const o: Outcome = {
      callId: 'c-2861',
      status: 'no_answer',
      objectiveAchieved: false,
      outcome: 'Left word at www.example.com',
    };
    const text = callResultText('Mom', o);
    expect(text).toBe(`It's Ferni. ${RISKY}`);
  });
});
