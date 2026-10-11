/**
 * The tools a caller known only by their phone number may use: an allowlist.
 *
 * Recognising a caller by their verified number (caller-recognition.ts) is
 * enough to talk like friends: their name, their memory in the conversation.
 * It is not enough to move money, change or delete what they've stored, read
 * their records back to whoever holds the phone, or act as them. Those need a
 * step-up the phone alone can't give, a separate gate.
 *
 * So only conversational tools stay open, and everything else is denied by
 * default: a tool added tomorrow is locked until someone puts it here on
 * purpose. A denylist missed most of the account tools the call starts with
 * (getBills, getNotes, getReminders, manageContact, getPackages, ...).
 * The rest leave each request AND the agent, so a call to one can't execute.
 *
 * @module agents/shared/phone-safe-tools
 */
import { llm } from '@livekit/agents';

/** Music and games: play, nothing stored or read back. */
const PLAY = [
  'playMusic',
  'musicControl',
  'musicInfo',
  'searchAppleMusic',
  'playAppleMusicPreview',
  'suggestGame',
  'startGame',
  'endGame',
  'getGameHint',
  'getGameStatus',
  'skipGameRound',
  'submitGameAnswer',
  'startTextGame',
  'endTextGame',
  'makeTextGameMove',
  'getTextGameBoard',
];

/** Support in the moment, crisis resources included: never locked away from a caller. */
const SUPPORT = [
  'breatheWithMe',
  'groundingExercise',
  'guideGroundingExercise',
  'groundingForTrauma',
  'deEscalateAnxiety',
  'somaticSupport',
  'windowOfTolerance',
  'noticeThisMoment',
  'naturePrescription',
  'selfCompassionTrauma',
  'provideCrisisResources',
  'quickCrisisResources',
  'findSafeResources',
];

/** Public information and the team. */
const PUBLIC = [
  'getWeather',
  'getMovieInfo',
  'getMovieShowtimes',
  'getMoviesNowPlaying',
  'getUpcomingMovies',
  'meetTheTeam',
  'softTeamIntro',
  'introduceMember',
  'askForTeammate',
  'endCall',
];

export const PHONE_SAFE_TOOLS: ReadonlySet<string> = new Set([...PLAY, ...SUPPORT, ...PUBLIC]);

/** Open to a phone-only caller: an allowlisted tool, or a handoff to a teammate. */
export function phoneSafeTool(name: string): boolean {
  return PHONE_SAFE_TOOLS.has(name) || /^handoffTo[A-Z]/.test(name);
}

/**
 * `toolCtx` with only phone-safe function tools (the same object when nothing
 * is removed). Provider tools and toolsets aren't allowlisted, so they go too.
 */
export function onlyPhoneSafeTools(toolCtx: llm.ToolContext): llm.ToolContext {
  const names = Object.keys(toolCtx.functionTools);
  const extras = toolCtx.providerTools.length + toolCtx.toolsets.length;
  if (extras === 0 && names.every(phoneSafeTool)) return toolCtx;
  const keep = Object.entries(toolCtx.functionTools)
    .filter(([name]) => phoneSafeTool(name))
    .map(([, tool]) => tool);
  return new llm.ToolContext(keep);
}
